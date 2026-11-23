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
  decodedBanding,
  fixture as visualFixture,
  flashAnalysis,
  flashAssessment,
  framingDelta,
  framingRegions,
  maximumFramingDelta,
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
      (orientation === "landscape" ? 0.028 : 0.021) * height,
    );
    close(bottom(caption), captionBottom);
    close(caption.width, captionWidth);
    close(caption.height, 2 * (fontSize * 1.22 + layout.captionPad.y));
    close(right(progress), right(safe));
    close(wordmark.x, safe.x);
    assert.ok(bottom(callout) < caption.y);
    assert.ok(bottom(layout.chapterChip) < caption.y);
    assert.ok(right(hostChips[0]) < hostChips[1].x);
    assert.ok(bottom(wave[0]) < hostChips[0].y);
    assert.equal(layout.waveBarsPerHost, bars);
    if (orientation === "portrait") {
      close(layout.chapter.y / height, 0.28);
      close(layout.type.chapter / height, 0.041);
      close(center(layout.chapterChip) / height, 0.495);
      close(center(layout.cardChip) / height, 0.505);
      const twoLineChapterBottom =
        layout.chapter.y +
        layout.type.progress * designTokens.common.leading.caption +
        layout.progressGap +
        2 * layout.type.chapter * designTokens.common.leading.chapter;
      close((layout.chapterChip.y - twoLineChapterBottom) / height, 0.0725);
      close(layout.stage.y / height, 0.17);
      for (const rail of wave) close(center(rail) / height, 0.3);
      for (const [, y] of designTokens.portrait.orbCenters) close(y, 0.3);
      close(designTokens.portrait.orbDiameterH, 0.118);
      close(layout.waveWash.box.y / height, 0.35);
      close(bottom(layout.waveWash.box) / height, 0.52);
      assert.equal(layout.waveWash.opacity, 0.06);
    } else {
      assert.equal(layout.waveWash, undefined);
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
      context.text.length = context.shapes.length = 0;
      overlay.draw(overlay.frameAt(127 / 30), "ocean");
      const label = context.text.find(
        ({ value }) => value === overlayCopy(plan).chapterLabels[1],
      );
      close(label.y - (geometry.type.progress * 1.22) / 2, height * 0.28);
      const title = context.text.find(
        ({ value }) => value === "Second chapter",
      );
      assert.equal(title.font, videoFont(800, height * 0.041));
      const chip = context.shapes.find(
        ({ box }) => box[4] === geometry.radius.host,
      );
      assert.ok(chip.box[1] >= geometry.chapterChip.y);
      assert.ok(chip.box[1] + chip.box[3] <= bottom(geometry.chapterChip));
      const caption = context.shapes.find(
        ({ box }) => box[4] === geometry.radius.caption,
      );
      assert.ok(chip.box[1] + chip.box[3] < caption.box[1]);
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
        ({ box }) =>
          box[4] === layout.radius.caption &&
          box[0] >= caption.x &&
          box[1] >= caption.y,
      );
      assert.equal(plate.color, palettes.ocean.plate);
      assert.equal(plate.alpha, 1);
      const [x, y, plateWidth, plateHeight] = plate.box;
      assert.ok(
        [x, y, plateWidth, plateHeight].every((value) => value % 16 === 0),
      );
      assert.ok(x >= caption.x && x - caption.x < layout.captionPad.x);
      assert.ok(y >= caption.y && y - caption.y < layout.captionPad.y);
      assert.ok(right(caption) - x - plateWidth >= 0);
      assert.ok(right(caption) - x - plateWidth < layout.captionPad.x);
      assert.ok(bottom(caption) - y - plateHeight >= 0);
      assert.ok(bottom(caption) - y - plateHeight < layout.captionPad.y);
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

test("active and idle chip ink follows each host's speaking state", () => {
  const context = recordingContext();
  const plan = {
    resolution: { width: 1920, height: 1080 },
    hostNames: { A: "Alice", B: "Ben" },
    scenes: ["A", "B"].map((speakerId, index) => ({
      kind: "turn",
      speakerId,
      start: index,
      end: index + 1,
      captions: [],
    })),
  };
  const overlay = prepareOverlay(context, plan);
  for (const palette of ["aurora", "light"]) {
    for (const [index, active] of ["Alice", "Ben"].entries()) {
      context.text.length = context.shapes.length = 0;
      overlay.drawHosts(overlay.frameAt(index + 0.5), palette);
      const { ink, secondaryInk, plate } = palettes[palette];
      assert.deepEqual(
        context.text.map(({ value, color }) => [value, color]),
        [
          ["Alice", active === "Alice" ? ink : secondaryInk],
          ["Ben", active === "Ben" ? ink : secondaryInk],
        ],
      );
      const plates = context.shapes.filter(({ color }) => color === plate);
      assert.equal(plates.length, 2);
      for (const { box } of plates)
        assert.ok(box.slice(0, 4).every((value) => value % 2 === 0));
    }
  }
});

test("decoded banding scans both axes and ignores an isolated noisy pixel", () => {
  const width = 192;
  const height = 128;
  for (const orientation of ["landscape", "portrait"]) {
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const value = 20 + (x >= 96 ? 4 : 0) + (y >= 88 ? 5 : 0);
        const offset = (y * width + x) * 4;
        pixels.set([value, value, value, 255], offset);
      }
    }
    const row = orientation === "landscape" ? 72 : 64;
    pixels.set([100, 100, 100, 255], (168 + row * width) * 4);
    pixels.set([100, 100, 100, 255], (184 + 48 * width) * 4);
    const { horizontal, vertical } = decodedBanding(
      pixels,
      width,
      height,
      orientation,
    );
    close(horizontal.step, 4 / 255);
    assert.equal(horizontal.x, 96);
    close(vertical.step, 5 / 255);
    assert.equal(vertical.y, 88);
  }
});

test("decoded framing compares the bottom rows and all six pixels beyond a rounded plate", () => {
  const [bottomRows, ...edges] = framingRegions(64, 64, [
    {
      kind: "caption",
      radius: 12,
      box: { x: 12, y: 12, width: 40, height: 32 },
    },
  ]);
  assert.deepEqual(bottomRows.box, { x: 0, y: 60, width: 64, height: 4 });
  const compare = (region, x, y, rgb) => {
    const { box } = region;
    const raw = new Uint8ClampedArray(box.width * box.height * 4);
    const decoded = raw.slice();
    decoded.set(rgb, ((y - box.y) * box.width + x - box.x) * 4);
    return framingDelta(raw, decoded, region);
  };
  assert.equal(
    compare(bottomRows, 63, 63, [0, 0, 3]).maxDelta,
    maximumFramingDelta,
  );
  assert.ok(
    compare(bottomRows, 63, 60, [0, 0, 4]).maxDelta > maximumFramingDelta,
  );
  const leftEdge = edges.find(({ name }) => name.endsWith(" left"));
  assert.equal(leftEdge.box.x, 6);
  const luma = compare(leftEdge, 6, 30, [0, 5, 0]);
  assert.ok(luma.maxDelta > maximumFramingDelta);
  assert.deepEqual([luma.x, luma.y], [6, 30]);
  assert.ok(
    compare(leftEdge, 11, 29, [0, 0, 10]).maxDelta < maximumFramingDelta,
  );

  const corner = edges.find(({ name }) => name.endsWith("top left corner"));
  assert.ok(compare(corner, 12, 12, [6, 6, 6]).maxDelta > maximumFramingDelta);
  assert.equal(compare(corner, 23, 23, [255, 255, 255]).maxDelta, 0);
});

test("the 2D background caches an opaque, deterministic dithered raster per size and palette", (t) => {
  class RasterCanvas {
    getContext() {
      return {
        createImageData: (width, height) => ({
          data: new Uint8ClampedArray(width * height * 4),
        }),
        putImageData: ({ data }) => {
          this.pixels = data;
        },
      };
    }
  }
  const original = Object.getOwnPropertyDescriptor(globalThis, "OffscreenCanvas");
  Object.defineProperty(globalThis, "OffscreenCanvas", {
    configurable: true,
    value: RasterCanvas,
  });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, "OffscreenCanvas", original);
    else delete globalThis.OffscreenCanvas;
  });

  const width = 256;
  const height = 128;
  const plan = { resolution: { width, height }, scenes: [] };
  const backgrounds = [];
  const testContext = () => ({
    ...recordingContext(),
    drawImage: (canvas, x, y) => {
      assert.deepEqual([x, y], [0, 0]);
      backgrounds.push(canvas);
    },
  });
  const context = testContext();
  prepareOverlay(context, plan).drawBackground("aurora");
  prepareOverlay(context, plan).drawBackground("aurora");
  prepareOverlay(context, plan).drawBackground("light");
  prepareOverlay(testContext(), plan).drawBackground("aurora");
  prepareOverlay(context, { ...plan, resolution: { width: 128, height } })
    .drawBackground("aurora");
  prepareOverlay(context, { ...plan, resolution: { width, height: height + 8 } })
    .drawBackground("aurora");
  const [first, reused, light, fresh, resized, partialRow] = backgrounds;
  assert.strictEqual(reused, first);
  assert.deepEqual(fresh.pixels, first.pixels);
  assert.notDeepEqual(light.pixels, first.pixels);
  assert.equal(resized.pixels.length, first.pixels.length / 2);
  // Fixed-coordinate quantization bias produces adjacent variation even
  // where the ideal Aurora gradient increases monotonically.
  assert.ok(first.pixels[4] > first.pixels[8]);
  assert.ok(
    first.pixels.every((value, index) => index % 4 !== 3 || value === 255),
  );
  const red = (y) =>
    Array.from(
      { length: width },
      (_, x) => partialRow.pixels[(y * width + x) * 4],
    );
  const decreases = (row) =>
    row.some((value, x) => x > 0 && value < row[x - 1]);
  assert.ok(decreases(red(height - 1)));
  for (let y = height; y < height + 8; y++)
    assert.equal(decreases(red(y)), false);
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
    first: { x: 2, y: 10 },
  });
  for (let y = 11; y < 18; y++) pixels[y * width * 4] = 255;
  assert.deepEqual(safeExterior(pixels, titleSafe, width, height), {
    total: 8,
    largestComponent: 8,
    connectedPixels: 8,
    first: { x: 2, y: 10 },
  });
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
