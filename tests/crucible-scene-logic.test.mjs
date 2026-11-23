import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import {
  createFixture,
  frameCount,
  fps,
} from "../spikes/crucible-scene/harness/fixture.js";
import {
  sampleAmplitude,
  sampleSpectrum,
  spectrumBins,
  spectrumWindowSize,
} from "../spikes/crucible-scene/src/audio-state.js";
import {
  barHeightAt,
  cameraPoseAt,
  createSeededRandom,
  orbPoseAt,
} from "../spikes/crucible-scene/src/scene-logic.js";
import { barId, createRecipe } from "../spikes/crucible-scene/src/recipe.js";

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

test("host and spectrum poses use bounded absolute audio energy", () => {
  const active = orbPoseAt(1, "A", { speaker: "A", amplitude: 1 });
  const idle = orbPoseAt(1, "B", { speaker: "A", amplitude: 1 });
  assert.ok(active.scale > idle.scale);
  assert.ok(active.emission > idle.emission);
  assert.equal(active.rotationY, 0.32);
  assert.equal(idle.rotationY, -0.27);
  assert.deepEqual(orbPoseAt(1, "A", { speaker: "A", amplitude: 2 }), active);
  assert.deepEqual(orbPoseAt(1, "B", { speaker: "B", amplitude: -1 }), idle);
  assert.equal(barHeightAt(), 0.09);
  assert.equal(barHeightAt(-1), 0.09);
  assert.equal(barHeightAt(0.25), 0.84);
  assert.equal(barHeightAt(2), 1.59);
});

test("both studio themes produce reproducible plain JSON recipes", () => {
  for (const theme of ["dark", "light"]) {
    const recipe = createRecipe(theme);
    assert.deepEqual(JSON.parse(JSON.stringify(recipe)), recipe);
    assert.deepEqual(createRecipe(theme), recipe);
    assert.equal(recipe.format, "crucible.scene");
    assert.equal(recipe.schemaVersion, 1);
    const ids = recipe.nodes.map((node) => node.id);
    assert.deepEqual(ids.slice(0, 5), [
      "floor",
      "pedestal-A",
      "orb-A",
      "pedestal-B",
      "orb-B",
    ]);
    assert.deepEqual(
      ids.slice(5),
      Array.from({ length: spectrumBins }, (_, i) => barId(i)),
    );
  }
  assert.notDeepEqual(
    createRecipe("dark").materials,
    createRecipe("light").materials,
  );
  assert.throws(() => createRecipe("unknown"), RangeError);
});

test("Crucible accepts the JSON recipes and validates their schema without WebGL", async (t) => {
  let createAgentScene;
  try {
    const resolveFromSpike = createRequire(
      new URL("../spikes/crucible-scene/package.json", import.meta.url),
    );
    const entry = resolveFromSpike.resolve(
      "@codepawlhq/crucible/addons/agent-scene",
    );
    ({ createAgentScene } = await import(pathToFileURL(entry)));
  } catch (error) {
    if (
      error?.code === "ERR_MODULE_NOT_FOUND" ||
      error?.code === "MODULE_NOT_FOUND"
    )
      return t.skip("spikes/crucible-scene dependencies are not installed");
    throw error;
  }
  for (const theme of ["dark", "light"]) {
    const recipe = JSON.parse(JSON.stringify(createRecipe(theme)));
    const scene = createAgentScene(recipe);
    assert.deepEqual(
      scene.parts.map((part) => part.name),
      recipe.nodes.map((node) => node.id),
    );
    assert.equal(scene.camera.fov, 40);
    assert.equal(scene.environment.world, true);
    const bars = scene.parts.slice(5);
    assert.ok(bars.every((bar) => bar.geometry === bars[0].geometry));
    assert.throws(
      () => createAgentScene({ ...recipe, script: "arbitrary code" }),
      /script/,
    );
  }
});
