import assert from "node:assert/strict";
import test from "node:test";
import {
  isCurrentVideo,
  videoArtifactKey,
} from "../src/factory/useVideoRender.ts";
import { getScene, listScenes } from "../src/video/scenes/registry.ts";
import {
  drawWaveform,
  prepareWaveform,
  wavePeaks,
} from "../src/video/scenes/waveform.ts";
import { buildTimeline } from "../src/video/timeline.ts";

const sampleRate = 24_000;
const bins = 88;
const turn = {
  kind: "turn",
  chapterId: "opening",
  turnId: "one",
  speakerId: "A",
  start: 5,
  end: 8,
  audioStart: 1,
  captions: [],
};

test("the built-in registry lists waveform and Studio 3D and resolves an unknown ID", () => {
  assert.deepEqual(listScenes(), [
    { id: "waveform", kind: "2d", label: "video.scene.waveform" },
    { id: "studio3d", kind: "webgl", label: "video.scene.studio3d" },
  ]);
  assert.equal(getScene("missing"), getScene("waveform"));
  assert.notEqual(getScene("waveform").create(), getScene("waveform").create());
});

test("chapter overrides work from the opening speech and match later chapter cards", () => {
  const plan = buildTimeline(
    {
      revision: 1,
      outline: {
        chapters: [
          { id: "opening", title: "Opening" },
          { id: "closing", title: "Closing" },
        ],
      },
      script: {
        title: "Fixture",
        turns: [
          { id: "one", chapterId: "opening", host: "A", text: "Hello" },
          { id: "two", chapterId: "closing", host: "B", text: "Thanks" },
        ],
      },
    },
    {
      chapterSceneIds: {
        opening: "fixture",
        closing: "studio3d",
        other: "ignored",
      },
    },
  );
  assert.deepEqual(
    plan.scenes
      .filter(({ kind }) => kind === "chapter")
      .map(({ sceneId }) => sceneId),
    ["studio3d"],
  );
  assert.deepEqual(
    plan.chapterWindows.map(({ sceneId }) => sceneId),
    ["fixture", "studio3d"],
  );
  assert.deepEqual(plan.chapters[0], {
    title: "Opening",
    start: 0,
    timestamp: "0:00",
  });
});

test("the smoothed waveform is seek-independent, resets on host changes and decays in a turn", () => {
  const resolution = { width: 1080, height: 1920 };
  const first = { ...turn, start: 0, end: 2, audioStart: 0 };
  const second = { ...first, speakerId: "B", start: 2, end: 3, audioStart: 2 };
  const plan = { resolution, fps: 30, duration: 3, scenes: [first, second] };
  const samples = new Float32Array(3 * sampleRate);
  samples.fill(0.4, 0, sampleRate / 2);
  samples.fill(0.4, 2 * sampleRate);
  const audio = { sampleRate, channels: [samples] };
  const prepared = prepareWaveform(plan, audio);
  const bins = prepared.geometry.waveBarsPerHost;
  const alpha = 1 - Math.exp(-1000 / (30 * 67));
  assert.equal(bins, 20);
  assert.ok(Math.abs(prepared.levels[0] - alpha) < 1e-7);
  assert.ok(prepared.levels[bins] > prepared.levels[0]);
  assert.ok(prepared.levels[bins * 30] < prepared.levels[bins * 24]);
  assert.equal(prepared.levels[bins * 60], prepared.levels[0]);
  function draw(index, waveform) {
    const calls = [];
    const context = {
      fillRect(...box) {
        calls.push([this.fillStyle, ...box]);
      },
    };
    drawWaveform(context, waveform, {
      index,
      time: index / 30,
      turn: index < 60 ? first : second,
      paletteId: "light",
    });
    return calls;
  }
  const order = [0, 17, 59, 60, 89];
  const frames = new Map(order.map((index) => [index, draw(index, prepared)]));
  const fresh = prepareWaveform(plan, audio);
  for (const index of [60, 0, 89, 17, 59])
    assert.deepEqual(draw(index, fresh), frames.get(index));
});

test("the waveform uses all bins at the start, middle and end of a turn", () => {
  const samples = new Int16Array(sampleRate * 5);
  samples.fill(32767, 0, sampleRate);
  samples.fill(-8192, sampleRate, sampleRate * 2);
  samples.fill(16384, sampleRate * 2, sampleRate * 3);
  samples.fill(-24576, sampleRate * 3, sampleRate * 4);
  samples.fill(32767, sampleRate * 4);
  samples.fill(32767, sampleRate * 1.24, sampleRate * 1.5);
  samples.fill(32767, sampleRate * 3.5, sampleRate * 3.75);
  const audio = { sampleRate, channels: [samples] };

  for (const [time, amplitude] of [
    [5, 0.25],
    [6.5, 0.5],
    [8 - 1 / sampleRate, 0.75],
  ]) {
    assert.deepEqual(
      wavePeaks(audio, time, turn, bins),
      Array(bins).fill(amplitude),
    );
  }

  samples.fill(0, sampleRate, sampleRate * 4);
  for (const time of [5, 6.5, 8 - 1 / sampleRate]) {
    assert.deepEqual(wavePeaks(audio, time, turn, bins), Array(bins).fill(0));
  }
});

test("short or truncated PCM fills the available window and stays flat once it ends", () => {
  const audio = { sampleRate: 4, channels: [Float32Array.of(1, 0.25, -0.5)] };
  const shortTurn = { ...turn, start: 2, end: 5, audioStart: 0.25 };

  assert.deepEqual(wavePeaks(audio, 2, shortTurn, 4), [0.25, 0.25, 0.25, 0.25]);
  assert.deepEqual(
    wavePeaks(audio, 2.25, shortTurn, 4),
    [0.25, 0.25, 0.5, 0.5],
  );
  assert.deepEqual(wavePeaks(audio, 2.49, shortTurn, 4), [0.5, 0.5, 0.5, 0.5]);
  assert.deepEqual(wavePeaks(audio, 2.5, shortTurn, 4), [0, 0, 0, 0]);
});

test("a scene change makes a saved video stale and legacy receipts imply waveform", () => {
  const source = {
    episodeId: "fixture",
    revision: 1,
    sourceStamp: "audio-stamp",
  };
  const artifact = { ...source, kind: "video", id: videoArtifactKey(source) };
  const custom = {
    ...artifact,
    metadata: { studioVideo: { sceneId: "custom" } },
  };

  assert.equal(isCurrentVideo(artifact, source, "waveform"), true);
  assert.equal(isCurrentVideo(artifact, source, "custom"), false);
  assert.equal(isCurrentVideo(custom, source, "custom"), true);
  assert.equal(isCurrentVideo(custom, source, "waveform"), false);
});

test("changing a Studio 3D setting invalidates a saved preview", () => {
  const source = {
    episodeId: "fixture",
    revision: 1,
    sourceStamp: "audio-stamp",
  };
  const studio3d = {
    paletteId: "ocean",
    cameraPresetId: "orbit",
    intensity: 0.5,
  };
  const artifact = {
    ...source,
    kind: "video",
    id: videoArtifactKey(source),
    metadata: { studioVideo: { sceneId: "studio3d", studio3d } },
  };
  assert.equal(isCurrentVideo(artifact, source, "studio3d", studio3d), true);
  assert.equal(
    isCurrentVideo(artifact, source, "studio3d", { ...studio3d, intensity: 1 }),
    false,
  );
});
