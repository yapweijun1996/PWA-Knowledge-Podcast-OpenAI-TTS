import { expect, type Locator, type Page } from "@playwright/test";
import {
  bundleStudio3d,
  measureStudio3d,
  studio3dContactProbes,
} from "../scripts/studio3d-bench.mjs";
import { wave } from "../server/audio.mjs";
import type { Episode } from "../shared/factory.ts";
import type { AgentArtifact } from "../src/agent/artifacts.ts";
import { createTranslator } from "../src/i18n/index.ts";
import { buildTimeline } from "../src/video/timeline.ts";
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
const secondsPerTurn = pcm.length / 48_000;
const pause = Buffer.alloc(0.23 * 48_000);
const wav = wave(turns.flatMap((_, index) => (index ? [pause, pcm] : [pcm])));
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
      turns.map(({ id }) => [
        id,
        { asset: `${id}.wav`, duration: secondsPerTurn },
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
      start: index * 2 * (secondsPerTurn + 0.23),
    })),
    transcript: { text: heard, model: "fixture", similarity: 100 },
    qa: { status: "matched", reasons: [] },
  },
};
const plan = buildTimeline(episode);
const firstTurnFrame = Math.ceil(
  plan.scenes.find(({ kind }) => kind === "turn")!.start * plan.fps,
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

async function decodedFrames(preview: Locator) {
  return preview.evaluate(
    async (video: HTMLVideoElement, { fps, frames }) => {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext("2d", { willReadFrequently: true })!;
      const results = [];
      for (const frame of frames) {
        const sought = new Promise<void>((resolve, reject) => {
          const listeners = new AbortController();
          video.addEventListener(
            "seeked",
            () => {
              listeners.abort();
              resolve();
            },
            { signal: listeners.signal },
          );
          video.addEventListener(
            "error",
            () => {
              listeners.abort();
              reject(new Error("Could not decode the requested video frame"));
            },
            { signal: listeners.signal },
          );
        });
        // Seek to the center of the frame's presentation interval.
        video.currentTime = (frame + 0.5) / fps;
        await sought;
        context.drawImage(video, 0, 0);
        const pixels = context.getImageData(
          0,
          0,
          canvas.width,
          canvas.height,
        ).data;
        const digest = await crypto.subtle.digest("SHA-256", pixels);
        const sha256 = Array.from(new Uint8Array(digest), (byte) =>
          byte.toString(16).padStart(2, "0"),
        ).join("");

        // Sample the space between the shared speaker label and captions.
        const studioPixels = context.getImageData(
          canvas.width * 0.2,
          canvas.height * 0.43,
          canvas.width * 0.6,
          canvas.height * 0.22,
        ).data;
        const colors = new Set<number>();
        for (let index = 0; index < studioPixels.length; index += 4 * 16) {
          colors.add(
            (studioPixels[index] << 16) |
              (studioPixels[index + 1] << 8) |
              studioPixels[index + 2],
          );
        }
        results.push({ sha256, colors: colors.size });
      }
      return results;
    },
    {
      fps: plan.fps,
      frames: [
        0,
        15,
        30,
        ...[0, 15, 30].map((offset) => firstTurnFrame + offset),
      ],
    },
  );
}

test("Studio 3D saves a playable preview with repeatable decoded frame hashes", async ({
  page,
}) => {
  test.setTimeout(150_000);
  await page.addInitScript(() => {
    const { prototype } = OffscreenCanvasRenderingContext2D;
    const fillText = prototype.fillText;
    const wordmarks = new Set<string>();
    Reflect.set(window, "renderedWordmarks", wordmarks);
    prototype.fillText = function (text, x, y, maxWidth?) {
      if (
        this.canvas.width === 1920 &&
        Math.abs(x - 1920 * 0.07) < 0.01 &&
        y < 120
      )
        wordmarks.add(text);
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
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      value(this: HTMLCanvasElement, kind: string, options?: unknown) {
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
    (element, { firstTurnFrame, cancelText }) => {
      const observer = new MutationObserver(() => {
        const progress = element.querySelector("progress");
        if (
          !progress ||
          progress.value <= firstTurnFrame ||
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
    { firstTurnFrame, cancelText: english("video.panel.cancel") },
  );
  await render.click();
  await expect(panel.getByText(english("video.panel.cancelled"))).toBeVisible({
    timeout: 65_000,
  });
  await expect(preview).toHaveCount(0);
  expect(await videoReceipts(page)).toEqual([]);
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
    const contactProbes = studio3dContactProbes(width, height);
    for (const palette of ["aurora", "sunset", "mono", "ocean"]) {
      const label = `${palette} at ${width}×${height}`;
      // The harness draws only the scene, so the speaker chips are absent.
      // The synthetic turn plan has stable A and B samples at 1s and 2s.
      const result = await page.evaluate(measureStudio3d, {
        bundle,
        width,
        height,
        frameOrder: [30, 60],
        visualPalette: palette,
        contactProbes,
      });
      expect(result.status, label).toBe("PASS");
      const aSpeaking = result.visuals[30];
      const bSpeaking = result.visuals[60];
      for (const frame of [aSpeaking, bSpeaking]) {
        expect(frame.horizontalStep, `${label} horizontal luma step`).toBeLessThanOrEqual(
          2 / 255 + 1e-9,
        );
        expect(frame.verticalStep, `${label} vertical luma step`).toBeLessThanOrEqual(
          2 / 255 + 1e-9,
        );
        expect(
          Math.abs(frame.betweenOrbs - frame.frameEdge) / frame.frameEdge,
          `${label} inter-orb luminance versus frame edge`,
        ).toBeLessThanOrEqual(0.15);
        for (const step of frame.washSteps) {
          expect(step, `${label} portrait wash luma lift`).toBeGreaterThan(1 / 255);
          expect(step, `${label} portrait wash luma lift`).toBeLessThanOrEqual(0.06 + 1 / 255);
        }
      }
      for (const [host, active, idle] of [
        ["A", aSpeaking.hosts[0], bSpeaking.hosts[0]],
        ["B", bSpeaking.hosts[1], aSpeaking.hosts[1]],
      ]) {
        expect(
          active.disc - idle.disc,
          `${label} host ${host} orb disc luminance gain`,
        ).toBeGreaterThanOrEqual(0.08 * idle.disc);
        if (width > height) {
          expect(
            active.thumbnailDisc - idle.thumbnailDisc,
            `${palette} host ${host} orb disc luminance gain at 160×90`,
          ).toBeGreaterThanOrEqual(0.08 * idle.thumbnailDisc);
        }
        expect(active.body - idle.body, `${label} host ${host} body emphasis`).toBeGreaterThan(
          0.012,
        );
        expect(active.rim, `${label} host ${host} rim emphasis`).toBeGreaterThanOrEqual(
          1.2 * idle.rim,
        );
        expect(
          active.groundRing - idle.groundRing,
          `${label} host ${host} ground ring luminance gain`,
        ).toBeGreaterThanOrEqual(0.012);
        for (const [probe, activeProfile] of active.groundRingProfiles.entries()) {
          const edge = `${label} host ${host} ring inner edge at probe ${probe + 1}`;
          const gain = activeProfile.map(
            (value: number, row: number) =>
              value - idle.groundRingProfiles[probe][row],
          );
          const peak = Math.max(...gain);
          expect(peak, edge).toBeGreaterThanOrEqual(0.012);
          const high = gain.findIndex((value: number) => value >= 0.9 * peak);
          const low = gain.slice(0, high).findLastIndex(
            (value: number) => value <= 0.1 * peak,
          );
          expect(low, edge).toBeGreaterThanOrEqual(0);
          expect(
            high - low,
            `${edge}, 10% to 90% rise in pixels`,
          ).toBeLessThanOrEqual(3);
        }
        for (const [state, sample] of [
          ["active", active],
          ["idle", idle],
        ] as const) {
          expect(
            sample.rimContrast,
            `${label} host ${host} ${state} rim contrast`,
          ).toBeGreaterThanOrEqual(3);
          expect(
            sample.pedestalStep,
            `${label} host ${host} ${state} pedestal-to-floor luminance step`,
          ).toBeGreaterThanOrEqual(12 / 255);
        }
      }
    }

    const reduced = await page.evaluate(measureStudio3d, {
      bundle,
      width,
      height,
      frameOrder: [120, 60, 30],
      visualPalette: "aurora",
      contactProbes,
      reducedMotion: true,
    });
    expect(reduced.status).toBe("PASS");
    expect(reduced.hashes[120]).toBe(reduced.hashes[30]);
    expect(reduced.hashes[60]).not.toBe(reduced.hashes[30]);
    expect(
      reduced.visuals[30].hosts[0].groundRing -
        reduced.visuals[60].hosts[0].groundRing,
    ).toBeGreaterThanOrEqual(0.012);
  }
});
