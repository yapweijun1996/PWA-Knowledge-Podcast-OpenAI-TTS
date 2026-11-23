import assert from "node:assert/strict";
import test from "node:test";
import {
  isCurrentVideo,
  videoArtifactKey,
} from "../src/factory/useVideoRender.ts";
import { getScene, listScenes } from "../src/video/scenes/registry.ts";
import { wavePeaks } from "../src/video/scenes/waveform.ts";
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

test("the built-in registry lists only waveform and resolves an unknown ID", () => {
  assert.deepEqual(listScenes(), [
    { id: "waveform", kind: "2d", label: "video.scene.waveform" },
  ]);
  assert.equal(getScene("missing"), getScene("waveform"));
  assert.notEqual(getScene("waveform").create(), getScene("waveform").create());
});

test("the timeline builder attaches overrides to the matching chapter cards", () => {
  const plan = buildTimeline(
    {
      revision: 1,
      outline: { chapters: [{ id: "opening", title: "Opening" }] },
      script: {
        title: "Fixture",
        turns: [{ id: "one", chapterId: "opening", host: "A", text: "Hello" }],
      },
    },
    { chapterSceneIds: { opening: "fixture", other: "ignored" } },
  );

  assert.equal(
    plan.scenes.find(({ kind }) => kind === "chapter").sceneId,
    "fixture",
  );
  assert.deepEqual(plan.chapters, [
    { title: "Opening", start: 0, timestamp: "0:00" },
  ]);
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
  assert.deepEqual(wavePeaks(audio, 2.25, shortTurn, 4), [0.25, 0.25, 0.5, 0.5]);
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
