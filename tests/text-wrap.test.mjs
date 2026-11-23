import assert from "node:assert/strict";
import test from "node:test";
import { drawThumbnail } from "../src/publish/thumbnail.ts";
import { wrapText } from "../src/text/wrap.ts";
import { drawFrame } from "../src/video/draw.ts";

const trialTitle = "组屋里的混居，是怎么被设计出来的";
const balancedTrial = ["组屋里的混居，是", "怎么被设计出来的"];

function recordingContext(unit = 1) {
  return {
    lines: [],
    save() {},
    restore() {},
    fillRect() {},
    fillText(line) {
      this.lines.push(line);
    },
    measureText(text) {
      const width = Array.from(text).reduce((sum, character) => {
        if (/\p{M}/u.test(character)) return sum;
        return (
          sum + (/[\p{Script=Han}，。！？、（）「」]/u.test(character) ? 2 : 1)
        );
      }, 0);
      return { width: width * unit };
    },
  };
}

test("balances the trial title in both canvas outputs", () => {
  const titleCard = recordingContext(50);
  const plan = {
    resolution: { width: 1920, height: 1080 },
    scenes: [{ kind: "intro", start: 0, end: 2, title: trialTitle }],
  };
  drawFrame(
    titleCard,
    plan,
    { sampleRate: 1, channels: [new Float32Array(1)] },
    "dark",
    0,
  );
  assert.deepEqual(titleCard.lines, balancedTrial);

  const thumbnail = recordingContext(35);
  drawThumbnail(thumbnail, {
    title: trialTitle,
    theme: "dark",
    language: "zh",
  });
  assert.deepEqual(thumbnail.lines, balancedTrial);
});

test("keeps brackets and closing punctuation attached in narrow layouts", () => {
  const context = recordingContext();
  const title = "甲乙（丙丁）戊！己？庚、辛。壬，癸「甲」(in)";
  const lines = wrapText(context, title, 8, "zh-CN");
  assert.equal(lines.join(""), title);
  for (const line of lines) {
    assert.doesNotMatch(line, /^[，。！？、）」)]/u);
    assert.doesNotMatch(line, /[（「(]$/u);
    assert.ok(context.measureText(line).width <= 8);
  }
  assert.deepEqual(wrapText(context, "天地玄黄，宇宙洪荒。", 8), [
    "天地玄",
    "黄，宇宙",
    "洪荒。",
  ]);
});

test("wraps mixed Chinese, English, and Malay without splitting Latin words", () => {
  const context = recordingContext();
  assert.deepEqual(wrapText(context, "项目（OpenAI）介绍", 12, "zh-CN"), [
    "项目",
    "（OpenAI）",
    "介绍",
  ]);
  assert.deepEqual(
    wrapText(context, "Bagaimana kejiranan dibina bersama", 20, "ms"),
    ["Bagaimana kejiranan", "dibina bersama"],
  );
  assert.deepEqual(wrapText(context, "A simple plan is", 13, "en"), [
    "A simple",
    "plan is",
  ]);
  const longWord = "Antidisestablishmentarianism";
  assert.deepEqual(wrapText(context, `${longWord} today`, 10, "en"), [
    longWord,
    "today",
  ]);
});

test("draws one-line and balanced three-line thumbnails", () => {
  const short = recordingContext(35);
  drawThumbnail(short, {
    title: "Kejiranan kita",
    theme: "light",
    language: "ms",
  });
  assert.deepEqual(short.lines, ["Kejiranan kita"]);

  const thumbnail = recordingContext(35);
  const title = "甲乙丙丁戊己庚辛壬癸".repeat(3) + "甲乙丙丁戊己";
  drawThumbnail(thumbnail, { title, theme: "light", language: "zh" });
  assert.equal(thumbnail.lines.join(""), title);
  assert.deepEqual(
    thumbnail.lines.map((line) => line.length),
    [12, 12, 12],
  );
});

test("rebalances pre-wrapped caption lines without changing the cue text or timing", () => {
  const context = recordingContext(50);
  const lines = ["甲乙丙丁戊己庚辛壬癸子丑寅卯辰", "，巳"];
  const plan = {
    resolution: { width: 1920, height: 1080 },
    scenes: [
      {
        kind: "turn",
        speakerId: "A",
        start: 0,
        end: 2,
        audioStart: 0,
        captions: [{ start: 0, end: 1, lines }],
      },
    ],
  };
  const audio = { sampleRate: 1, channels: [new Float32Array(2)] };
  const speakers = new Map([["A", "Host A"]]);
  drawFrame(context, plan, audio, "dark", 0.5, speakers);
  assert.deepEqual(context.lines, [
    "Host A",
    "甲乙丙丁戊己庚辛壬",
    "癸子丑寅卯辰，巳",
  ]);
  assert.deepEqual(plan.scenes[0].captions[0].lines, lines);
  context.lines.length = 0;
  drawFrame(context, plan, audio, "dark", 1, speakers);
  assert.deepEqual(context.lines, ["Host A"]);
});

test("preserves astral characters and combining marks without Intl.Segmenter", (t) => {
  const segmenter = Intl.Segmenter;
  Intl.Segmenter = undefined;
  t.after(() => {
    Intl.Segmenter = segmenter;
  });

  const context = recordingContext();
  assert.deepEqual(wrapText(context, "𠮷𠮷𠮷", 4, "zh-CN"), ["𠮷", "𠮷𠮷"]);
  assert.deepEqual(wrapText(context, "e\u0301e\u0301 test", 4, "en"), [
    "e\u0301e\u0301",
    "test",
  ]);
});
