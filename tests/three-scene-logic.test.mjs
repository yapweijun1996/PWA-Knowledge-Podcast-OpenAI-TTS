import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createFixture,
  frameCount,
  fps,
} from "../spikes/three-scene/harness/fixture.js";
import {
  sampleAmplitude,
  sampleSpectrum,
  spectrumBins,
  spectrumWindowSize,
} from "../spikes/three-scene/src/audio-state.js";
import {
  cameraPoseAt,
  createSeededRandom,
} from "../spikes/three-scene/src/scene-logic.js";

test("silence and samples outside the clip have zero audio energy", () => {
  const sampleRate = 48_000;
  const silence = new Float32Array(sampleRate);
  assert.equal(sampleAmplitude(silence, sampleRate, 0), 0);
  assert.deepEqual(
    sampleSpectrum(silence, sampleRate, 0),
    new Float32Array(spectrumBins),
  );

  const pcm = Float32Array.of(1, -1);
  assert.equal(sampleAmplitude(pcm, sampleRate, 3), 0);
  assert.deepEqual(
    sampleSpectrum(pcm, sampleRate, 3),
    new Float32Array(spectrumBins),
  );
});

test("amplitude measures the clamped peak in a centered 480 ms window", () => {
  const pcm = new Float32Array(1_000);
  pcm[259] = 0.95;
  pcm[260] = -0.75;
  pcm[739] = 0.5;
  pcm[740] = -0.95;
  assert.equal(sampleAmplitude(pcm, 1_000, 0.5), 0.75);
  pcm[739] = -1.1;
  assert.equal(sampleAmplitude(pcm, 1_000, 0.5), 1);
  assert.equal(sampleAmplitude(Float32Array.of(-0.5), 1_000, 0), 0.5);
});

test("the centered DFT finds a tone in its positive-frequency bin", () => {
  const sampleRate = 48_000;
  const bin = 7;
  const pcm = Float32Array.from(
    { length: sampleRate },
    (_, index) =>
      0.7 * Math.sin((2 * Math.PI * bin * index) / spectrumWindowSize),
  );
  const spectrum = sampleSpectrum(pcm, sampleRate, 0.5);
  assert.equal(spectrumBins, 32);
  assert.equal(spectrum.length, spectrumBins);
  assert.equal(spectrum.indexOf(Math.max(...spectrum)), bin - 1);
  assert.ok(Math.abs(spectrum[bin - 1] - 0.7) < 0.002);
  assert.ok(spectrum[bin + 4] < 0.001);
  sampleSpectrum(pcm, sampleRate, 0.1);
  assert.deepEqual(sampleSpectrum(pcm, sampleRate, 0.5), spectrum);
});

test("fixture alternates speaker tones and includes silent gaps", () => {
  const stateAt = createFixture();
  const first = stateAt(15 / fps);
  const next = stateAt(45 / fps);
  const gap = stateAt(29 / fps);
  assert.equal(frameCount, 150);
  assert.equal(first.speaker, "A");
  assert.equal(next.speaker, "B");
  assert.equal(gap.speaker, null);
  assert.equal(gap.amplitude, 0);
  assert.deepEqual(gap.spectrum, new Float32Array(spectrumBins));
  assert.ok(first.spectrum[2] > first.spectrum[6]);
  assert.ok(next.spectrum[6] > next.spectrum[2]);
  assert.deepEqual(stateAt(15 / fps), first);
  assert.deepEqual(createFixture()(15 / fps), first);
});

test("seeded random generators reproduce the same sequence independently", () => {
  const sequence = (seed) =>
    Array.from({ length: 12 }, createSeededRandom(seed));
  const first = sequence(51);
  assert.deepEqual(sequence(51), first);
  assert.notDeepEqual(sequence(52), first);
  assert.ok(first.every((value) => value >= 0 && value < 1));
  assert.equal(new Set(first).size, first.length);
});

test("camera drift depends only on timeline time", () => {
  const t = 15 / fps;
  const pose = cameraPoseAt(t);
  assert.notDeepEqual(cameraPoseAt(60 / fps).position, pose.position);
  assert.deepEqual(cameraPoseAt(t), pose);
  assert.ok([...pose.position, ...pose.target].every(Number.isFinite));
});

test("scene module exports its factory without initializing WebGL on import", async (t) => {
  // The spike installs its own copy of three; the root install does not have it.
  const module = await import("../spikes/three-scene/src/scene.js").catch(
    (error) => (error?.code === "ERR_MODULE_NOT_FOUND" ? null : Promise.reject(error)),
  );
  if (!module) return t.skip("spikes/three-scene dependencies are not installed");
  assert.equal(typeof module.createStudioScene, "function");
});
