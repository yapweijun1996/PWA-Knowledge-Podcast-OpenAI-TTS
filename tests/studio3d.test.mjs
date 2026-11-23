import assert from "node:assert/strict";
import test from "node:test";
import {
  audioStateAt,
  spectrumBins,
  spectrumWindowSize,
} from "../src/video/scenes/studio3d/audio-state.ts";
import {
  cameraLabels,
  cameraPoseAt,
  defaultStudio3dSettings,
  paletteLabels,
  resolveStudio3dOptions,
} from "../src/video/scenes/studio3d/presets.ts";

test("studio presets have a closed set of IDs and report unknown IDs", () => {
  assert.deepEqual(Object.keys(paletteLabels), [
    "aurora",
    "sunset",
    "mono",
    "ocean",
  ]);
  assert.deepEqual(Object.keys(cameraLabels), [
    "drift",
    "orbit",
    "static",
    "push-in",
  ]);
  assert.deepEqual(resolveStudio3dOptions(), {
    settings: defaultStudio3dSettings,
    notices: [],
  });
  assert.deepEqual(
    resolveStudio3dOptions({
      paletteId: "ocean",
      cameraPresetId: "push-in",
      intensity: 0.65,
    }),
    {
      settings: {
        paletteId: "ocean",
        cameraPresetId: "push-in",
        intensity: 0.65,
      },
      notices: [],
    },
  );
  assert.deepEqual(
    resolveStudio3dOptions({
      paletteId: "__proto__",
      cameraPresetId: "toString",
    }),
    {
      settings: defaultStudio3dSettings,
      notices: ["unknown-palette", "unknown-camera"],
    },
  );
});

test("studio intensity clamps to the supported interval", () => {
  for (const [intensity, expected] of [
    [-Infinity, 0],
    [-1, 0],
    [0, 0],
    [0.3, 0.3],
    [1, 1],
    [1.2, 1],
    [Infinity, 1],
    [NaN, 1],
  ]) {
    assert.equal(
      resolveStudio3dOptions({ intensity }).settings.intensity,
      expected,
    );
  }
});

const sampleRate = 8192;
const turn = {
  kind: "turn",
  chapterId: "one",
  turnId: "two",
  speakerId: "B",
  start: 5,
  end: 6,
  audioStart: 1,
  captions: [],
};

test("studio audio drives the speaker and spectrum from the matching PCM turn", () => {
  const samples = new Int16Array(3 * sampleRate);
  samples.fill(32767);
  const toneBin = 7;
  for (let offset = 0; offset < sampleRate; offset++) {
    samples[sampleRate + offset] = Math.round(
      16384 * Math.sin((2 * Math.PI * toneBin * offset) / spectrumWindowSize),
    );
  }
  const audio = { sampleRate, channels: [samples] };
  const middle = audioStateAt(audio, 5.5, turn);
  assert.equal(middle.speaker, "B");
  assert.equal(middle.amplitude, 0.5);
  assert.equal(middle.spectrum.length, 32);
  assert.equal(
    middle.spectrum.indexOf(Math.max(...middle.spectrum)),
    toneBin - 1,
  );
  assert.ok(Math.abs(middle.spectrum[toneBin - 1] - 0.5) < 0.001);

  for (const time of [5, 6 - 1 / sampleRate]) {
    const edge = audioStateAt(audio, time, turn);
    assert.equal(edge.amplitude, 0.5);
    assert.ok(edge.spectrum[toneBin - 1] < 0.27);
  }
  assert.deepEqual(audioStateAt(audio, 5.5, turn), middle);
});

test("studio audio handles pauses, truncated PCM and multi-channel inputs", () => {
  const samples = new Float32Array(sampleRate * 1.5).fill(0.75);
  const audio = {
    sampleRate,
    channels: [samples, samples.map((value) => -value)],
  };
  const state = audioStateAt(audio, 5.25, turn);
  assert.equal(state.amplitude, 0.75);
  assert.deepEqual(state.spectrum, new Float32Array(spectrumBins));

  for (const time of [4.99, 5.5, 6]) {
    assert.deepEqual(audioStateAt(audio, time, turn), {
      speaker: null,
      amplitude: 0,
      spectrum: new Float32Array(spectrumBins),
    });
  }
});

test("camera poses depend only on preset and timeline time", () => {
  const time = 3.4;
  const poses = Object.keys(cameraLabels).map((id) => cameraPoseAt(id, time));
  assert.equal(new Set(poses.map((pose) => JSON.stringify(pose))).size, 4);
  assert.deepEqual(cameraPoseAt("static", time), cameraPoseAt("static", 0));
  assert.notDeepEqual(cameraPoseAt("drift", time), cameraPoseAt("drift", 0));
  assert.ok(
    Math.abs(Math.hypot(poses[1].position[0], poses[1].position[2]) - 9.15) <
      1e-10,
  );
  assert.ok(cameraPoseAt("push-in", 10).position[2] < poses[3].position[2]);
  assert.deepEqual(cameraPoseAt("drift", time), poses[0]);
  assert.deepEqual(poses[0].target, [0, -0.15, 0]);
});
