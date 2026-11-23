import assert from "node:assert/strict";
import test from "node:test";
import { palettes } from "../src/video/design/palettes.ts";
import { designTokens } from "../src/video/design/tokens.ts";
import {
  analysisWindowSize,
  audioStateAt,
  envelopeStride,
  prepareAudioEnvelopes,
  spectrumBandEdges,
  spectrumBins,
} from "../src/video/scenes/studio3d/audio-state.ts";
import {
  haloOpacityAt,
  orbScaleAt,
  projectStagePoint,
  spectrumBarHeight,
  studioLayout,
  studioParticles,
} from "../src/video/scenes/studio3d/layout.ts";
import {
  cameraLabels,
  cameraPoseAt,
  defaultStudio3dMood,
  defaultStudio3dSettings,
  getPalette,
  motionMultipliers,
  paletteLabels,
  resolveStudio3dOptions,
} from "../src/video/scenes/studio3d/presets.ts";

function near(actual, expected, tolerance = 1e-6) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${actual} != ${expected}`,
  );
}

test("studio uses the design palettes and keeps the existing preset IDs and notices", () => {
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
  for (const id of Object.keys(paletteLabels))
    assert.equal(getPalette(id), palettes[id]);
  assert.deepEqual(resolveStudio3dOptions(), {
    settings: { paletteId: "aurora", cameraPresetId: "drift", intensity: 0.55 },
    notices: [],
  });
  assert.equal(defaultStudio3dMood, "calm");

  const options = {
    paletteId: "ocean",
    cameraPresetId: "push-in",
    intensity: 0.65,
    moodId: "warm",
    reducedMotion: true,
  };
  assert.deepEqual(resolveStudio3dOptions(options), {
    settings: options,
    notices: [],
  });
  assert.deepEqual(
    resolveStudio3dOptions({
      paletteId: "light",
      cameraPresetId: "toString",
      moodId: "__proto__",
    }),
    {
      settings: { ...defaultStudio3dSettings, moodId: "calm" },
      notices: ["unknown-palette", "unknown-camera"],
    },
  );
});

test("studio clamps intensity and applies the specified mood multipliers", () => {
  for (const [intensity, expected] of [
    [-Infinity, 0],
    [-1, 0],
    [0, 0],
    [0.3, 0.3],
    [1, 1],
    [1.2, 1],
    [Infinity, 1],
    [NaN, 0.55],
  ]) {
    assert.equal(
      resolveStudio3dOptions({ intensity }).settings.intensity,
      expected,
    );
  }
  for (const [id, expected] of Object.entries({
    calm: 0.7,
    curious: 1,
    urgent: 1.15,
    warm: 0.8,
    serious: 0.55,
  })) {
    assert.deepEqual(motionMultipliers(id, 0.5), {
      audio: expected * 0.5,
      camera: Math.min(1, expected),
    });
  }
  assert.deepEqual(motionMultipliers(), { audio: 1, camera: 1 });
  assert.deepEqual(motionMultipliers("urgent", 4), { audio: 1, camera: 1 });
  assert.deepEqual(motionMultipliers("urgent", -1), { audio: 0, camera: 1 });
  assert.equal(orbScaleAt(-1), 1);
  assert.equal(orbScaleAt(2), 1.06);
  assert.ok(haloOpacityAt(2) <= 0.18);
  assert.ok(haloOpacityAt(2) - haloOpacityAt(0) <= 0.05);
  assert.equal(haloOpacityAt(2, true), haloOpacityAt(0, true));
});

test("studio spectrum uses a centered 40 ms window and 32 log bands through Nyquist", () => {
  assert.equal(analysisWindowSize(48_000), 1920);
  assert.equal(analysisWindowSize(44_100), 1764);
  for (const [rate, upper] of [
    [48_000, 8000],
    [8192, 4096],
    [1000, 500],
  ]) {
    const edges = spectrumBandEdges(rate);
    assert.equal(edges.length, spectrumBins + 1);
    assert.equal(edges[0], 80);
    assert.equal(edges.at(-1), upper);
    for (let index = 1; index < edges.length; index++)
      near(edges[index] / edges[index - 1], (upper / 80) ** (1 / spectrumBins));
  }
  assert.deepEqual(spectrumBandEdges(160), []);
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

test("studio drives from matching PCM and calibrates the Hann spectrum and RMS in dBFS", () => {
  const samples = new Int16Array(3 * sampleRate).fill(32767);
  const tone = 640;
  const peak = 0.0125;
  for (let offset = 0; offset < sampleRate; offset++) {
    samples[sampleRate + offset] = Math.round(
      32768 * peak * Math.sin((2 * Math.PI * tone * offset) / sampleRate),
    );
  }
  const audio = { sampleRate, channels: [samples] };
  const middle = audioStateAt(audio, 5.5, turn);
  const edges = spectrumBandEdges(sampleRate);
  const toneBand = edges.findIndex((edge) => edge > tone) - 1;
  const expectedSpectrum = (20 * Math.log10(peak) + 72) / 44;
  const expectedOrb = (20 * Math.log10(peak / Math.SQRT2) + 48) / 32;
  assert.equal(middle.speaker, "B");
  assert.equal(middle.spectrum.length, 32);
  assert.equal(middle.spectrum.indexOf(Math.max(...middle.spectrum)), toneBand);
  near(middle.spectrum[toneBand], expectedSpectrum, 0.005);
  near(middle.amplitude, expectedOrb, 0.005);

  for (const time of [5, 6 - 1 / sampleRate]) {
    const edge = audioStateAt(audio, time, turn);
    assert.ok(edge.amplitude < middle.amplitude);
    assert.ok(edge.spectrum[toneBand] < middle.spectrum[toneBand] - 0.1);
  }
  assert.deepEqual(audioStateAt(audio, 5.5, turn), middle);
});

test("studio audio handles pauses, truncated PCM, clipping and stereo downmix", () => {
  const samples = new Float32Array(sampleRate * 1.5).fill(1.1);
  const audio = {
    sampleRate,
    channels: [samples, samples.map((value) => -value)],
  };
  const state = audioStateAt(audio, 5.25, turn);
  assert.equal(state.speaker, "B");
  assert.equal(state.amplitude, 1);
  assert.deepEqual(state.spectrum, new Float32Array(spectrumBins));

  for (const time of [4.99, 5.5, 6]) {
    assert.deepEqual(audioStateAt(audio, time, turn), {
      speaker: null,
      amplitude: 0,
      spectrum: new Float32Array(spectrumBins),
    });
  }
});

function finishEnvelopePass(audio, plan) {
  const pass = prepareAudioEnvelopes(audio, plan);
  let batch = pass.next();
  while (!batch.done) batch = pass.next();
  return batch.value;
}

test("episode envelopes reset, use separate attack and release and support shuffled seeks", () => {
  const samples = Float32Array.from(
    { length: sampleRate * 2 },
    (_, index) => 0.65 * Math.cos((2 * Math.PI * 640 * index) / sampleRate),
  );
  const audio = { sampleRate, channels: [samples] };
  const plan = {
    fps: 30,
    duration: 5,
    scenes: [
      { ...turn, speakerId: "A", start: 0, end: 1, audioStart: 0 },
      { ...turn, start: 1.5, end: 2.5, audioStart: 1 },
    ],
  };
  const envelopes = finishEnvelopePass(audio, plan);
  const frameAt = (data, index) =>
    data.slice(index * envelopeStride, (index + 1) * envelopeStride);
  const frame = (index) => frameAt(envelopes, index);
  assert.equal(envelopes.length, 150 * envelopeStride);
  const orbAttack = 1 - Math.exp(-1000 / (30 * 100));
  const orbRelease = Math.exp(-1000 / (30 * 320));
  const spectrumAttack = 1 - Math.exp(-1000 / (30 * 80));
  const spectrumRelease = Math.exp(-1000 / (30 * 260));
  const bin = frame(0).indexOf(Math.max(...frame(0).slice(2)));
  assert.ok(bin >= 2);
  near(frame(0)[0], orbAttack);
  near(frame(0)[bin], spectrumAttack);
  assert.equal(frame(0)[1], 0);
  near(frame(30)[0], frame(29)[0] * orbRelease);
  near(frame(30)[bin], frame(29)[bin] * spectrumRelease);
  assert.ok(frame(44)[0] < frame(30)[0]);
  assert.ok(frame(45)[1] > 0 && frame(45)[0] < frame(44)[0]);
  assert.ok(frame(149)[1] < 0.001);

  const fresh = finishEnvelopePass(audio, plan);
  for (const index of [45, 0, 149, 30, 1, 45])
    assert.deepEqual(frameAt(fresh, index), frame(index));
});

const degrees = (radians) => (radians * 180) / Math.PI;
const yawAt = (pose) => degrees(Math.atan2(pose.back[0], pose.back[2]));
const pitchAt = (pose) => degrees(Math.asin(pose.back[1]));

test("camera presets follow bounded angular paths and a delayed smootherstep push", () => {
  const reference = cameraPoseAt("static", 0);
  assert.deepEqual(cameraPoseAt("static", 89), reference);
  assert.deepEqual(reference.target, [0, 0, 0]);
  assert.equal(reference.right[1], 0);
  for (const [time, sign] of [
    [9, 1],
    [27, -1],
  ]) {
    const pose = cameraPoseAt("drift", time);
    near(yawAt(pose), sign * 4);
    near(pitchAt(pose) - pitchAt(reference), sign * 1.25);
    assert.equal(pose.distance, reference.distance);
  }
  near(yawAt(cameraPoseAt("orbit", 14)), 7);
  near(yawAt(cameraPoseAt("orbit", 42)), -7);
  near(pitchAt(cameraPoseAt("orbit", 14)), pitchAt(reference));
  near(
    yawAt(cameraPoseAt("orbit", 14, "serious", "portrait")),
    7 * 0.55 * 0.65,
  );
  assert.deepEqual(cameraPoseAt("push-in", 2), reference);
  near(
    cameraPoseAt("push-in", 5).distance / reference.distance,
    1 - 0.04 * 0.103515625,
  );
  near(cameraPoseAt("push-in", 8).distance / reference.distance, 0.98);
  near(cameraPoseAt("push-in", 14).distance / reference.distance, 0.96);
  assert.deepEqual(cameraPoseAt("push-in", 140), cameraPoseAt("push-in", 14));
  for (const id of Object.keys(cameraLabels))
    assert.deepEqual(
      cameraPoseAt(id, 9, "urgent", "portrait", true),
      reference,
    );
});

test("studio particles are a fixed seeded batch behind the ring", () => {
  const layout = studioLayout(1080, 1920);
  const particles = studioParticles(layout, 51);
  assert.equal(particles.length, 12);
  assert.ok(
    particles.every(
      ([x, , z]) =>
        Math.abs(x) <= layout.ringWidth && z < -2 * layout.ringDepth,
    ),
  );
  assert.deepEqual(particles, studioParticles(layout, 51));
  assert.notDeepEqual(particles, studioParticles(layout, 52));
});

test("both aspects fit maximum excursions and cap projected camera travel and spectrum height", () => {
  const landscape = studioLayout(1920, 1080);
  const portrait = studioLayout(1080, 1920);
  assert.equal(portrait.centerX, 0.43);
  near(portrait.ringDepth / landscape.ringDepth, 0.55);
  near(motionMultipliers("urgent", 1).audio, 1);
  const fps = 30;
  for (const layout of [landscape, portrait]) {
    const tokens = designTokens[layout.orientation];
    const [width, height] = tokens.frame;
    const [left, top, right, bottom] = tokens.stageBox;
    const pedestalCorners = [];
    const orbCorners = [];
    for (const sign of [-1, 1]) {
      const x = sign * layout.hostX;
      assert.deepEqual(
        projectStagePoint(layout, cameraPoseAt("static", 0), [x, 0, 0]).map(
          (point) => Number(point.toFixed(8)),
        ),
        [...tokens.orbCenters[sign === -1 ? 0 : 1]],
      );
      for (let index = 0; index < 16; index++) {
        const theta = (Math.PI * index) / 8;
        const dx = Math.cos(theta);
        const dz = Math.sin(theta);
        pedestalCorners.push([
          x + dx * layout.pedestalRadius,
          layout.floorY,
          dz * layout.pedestalRadius,
        ]);
      }
      const radius = layout.orbRadius * orbScaleAt(1) * 1.03;
      // The axis-aligned bounding cube is conservative for the orb and bands.
      for (const dx of [-radius, radius])
        for (const dy of [-radius, radius])
          for (const dz of [-radius, radius]) orbCorners.push([x + dx, dy, dz]);
    }

    let maxTravel = 0;
    let maxRingHeight = 0;
    let lowestPedestal = 0;
    for (const [preset, seconds] of Object.entries({
      static: 1,
      drift: 36,
      orbit: 56,
      "push-in": 15,
    })) {
      for (let index = 0; index <= seconds * fps; index++) {
        const time = index / fps;
        const pose = cameraPoseAt(preset, time, "urgent", layout.orientation);
        const next = cameraPoseAt(
          preset,
          (index + 1) / fps,
          "urgent",
          layout.orientation,
        );
        function fit(point) {
          const [x, y] = projectStagePoint(layout, pose, point);
          const [nextX, nextY] = projectStagePoint(layout, next, point);
          assert.ok(
            x >= left && x <= right && y >= top && y <= bottom,
            `${layout.orientation} ${preset} at ${time}: ${x}, ${y}`,
          );
          const travel =
            (Math.hypot((nextX - x) * width, (nextY - y) * height) * fps) /
            Math.min(width, height);
          maxTravel = Math.max(maxTravel, travel);
          return y;
        }

        for (const point of orbCorners) fit(point);
        for (const point of pedestalCorners)
          lowestPedestal = Math.max(lowestPedestal, fit(point));
        for (const block of layout.ring) {
          const blockHeight = spectrumBarHeight(pose, block, 1);
          let lowest = 0;
          let highest = 1;
          for (const [x, y, z] of block.baseCorners) {
            lowest = Math.max(lowest, fit([x, y, z]));
            highest = Math.min(highest, fit([x, y + blockHeight, z]));
          }
          assert.ok(lowest - highest <= block.heightCap + 1e-9);
          maxRingHeight = Math.max(maxRingHeight, lowest - highest);
        }
      }
    }
    assert.ok(
      lowestPedestal < Math.min(...tokens.hostTagCenters.map(([, y]) => y)),
    );
    assert.ok(maxTravel <= 0.015);
    near(maxRingHeight, 0.055);
  }
});
