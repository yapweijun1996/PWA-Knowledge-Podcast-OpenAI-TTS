import { expect, type Locator, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build, transformWithOxc } from "vite";
import { bundleStudio3d } from "../scripts/studio3d-bench.mjs";
import { wave } from "../server/audio.mjs";
import type { Episode } from "../shared/factory.ts";
import type { AgentArtifact } from "../src/agent/artifacts.ts";
import { createTranslator } from "../src/i18n/index.ts";
import { paletteIds, palettes, type Palette } from "../src/video/design/palettes.ts";
import { projectStagePoint, studioLayout } from "../src/video/scenes/studio3d/layout.ts";
import { cameraFov, cameraPoseAt } from "../src/video/scenes/studio3d/presets.ts";
import { beforeEnd, buildTimeline, type TimelinePlan } from "../src/video/timeline.ts";
import { test } from "./fixtures/guards";
import {
  dialogue,
  heard,
  intended,
  pcmFixture,
} from "./fixtures/podcast-provider.mjs";

test.use({
  launchOptions: {
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  },
});

const english = createTranslator("en");
const id = "10000000-0000-4000-8000-000000000055";
const asset = "finished-video-fixture.wav";
const chapters = dialogue.map(({ chapterId }, index) => ({
  id: chapterId,
  title: `Chapter ${index + 1}`,
  angle: "Fixture",
  claimIds: [],
}));
const turns = dialogue.flatMap(({ chapterId, turns }) =>
  turns.map((turn, index) => ({
    ...turn,
    host: turn.host as "A" | "B",
    chapterId,
    id: `${chapterId}-${index + 1}`,
  })),
);
const pcm = pcmFixture();
const repeatedPcm = Buffer.concat([pcm, pcm]);
// Start the second chapter early so the short fixture still shows the 3D stage.
const clips = turns.map(({ chapterId }) =>
  repeatedPcm.subarray(0, chapterId === chapters[0].id ? 6_000 : 42_000),
);
const pause = Buffer.alloc(0.23 * 48_000);
const wav = wave(clips.flatMap((clip, index) => (index ? [pause, clip] : [clip])));
const duration = (wav.length - 44) / 48_000;
const episode: Episode = {
  id,
  topic: "Short fixture episode",
  revision: 1,
  language: "zh",
  updated: "2026-11-23T00:00:00.000Z",
  voices: { A: "marin", B: "cedar" },
  outline: { chapters, model: "fixture" },
  script: { title: "Fixture episode", turns, model: "fixture" },
  render: {
    revision: 1,
    model: "fixture",
    clips: Object.fromEntries(
      turns.map(({ id }, index) => [
        id,
        { asset: `${id}.wav`, duration: clips[index].length / 48_000 },
      ]),
    ),
  },
  finished: {
    revision: 1,
    asset,
    model: "fixture",
    duration,
    intendedText: intended,
    chapters: chapters.map(({ title }, index) => ({
      title,
      start: index * 2 * (clips[0].length / 48_000 + 0.23),
    })),
    transcript: { text: heard, model: "fixture", similarity: 100 },
    qa: { status: "matched", reasons: [] },
  },
};
const plan = buildTimeline(episode);
const frameCount = Math.ceil(plan.duration * plan.fps);
const stageFrames = Array.from(
  { length: frameCount },
  (_, frame) => frame,
).filter((frame) => {
  const time = frame / plan.fps;
  const visible = plan.scenes.filter(
    ({ start, end }) => start <= time && beforeEnd(time, end),
  );
  return visible.length === 1 && visible[0].kind === "turn";
});
if (stageFrames.length < 3)
  throw new Error("3D fixture needs uncropped stage frames");
const firstStageFrame = stageFrames[0];
const previewFrames = [
  0,
  15,
  30,
  firstStageFrame,
  stageFrames[Math.floor(stageFrames.length / 2)],
  stageFrames.at(-1)!,
];
const previewTimes = previewFrames.map((index) =>
  Math.round((index * 1_000_000) / plan.fps),
);

async function openFixture(page: Page) {
  await page.addInitScript(() =>
    localStorage.setItem("podcast-ui-locale", "en"),
  );
  await page.goto("/");
  await expect(
    page.getByText(english("library.empty.noEpisodes")),
  ).toBeVisible();
  await page.evaluate(
    async ({ episode, bytes }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("knowledge-podcast-library", 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction("episodes", "readwrite");
          tx.oncomplete = () => resolve();
          tx.onabort = () => reject(tx.error);
          tx.objectStore("episodes").put({
            episode,
            assets: {
              [episode.finished!.asset]: new Blob([Uint8Array.from(bytes)], {
                type: "audio/wav",
              }),
            },
            stamp: crypto.randomUUID(),
          });
        });
      } finally {
        db.close();
      }
    },
    { episode, bytes: [...wav] },
  );
  await page.goto(`/?view=studio&episode=${id}`);
  const panel = page.getByRole("region", {
    name: english("episode.video.title"),
  });
  const render = panel.getByRole("button", {
    name: english("video.panel.render"),
  });
  const scene = panel.getByLabel(english("video.panel.scene"));
  await expect(render).toBeEnabled({ timeout: 15_000 });
  await scene.selectOption("studio3d");
  return { panel, render, scene, preview: panel.locator("video") };
}

async function videoReceipts(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("knowledge-podcast-agent", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const records = await new Promise<AgentArtifact[]>((resolve, reject) => {
        const request = db
          .transaction("artifacts")
          .objectStore("artifacts")
          .getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      return records
        .filter(({ kind }) => kind === "video")
        .map(({ metadata }) => metadata?.studioVideo);
    } finally {
      db.close();
    }
  });
}

const decoderUrl = "/__test/visual-mp4.js";

async function servePreviewDecoder(page: Page) {
  const result = await build({
    configFile: false,
    logLevel: "error",
    build: {
      write: false,
      lib: {
        entry: fileURLToPath(
          new URL("./fixtures/visual-mp4.ts", import.meta.url),
        ),
        formats: ["es"],
      },
    },
  });
  if (!Array.isArray(result))
    throw new Error("Could not build the preview decoder");
  const reader = result[0].output.find(
    (chunk) => chunk.type === "chunk" && chunk.isEntry,
  );
  if (!reader || reader.type !== "chunk")
    throw new Error("Missing preview decoder");
  await page.route(`**${decoderUrl}`, (route) =>
    route.fulfill({ contentType: "text/javascript", body: reader.code }),
  );
}

async function decodedFrames(preview: Locator, compare: boolean) {
  return preview.evaluate(
    async (
      video: HTMLVideoElement,
      { compare, decoderUrl, fps, frameCount, indices },
    ) => {
      const module: typeof import("./fixtures/visual-mp4.ts") = await import(
        decoderUrl
      );
      const blob = await (await fetch(video.currentSrc)).blob();
      const canvas = document.createElement("canvas");
      const width = (canvas.width = video.videoWidth);
      const height = (canvas.height = video.videoHeight);
      const context = canvas.getContext("2d", { willReadFrequently: true })!;
      const samples = new Map<
        number,
        { pixels: Uint8ClampedArray; colors: number }
      >();
      const reference: typeof samples | undefined = Reflect.get(
        window,
        "previewReferenceFrames",
      );
      if (compare && !reference) throw new Error("Missing reference preview");
      await module.readMp4Frames(
        blob,
        width,
        height,
        fps,
        frameCount,
        (frame, index) => {
          if (!indices.includes(index)) return;
          context.drawImage(frame, 0, 0);
          const pixels = context.getImageData(0, 0, width, height).data;
          const studioPixels = context.getImageData(
            width * 0.2,
            height * 0.43,
            width * 0.6,
            height * 0.22,
          ).data;
          const colors = new Set<number>();
          for (let offset = 0; offset < studioPixels.length; offset += 4 * 16) {
            colors.add(
              (studioPixels[offset] << 16) |
                (studioPixels[offset + 1] << 8) |
                studioPixels[offset + 2],
            );
          }
          samples.set(index, { pixels, colors: colors.size });
        },
      );
      if (compare) Reflect.deleteProperty(window, "previewReferenceFrames");
      else Reflect.set(window, "previewReferenceFrames", samples);
      return Promise.all(
        indices.map(async (index) => {
          const sample = samples.get(index);
          if (!sample) throw new Error(`Preview is missing frame ${index}`);
          const digest = await crypto.subtle.digest("SHA-256", sample.pixels);
          const sha256 = Array.from(new Uint8Array(digest), (byte) =>
            byte.toString(16).padStart(2, "0"),
          ).join("");
          const baseline = reference?.get(index);
          let psnr: number | undefined;
          if (baseline) {
            let squaredError = 0;
            for (let offset = 0; offset < sample.pixels.length; offset += 4) {
              for (let channel = 0; channel < 3; channel++) {
                const position = offset + channel;
                squaredError +=
                  (sample.pixels[position] - baseline.pixels[position]) ** 2;
              }
            }
            const mean = squaredError / (width * height * 3);
            psnr = mean === 0 ? Infinity : 10 * Math.log10(255 ** 2 / mean);
          }
          return { sha256, colors: sample.colors, psnr };
        }),
      );
    },
    {
      compare,
      decoderUrl,
      fps: plan.fps,
      frameCount,
      indices: previewFrames,
    },
  );
}

async function instrumentRenderWorker(
  page: Page,
  setup: (times: number[]) => void,
  times: number[] = [],
) {
  await page.route("**/assets/render-worker-*.js", async (route) => {
    const script = await route.fetch();
    await route.fulfill({
      response: script,
      body: `(${setup.toString()})(${JSON.stringify(times)});\n${await script.text()}`,
    });
  });
}

test("Studio 3D saves a playable preview with repeatable source frames", async ({
  page,
}) => {
  test.setTimeout(150_000);
  await servePreviewDecoder(page);
  await page.addInitScript(() => {
    const wordmarks = new Set<string>();
    const runs: { time: number; sha256: string }[][] = [];
    Reflect.set(window, "renderedWordmarks", wordmarks);
    Reflect.set(window, "renderedFrames", runs);
    window.Worker = class extends Worker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        const raw: (typeof runs)[number] = [];
        if (String(url).includes("render-worker")) runs.push(raw);
        this.addEventListener("message", ({ data }) => {
          if (data.kind === "wordmark") wordmarks.add(data.text);
          if (data.kind === "raw-preview-hash")
            raw.push({ time: data.time, sha256: data.sha256 });
        });
      }
    };
  });
  await instrumentRenderWorker(page, (times) => {
    const pending: Promise<void>[] = [];
    globalThis.VideoEncoder = class extends VideoEncoder {
      async flush() {
        await super.flush();
        await Promise.all(pending);
        pending.length = 0;
      }
    };
    globalThis.VideoFrame = class extends VideoFrame {
      constructor(source: CanvasImageSource, init: VideoFrameInit) {
        super(source, init);
        const time = init.timestamp;
        if (!(source instanceof OffscreenCanvas) || !times.includes(time))
          return;
        const context = source.getContext("2d")!;
        const pixels = context.getImageData(0, 0, source.width, source.height);
        pending.push(
          crypto.subtle.digest("SHA-256", pixels.data).then((digest) => {
            const sha256 = Array.from(new Uint8Array(digest), (byte) =>
              byte.toString(16).padStart(2, "0"),
            ).join("");
            globalThis.postMessage({ kind: "raw-preview-hash", time, sha256 });
          }),
        );
      }
    };
    const { prototype } = OffscreenCanvasRenderingContext2D;
    const fillText = prototype.fillText;
    prototype.fillText = function (text, x, y, maxWidth?) {
      if (
        this.canvas.width === 1920 &&
        Math.abs(x - 1920 * 0.07) < 0.01 &&
        y < 120
      )
        globalThis.postMessage({ kind: "wordmark", text });
      Reflect.apply(
        fillText,
        this,
        maxWidth === undefined ? [text, x, y] : [text, x, y, maxWidth],
      );
    };
  }, previewTimes);
  const { panel, render, scene, preview } = await openFixture(page);
  await expect(
    panel.getByText(english("video.studio3d.description")),
  ).toBeVisible();
  const palette = panel.getByLabel(english("video.studio3d.palette"));
  const camera = panel.getByLabel(english("video.studio3d.camera"));
  const intensity = panel.getByRole("slider", {
    name: english("video.studio3d.intensity"),
  });
  await palette.selectOption("ocean");
  await camera.selectOption("orbit");
  await intensity.press("End");
  await intensity.press("ArrowLeft");
  await expect(intensity).toHaveValue("0.95");

  async function renderAndSample(previousUrl?: string) {
    await render.click();
    await expect(preview).toHaveAttribute("src", /^blob:/, { timeout: 65_000 });
    if (previousUrl)
      await expect(preview).not.toHaveAttribute("src", previousUrl, {
        timeout: 65_000,
      });
    const url = (await preview.getAttribute("src"))!;
    await expect
      .poll(() => preview.evaluate((video: HTMLVideoElement) => video.currentSrc))
      .toBe(url);
    await expect
      .poll(() => preview.evaluate((video: HTMLVideoElement) => video.duration))
      .toBeCloseTo(plan.duration, 1);
    return {
      url,
      frames: await decodedFrames(preview, Boolean(previousUrl)),
    };
  }

  const first = await renderAndSample();
  await preview.evaluate(async (video: HTMLVideoElement) => {
    video.muted = true;
    await video.play();
  });
  await expect
    .poll(() =>
      preview.evaluate((video: HTMLVideoElement) => video.currentTime),
    )
    .toBeGreaterThan(0.15);
  await preview.evaluate((video: HTMLVideoElement) => video.pause());

  expect(
    await page.evaluate(() => [...Reflect.get(window, "renderedWordmarks")]),
  ).toEqual([createTranslator("zh-CN")("video.wordmark")]);
  const studioFrames = first.frames.slice(3);
  expect(studioFrames.every(({ colors }) => colors > 1)).toBe(true);
  expect(
    new Set(studioFrames.map(({ sha256 }) => sha256)).size,
  ).toBeGreaterThan(1);
  const second = await renderAndSample(first.url);
  const runs = await page.evaluate(() => {
    const raw: { time: number; sha256: string }[][] = Reflect.get(
      window,
      "renderedFrames",
    );
    return raw.map((run) => run.sort((a, b) => a.time - b.time));
  });
  expect(runs).toHaveLength(2);
  expect(runs[0].map(({ time }) => time)).toEqual(previewTimes);
  expect(runs[1]).toEqual(runs[0]);
  for (const [index, { psnr }] of second.frames.entries()) {
    // Native x64 encoded different H.264 packets from identical sources.
    // 40 dB bounds decoded RGB error to about 2.55 levels RMS out of 255.
    expect(psnr, `decoded frame ${previewFrames[index]}`).toBeGreaterThanOrEqual(
      40,
    );
  }

  expect(await videoReceipts(page)).toEqual([
    expect.objectContaining({
      sceneId: "studio3d",
      studio3d: {
        paletteId: "ocean",
        cameraPresetId: "orbit",
        intensity: 0.95,
      },
      sceneNotices: [],
      chapterScenes: chapters.map(({ id }) => ({
        chapterId: id,
        sceneId: "studio3d",
      })),
    }),
  ]);

  await page.reload();
  await expect(scene).toHaveValue("studio3d");
  await expect(palette).toHaveValue("ocean");
  await expect(camera).toHaveValue("orbit");
  await expect(intensity).toHaveValue("0.95");
  await palette.selectOption("sunset");
  await expect(
    panel.getByText(english("video.panel.sceneStale")),
  ).toBeVisible();
  await expect(preview).toHaveCount(0);
});

test("Studio 3D falls back to Waveform when WebGL2 is unavailable", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await instrumentRenderWorker(page, () => {
    const getContext = OffscreenCanvas.prototype.getContext;
    Object.defineProperty(OffscreenCanvas.prototype, "getContext", {
      value(this: OffscreenCanvas, kind: string, options?: unknown) {
        if (kind === "webgl2") return null;
        return Reflect.apply(getContext, this, [kind, options]);
      },
    });
  });
  const { panel, render, scene, preview } = await openFixture(page);
  await render.click();
  await expect(preview).toHaveAttribute("src", /^blob:/, { timeout: 65_000 });
  await expect(scene).toHaveValue("waveform");
  await expect(
    panel.getByText(english("video.studio3d.unavailable")),
  ).toBeVisible();
  expect(await videoReceipts(page)).toEqual([
    expect.objectContaining({
      sceneId: "waveform",
      sceneNotices: [
        { reason: "webgl-unavailable", fallbackSceneId: "waveform" },
      ],
    }),
  ]);
});

test("cancelling after Studio 3D starts leaves no video artifact", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const { panel, render, preview } = await openFixture(page);
  await panel.evaluate(
    (element, { firstStageFrame, cancelText }) => {
      const observer = new MutationObserver(() => {
        const progress = element.querySelector("progress");
        if (
          !progress ||
          progress.value <= firstStageFrame ||
          progress.value >= progress.max
        )
          return;
        const cancel = [...element.querySelectorAll("button")].find(
          (button) => button.textContent === cancelText,
        );
        if (!cancel || cancel.disabled) return;
        observer.disconnect();
        cancel.click();
      });
      observer.observe(element, {
        childList: true,
        attributes: true,
        subtree: true,
      });
    },
    { firstStageFrame, cancelText: english("video.panel.cancel") },
  );
  await render.click();
  await expect(panel.getByText(english("video.panel.cancelled"))).toBeVisible({
    timeout: 65_000,
  });
  await expect(preview).toHaveCount(0);
  expect(await videoReceipts(page)).toEqual([]);
});

async function inspectStagePixels({
  bundle, backgroundModule, width, height, paletteId, palette, centerX, centerY,
  orbRadius, hostSamples,
}: {
  bundle: string;
  backgroundModule: string;
  width: number;
  height: number;
  paletteId: string;
  palette: Palette;
  centerX: number;
  centerY: number;
  orbRadius: number;
  hostSamples: Record<"orb" | "bevel" | "floor" | "top" | "side", readonly [number, number]>[];
}) {
  const load = async (code: string) => {
    const url = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
    try {
      return await import(url);
    } finally {
      URL.revokeObjectURL(url);
    }
  };
  const { createStudio3dScene } = await load(bundle) as typeof import("../src/video/scenes/studio3d/index.ts");
  const { drawVideoBackground } = await load(backgroundModule) as typeof import("../src/video/design/background.ts");
  const context = (w: number, h: number) =>
    new OffscreenCanvas(w, h).getContext("2d", { alpha: false, willReadFrequently: true })!;
  const card = context(width, height);
  drawVideoBackground(card, width, height, palette);
  const cardPixels = card.getImageData(0, 0, width, height).data;
  const small = context(Math.floor(width / 4), Math.floor(height / 4));
  small.drawImage(card.canvas, 0, 0, small.canvas.width, small.canvas.height);
  const { width: smallWidth, height: smallHeight } = small.canvas;
  const smallCard = small.getImageData(0, 0, smallWidth, smallHeight).data;

  const portrait = width < height;
  const weights = [0.2126, 0.7152, 0.0722];
  const linear = (channel: number) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const offset = (w: number, x: number, y: number) => 4 * (Math.floor(y) * w + Math.floor(x));
  const luma = (pixels: Uint8ClampedArray, at: number, decode: (v: number) => number) =>
    weights.reduce((sum, weight, channel) => sum + weight * decode(pixels[at + channel]), 0);
  const srgb = (channel: number) => channel / 255;
  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const strip = (smallPixels: Uint8ClampedArray, x: number, halfWidth: number) => {
    let total = 0;
    for (let row = 0; row < 12; row++) {
      for (let column = -2; column <= 2; column++) {
        const at = offset(
          smallWidth,
          (x + column * halfWidth / 2) * smallWidth,
          (centerY + (row - 5.5) * 0.009) * smallHeight,
        );
        total += luma(smallPixels, at, linear);
      }
    }
    return total / 60;
  };
  const frameEdge = (pixels: Uint8ClampedArray) =>
    mean([strip(pixels, 0.04, 0.02), strip(pixels, 0.96, 0.02)]);
  const backdropGap = (pixels: Uint8ClampedArray) => strip(pixels, centerX, 0.014) - frameEdge(pixels);
  const maxStep = (length: number, read: (index: number) => number) => {
    let largest = 0;
    for (let index = 1; index < length; index++)
      largest = Math.max(largest, Math.abs(read(index) - read(index - 1)));
    return largest;
  };
  function sampleOrb(pixels: Uint8ClampedArray, [orbX, orbY]: readonly [number, number]) {
    const x = orbX * width;
    const y = orbY * height;
    const luminance = (px: number, py: number) => luma(pixels, offset(width, px, py), linear);
    const discRadius = 0.95 * orbRadius;
    // Include the full silhouette and the bands in the highlight check.
    const highlightRadius = 1.09 * orbRadius;
    let discTotal = 0;
    let discPixels = 0;
    let highlight = 0;
    for (let py = Math.floor(y - highlightRadius); py < y + highlightRadius; py++) {
      for (let px = Math.floor(x - highlightRadius); px < x + highlightRadius; px++) {
        const distanceSquared = (px + 0.5 - x) ** 2 + (py + 0.5 - y) ** 2;
        if (distanceSquared <= highlightRadius ** 2)
          highlight = Math.max(highlight, luma(pixels, offset(width, px, py), srgb));
        if (distanceSquared <= discRadius ** 2) {
          discTotal += luminance(px, py);
          discPixels++;
        }
      }
    }
    const body = [];
    for (let row = -2; row <= 2; row++)
      for (let column = -2; column <= 2; column++)
        body.push(luminance(x + column * 0.05 * orbRadius, y + (row * 0.05 - 0.37) * orbRadius));

    const rim = [];
    const contrast = [];
    const rimRGB = [[], [], []] as number[][];
    for (let ray = -6; ray <= 6; ray++) {
      const angle = -Math.PI / 2 + ray * Math.PI / 36;
      const radial = (radius: number) => offset(width, x + Math.cos(angle) * radius, y + Math.sin(angle) * radius);
      let peak = 0;
      let peakOffset = 0;
      for (let radius = orbRadius * 0.88; radius <= orbRadius * 1.10; radius++) {
        const at = radial(radius);
        const brightness = luma(pixels, at, linear);
        if (brightness > peak) {
          peak = brightness;
          peakOffset = at;
        }
      }
      rim.push(peak);
      rimRGB.forEach((samples, channel) => samples.push(pixels[peakOffset + channel]));
      contrast.push((peak + 0.05) / (luma(pixels, radial(orbRadius * 1.17), linear) + 0.05));
    }
    return {
      body: mean(body), disc: discTotal / discPixels, highlight,
      rim: mean(rim), rimRGB: rimRGB.map(mean), rimContrast: Math.min(...contrast),
    };
  }
  // This static reduced-motion fixture exercises both turn cues in silent PCM.
  const sampleRate = 8_000;
  const scenes = (["A", "B"] as const).map((speakerId, index) => ({
    kind: "turn" as const, start: index, end: index + 1, audioStart: index,
    chapterId: "fixture", turnId: String(index), captions: [], speakerId,
  }));
  const canvas = new OffscreenCanvas(width, height);
  const frame = context(width, height);
  const plan: TimelinePlan = {
    duration: 2,
    fps: 30,
    // The renderer also accepts smaller frames for pixel inspection.
    resolution: { width, height } as TimelinePlan["resolution"],
    scenes,
    chapters: [],
    estimated: false,
  };
  const audio = { sampleRate, channels: [new Float32Array(2 * sampleRate)] };
  const input = { canvas, plan, audio, theme: "dark" as const };
  const scene = createStudio3dScene({ paletteId, cameraPresetId: "static", reducedMotion: true });
  try {
    const unavailable = await scene.init({
      ...input, signal: new AbortController().signal, fail: (error) => { throw error; },
    });
    if (unavailable) throw new Error(unavailable);
    const contrasts = [];
    const bevels: number[][] = [[], []];
    const topLifts: number[] = [];
    const visualFrames = [];
    let drawCalls = 0;
    let triangles = 0;
    let rowStep = 0;
    let washEdgeStep = 0;
    let gradientDelta = 0;
    for (let host = 0; host < scenes.length; host++) {
      const time = host + 0.5;
      scene.draw({
        ...input, kind: "webgl", time, index: 30 * time,
        turn: scenes[host], textLayouts: new Map(),
      });
      frame.drawImage(canvas, 0, 0);
      const pixels = frame.getImageData(0, 0, width, height).data;
      const stats = scene.getRenderStats()!;
      drawCalls = Math.max(drawCalls, stats.calls);
      triangles = Math.max(triangles, stats.triangles);
      small.drawImage(frame.canvas, 0, 0, smallWidth, smallHeight);
      const preview = small.getImageData(0, 0, smallWidth, smallHeight).data;
      const previewLuma = (x: number, y: number) => luma(preview, offset(smallWidth, x, y), srgb);
      visualFrames.push({
        horizontalStep: maxStep(smallWidth, (x) => previewLuma(x, smallHeight * 0.13)),
        verticalStep: maxStep(smallHeight, (y) => previewLuma(smallWidth * 0.92, y)),
        gapShift: Math.abs(backdropGap(preview) - backdropGap(smallCard)) / frameEdge(preview),
        hosts: hostSamples.map(({ orb }) => sampleOrb(pixels, orb)),
      });
      for (const y of [0.13, 0.62]) {
        for (const x of [0.04, 0.23, 0.43, 0.64, 0.79, 0.96]) {
          const at = offset(width, x * width, y * height);
          for (let channel = 0; channel < 3; channel++)
            gradientDelta = Math.max(gradientDelta, Math.abs(pixels[at + channel] - cardPixels[at + channel]));
        }
      }
      // These two lines run between the orbs, pedestals and nearest spectrum blocks.
      const washEdges = portrait ? [0.405, 0.491] : [0.422, 0.530];
      for (const x of [centerX - 0.024, centerX + 0.024]) {
        const read = (y: number) => luma(pixels, offset(width, x * width, y), srgb);
        for (let y = Math.ceil((washEdges[0] - 0.005) * height); y < 0.62 * height; y++) {
          const step = Math.abs(read(y) - read(y - 1));
          rowStep = Math.max(rowStep, step);
          if (washEdges.some((edge) => Math.abs(y - edge * height) <= 2))
            washEdgeStep = Math.max(washEdgeStep, step);
        }
      }
      const sample = ([x, y]: readonly [number, number]) =>
        luma(pixels, offset(width, x * width, y * height), linear);
      const { bevel, floor, top, side } = hostSamples[host];
      contrasts.push((sample(bevel) + 0.05) / (sample(floor) + 0.05));
      topLifts.push(sample(top) - sample(side));
      hostSamples.forEach(({ bevel }, index) => bevels[index].push(sample(bevel)));
    }
    return {
      rowStep, washEdgeStep, gradientDelta, contrasts, topLifts, visualFrames, drawCalls, triangles,
      bevelLift: bevels.map((samples, host) => samples[host] - samples[1 - host]),
    };
  } finally {
    scene.dispose();
  }
}

function hueDegrees([r, g, b]: number[]) {
  const max = Math.max(r, g, b);
  const range = max - Math.min(r, g, b);
  if (!range) return 0;
  const hue = max === r ? (g - b) / range : max === g ? 2 + (b - r) / range : 4 + (r - g) / range;
  return (hue * 60 + 360) % 360;
}

test("Studio 3D keeps the backdrop continuous and makes the speaker visible at preview sizes", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.route("**/studio3d-visuals", (route) =>
    route.fulfill({ contentType: "text/html", body: "<!doctype html>" }),
  );
  await page.goto("/studio3d-visuals");
  const bundle = await bundleStudio3d();
  const backgroundSource = new URL("../src/video/design/background.ts", import.meta.url);
  const { code: backgroundModule } = await transformWithOxc(
    await readFile(backgroundSource, "utf8"), "background.ts",
  );
  for (const [width, height] of [
    [960, 540],
    [390, 694],
  ]) {
    const layout = studioLayout(width, height);
    const pose = cameraPoseAt("static", 0);
    const { centerX, centerY, hostX, floorY, pedestalHeight, pedestalRadius } = layout;
    const orbRadius = height * Math.tan(Math.asin(layout.orbRadius / pose.distance)) /
      (2 * Math.tan((cameraFov * Math.PI) / 360));
    const hostSamples = [-hostX, hostX].map((x) => ({
      orb: projectStagePoint(layout, pose, [x, 0, 0]),
      bevel: projectStagePoint(layout, pose, [x, floorY + 0.795 * pedestalHeight, 0.921 * pedestalRadius]),
      floor: projectStagePoint(layout, pose, [x, floorY, 1.68 * pedestalRadius]),
      top: projectStagePoint(layout, pose, [x, floorY + pedestalHeight, 0.70 * pedestalRadius]),
      side: projectStagePoint(layout, pose, [x, floorY + 0.35 * pedestalHeight, pedestalRadius]),
    }));
    for (const paletteId of paletteIds) {
      const label = `${paletteId} at ${width}×${height}`;
      const pixels = await page.evaluate(inspectStagePixels, {
        bundle, backgroundModule, width, height, paletteId, palette: palettes[paletteId],
        centerX, centerY, orbRadius, hostSamples,
      });
      expect(pixels.gradientDelta, `${label} card-to-stage background code values`).toBeLessThanOrEqual(1);
      expect(pixels.rowStep, `${label} raw floor luma step`).toBeLessThanOrEqual(3 / 255 + 1e-9);
      expect(pixels.washEdgeStep, `${label} wash-edge luma step`).toBeLessThanOrEqual(2 / 255 + 1e-9);
      for (const ratio of pixels.contrasts)
        expect(ratio, `${label} active bevel versus adjacent floor`).toBeGreaterThanOrEqual(3);
      for (const lift of pixels.bevelLift)
        expect(lift, `${label} active bevel versus idle`).toBeGreaterThanOrEqual(0.05);
      for (const lift of pixels.topLifts)
        expect(lift, `${label} pedestal top versus side`).toBeGreaterThanOrEqual(0.02);
      expect(pixels.drawCalls, `${label} draw calls`).toBeLessThanOrEqual(16);
      expect(pixels.triangles, `${label} triangles`).toBeLessThanOrEqual(12_000);
      const [aSpeaking, bSpeaking] = pixels.visualFrames;
      for (const frame of [aSpeaking, bSpeaking]) {
        expect(
          frame.horizontalStep,
          `${label} horizontal luma step`,
        ).toBeLessThanOrEqual(2 / 255 + 1e-9);
        expect(
          frame.verticalStep,
          `${label} vertical luma step`,
        ).toBeLessThanOrEqual(2 / 255 + 1e-9);
        expect(frame.gapShift, `${label} inter-orb luminance shift`).toBeLessThanOrEqual(0.15);
      }
      for (const [host, active, idle] of [
        ["A", aSpeaking.hosts[0], bSpeaking.hosts[0]],
        ["B", bSpeaking.hosts[1], aSpeaking.hosts[1]],
      ] as const) {
        expect(
          active.body - idle.body,
          `${label} host ${host} body emphasis`,
        ).toBeGreaterThan(0.012);
        expect(
          active.body - idle.body,
          `${label} host ${host} body luminance swing`,
        ).toBeLessThanOrEqual(0.05);
        expect(
          (active.disc - idle.disc) / idle.disc,
          `${label} host ${host} orb-disc luminance lift without chips`,
        ).toBeGreaterThanOrEqual(0.08);
        expect(
          active.rim,
          `${label} host ${host} rim emphasis`,
        ).toBeGreaterThanOrEqual(1.2 * idle.rim);
        for (const [state, sample] of [
          ["active", active],
          ["idle", idle],
        ] as const) {
          expect(
            sample.rimContrast,
            `${label} host ${host} ${state} rim contrast`,
          ).toBeGreaterThanOrEqual(3);
          expect(sample.highlight, `${label} host ${host} ${state} peak orb luma in sRGB`)
            .toBeLessThanOrEqual(0.92);
        }
      }
      if (paletteId === "aurora") {
        const a = aSpeaking.hosts[0];
        const b = bSpeaking.hosts[1];
        const hueDelta = Math.abs(hueDegrees(a.rimRGB) - hueDegrees(b.rimRGB));
        expect(Math.min(hueDelta, 360 - hueDelta), `${label} active rim hue distance`)
          .toBeGreaterThanOrEqual(65);
        expect(Math.abs(a.rim - b.rim), `${label} active rim luminance match`).toBeLessThanOrEqual(0.035);
      }
    }
  }
});
