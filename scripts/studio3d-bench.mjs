import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";
import { build } from "vite";

export async function bundleStudio3d() {
  const result = await build({
    root: fileURLToPath(new URL("..", import.meta.url)),
    configFile: false,
    envFile: false,
    publicDir: false,
    logLevel: "silent",
    // Library mode leaves dependency process.env references (React) untouched.
    define: { "process.env.NODE_ENV": '"production"', "process.env": "{}" },
    build: {
      write: false,
      lib: {
        entry: fileURLToPath(
          new URL("../src/video/scenes/studio3d/index.ts", import.meta.url),
        ),
        formats: ["es"],
      },
    },
  });
  const chunks = result.flatMap(({ output }) =>
    output.filter(({ type }) => type === "chunk"),
  );
  if (
    chunks.length !== 1 ||
    chunks[0].imports.length ||
    chunks[0].dynamicImports.length
  )
    throw new Error("Expected a self-contained Studio 3D benchmark module");
  return chunks[0].code;
}

// Playwright evaluates this function in a blank document. The same function
// body also runs inside a dedicated worker with the production scene bundle.
export async function measureStudio3d({
  bundle,
  width,
  height,
  frameOrder,
  worker = false,
}) {
  async function measure({ url, width, height, frameOrder, worker }) {
    const { createStudio3dScene } = await import(url);
    const createCanvas = () => {
      if (worker) return new OffscreenCanvas(width, height);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      return canvas;
    };
    const fps = 30;
    const duration = 5;
    const sampleRate = 48_000;
    const scenes = [
      [0, 1.35, "A", 310],
      [1.52, 3.03, "B", 460],
      [3.25, 4.75, "A", 275],
    ].map(([start, end, speakerId, frequency], index) => ({
      kind: "turn",
      start,
      end,
      speakerId,
      frequency,
      audioStart: start,
      chapterId: "fixture",
      turnId: String(index),
      captions: [],
    }));
    const plan = {
      duration,
      fps,
      resolution: { width, height },
      scenes,
      estimated: false,
      chapters: [],
    };
    const pcm = new Float32Array(duration * sampleRate);
    for (const { start, end, frequency } of scenes) {
      for (
        let index = Math.round(start * sampleRate);
        index < Math.round(end * sampleRate);
        index++
      ) {
        const time = index / sampleRate;
        const gain = 0.045 + 0.042 * Math.sin(2 * Math.PI * 1.8 * time);
        const phase = 2 * Math.PI * frequency * time;
        pcm[index] = gain * (Math.sin(phase) + 0.25 * Math.sin(3 * phase));
      }
    }
    const canvas = createCanvas();
    const composite = createCanvas().getContext("2d", {
      alpha: false,
      willReadFrequently: true,
    });
    const inputs = {
      canvas,
      plan,
      audio: { sampleRate, channels: [pcm] },
      theme: "dark",
    };
    const signal = new AbortController().signal;
    const scene = createStudio3dScene({
      paletteId: "aurora",
      cameraPresetId: "drift",
      moodId: "urgent",
      intensity: 1,
    });
    const textLayouts = new Map();
    const hashFrames = new Set([0, 15, 30, 60, 120]);
    const hashes = {};
    const metrics = { drawCalls: 0, triangles: 0 };
    let failure;

    try {
      const initStart = performance.now();
      const unavailable = await scene.init({
        ...inputs,
        signal,
        fail: (error) => {
          failure = error;
        },
      });
      const initMs = performance.now() - initStart;
      if (unavailable || !composite)
        throw new Error("Studio 3D or composite canvas unavailable");
      const gl = canvas.getContext("webgl2");
      const debug = gl.getExtension("WEBGL_debug_renderer_info");
      const renderer = gl.getParameter(
        debug?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER,
      );

      function draw(index) {
        const time = index / fps;
        const turn =
          scenes.find(({ start, end }) => time >= start && time < end) ??
          scenes[0];
        scene.draw({
          ...inputs,
          index,
          time,
          turn,
          textLayouts,
          kind: "webgl",
        });
        composite.drawImage(canvas, 0, 0);
        // Synchronize the measurement after the 2D composite.
        composite.getImageData(0, 0, 1, 1);
        if (failure) throw failure;
      }

      const warmupStart = performance.now();
      for (let index = 0; index < 10; index++) draw(index);
      const warmupMs = performance.now() - warmupStart;
      const samples = [];
      for (const index of frameOrder) {
        const start = performance.now();
        draw(index);
        samples.push(performance.now() - start);
        const { calls, triangles } = scene.getRenderStats();
        metrics.drawCalls = Math.max(metrics.drawCalls, calls);
        metrics.triangles = Math.max(metrics.triangles, triangles);
        if (hashFrames.has(index)) {
          const { data } = composite.getImageData(0, 0, width, height);
          const digest = await crypto.subtle.digest("SHA-256", data);
          hashes[index] = Array.from(new Uint8Array(digest), (byte) =>
            byte.toString(16).padStart(2, "0"),
          ).join("");
        }
      }
      samples.sort((a, b) => a - b);
      return {
        status: "PASS",
        renderer,
        width,
        height,
        frames: samples.length,
        initMs,
        warmupMs,
        medianMs:
          (samples[Math.floor((samples.length - 1) / 2)] +
            samples[Math.floor(samples.length / 2)]) /
          2,
        p95Ms: samples[Math.ceil(samples.length * 0.95) - 1],
        ...metrics,
        hashes,
      };
    } finally {
      scene.dispose();
    }
  }

  const url = URL.createObjectURL(
    new Blob([bundle], { type: "text/javascript" }),
  );
  const options = { url, width, height, frameOrder, worker };
  try {
    if (!worker) return await measure(options);
    if (typeof Worker !== "function" || typeof OffscreenCanvas !== "function")
      return {
        status: "NOT_RUN",
        reason: "Worker or OffscreenCanvas unavailable",
      };

    const source = `
      self.onmessage = async ({ data }) => {
        try {
          self.postMessage(await (${measure.toString()})(data));
        } catch (error) {
          self.postMessage({ status: "FAIL", reason: String(error) });
        }
      };
    `;
    const workerUrl = URL.createObjectURL(
      new Blob([source], { type: "text/javascript" }),
    );
    let instance;
    try {
      instance = new Worker(workerUrl, { type: "module" });
      return await new Promise((resolve, reject) => {
        instance.onmessage = ({ data }) => resolve(data);
        instance.onerror = reject;
        instance.postMessage(options);
      });
    } finally {
      instance?.terminate();
      URL.revokeObjectURL(workerUrl);
    }
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function main() {
  const bundle = await bundleStudio3d();
  const browser = await chromium.launch({
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  try {
    const context = await browser.newContext({ serviceWorkers: "block" });
    const origin = "http://127.0.0.1";
    await context.route("**/*", (route) =>
      route.request().url() === origin + "/studio3d-bench"
        ? route.fulfill({
            contentType: "text/html",
            body: "<!doctype html><title>Studio 3D benchmark</title>",
          })
        : route.abort(),
    );
    const page = await context.newPage();
    await page.goto(origin + "/studio3d-bench");
    const frameOrder = Array.from({ length: 150 }, (_, index) => index);
    const shuffled = frameOrder.map(
      (index) => (index * 37) % frameOrder.length,
    );
    const samePixels = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const withinBudget = ({ renderer, medianMs, p95Ms, drawCalls, triangles }) =>
      /swiftshader/i.test(renderer) &&
      medianMs <= 40 &&
      p95Ms <= 60 &&
      drawCalls <= 16 &&
      triangles <= 12_000;
    console.log(
      JSON.stringify({ chromium: browser.version(), encoding: "NOT_RUN" }),
    );

    for (const [orientation, width, height] of [
      ["landscape", 1920, 1080],
      ["portrait", 1080, 1920],
    ]) {
      const options = { bundle, width, height, frameOrder };
      const main = await page.evaluate(measureStudio3d, options);
      const mainShuffled = await page.evaluate(measureStudio3d, {
        ...options,
        frameOrder: shuffled,
      });
      const worker = await page.evaluate(measureStudio3d, {
        ...options,
        worker: true,
      });
      const workerShuffled =
        worker.status === "PASS"
          ? await page.evaluate(measureStudio3d, {
              ...options,
              frameOrder: shuffled,
              worker: true,
            })
          : worker;
      const mainRepeatable = samePixels(main.hashes, mainShuffled.hashes);
      const workerRepeatable =
        worker.status === "PASS" && workerShuffled.status === "PASS"
          ? samePixels(worker.hashes, workerShuffled.hashes)
          : worker.status;
      const workerMatchesMain =
        worker.status === "PASS"
          ? samePixels(main.hashes, worker.hashes)
          : worker.status;
      const runs = [main, mainShuffled, worker, workerShuffled];
      const passed =
        mainRepeatable &&
        new Set(Object.values(main.hashes)).size > 1 &&
        workerRepeatable !== false &&
        workerMatchesMain !== false &&
        runs.every(
          (run) =>
            run.status === "NOT_RUN" ||
            (run.status === "PASS" && withinBudget(run)),
        );
      console.log(
        JSON.stringify(
          {
            orientation,
            status: passed ? "PASS" : "FAIL",
            main,
            mainShuffled,
            worker,
            workerShuffled,
            mainRepeatable,
            workerRepeatable,
            workerMatchesMain,
          },
          null,
          2,
        ),
      );
      if (!passed) process.exitCode = 1;
    }
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await main();
