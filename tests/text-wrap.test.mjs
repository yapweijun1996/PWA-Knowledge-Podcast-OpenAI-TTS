import assert from "node:assert/strict";
import test from "node:test";
import { drawThumbnail } from "../src/publish/thumbnail.ts";
import { paginateText, wrapDisplayText, wrapText } from "../src/text/wrap.ts";
import { drawFrame } from "../src/video/draw.ts";

const trialTitle = "组屋里的混居，是怎么被设计出来的";
const balancedTrial = ["组屋里的混居，是", "怎么被设计出来的"];

function recordingContext(unit = 1, sizeSensitive = false) {
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
      const size = Number(this.font?.match(/ (\d+(?:\.\d+)?)px/u)?.[1] ?? 54);
      return { width: width * unit * (sizeSensitive && size < 54 ? 0.4 : 1) };
    },
  };
}

test("balances the trial title in both canvas outputs", () => {
  const titleCard = recordingContext(50, true);
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
  assert.deepEqual(titleCard.lines, ["Podcast Studio", ...balancedTrial]);

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
  const context = recordingContext(50, true);
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
    "Podcast Studio",
    "Host A",
    "主持人 B",
    "甲乙丙丁戊己庚辛",
    "壬癸子丑寅卯辰，巳",
  ]);
  assert.deepEqual(plan.scenes[0].captions[0].lines, lines);
  context.lines.length = 0;
  drawFrame(context, plan, audio, "dark", 1, speakers);
  assert.deepEqual(context.lines, ["Podcast Studio", "Host A", "主持人 B"]);
});

test("repaginates an oversized legacy cue without dropping its words", () => {
  const context = recordingContext(40, true);
  const phrase = "The caption preserves all the words";
  const plan = {
    fps: 30,
    duration: 6,
    resolution: { width: 1080, height: 1920 },
    scenes: [
      {
        kind: "turn",
        speakerId: "A",
        start: 0,
        end: 6,
        audioStart: 0,
        captions: [{ start: 0, end: 6, lines: [phrase] }],
      },
    ],
  };
  const audio = { sampleRate: 1, channels: [new Float32Array(6)] };
  const shown = new Set();
  for (let time = 0; time < 6; time += 0.25) {
    context.lines.length = 0;
    drawFrame(context, plan, audio, "dark", time);
    context.lines.slice(3).forEach((line) => shown.add(line));
  }
  assert.equal([...shown].join(" "), phrase);
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

test("CJK captions keep the housing phrase, punctuation and a supplied name together", () => {
  const context = recordingContext();
  const examples = [
    "在新加坡的组屋里，不同族群怎样成为邻居？",
    "这就是为什么我们在组屋里会听到不同的语言。",
    "我们问了陈美玲：「组屋里住着谁？」",
  ];
  for (const text of examples) {
    const pages = paginateText(context, text, 18, {
      locale: "zh-CN",
      limits: [2, 9, 26],
      keepTogether: ["陈美玲"],
    });
    const lines = pages.flatMap((page) => page.lines);
    assert.equal(lines.join(""), text);
    assert.ok(lines.some((line) => line.includes("组屋里")));
    if (text.includes("陈美玲"))
      assert.ok(lines.some((line) => line.includes("陈美玲")));
    for (const { lines } of pages) {
      assert.ok(lines.length <= 2);
      for (const line of lines) {
        assert.ok(context.measureText(line).width <= 18);
        assert.doesNotMatch(line, /^[，。！？、）」)]|[（「(]$/u);
      }
      if (lines.length > 1)
        assert.doesNotMatch(
          lines.at(-1),
          /^\p{Script=Han}[\p{P}]*$|^[\p{P}\s]+$/u,
        );
    }
  }
});

test("Malay spaces and mixed graphemes count against their role limits", () => {
  const context = recordingContext();
  const malay = "Kami tinggal bersama sejak 20 km dari bandar.";
  const mixed = "项目（OpenAI）介绍 Dr. Lee 走了 30 km。";
  for (const [text, locale, groups] of [
    [malay, "ms", ["tinggal", "20 km"]],
    [mixed, "zh-CN", ["（OpenAI）", "Dr. Lee", "30 km"]],
  ]) {
    const pages = paginateText(context, text, 24, {
      locale,
      limits: [2, 11, 20],
    });
    assert.equal(
      pages
        .map((page) => page.text)
        .join("")
        .replaceAll(" ", ""),
      text.replaceAll(" ", ""),
    );
    for (const group of groups)
      assert.ok(
        pages.some(({ lines }) => lines.some((line) => line.includes(group))),
        group,
      );
    assert.ok(
      pages.flatMap(({ lines }) => lines).every((line) => line.length <= 20),
    );
  }
  const abbreviations = paginateText(
    context,
    "The U.S. study uses, e.g., four cases.",
    13,
    {
      locale: "en",
      limits: [2, 11, 20],
    },
  ).flatMap(({ lines }) => lines);
  assert.ok(abbreviations.some((line) => line.includes("U.S.")));
  assert.ok(abbreviations.some((line) => line.includes("e.g.,")));
  assert.deepEqual(
    wrapDisplayText(context, "12 34 56", 100, { limits: [1, 4, 7] }),
    ["12 34…"],
  );
  assert.deepEqual(
    wrapDisplayText(context, "甲 AB", 100, { limits: [1, 2, 20] }, false),
    [],
  );
  assert.deepEqual(wrapDisplayText(context, "好", 8, { limits: [2, 4, 8] }), [
    "好",
  ]);
  assert.deepEqual(
    wrapDisplayText(
      {
        measureText: (text) => ({
          width: text.length,
          actualBoundingBoxRight: text.length * 2,
        }),
      },
      "four",
      7,
      { limits: [1, 4, 8] },
      false,
    ),
    [],
  );
});
