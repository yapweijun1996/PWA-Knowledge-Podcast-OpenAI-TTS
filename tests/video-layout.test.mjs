import assert from "node:assert/strict";
import test from "node:test";
import { createTranslator, setLocale } from "../src/i18n/index.ts";
import { videoLayout } from "../src/video/design/layout.ts";
import { palettes } from "../src/video/design/palettes.ts";
import { videoFont } from "../src/video/fonts/loader.ts";
import { overlayCopy, prepareOverlay } from "../src/video/overlay.ts";

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
    close(bottom(caption), captionBottom);
    close(caption.width, captionWidth);
    close(caption.height, 2 * (fontSize * 1.22 + layout.captionPad.y));
    close(right(progress), right(safe));
    close(wordmark.x, safe.x);
    assert.ok(bottom(callout) < caption.y);
    assert.ok(right(hostChips[0]) < hostChips[1].x);
    assert.ok(bottom(wave[0]) < hostChips[0].y);
    assert.equal(layout.waveBarsPerHost, bars);
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
      ["Studio Podcast", "1 / 1", "Hos A", "Aminah"],
    );
  } finally {
    setLocale("zh-CN");
  }
});
