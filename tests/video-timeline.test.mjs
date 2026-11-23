import assert from "node:assert/strict";
import test from "node:test";
import { assembly, sampleRate } from "../server/audio.mjs";
import { readEpisode } from "../shared/episode-record.ts";
import { probeVideoSupport } from "../src/video/capabilities.ts";
import { buildTimeline } from "../src/video/timeline.ts";

function fixture(language, titles, dialogue, durations = []) {
  const chapters = titles.map((title, index) => ({
    id: `chapter-${index + 1}`,
    title,
    angle: title,
    claimIds: [],
  }));
  const turns = dialogue.map(([chapter, host, text], index) => ({
    id: `turn-${index + 1}`,
    chapterId: chapters[chapter - 1].id,
    host,
    text,
    claimIds: [],
  }));
  const voices = { A: "marin", B: "cedar", C: "coral" };
  const episode = {
    id: "7baa7fc0-fbad-492d-abb7-8896fcd15d3f",
    topic: "Fixture topic",
    revision: 2,
    updated: "2026-11-23T00:00:00Z",
    language,
    voices: Object.fromEntries(turns.map(({ host }) => [host, voices[host]])),
    outline: { chapters, model: "fixture" },
    script: { title: "Fixture episode", model: "fixture", turns },
  };
  if (durations.length > 0) {
    episode.render = {
      revision: episode.revision,
      model: "fixture",
      clips: Object.fromEntries(
        turns.flatMap((turn, index) => {
          const duration = durations[index];
          return duration === undefined
            ? []
            : [
                [
                  turn.id,
                  { asset: `clip-${String(index).repeat(64)}.pcm`, duration },
                ],
              ];
        }),
      ),
    };
  }
  return readEpisode(episode);
}

const turnScenes = (plan) =>
  plan.scenes.filter((scene) => scene.kind === "turn");

function assertCaptionBounds(scene, maxCharacters) {
  let position = scene.start;
  assert.ok(scene.captions.length > 1);
  for (const cue of scene.captions) {
    assert.equal(cue.start, position);
    assert.ok(cue.end > cue.start && cue.end <= scene.end);
    assert.ok(cue.lines.length >= 1 && cue.lines.length <= 2);
    assert.ok(
      cue.lines.every(
        (line) => line && Array.from(line).length <= maxCharacters,
      ),
    );
    position = cue.end;
  }
  assert.equal(position, scene.end);
}

test("a measured solo episode has a deterministic landscape timeline and bounded Latin captions", () => {
  const text =
    "The audio timeline should preserve every word in an English sentence. "
      .repeat(3)
      .trim();
  const episode = fixture("en", ["Opening"], [[1, "A", text]], [12.5]);
  const original = structuredClone(episode);
  const plan = buildTimeline(episode);
  assert.deepEqual(episode, original);
  assert.equal(
    JSON.stringify(plan),
    JSON.stringify(buildTimeline(original, {})),
  );
  assert.deepEqual(plan, JSON.parse(JSON.stringify(plan)));
  assert.deepEqual(plan.resolution, { width: 1920, height: 1080 });
  assert.equal(plan.fps, 30);
  assert.equal(plan.duration, 16);
  assert.equal(plan.estimated, false);
  assert.deepEqual(plan.chapters, [
    { title: "Opening", start: 0, timestamp: "0:00" },
  ]);
  assert.deepEqual(plan.scenes.slice(0, 2), [
    { kind: "intro", title: "Fixture episode", start: 0, end: 2 },
    {
      kind: "chapter",
      chapterId: "chapter-1",
      title: "Opening",
      start: 2,
      end: 3.5,
    },
  ]);
  const [turn] = turnScenes(plan);
  assert.equal(turn.speakerId, "A");
  assert.equal(turn.audioStart, 0);
  assert.equal(turn.start, 3.5);
  assert.equal(turn.end, 16);
  assertCaptionBounds(turn, 42);
  assert.equal(turn.captions.flatMap(({ lines }) => lines).join(" "), text);
});

test("a two-speaker Mandarin episode preserves audio offsets and wraps captions in portrait", () => {
  const text = "浏览器里的字幕需要保留每一个汉字。".repeat(4);
  const episode = fixture(
    "zh",
    ["开场", "结论"],
    [
      [1, "A", text],
      [1, "B", "接下来介绍证据。"],
      [2, "A", "谢谢收听。"],
    ],
    [6, 7, 5],
  );
  const plan = buildTimeline(episode, {
    fps: 24,
    resolution: { width: 1080, height: 1920 },
  });
  assert.equal(plan.fps, 24);
  assert.deepEqual(plan.resolution, { width: 1080, height: 1920 });
  assert.deepEqual(
    plan.scenes.map(({ kind }) => kind),
    ["intro", "chapter", "turn", "turn", "chapter", "turn"],
  );
  assert.deepEqual(plan.chapters, [
    { title: "开场", start: 0, timestamp: "0:00" },
    { title: "结论", start: 16.96, timestamp: "0:16" },
  ]);
  const turns = turnScenes(plan);
  assert.deepEqual(
    turns.map(({ turnId, speakerId, audioStart, start, end }) => [
      turnId,
      speakerId,
      audioStart,
      start,
      end,
    ]),
    [
      ["turn-1", "A", 0, 3.5, 9.5],
      ["turn-2", "B", 6.23, 9.73, 16.73],
      ["turn-3", "A", 13.46, 18.46, 23.46],
    ],
  );
  assert.equal(plan.duration, 23.46);
  const audio = assembly(episode.script.turns, episode.outline.chapters, (id) =>
    Buffer.alloc(episode.render.clips[id].duration * sampleRate * 2),
  );
  assert.equal(turns[2].audioStart, audio.chapters[1].start);
  assertCaptionBounds(turns[0], 12);
  assert.equal(turns[0].captions.flatMap(({ lines }) => lines).join(""), text);
});

test("a three-speaker episode estimates missing and zero-length clips while preserving measured durations", () => {
  const episode = fixture(
    "sg",
    ["Mixed speech"],
    [
      [1, "A", "Ready"],
      [1, "B", "四個漢字"],
      [1, "C", "abcdefghijklmnopqrstuvwxyzabcd"],
    ],
    [2, undefined, 0],
  );
  const plan = buildTimeline(episode);
  assert.equal(plan.estimated, true);
  assert.deepEqual(
    turnScenes(plan).map(({ speakerId, start, end }) => [
      speakerId,
      start,
      end,
    ]),
    [
      ["A", 3.5, 5.5],
      ["B", 5.73, 6.73],
      ["C", 6.96, 8.96],
    ],
  );
  assert.equal(plan.duration, 8.96);
  assert.equal(JSON.stringify(plan), JSON.stringify(buildTimeline(episode)));
  episode.render.revision--;
  assert.equal(turnScenes(buildTimeline(episode))[0].end, 4.25);
  delete episode.render;
  assert.equal(turnScenes(buildTimeline(episode))[0].end, 4.25);
});

test("caption wrapping preserves code points and splits an unbroken Latin token", () => {
  const text = "𠮷".repeat(22) + "a".repeat(85);
  const episode = fixture("sg", ["Opening"], [[1, "A", text]], [10]);
  const [turn] = turnScenes(buildTimeline(episode));
  assertCaptionBounds(turn, 42);
  const lines = turn.captions.flatMap((cue) => cue.lines);
  assert.equal(lines[0], "𠮷".repeat(21));
  assert.equal(lines.join(""), text);
});

test("a draft without a script yields an intro without invented turn or chapter timings", () => {
  const { script, ...draft } = fixture("en", ["Opening"], [[1, "A", "Hello"]]);
  const plan = buildTimeline(draft);
  assert.deepEqual(plan.scenes, [
    { kind: "intro", title: draft.topic, start: 0, end: 2 },
  ]);
  assert.deepEqual(plan.chapters, []);
  assert.equal(plan.duration, 2);
});

test("the codec probe uses bound encoder checks and reports API presence independently", async () => {
  const calls = [];
  class VideoEncoder {
    static async isConfigSupported(config) {
      calls.push([this, config]);
      return { supported: config.codec.startsWith("avc1") };
    }
  }
  class AudioEncoder {
    static async isConfigSupported(config) {
      calls.push([this, config]);
      if (config.codec === "opus") throw new Error("Fixture rejection");
      return { supported: true };
    }
  }
  const report = await probeVideoSupport({
    VideoEncoder,
    AudioEncoder,
    VideoFrame: class {},
  });
  assert.deepEqual(report, {
    videoEncoder: true,
    videoFrame: true,
    offscreenCanvas: false,
    audioEncoder: true,
    codecs: { avc1: true, vp09: false, av01: false, mp4a: true, opus: false },
  });
  const video = {
    width: 1920,
    height: 1080,
    framerate: 30,
    bitrate: 5_000_000,
  };
  const audio = { numberOfChannels: 1, bitrate: 64_000 };
  assert.deepEqual(calls, [
    [VideoEncoder, { ...video, codec: "avc1.420028" }],
    [VideoEncoder, { ...video, codec: "vp09.00.40.08" }],
    [VideoEncoder, { ...video, codec: "av01.0.08M.08" }],
    [AudioEncoder, { ...audio, codec: "mp4a.40.2", sampleRate: 24_000 }],
    [AudioEncoder, { ...audio, codec: "opus", sampleRate: 48_000 }],
  ]);
});

test("the codec probe accepts injected checks and handles missing encoders and checks", async () => {
  const calls = [];
  const report = await probeVideoSupport({
    VideoEncoder: class {},
    OffscreenCanvas: class {},
    isConfigSupported(kind, { codec }) {
      calls.push([kind, codec]);
      return {
        supported: codec.startsWith("vp09") || codec.startsWith("av01"),
      };
    },
  });
  assert.deepEqual(calls, [
    ["video", "avc1.420028"],
    ["video", "vp09.00.40.08"],
    ["video", "av01.0.08M.08"],
  ]);
  assert.equal(report.offscreenCanvas, true);
  assert.deepEqual(report.codecs, {
    avc1: false,
    vp09: true,
    av01: true,
    mp4a: false,
    opus: false,
  });
  assert.deepEqual(await probeVideoSupport({ AudioEncoder: class {} }), {
    videoEncoder: false,
    videoFrame: false,
    offscreenCanvas: false,
    audioEncoder: true,
    codecs: { avc1: false, vp09: false, av01: false, mp4a: false, opus: false },
  });
});
