import assert from "node:assert/strict";
import test from "node:test";
import { createTranslator, setLocale } from "../src/i18n/index.ts";
import { videoLayout } from "../src/video/design/layout.ts";
import { palettes } from "../src/video/design/palettes.ts";
import { designTokens } from "../src/video/design/tokens.ts";
import { videoFont } from "../src/video/fonts/loader.ts";
import { overlayCopy, prepareOverlay } from "../src/video/overlay.ts";
import { buildTimeline } from "../src/video/timeline.ts";

const close = (a, b) =>
  assert.ok(Math.abs(a - b) < 1e-8, `${a} is not close to ${b}`);
const right = ({ x, width }) => x + width;
const bottom = ({ y, height }) => y + height;
const center = ({ y, height }) => y + height / 2;
const cases = [
  ["landscape", 1920, 1080, 54, 907.2, 1382.4, 36],
  ["portrait", 1080, 1920, 61.44, 1344, 756, 20],
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
      layout.title,
      layout.titleGraphic,
      layout.chapter,
      layout.stage,
    ];
    for (const box of boxes) {
      assert.ok(box.x >= safe.x - 1e-8 && box.y >= safe.y - 1e-8);
      assert.ok(
        right(box) <= right(safe) + 1e-8 && bottom(box) <= bottom(safe) + 1e-8,
      );
    }
    close(layout.type.caption, fontSize);
    close(layout.marker, 0.018 * height);
    close(
      layout.type.wordmark,
      (orientation === "landscape" ? 0.022 : 0.016) * height,
    );
    close(bottom(caption), captionBottom);
    close(caption.width, captionWidth);
    close(caption.height, 2 * (fontSize * 1.22 + layout.captionPad.y));
    close(right(progress), right(safe));
    close(wordmark.x, safe.x);
    assert.ok(bottom(callout) < caption.y);
    assert.ok(right(hostChips[0]) < hostChips[1].x);
    assert.ok(bottom(wave[0]) < hostChips[0].y);
    assert.equal(layout.waveBarsPerHost, bars);
    if (orientation === "portrait") {
      close(layout.chapter.y / height, 0.25);
      close(layout.stage.y / height, 0.17);
      for (const rail of wave) close(center(rail) / height, 0.3);
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
          { id: "next", title: "Second chapter" },
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
    if (orientation === "portrait") {
      context.text.length = 0;
      overlay.draw(overlay.frameAt(127 / 30), "ocean");
      const label = context.text.find(
        ({ value }) => value === overlayCopy(plan).chapterLabels[1],
      );
      close(label.y - (geometry.type.progress * 1.22) / 2, height * 0.25);
    }
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
      const plate = context.shapes.find(
        (shape) => shape.box[0] === caption.x && shape.box[1] === caption.y,
      );
      assert.equal(plate.color, palettes.ocean.plate);
      assert.equal(plate.alpha, 1);
      assert.deepEqual(plate.box, [
        caption.x,
        caption.y,
        caption.width,
        caption.height,
        layout.radius.caption,
      ]);
      if (previousPlate) assert.deepEqual(plate, previousPlate);
      const text = context.text.filter(
        (line) => line.font === videoFont(600, fontSize),
      );
      assert.equal(text.length, time < 2 ? 1 : 2);
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
    assert.equal(context.text[0].font, videoFont(600, 1080 * 0.022));
    assert.equal(context.text[0].color, palettes.ocean.secondaryInk);
    const branded = prepareOverlay(context, {
      ...plan,
      showName: "Fixture Studio",
    });
    context.text.length = 0;
    branded.draw(branded.frameAt(0), "ocean");
    assert.equal(context.text[0].value, "Fixture Studio");
  }
});
