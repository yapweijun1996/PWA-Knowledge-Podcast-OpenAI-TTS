import assert from "node:assert/strict";
import test from "node:test";
import { createTranslator, setLocale } from "../src/i18n/index.ts";
import { encodeThumbnail } from "../src/publish/thumbnail.ts";
import { videoLayout } from "../src/video/design/layout.ts";
import { palettes } from "../src/video/design/palettes.ts";
import { designTokens } from "../src/video/design/tokens.ts";
import { videoFont } from "../src/video/fonts/loader.ts";
import { overlayCopy, prepareOverlay } from "../src/video/overlay.ts";
import { buildTimeline } from "../src/video/timeline.ts";
import {
  assertFrameTime,
  fixture as visualFixture,
  flashAnalysis,
  flashAssessment,
  safeExterior,
  seekFrame,
} from "./fixtures/visual-qa.ts";

const close = (a, b) =>
  assert.ok(Math.abs(a - b) < 1e-8, `${a} is not close to ${b}`);
const right = ({ x, width }) => x + width;
const bottom = ({ y, height }) => y + height;
const center = ({ y, height }) => y + height / 2;
const cases = [
  ["landscape", 1920, 1080, 54, 907.2, 1382.4, 36],
  ["portrait", 1080, 1920, 61.44, 1305.6, 756, 20],
];

function recordingContext() {
  return {
    shapes: [],
    text: [],
    fillRect() {},
    beginPath() {},
    roundRect(...box) {
      this.path = box;
    },
    fill() {
      this.shapes.push({
        color: this.fillStyle,
        alpha: this.globalAlpha ?? 1,
        box: this.path,
      });
    },
    fillText(value, x, y, width) {
      this.text.push({
        value,
        x,
        y,
        width,
        color: this.fillStyle,
        font: this.font,
        alpha: this.globalAlpha ?? 1,
      });
    },
    measureText(value) {
      const size = Number(this.font?.match(/ (\d+(?:\.\d+)?)px/u)?.[1] ?? 54);
      return {
        width: [...value].reduce(
          (sum, glyph) =>
            sum + (/\p{Script=Han}/u.test(glyph) ? size : 0.58 * size),
          0,
        ),
      };
    },
  };
}

for (const [
  orientation,
  width,
  height,
  fontSize,
  captionBottom,
  captionWidth,
  bars,
] of cases) {
  test(`${orientation} token boxes fit the safe rectangle and reserve distinct rails`, () => {
    const layout = videoLayout(width, height, orientation);
    const { safe, caption, callout, hostChips, wave, progress, wordmark } =
      layout;
    const boxes = [
      caption,
      callout,
      ...hostChips,
      ...wave,
      progress,
      wordmark,
      layout.cardChip,
      layout.chapterChip,
      layout.title,
      layout.titleGraphic,
      layout.chapter,
      ...(layout.chapterShort ? [layout.chapterShort] : []),
      layout.stage,
    ];
    for (const box of boxes) {
      assert.ok(box.x >= safe.x - 1e-8 && box.y >= safe.y - 1e-8);
      assert.ok(
        right(box) <= right(safe) + 1e-8 && bottom(box) <= bottom(safe) + 1e-8,
      );
    }
    close(layout.type.caption, fontSize);
    close(layout.stroke.activeHostChip / height, 0.003);
    close(layout.marker, (orientation === "landscape" ? 0.026 : 0.018) * height);
    close(
      layout.type.wordmark,
      (orientation === "landscape" ? 0.028 : 0.021) * height,
    );
    close(bottom(caption), captionBottom);
    close(caption.width, captionWidth);
    close(caption.height, 2 * (fontSize * 1.22 + layout.captionPad.y));
    close(right(progress), right(safe));
    close(wordmark.x, safe.x);
    assert.ok(bottom(callout) < caption.y);
    assert.ok(bottom(layout.cardChip) + 0.5 < caption.y);
    assert.ok(bottom(layout.chapterChip) + 0.5 < caption.y);
    assert.ok(right(hostChips[0]) < hostChips[1].x);
    for (const [index, chip] of hostChips.entries()) {
      assert.ok(bottom(wave[index]) < chip.y);
      assert.ok(bottom(chip) < callout.y);
    }
    assert.equal(layout.waveBarsPerHost, bars);
    if (orientation === "portrait") {
      close(layout.chapter.y / height, 0.285);
      close(layout.chapterShort.x / width, 0.08);
      close(layout.chapterShort.y / height, 0.30);
      close(right(layout.chapterShort) / width, 0.64);
      close(bottom(layout.chapterShort) / height, 0.45);
      close(layout.type.chapter / height, 0.047);
      close(center(layout.chapterChip) / height, 0.53);
      close(center(layout.cardChip) / height, 0.505);
      close(center(hostChips[0]) / height, 0.48);
      close(wordmark.y / height, 0.12);
      close(progress.y / height, 0.12);
      close((caption.x + caption.width / 2) / width, 0.43);
      close(center(caption) / height, 0.63396);
      assert.ok((caption.y - bottom(layout.chapterChip)) / height >= 0.03572);
      assert.ok(bottom(progress) < layout.chapter.y);
      assert.ok(bottom(layout.chapter) < callout.y);
      assert.ok(bottom(layout.chapter) < layout.chapterChip.y);
      close(layout.stage.y / height, 0.17);
      for (const rail of wave) close(center(rail) / height, 0.355);
      for (const [, y] of designTokens.portrait.orbCenters) close(y, 0.3);
      close(designTokens.portrait.orbDiameterH, 0.118);
    }
  });

  test(`${orientation} holds the live opening and reveals the stage on the frame clock`, () => {
    const context = recordingContext();
    const resolution = { width, height };
    const geometry = videoLayout(width, height, orientation);
    const episode = {
      topic: "Public housing",
      revision: 1,
      language: "en",
      outline: {
        chapters: [
          { id: "open", title: "First chapter" },
          { id: "next", title: "Sharing spaces around the park" },
        ],
      },
      script: {
        title: "Public housing",
        turns: [
          { id: "a", chapterId: "open", host: "A", text: "We start here." },
          { id: "b", chapterId: "next", host: "B", text: "We continue here." },
        ],
      },
      render: {
        revision: 1,
        clips: { a: { duration: 4 }, b: { duration: 3 } },
      },
    };
    const plan = buildTimeline(episode, { resolution });
    const overlay = prepareOverlay(context, plan);
    const holdFrames = orientation === "landscape" ? 60 : 45;
    for (const index of [0, holdFrames - 1]) {
      const frame = overlay.frameAt(index / 30);
      assert.equal(frame.card.kind, "intro");
      context.text.length = 0;
      overlay.draw(frame, "ocean");
      const title = context.text.find(
        ({ value }) => value === episode.script.title,
      );
      assert.equal(title.alpha, 1);
      assert.equal(title.font, videoFont(800, geometry.type.title));
      assert.ok(
        title.x >= geometry.title.x &&
          title.x + title.width <= right(geometry.title),
      );
      const caption = context.text.find(
        ({ value }) => value === episode.script.turns[0].text,
      );
      assert.equal(caption.alpha, 1);
      close(caption.y, center(geometry.caption));
    }
    assert.equal(overlay.frameAt(holdFrames / 30).card, undefined);
    for (const [index, fade] of [1, 0.75, 0.25, 0].entries())
      close(overlay.frameAt((holdFrames + index) / 30).stageFade, fade);
    assert.equal(
      prepareOverlay(context, { ...plan, transition: "cut" }).frameAt(
        holdFrames / 30,
      ).stageFade,
      0,
    );
  });

  test(`${orientation} caption plate is fixed and centers one or two lines`, () => {
    const context = recordingContext();
    const layout = videoLayout(width, height, orientation);
    const plan = {
      duration: 4,
      fps: 30,
      resolution: { width, height },
      estimated: false,
      chapters: [],
      scenes: [
        {
          kind: "turn",
          speakerId: "A",
          start: 0,
          end: 4,
          audioStart: 0,
          captions: [
            { start: 0, end: 2, lines: ["组屋里。"] },
            {
              start: 2,
              end: 4,
              lines: ["为什么我们在组屋里", "会听到不同的语言。"],
            },
          ],
        },
      ],
      callouts: [{ start: 0, end: 3, text: "One useful detail" }],
    };
    const overlay = prepareOverlay(context, plan);
    const caption = layout.caption;
    let previousPlate;
    for (const time of [0.1, 2.1]) {
      context.shapes.length = 0;
      context.text.length = 0;
      overlay.draw(overlay.frameAt(time), "ocean");
      const x = Math.round(caption.x);
      const y = Math.round(caption.y);
      const plate = context.shapes.find(
        (shape) => shape.box[0] === x && shape.box[1] === y,
      );
      assert.equal(plate.color, palettes.ocean.plate);
      assert.equal(plate.alpha, 1);
      const plateBottom = orientation === "portrait"
        ? Math.floor(bottom(caption))
        : Math.round(bottom(caption));
      assert.deepEqual(plate.box, [
        x,
        y,
        Math.round(right(caption)) - x,
        plateBottom - y,
        Math.round(layout.radius.caption),
      ]);
      if (previousPlate) assert.deepEqual(plate, previousPlate);
      const text = context.text.filter(
        (line) => line.font === videoFont(600, fontSize),
      );
      assert.equal(text.length, time < 2 ? 1 : 2);
      const lineHalf = (fontSize * 1.22) / 2;
      assert.ok(text[0].y - lineHalf >= y);
      assert.ok(text.at(-1).y + lineHalf <= plateBottom);
      close(
        text.reduce((sum, line) => sum + line.y, 0) / text.length,
        center(caption),
      );
      assert.ok(text.some((line) => line.value.includes("组屋里")));
      assert.ok(
        text.every(
          ({ alpha, color }) => alpha === 1 && color === palettes.ocean.ink,
        ),
      );
      const callout = context.text.find(
        ({ value }) => value === "One useful detail",
      );
      assert.equal(callout.alpha, 1);
      assert.ok(callout.y < caption.y);
      previousPlate = plate;
    }
  });
}

function checkChapterRails(orientation, resolution, titles, captionText) {
  const { width, height } = resolution;
  const { type, stroke, progress, chapter, chapterShort, chapterChip, callout, caption } =
    videoLayout(width, height, orientation);
  const calloutText = "A useful detail about shared space";
  const titleFont = videoFont(800, type.chapter);
  const captionFont = videoFont(600, type.caption);
  const calloutFont = videoFont(600, type.callout);
  const chapterId = "park";
  const chapterEnd = 100 / 30;
  const titleStep = type.chapter * 1.16;
  const captionBottom = chapterShort
    ? Math.floor(bottom(caption))
    : Math.round(bottom(caption));
  for (const { title, lines, short, truncated } of titles) {
    const box = short ? chapterShort : chapter;
    const plan = {
      duration: 6,
      fps: 30,
      resolution,
      chapterWindows: [
        { chapterId: "opening", start: 0, end: 2 },
        { chapterId, start: 2, end: 6 },
      ],
      scenes: [
        { kind: "chapter", chapterId, title, start: 2, end: chapterEnd },
        {
          kind: "turn",
          chapterId,
          speakerId: "A",
          start: 2,
          end: 6,
          audioStart: 0,
          captions: [{ start: 2, end: 6, lines: [captionText] }],
        },
      ],
      // An overlapping input still cannot place an annotation on a card.
      callouts: [{ chapterId, start: 2, end: 5, text: calloutText }],
    };
    const context = recordingContext();
    const copy = overlayCopy(plan);
    const overlay = prepareOverlay(context, plan, copy);
    const palette = palettes.ocean;
    for (const frame of [60, 62, 80, 99]) {
      context.text.length = 0;
      context.shapes.length = 0;
      overlay.draw(overlay.frameAt(frame / 30), "ocean");
      const label = context.text.find(
        ({ value }) => value === copy.chapterLabels[1],
      );
      const titleTop = label.y - (type.progress * 1.22) / 2;
      if (chapterShort) close(titleTop / height, lines === 3 ? 0.285 : 0.30);
      const track = context.shapes.find(({ color }) => color === palette.track);
      close(track.box[1] + track.box[3], bottom(progress));
      assert.ok(bottom(progress) < titleTop);
      assert.ok(titleTop >= box.y - 1e-8);

      const titleLines = context.text.filter(({ font }) => font === titleFont);
      assert.equal(titleLines.length, lines, title);
      const displayed = titleLines.map(({ value }) => value).join(" ");
      if (truncated) {
        assert.ok(displayed.endsWith("…"));
        assert.ok(title.startsWith(displayed.slice(0, -1)));
      } else assert.equal(displayed, title);
      const titleBottom = titleLines.at(-1).y + titleStep / 2;
      assert.ok(titleBottom <= bottom(box));
      assert.ok(titleBottom < callout.y);
      assert.ok(titleLines.every(({ x, width }) => x + width <= right(box) + 1e-8));
      const rule = context.shapes.find(({ box }) => box[2] === stroke.cardRule);
      if (rule) {
        assert.ok(rule.box[1] >= box.y);
        assert.ok(rule.box[1] + rule.box[3] <= bottom(box));
      }

      const plates = context.shapes.filter(({ color }) => color === palette.plate);
      assert.equal(plates.length, 2);
      const [chipPlate, captionPlate] = plates.map(({ box }) => box);
      close(chipPlate[1] - stroke.activeHostChip, chapterChip.y);
      assert.ok(titleBottom < chapterChip.y);
      close(captionPlate[1], Math.round(caption.y));
      close(captionPlate[1] + captionPlate[3], captionBottom);
      assert.ok(bottom(chapterChip) < captionPlate[1]);
      const cueLines = context.text.filter(({ font }) => font === captionFont);
      assert.equal(cueLines.length, 2);
      assert.equal(cueLines.map(({ value }) => value).join(" "), captionText);
      assert.ok(context.text.every(({ font }) => font !== calloutFont));
    }

    context.text.length = 0;
    context.shapes.length = 0;
    overlay.draw(overlay.frameAt(chapterEnd), "ocean");
    const annotation = context.text.filter(({ font }) => font === calloutFont);
    assert.equal(annotation.map(({ value }) => value).join(" "), calloutText);
    const [stageA, stageB, calloutPlate, captionPlate] = context.shapes
      .filter(({ color }) => color === palette.plate)
      .map(({ box }) => box);
    assert.ok(stageA[1] + stageA[3] < calloutPlate[1]);
    assert.ok(stageB[1] + stageB[3] < calloutPlate[1]);
    assert.ok(calloutPlate[1] + calloutPlate[3] < captionPlate[1]);
  }
}

test("portrait chapter titles of one to three lines clear the HUD, chip and two-line caption", () => {
  checkChapterRails(
    "portrait",
    { width: 1080, height: 1920 },
    [
      { title: "Parks", lines: 1, short: true },
      { title: "Shared spaces", lines: 2, short: true },
      { title: "Sharing spaces around the park", lines: 3 },
    ],
    "We share the park and walk home.",
  );
});

test("landscape chapter titles respect the two-line limit and clear the HUD, chip and two-line caption", () => {
  checkChapterRails(
    "landscape",
    { width: 1920, height: 1080 },
    [
      { title: "Shared spaces", lines: 1 },
      { title: "Shared spaces around the park near the river", lines: 2 },
      {
        title: "How parks connect neighbours across so many city blocks and shared community spaces",
        lines: 2,
        truncated: true,
      },
    ],
    "We share the park with our neighbours and walk home together.",
  );
});

test("compact landscape host chips fit their labels and show both marker states", () => {
  const context = recordingContext();
  const strokes = [];
  context.arc = (...circle) => {
    context.path = circle;
  };
  context.stroke = () => {
    strokes.push(context.lineWidth);
  };
  const resolution = { width: 320, height: 180 };
  const layout = videoLayout(320, 180, "landscape");
  const scenes = ["A", "B"].map((speakerId, start) => ({
    kind: "turn",
    speakerId,
    start,
    end: start + 1,
    audioStart: start,
    captions: [],
  }));
  const plan = {
    resolution,
    duration: 2,
    scenes,
    hostNames: { A: "A name longer than the whole chip budget", B: "Maya" },
  };
  const copy = overlayCopy(plan);
  const overlay = prepareOverlay(context, plan, copy);
  const palette = palettes.aurora;
  close(layout.type.host, 6.48);
  close(layout.marker, 4.68);
  for (const active of [0, 1]) {
    context.shapes.length = 0;
    context.text.length = 0;
    strokes.length = 0;
    overlay.drawHosts(overlay.frameAt(active), "aurora");
    const plates = context.shapes.filter(({ color }) => color === palette.plate);
    assert.deepEqual(
      context.text.map(({ value }) => value),
      [copy.hostLabels.A, plan.hostNames.B],
    );
    assert.equal(plates.length, 2);
    for (const [host, limit] of layout.hostChips.entries()) {
      const { x, font, color, value } = context.text[host];
      const [left, top, width, height] = plates[host].box;
      assert.equal(font, videoFont(800, 6.48));
      assert.equal(color, host === active ? "#F5F7FC" : "#C4CDDE");
      assert.ok(left >= limit.x && left + width <= right(limit));
      assert.ok(top > bottom(layout.wave[host]));
      assert.ok(top + height < layout.callout.y);
      context.font = font;
      assert.ok(x + context.measureText(value).width <= left + width);
    }
    const bStrokes = context.shapes.filter(
      ({ color, box }) => color === palette.hostB && box[2] <= layout.marker,
    );
    assert.equal(bStrokes.length, 2);
    for (const { box } of bStrokes) assert.ok(box[3] >= 1);
    assert.ok(bStrokes[0].box[1] + bStrokes[0].box[3] < bStrokes[1].box[1]);
    if (active === 1) assert.ok(strokes[0] >= 1);
  }
});

test("only the speaking chip has an inset accent outline and both labels clear the source contrast floor", (t) => {
  const luminance = (hex) => hex.match(/[\da-f]{2}/giu)
    .map((pair) => parseInt(pair, 16) / 255)
    .map((channel) => channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4)
    .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
  const minimum = { active: Infinity, idle: Infinity };
  for (const [orientation, width, height] of cases) {
    const { hostChips, stroke, radius } = videoLayout(width, height, orientation);
    const scenes = ["A", "B"].map((speakerId, start) => ({
      kind: "turn",
      speakerId,
      start,
      end: start + 1,
      audioStart: start,
      captions: [],
    }));
    const context = recordingContext();
    const overlay = prepareOverlay(context, {
      resolution: { width, height },
      duration: 3,
      scenes,
    });
    for (const [id, palette] of Object.entries(palettes)) {
      for (const time of [0, 1, 2]) {
        context.shapes.length = 0;
        context.text.length = 0;
        overlay.drawHosts(overlay.frameAt(time), id);
        const outlines = context.shapes.filter(({ box, color }) =>
          box[3] === hostChips[0].height &&
          [palette.hostA, palette.hostB].includes(color));
        assert.deepEqual(outlines.map(({ color }) => color),
          time === 0 ? [palette.hostA] : time === 1 ? [palette.hostB] : []);
        const plates = context.shapes.filter(({ color }) => color === palette.plate);
        assert.equal(plates.length, 2);
        for (const [host, chip] of hostChips.entries()) {
          const active = host === time;
          const [x, y, w, h, r] = plates[host].box;
          const { color } = context.text[host];
          assert.equal(color, active ? palette.ink : palette.secondaryInk);
          const colors = [luminance(color), luminance(plates[host].color)];
          const contrast = (Math.max(...colors) + 0.05) / (Math.min(...colors) + 0.05);
          assert.ok(contrast >= 4.5, `${orientation} ${id} host ${host} has ${contrast}:1 contrast`);
          const state = active ? "active" : "idle";
          minimum[state] = Math.min(minimum[state], contrast);
          if (active) {
            const [left, top, width, height, outerRadius] = outlines[0].box;
            close(top, chip.y);
            close(x - left, stroke.activeHostChip);
            close(y - top, stroke.activeHostChip);
            close(width - w, 2 * stroke.activeHostChip);
            close(height - h, 2 * stroke.activeHostChip);
            close(outerRadius - r, stroke.activeHostChip);
            assert.ok(left >= chip.x && left + width <= right(chip));
          } else {
            close(y, chip.y);
            close(h, chip.height);
            close(r, radius.host);
          }
        }
      }
    }
  }
  t.diagnostic(`Minimum source contrast: active ${minimum.active.toFixed(2)}:1, idle ${minimum.idle.toFixed(2)}:1`);
});

test("localized fallback names fit and the overlay freezes catalogue copy at preparation", () => {
  const context = recordingContext();
  const plan = {
    duration: 1,
    fps: 30,
    resolution: { width: 1080, height: 1920 },
    locale: "ms",
    estimated: false,
    chapters: [{ title: "Fixture", start: 0, timestamp: "0:00" }],
    scenes: [],
    showName: "An extremely long show name that exceeds the wordmark budget",
    hostNames: {
      A: "An extremely long host name that exceeds the chip budget",
      B: "Aminah",
    },
  };
  try {
    setLocale("ms");
    const copy = overlayCopy(plan);
    assert.ok(
      copy.texts.includes(
        createTranslator("ms")("publish.content.chapterNumber", { number: 1 }),
      ),
    );
    setLocale("en");
    const overlay = prepareOverlay(context, plan, copy);
    overlay.draw(overlay.frameAt(0), "light");
    assert.deepEqual(
      context.text.map(({ value }) => value),
      ["Studio Podkes", "1 / 1", "Hos A", "Aminah"],
    );
  } finally {
    setLocale("zh-CN");
  }
});

test("the wordmark uses the episode catalogue and a fitting show name takes precedence", () => {
  const resolution = { width: 1920, height: 1080 };
  for (const [locale, expected] of [
    ["zh-CN", "播客工作室"],
    ["en", "Podcast Studio"],
    ["ms", "Studio Podkes"],
  ]) {
    const plan = { locale, resolution, scenes: [], chapters: [] };
    const context = recordingContext();
    const copy = overlayCopy(plan);
    assert.ok(copy.texts.includes(expected));
    const overlay = prepareOverlay(context, plan, copy);
    overlay.draw(overlay.frameAt(0), "ocean");
    assert.equal(context.text[0].value, expected);
    assert.equal(context.text[0].font, videoFont(800, 1080 * 0.028));
    assert.equal(context.text[0].color, palettes.ocean.ink);
    const branded = prepareOverlay(context, {
      ...plan,
      showName: "Fixture Studio",
    });
    context.text.length = 0;
    branded.draw(branded.frameAt(0), "ocean");
    assert.equal(context.text[0].value, "Fixture Studio");
  }
});

test("canonical equivalents produce the same video plan, preflight copy and drawn text", () => {
  function render(accent) {
    const episode = {
      topic: `The caf${accent} district`,
      language: "en",
      revision: 1,
      outline: {
        chapters: [
          { id: "a", title: `A caf${accent} nearby` },
          { id: "b", title: `Another caf${accent}` },
        ],
      },
      script: {
        title: `Caf${accent} stories`,
        turns: [
          {
            id: "1",
            chapterId: "a",
            host: "A",
            text: `We found a caf${accent}.`,
          },
          {
            id: "2",
            chapterId: "a",
            host: "B",
            text: `The caf${accent} is open.`,
          },
          {
            id: "3",
            chapterId: "b",
            host: "A",
            text: `Ren${accent} meets us there.`,
          },
        ],
      },
      render: {
        revision: 1,
        clips: { 1: { duration: 3 }, 2: { duration: 4 } },
      },
    };
    const original = structuredClone(episode);
    const plan = buildTimeline(episode, {
      hostNames: { A: `Ren${accent}` },
      showName: `Caf${accent} Studio`,
      callouts: [{ chapterId: "a", start: 3, text: `Caf${accent} service` }],
      endCard: true,
    });
    assert.deepEqual(episode, original);
    const context = recordingContext();
    const copy = overlayCopy(plan);
    const overlay = prepareOverlay(context, plan, copy);
    for (const time of [0, 3.3, 7.5, plan.duration - 0.5])
      overlay.draw(overlay.frameAt(time), "aurora");
    return { plan, copy, text: context.text };
  }

  const canonical = render("é");
  assert.deepEqual(render("e\u0301"), canonical);
  for (const value of [
    "Café Studio",
    "René",
    "Café service",
    "Another café",
    "We found a café.",
  ])
    assert.ok(
      canonical.text.some((line) => line.value === value),
      value,
    );
});

test("thumbnail preflight and layout share NFC headlines and wordmarks", async () => {
  async function render(accent) {
    const context = {
      ...recordingContext(),
      save() {},
      restore() {},
      createLinearGradient: () => ({ addColorStop() {} }),
    };
    const canvas = {
      getContext: () => context,
      toBlob: (callback) => callback(new Blob(["mock"], { type: "image/png" })),
    };
    let preflight;
    await encodeThumbnail(
      canvas,
      {
        locale: "en",
        variant: "headline",
        headline: `Visit the caf${accent}`,
        wordmark: `Caf${accent} Studio`,
      },
      async ({ texts }) => {
        preflight = texts;
        return { notices: [], missingCharacters: [] };
      },
    );
    return { preflight, text: context.text };
  }
  const canonical = await render("é");
  assert.deepEqual(await render("e\u0301"), canonical);
  assert.ok(canonical.text.some(({ value }) => value === "Visit the café"));
  assert.ok(canonical.text.some(({ value }) => value === "Café Studio"));
});

test("visual QA seeks to the sample center and waits past an adjacent presentation", async () => {
  assert.doesNotThrow(() => assertFrameTime(80, 2.667));
  assert.throws(
    () => assertFrameTime(80, 2.7),
    /frame 80.*observed mediaTime 2\.700000 s/,
  );
  assert.doesNotThrow(() => assertFrameTime(177, 5.9));
  assert.throws(
    () => assertFrameTime(177, 178 / 30),
    /frame 177.*observed mediaTime 5\.933333 s/,
  );
  const video = new EventTarget();
  video.duration = 6;
  const callbacks = new Map();
  let nextId = 0;
  video.requestVideoFrameCallback = (callback) => {
    callbacks.set(++nextId, callback);
    return nextId;
  };
  video.cancelVideoFrameCallback = (id) => callbacks.delete(id);
  const present = (mediaTime) => {
    const pending = [...callbacks.values()];
    callbacks.clear();
    for (const callback of pending) callback(0, { mediaTime });
  };
  const pending = seekFrame(video, 80);
  assert.equal(video.currentTime, 80.5 / 30);
  video.dispatchEvent(new Event("seeked"));
  present(2.7);
  assert.equal(callbacks.size, 1);
  present(2.667);
  assert.equal(await pending, 2.667);
  assert.equal(callbacks.size, 0);
});

test("the Malay framing sample at frame 350 is a chapter card", () => {
  const { plan } = visualFixture({
    scene: "studio3d",
    orientation: "landscape",
    language: "ms",
  });
  const overlay = prepareOverlay(recordingContext(), plan);
  const { card } = overlay.frameAt(350 / 30);
  assert.equal(card.kind, "chapter");
  assert.equal(card.title, "Ruang bersama");
  assert.equal(card.start, 11.62);
  assert.equal(card.end, 13.233333);
});

test("visual QA separates a single decoded exterior edge from a connected crossing", () => {
  const width = 60;
  const height = 40;
  const pixels = new Uint8ClampedArray(width * height * 4);
  const titleSafe = { x: 12, y: 8, width: 36, height: 24 };
  pixels[10 * width * 4] = 255;
  assert.deepEqual(safeExterior(pixels, titleSafe, width, height), {
    total: 1,
    largestComponent: 1,
    connectedPixels: 0,
    codecRimPixels: 0,
    first: { x: 2, y: 10 },
  });
  for (let y = 11; y < 18; y++) pixels[y * width * 4] = 255;
  assert.deepEqual(safeExterior(pixels, titleSafe, width, height), {
    total: 8,
    largestComponent: 8,
    connectedPixels: 8,
    codecRimPixels: 0,
    first: { x: 2, y: 10 },
  });
});

test("visual QA retains true exterior crossings beside codec padding", () => {
  const width = 60;
  const height = 40;
  const safe = { x: 12, y: 8, width: 36, height: 24 };
  const pixels = new Uint8ClampedArray(width * height * 4).fill(60);
  const draw = (x, y, value) =>
    pixels.fill(value, 4 * (y * width + x), 4 * (y * width + x) + 3);
  for (let y = 0; y < height; y++) {
    draw(width - 2, y, 30);
    draw(width - 1, y, 30);
  }
  const padding = { right: true, bottom: false };
  const source = safeExterior(pixels, safe, width, height);
  assert.equal(source.connectedPixels, 2 * (height - 4));
  const decoded = safeExterior(pixels, safe, width, height, padding);
  assert.equal(decoded.codecRimPixels, 2 * (height - 4));
  assert.equal(decoded.connectedPixels, 0);
  // The two-column signal cannot mask connected, inward foreground detail.
  draw(width - 3, 12, 30);
  const withArtwork = safeExterior(pixels, safe, width, height, padding);
  assert.equal(withArtwork.codecRimPixels, 0);
  assert.ok(withArtwork.connectedPixels > 0);

  pixels.fill(60);
  for (let x = 0; x < width; x++) {
    draw(x, height - 2, 30);
    draw(x, height - 1, 30);
  }
  const bottom = safeExterior(pixels, safe, width, height, {
    right: false,
    bottom: true,
  });
  assert.equal(bottom.codecRimPixels, 2 * (width - 4));
  assert.equal(bottom.connectedPixels, 0);
  assert.equal(
    safeExterior(pixels, safe, width, height, padding).connectedPixels,
    2 * (width - 4),
  );
});

test("visual QA gates field flashes and reports cell rates as diagnostics", () => {
  const raw = flashAnalysis(8, 8);
  const decoded = flashAnalysis(8, 8);
  const grid = [8, 8];
  const dark = new Uint8ClampedArray(8 * 8 * 4);
  const local = dark.slice();
  local.fill(255, 0, 3);
  for (let frame = 0; frame <= 30; frame++) {
    raw.add(frame, Math.floor(frame / 2) % 2 ? local : dark);
    decoded.add(frame, frame % 2 ? local : dark);
  }
  const localResults = flashAssessment({ grid, raw, decoded });
  assert.deepEqual(localResults.issues, []);
  assert.deepEqual(
    localResults.diagnostics.filter(({ kind }) => kind === "general"),
    [
      {
        path: "raw",
        kind: "general",
        maxCellFlashesPerSecond: 7,
        softLimit: 10,
        exceedsSoftLimit: false,
      },
      {
        path: "decoded",
        kind: "general",
        maxCellFlashesPerSecond: 15,
        softLimit: 10,
        exceedsSoftLimit: true,
      },
    ],
  );

  const red = dark.map((_, index) => (index % 4 === 0 ? 255 : 0));
  const bright = dark.map(() => 255);
  for (const [pixels, expected] of [
    [bright, ["general"]],
    [red, ["general", "saturated red"]],
  ]) {
    const field = flashAnalysis(8, 8);
    for (let frame = 0; frame <= 30; frame++)
      field.add(frame, frame % 2 ? pixels : dark);
    const { issues } = flashAssessment({ grid, raw: field, decoded });
    assert.deepEqual(
      issues.map(({ detail }) => detail.split(" exceeded")[0]),
      expected.map((kind) => `raw ${kind}`),
    );
  }
});
