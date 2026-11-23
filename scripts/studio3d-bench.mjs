import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";
import { build } from "vite";
import {
  pedestalFootRadius,
  projectStagePoint,
  studioLayout,
} from "../src/video/scenes/studio3d/layout.ts";
import { cameraPoseAt } from "../src/video/scenes/studio3d/presets.ts";

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

export function studio3dContactProbes(width, height) {
  const layout = studioLayout(width, height);
  const pose = cameraPoseAt("static", 0);
  const { hostX, floorY, pedestalRadius, groundRingRadius } = layout;
  const pixels = (point) => {
    const [x, y] = projectStagePoint(layout, pose, point);
    return [x * width, y * height];
  };
  return [-hostX, hostX].map((x) => {
    const radius = pedestalRadius * groundRingRadius;
    return {
      foot: pixels([x, floorY, pedestalRadius * pedestalFootRadius]),
      ring: [-0.28, -0.14, 0, 0.14, 0.28].map((angle) =>
        pixels([x + radius * Math.sin(angle), floorY + 0.001, radius * Math.cos(angle)]),
      ),
    };
  });
}

// Playwright evaluates this function in a blank document. The same function
// body also runs inside a dedicated worker with the production scene bundle.
export async function measureStudio3d({
  bundle,
  width,
  height,
  frameOrder,
  worker = false,
  visualPalette,
  contactProbes,
  reducedMotion = false,
}) {
  async function measure({
    url, width, height, frameOrder, worker, visualPalette, contactProbes, reducedMotion,
  }) {
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
      audio: { sampleRate, channels: [reducedMotion ? new Float32Array(0) : pcm] },
      theme: "dark",
    };
    const signal = new AbortController().signal;
    const scene = createStudio3dScene({
      ...(visualPalette
        ? { paletteId: visualPalette, cameraPresetId: "static" }
        : { paletteId: "aurora", cameraPresetId: "drift", moodId: "urgent", intensity: 1 }),
      ...(reducedMotion && { cameraPresetId: "drift", reducedMotion: true }),
    });
    const textLayouts = new Map();
    const hashFrames = new Set([0, 15, 30, 60, 120]);
    const hashes = {};
    const visuals = {};
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

      function sampleVisuals(pixels) {
        const portrait = width < height;
        const centerX = portrait ? 0.43 : 0.5;
        const centerY = portrait ? 0.30 : 0.345;
        const orbRadius = (height * (portrait ? 0.118 : 0.195)) / 2;
        const mean = (values) =>
          values.reduce((sum, value) => sum + value, 0) / values.length;
        const linear = (channel) => {
          const value = channel / 255;
          return value <= 0.04045
            ? value / 12.92
            : ((value + 0.055) / 1.055) ** 2.4;
        };
        const sample = (image, x, y, convert) => {
          const offset = 4 * (Math.floor(y) * image.width + Math.floor(x));
          return (
            0.2126 * convert(image.data[offset]) +
            0.7152 * convert(image.data[offset + 1]) +
            0.0722 * convert(image.data[offset + 2])
          );
        };
        const downscaled = createCanvas();
        downscaled.width = Math.floor(width / 4);
        downscaled.height = Math.floor(height / 4);
        const smallContext = downscaled.getContext("2d");
        smallContext.drawImage(
          composite.canvas, 0, 0, downscaled.width, downscaled.height,
        );
        const small = smallContext.getImageData(
          0, 0, downscaled.width, downscaled.height,
        );
        const luma = (x, y) => sample(small, x, y, (channel) => channel / 255);
        const maxStep = (length, read) => {
          let largest = 0;
          for (let index = 1; index < length; index++)
            largest = Math.max(largest, Math.abs(read(index) - read(index - 1)));
          return largest;
        };
        const horizontalStep = maxStep(
          small.width, (x) => luma(x, small.height * 0.13),
        );
        const verticalStep = maxStep(
          small.height, (y) => luma(small.width * 0.92, y),
        );

        // Compare the inter-orb gap with strips at the same height at both frame edges.
        const backdropStrip = (x, halfWidth) => {
          const samples = [];
          for (let row = 0; row < 12; row++)
            for (let column = -2; column <= 2; column++)
              samples.push(sample(
                small,
                (x + (column * halfWidth) / 2) * small.width,
                (centerY + (row - 5.5) * 0.009) * small.height,
                linear,
              ));
          return mean(samples);
        };
        const betweenOrbs = backdropStrip(centerX, 0.014);
        const frameEdge = mean([
          backdropStrip(0.04, 0.02), backdropStrip(0.96, 0.02),
        ]);

        const hosts = (portrait ? [0.25, 0.61] : [0.34, 0.66]).map((anchorX, host) => {
          const x = anchorX * width;
          const y = centerY * height;
          const luminance = (px, py) => sample(pixels, px, py, linear);
          // Sample above the equatorial bands to isolate body light from band light.
          const body = [];
          for (let row = -2; row <= 2; row++)
            for (let column = -2; column <= 2; column++)
              body.push(luminance(
                x + column * 0.05 * orbRadius,
                y + (row * 0.05 - 0.37) * orbRadius,
              ));

          const rim = [];
          const contrast = [];
          // Trace the upper arc to cover smooth and faceted silhouettes. Take the
          // brightest rim on each ray and pair it with the adjacent backdrop.
          for (let ray = -6; ray <= 6; ray++) {
            const angle = -Math.PI / 2 + ray * Math.PI / 36;
            const radial = (radius) =>
              luminance(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius);
            let peak = 0;
            for (let radius = orbRadius * 0.88; radius <= orbRadius * 1.10; radius++)
              peak = Math.max(peak, radial(radius));
            rim.push(peak);
            contrast.push((peak + 0.05) / (radial(orbRadius * 1.17) + 0.05));
          }
          // Measure the lower lip against the floor on the same vertical line.
          const { foot: [footX, footY], ring } = contactProbes[host];
          const pedestalStep =
            luminance(footX, footY - height * 0.003) -
            luminance(footX, footY + height * 0.0025);
          const groundRing = mean(ring.map(([px, py]) => luminance(px, py)));
          return {
            body: mean(body),
            rim: mean(rim),
            rimContrast: Math.min(...contrast),
            pedestalStep,
            groundRing,
          };
        });
        // One period of the backdrop dither along each row isolates the wash.
        const rowLuma = (x, y) => mean([0, 1, 2, 3].map((column) =>
          sample(pixels, x * width + column - 2, y * height, (channel) => channel / 255),
        ));
        const washSteps = portrait
          ? [0.35, 0.42, 0.52].map((y) => rowLuma(centerX, y) - rowLuma(0.92, y))
          : [];
        return { horizontalStep, verticalStep, betweenOrbs, frameEdge, hosts, washSteps };
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
        const hashFrame = hashFrames.has(index);
        if (hashFrame || visualPalette) {
          const pixels = composite.getImageData(0, 0, width, height);
          if (visualPalette) visuals[index] = sampleVisuals(pixels);
          if (!hashFrame) continue;
          const digest = await crypto.subtle.digest("SHA-256", pixels.data);
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
        ...(visualPalette && { visuals }),
      };
    } finally {
      scene.dispose();
    }
  }

  const url = URL.createObjectURL(
    new Blob([bundle], { type: "text/javascript" }),
  );
  const options = { url, width, height, frameOrder, worker, visualPalette, contactProbes, reducedMotion };
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
  // Diagnostic mode for environments that block Chromium child processes.
  const inProcess = process.argv.includes("--in-process");
  const browser = await chromium.launch({
    args: [
      inProcess ? "--use-angle=swiftshader-webgl" : "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "--no-proxy-server",
      "--host-resolver-rules=MAP * ~NOTFOUND",
      ...(inProcess
        ? [
            "--single-process",
            "--in-process-gpu",
            "--disable-features=AudioServiceOutOfProcess",
          ]
        : []),
    ],
  });
  try {
    const context = await browser.newContext({
      offline: true,
      serviceWorkers: "block",
    });
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
      JSON.stringify({
        chromium: browser.version(),
        mode: inProcess ? "in-process diagnostic" : "standard",
        encoding: "NOT_RUN",
      }),
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
