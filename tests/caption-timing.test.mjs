import assert from "node:assert/strict";
import { test } from "node:test";
import {
  captionRateCeilings,
  captionRateTargets,
  readingRate,
  rebalanceCues,
  requiredSeconds,
  snapCaptionTime,
  targetSeconds,
} from "../src/video/caption-timing.ts";

const near = (actual, expected) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} vs ${expected}`);
const housingTitle = "组屋里的混居，是怎么被设计出来的";
const housingLine = "新加坡的组屋，让不同族群的家庭住在同一栋楼里。";

test("Mandarin episode cues count Han and full-width punctuation as CJK graphemes", () => {
  assert.deepEqual(readingRate(housingTitle, 2), {
    cjkPerSecond: 8,
    latinPerSecond: 0,
    wordsPerMinute: 0,
  });
  assert.deepEqual(readingRate(housingLine), {
    cjkPerSecond: 23,
    latinPerSecond: 0,
    wordsPerMinute: 0,
  });
  near(requiredSeconds(housingTitle), 16 / 9);
  near(targetSeconds(housingTitle), 16 / 7);
});

test("English and Malay count Latin punctuation, internal spaces, words and combining marks", () => {
  assert.deepEqual(readingRate("  Hello, world!  ", 2), {
    cjkPerSecond: 0,
    latinPerSecond: 6.5,
    wordsPerMinute: 60,
  });
  assert.deepEqual(readingRate("Selamat datang, semua!"), {
    cjkPerSecond: 0,
    latinPerSecond: 22,
    wordsPerMinute: 180,
  });
  assert.deepEqual(readingRate("Cafe\u0301 dan teh."), {
    cjkPerSecond: 0,
    latinPerSecond: 13,
    wordsPerMinute: 180,
  });
  assert.deepEqual(readingRate("  \n\t"), {
    cjkPerSecond: 0,
    latinPerSecond: 0,
    wordsPerMinute: 0,
  });
  near(requiredSeconds("Hello, world!"), 2 / 3);
  near(requiredSeconds("Selamat datang, semua!"), 22 / 20);
  near(targetSeconds("Hello, world!"), 13 / 17);
  near(targetSeconds("I am on it."), 240 / 160);
  near(targetSeconds("Selamat datang, semua!"), 22 / 17);
});

test("mixed cues need additive time and count spaces within Latin runs", () => {
  const text = "组屋里，HDB  flats.";
  assert.deepEqual(readingRate(text), {
    cjkPerSecond: 4,
    latinPerSecond: 11,
    wordsPerMinute: 120,
  });
  assert.deepEqual(readingRate("组屋 HDB flats， 社区"), {
    cjkPerSecond: 5,
    latinPerSecond: 9,
    wordsPerMinute: 120,
  });
  near(requiredSeconds(text), 4 / 9 + 2 / 3);
  near(targetSeconds(text), 4 / 7 + 120 / 160);
  assert.deepEqual(captionRateTargets, {
    cjkPerSecond: 7,
    latinPerSecond: 17,
    wordsPerMinute: 160,
  });
  assert.deepEqual(captionRateCeilings, {
    cjkPerSecond: 9,
    latinPerSecond: 20,
    wordsPerMinute: 180,
  });
});

test("flags the café cue when its voiced window is too fast", () => {
  const cue = {
    text: "We met in the cafe\u0301 after lunch.",
    start: 0,
    end: 2.137,
  };
  near(requiredSeconds(cue.text, "en"), 7 / 3);
  const { flags } = rebalanceCues([cue], { start: cue.start, end: cue.end });
  assert.deepEqual(flags, [{ cueIndex: 0, code: "caption.tooFast" }]);
});

test("repair moves a boundary between cues without changing text, order or metadata", () => {
  const original = Object.freeze([
    Object.freeze({ text: housingTitle, start: 0, end: 1, speaker: "A" }),
    Object.freeze({ text: "对。", start: 1, end: 3, speaker: "A" }),
  ]);
  const { cues, flags } = rebalanceCues(original, { start: 0, end: 3 });
  assert.deepEqual(flags, []);
  assert.deepEqual(cues, [
    { ...original[0], end: 54 / 30 },
    { ...original[1], start: 54 / 30 },
  ]);
});

test("repair snaps to 30 fps while preserving a valid gap and enforcing the 6.5-second limit", () => {
  const original = [
    { text: "Baik.", start: 0.01, end: 1.017 },
    { text: "Mari kita mulakan.", start: 2.01, end: 10 },
  ];
  assert.equal(snapCaptionTime(0.017), 1 / 30);
  assert.deepEqual(rebalanceCues(original, { start: 0, end: 10 }), {
    cues: [
      { ...original[0], start: 0, end: 31 / 30 },
      { ...original[1], start: 2, end: 8.5 },
    ],
    flags: [],
  });
});

test("repair borrows confirmed silence only, capped at six frames across both edges", () => {
  const text = "你好，欢迎。";
  const original = [{ text, start: 1, end: 1.8 }];
  assert.deepEqual(
    rebalanceCues(original, {
      start: 1,
      end: 1.8,
      silenceBefore: 0.3,
      silenceAfter: 0.1,
    }),
    {
      cues: [{ text, start: 0.9, end: 1.9 }],
      flags: [],
    },
  );
  assert.deepEqual(
    rebalanceCues(original, { start: 1, end: 1.8, silenceAfter: 0.06 }),
    {
      cues: [{ text, start: 1, end: 55 / 30 }],
      flags: [{ cueIndex: 0, code: "caption.tooShort" }],
    },
  );

  const dense = { text: housingLine, start: 2, end: 3 };
  assert.deepEqual(
    rebalanceCues([dense], {
      start: 2,
      end: 3,
      silenceBefore: 1,
      silenceAfter: 1,
    }),
    {
      cues: [{ ...dense, end: 3.2 }],
      flags: [{ cueIndex: 0, code: "caption.tooFast" }],
    },
  );
});

test("an infeasible speaker window preserves every cue and reports each unmet hard limit", () => {
  const original = [
    { text: "组屋里，HDB flats.", start: 0, end: 0.4 },
    { text: "Selamat datang, semua!", start: 0.4, end: 1.5 },
  ];
  const result = rebalanceCues(original, { start: 0, end: 1.5 });
  assert.deepEqual(
    result.cues.map(({ text }) => text),
    original.map(({ text }) => text),
  );
  assert.equal(result.cues[0].end, result.cues[1].start);
  assert.equal(result.cues[1].end, 1.5);
  assert.deepEqual(result.flags, [
    { cueIndex: 0, code: "caption.tooShort" },
    { cueIndex: 0, code: "caption.tooFast" },
    { cueIndex: 1, code: "caption.tooShort" },
    { cueIndex: 1, code: "caption.tooFast" },
  ]);
  assert.deepEqual(
    rebalanceCues([{ text: "住".repeat(60), start: 0, end: 7 }], {
      start: 0,
      end: 7,
    }),
    {
      cues: [{ text: "住".repeat(60), start: 0, end: 6.5 }],
      flags: [{ cueIndex: 0, code: "caption.tooFast" }],
    },
  );
});
