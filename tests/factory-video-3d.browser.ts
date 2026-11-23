import { expect, type Locator, type Page } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { bundleStudio3d, measureStudio3d } from "../scripts/studio3d-bench.mjs";
import { wave } from "../server/audio.mjs";
import type { Episode } from "../shared/factory.ts";
import type { AgentArtifact } from "../src/agent/artifacts.ts";
import { createTranslator } from "../src/i18n/index.ts";
import { beforeEnd, buildTimeline } from "../src/video/timeline.ts";
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

async function decodedFrames(preview: Locator) {
  return preview.evaluate(
    async (
      video: HTMLVideoElement,
      { decoderUrl, fps, frameCount, indices },
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
      return Promise.all(
        indices.map(async (index) => {
          const sample = samples.get(index);
          if (!sample) throw new Error(`Preview is missing frame ${index}`);
          const digest = await crypto.subtle.digest("SHA-256", sample.pixels);
          const sha256 = Array.from(new Uint8Array(digest), (byte) =>
            byte.toString(16).padStart(2, "0"),
          ).join("");
          return { sha256, colors: sample.colors };
        }),
      );
    },
    {
      decoderUrl,
      fps: plan.fps,
      frameCount,
      indices: previewFrames,
    },
  );
}

async function instrumentRenderWorker(page: Page, setup: () => void) {
  await page.route("**/assets/render-worker-*.js", async (route) => {
    const script = await route.fetch();
    await route.fulfill({
      response: script,
      body: `(${setup.toString()})();\n${await script.text()}`,
    });
  });
}

test("Studio 3D saves a playable preview with repeatable decoded frame hashes", async ({
  page,
}) => {
  test.setTimeout(150_000);
  await servePreviewDecoder(page);
  await page.addInitScript(() => {
    const wordmarks = new Set<string>();
    Reflect.set(window, "renderedWordmarks", wordmarks);
    window.Worker = class extends Worker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.addEventListener("message", ({ data }) => {
          if (data.kind === "wordmark") wordmarks.add(data.text);
        });
      }
    };
  });
  await instrumentRenderWorker(page, () => {
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
  });
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
    await expect
      .poll(() => preview.evaluate((video: HTMLVideoElement) => video.duration))
      .toBeCloseTo(plan.duration, 1);
    return {
      url: (await preview.getAttribute("src"))!,
      frames: await decodedFrames(preview),
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
  expect(second.frames.map(({ sha256 }) => sha256)).toEqual(
    first.frames.map(({ sha256 }) => sha256),
  );

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

test("Studio 3D stays within the render budget and reproduces pixels after shuffled seeks", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.route("**/studio3d-budget", (route) =>
    route.fulfill({ contentType: "text/html", body: "<!doctype html>" }),
  );
  await page.goto("/studio3d-budget");
  const bundle = await bundleStudio3d();
  for (const [width, height] of [
    [1920, 1080],
    [1080, 1920],
  ]) {
    const frames = await page.evaluate(measureStudio3d, {
      bundle,
      width,
      height,
      frameOrder: Array.from({ length: 150 }, (_, index) => index),
    });
    const shuffled = await page.evaluate(measureStudio3d, {
      bundle,
      width,
      height,
      frameOrder: [120, 15, 0, 60, 30],
    });
    for (const result of [frames, shuffled]) {
      expect(result.status).toBe("PASS");
      expect(result.drawCalls).toBeGreaterThan(0);
      expect(result.drawCalls).toBeLessThanOrEqual(16);
      expect(result.triangles).toBeGreaterThan(0);
      expect(result.triangles).toBeLessThanOrEqual(12_000);
    }
    expect(new Set(Object.values(frames.hashes)).size).toBeGreaterThan(1);
    expect(shuffled.hashes).toEqual(frames.hashes);
  }
});

test("Studio 3D keeps the backdrop continuous and makes the speaker visible at preview sizes", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.route("**/studio3d-visuals", (route) =>
    route.fulfill({ contentType: "text/html", body: "<!doctype html>" }),
  );
  await page.goto("/studio3d-visuals");
  const bundle = await bundleStudio3d();
  for (const [width, height] of [
    [960, 540],
    [390, 694],
  ]) {
    for (const palette of ["aurora", "sunset", "mono", "ocean"]) {
      const label = `${palette} at ${width}×${height}`;
      // The synthetic turn plan has stable A and B samples at 1s and 2s.
      const result = await page.evaluate(measureStudio3d, {
        bundle,
        width,
        height,
        frameOrder: [30, 60],
        visualPalette: palette,
      });
      expect(result.status, label).toBe("PASS");
      const aSpeaking = result.visuals[30];
      const bSpeaking = result.visuals[60];
      for (const frame of [aSpeaking, bSpeaking]) {
        expect(
          frame.horizontalStep,
          `${label} horizontal luma step`,
        ).toBeLessThanOrEqual(2 / 255 + 1e-9);
        expect(
          frame.verticalStep,
          `${label} vertical luma step`,
        ).toBeLessThanOrEqual(2 / 255 + 1e-9);
        expect(
          Math.abs(frame.betweenOrbs - frame.frameEdge) / frame.frameEdge,
          `${label} inter-orb luminance versus frame edge`,
        ).toBeLessThanOrEqual(0.15);
      }
      for (const [host, active, idle] of [
        ["A", aSpeaking.hosts[0], bSpeaking.hosts[0]],
        ["B", bSpeaking.hosts[1], aSpeaking.hosts[1]],
      ]) {
        expect(
          active.body - idle.body,
          `${label} host ${host} body emphasis`,
        ).toBeGreaterThan(0.012);
        expect(
          active.rim,
          `${label} host ${host} rim emphasis`,
        ).toBeGreaterThanOrEqual(1.2 * idle.rim);
        for (const [state, sample] of [
          ["active", active],
          ["idle", idle],
        ] as const)
          expect(
            sample.rimContrast,
            `${label} host ${host} ${state} rim contrast`,
          ).toBeGreaterThanOrEqual(3);
      }
    }
  }
});
