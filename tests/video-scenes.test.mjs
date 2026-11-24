import assert from "node:assert/strict";
import test from "node:test";
import {
  isCurrentVideo,
  videoArtifactKey,
} from "../src/factory/useVideoRender.ts";
import { palettes } from "../src/video/design/palettes.ts";
import { prepareOverlay } from "../src/video/overlay.ts";
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

test("the dithered portrait chapter wash keeps adjacent background luma steps within 3/255", (t) => {
  class PixelCanvas {
    constructor(width, height) {
      this.width = width;
      this.height = height;
    }
    getContext() {
      return {
        createImageData: (width, height) => ({
          data: new Uint8ClampedArray(4 * width * height),
        }),
        getImageData: () => ({ data: this.pixels.slice() }),
        putImageData: ({ data }) => {
          this.pixels = data;
        },
        drawImage: (source) => {
          this.pixels = source.pixels.slice();
        },
      };
    }
  }
  const previousCanvas = Object.getOwnPropertyDescriptor(
    globalThis,
    "OffscreenCanvas",
  );
  Object.defineProperty(globalThis, "OffscreenCanvas", {
    value: PixelCanvas,
    configurable: true,
  });
  t.after(() => {
    if (previousCanvas) Object.defineProperty(globalThis, "OffscreenCanvas", previousCanvas);
    else delete globalThis.OffscreenCanvas;
  });

  const width = 1080;
  const height = 1920;
  const plan = {
    duration: 3,
    resolution: { width, height },
    scenes: [{ kind: "chapter", title: "Shared spaces", start: 1, end: 2 }],
  };
  const context = {
    drawImage(source) {
      this.background = source.pixels;
    },
    createPattern(strip, repetition) {
      assert.equal(repetition, "repeat-x");
      return {
        strip,
        setTransform({ f }) {
          this.top = f;
        },
      };
    },
    fillRect(...box) {
      if (this.fillStyle.strip) this.wash = { ...this.fillStyle, box };
    },
    fillText() {},
    measureText: (value) => ({ width: value.length * 20 }),
  };
  const overlay = prepareOverlay(context, plan);
  const luma = [0.2126, 0.7152, 0.0722];
  const previousRow = new Float64Array(width);
  let maxStep = 0;
  for (const paletteId of Object.keys(palettes)) {
    overlay.drawBackground(paletteId);
    overlay.draw(overlay.frameAt(1.5), paletteId);
    const { strip, top, box } = context.wash;
    assert.deepEqual(box, [0, top, width, strip.height]);
    const { pixels, width: stripWidth } = strip;
    assert.equal(stripWidth, 4);
    const alphaAt = (x, y) => pixels[(y * stripWidth + x) * 4 + 3];
    const peakRow = Math.round(0.35 * height) - top;
    assert.equal(alphaAt(0, peakRow), 15);
    assert.equal(alphaAt(0, 0), 0);
    assert.equal(alphaAt(0, strip.height - 1), 0);
    const alphas = pixels.filter((_, index) => index % 4 === 3);
    assert.ok(alphas.every((alpha) => alpha / 255 <= 0.06));
    assert.ok(
      alphas.some(
        (alpha, index) => index % stripWidth > 0 && alpha !== alphas[index - 1],
      ),
    );

    // Sample the 8-bit source-over composite including the wash boundaries.
    let paletteStep = 0;
    for (let y = top - 1; y <= top + strip.height; y++) {
      let previous = 0;
      for (let x = 0; x < width; x++) {
        const mask = ((y - top) * stripWidth + x % stripWidth) * 4;
        const alpha = (pixels[mask + 3] ?? 0) / 255;
        const base = (y * width + x) * 4;
        let value = 0;
        for (let channel = 0; channel < 3; channel++) {
          const ink = Math.round((pixels[mask + channel] ?? 0) * alpha);
          const composite = ink + context.background[base + channel] * (1 - alpha);
          value += luma[channel] * Math.round(composite);
        }
        if (x > 0) paletteStep = Math.max(paletteStep, Math.abs(value - previous));
        if (y >= top) paletteStep = Math.max(paletteStep, Math.abs(value - previousRow[x]));
        previous = value;
        previousRow[x] = value;
      }
    }
    assert.ok(paletteStep <= 3, `${paletteId}: ${paletteStep.toFixed(4)}/255`);
    maxStep = Math.max(maxStep, paletteStep);

    context.wash = undefined;
    overlay.draw(overlay.frameAt(2), paletteId);
    assert.equal(context.wash, undefined);
    overlay.draw(overlay.frameAt(1), paletteId);
    assert.equal(context.wash.strip, strip);
  }
  t.diagnostic(
    `Maximum adjacent luma step across five palettes: ${maxStep.toFixed(4)}/255`,
  );
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
  const target = Math.sqrt((0.4 - 0.012) / (1 - 0.012));
  const level = (index) => prepared.frame(index)[0];
  assert.ok(Math.abs(level(0) - target * alpha) < 1e-7);
  assert.ok(level(1) > level(0));
  assert.ok(level(30) < level(24));
  assert.equal(level(60), level(0));
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

for (const [orientation, width, height, count, railWidth, cap] of [
  ["landscape", 320, 180, 36, 0.24, 0.058],
  ["portrait", 1080, 1920, 20, 0.27, 0.039],
]) {
  test(`the ${orientation} speaking rail preserves local PCM variation across all ${count} bars`, () => {
    const resolution = { width, height };
    const active = { ...turn, start: 0, end: 2, audioStart: 0 };
    const plan = { resolution, fps: 30, duration: 2, scenes: [active] };
    const pattern = [0.25, 0.75, 0.125, 1, 0.5, 0.875];
    const peaks = Array.from(
      { length: count },
      (_, index) => pattern[index % pattern.length],
    );
    const samples = new Float32Array(2 * sampleRate);
    const binSamples = (0.48 * sampleRate) / count;
    // Put one signed peak inside each bin of the centered 480 ms window.
    peaks.forEach((peak, bin) => {
      samples[0.76 * sampleRate + binSamples * (bin + 0.5)] = -peak;
    });
    const audio = { sampleRate, channels: [samples] };
    assert.deepEqual(wavePeaks(audio, 1, active, count), peaks);
    const prepared = prepareWaveform(plan, audio);
    const calls = [];
    drawWaveform({ fillRect: (...box) => calls.push(box) }, prepared, {
      index: 30,
      time: 1,
      turn: active,
      paletteId: "aurora",
    });
    const bars = calls.slice(1, count + 1);
    assert.equal(bars.length, count);
    for (const [bin, [, , barWidth, barHeight]] of bars.entries()) {
      assert.ok(Math.abs(barWidth - (width * railWidth * 0.58) / count) < 1e-10);
      assert.ok(barHeight >= 3 && barHeight <= 2 * cap * height);
      const next = (bin + 1) % bars.length;
      assert.ok(Math.abs(barHeight - bars[next][3]) >= 1);
      assert.equal(
        Math.sign(barHeight - bars[next][3]),
        Math.sign(peaks[bin] - peaks[next]),
      );
    }
  });
}

test("native rails keep 3 px idle ticks and sustained voice peaks near 0.04H", (t) => {
  const first = { ...turn, start: 0, end: 2, audioStart: 0 };
  const second = { ...first, speakerId: "B", start: 2, end: 4, audioStart: 2 };
  const samples = new Float32Array(4 * sampleRate);
  samples.fill(0.13, 0, 2 * sampleRate);
  samples.fill(1, 2 * sampleRate);
  const audio = { sampleRate, channels: [samples] };
  for (const [width, height, cap] of [[1920, 1080, 0.058], [1080, 1920, 0.039]]) {
    const prepared = prepareWaveform({
      resolution: { width, height },
      fps: 30,
      duration: 5,
      scenes: [first, second],
    }, audio);
    const count = prepared.geometry.waveBarsPerHost;
    function heights(time, turn) {
      const calls = [];
      drawWaveform({ fillRect: (...box) => calls.push(box[3]) }, prepared, {
        index: time * 30,
        time,
        turn,
        paletteId: "aurora",
      });
      assert.ok(calls[0] < 3 && calls[count + 1] < 3);
      return [calls.slice(1, count + 1), calls.slice(count + 2)];
    }
    const idle = Array(count).fill(3);
    const [speaking, resting] = heights(1, first);
    assert.deepEqual(resting, idle);
    for (const peak of speaking) assert.ok(peak >= 0.037 * height && peak <= 0.044 * height);
    const [restingAfterSwitch, clipped] = heights(3, second);
    assert.deepEqual(restingAfterSwitch, idle);
    for (const peak of clipped) assert.ok(peak > 0.99 * 2 * cap * height && peak <= 2 * cap * height);
    assert.deepEqual(heights(4, second), [idle, idle]);
    t.diagnostic(`${width}×${height} sustained peak height: ${(speaking[0] / height).toFixed(4)}H`);
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
