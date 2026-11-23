import { resolve } from "node:path";
import { buffer } from "node:stream/consumers";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { build } from "vite";
import { wave } from "../server/audio.mjs";
import type { Episode } from "../shared/factory.ts";
import type { AgentArtifact } from "../src/agent/artifacts.ts";
import { createTranslator } from "../src/i18n/index.ts";
import { videoLayout } from "../src/video/design/layout.ts";
import {
  dialogue,
  heard,
  intended,
  pcmFixture,
} from "./fixtures/podcast-provider.mjs";

test.use({ serviceWorkers: "block" });

const episodeId = "10000000-0000-4000-8000-000000000036";
const language = "zh";
const english = createTranslator("en");
const chinese = createTranslator("zh-CN");

async function openFinishedEpisode(
  page: Page,
  context: BrowserContext,
  baseURL: string,
) {
  const unexpected: string[] = [];
  const origin = new URL(baseURL).origin;
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (
      url.protocol === "blob:" ||
      (url.origin === origin && request.method() === "GET")
    ) {
      await route.continue();
    } else {
      unexpected.push(`${request.method()} ${url.origin}${url.pathname}`);
      await route.abort();
    }
  });

  await page.addInitScript(() =>
    localStorage.setItem("podcast-ui-locale", "en"),
  );
  await page.goto("/");
  await expect(
    page.getByText(english("library.empty.noEpisodes")),
  ).toBeVisible();
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
  const wav = wave(
    turns.flatMap((_, index) => (index === 0 ? [pcm] : [pause, pcm])),
  );
  const duration = (wav.length - 44) / 48_000;
  const asset = "finished-video-fixture.wav";
  const episode: Episode = {
    id: episodeId,
    topic: "Short fixture episode",
    revision: 1,
    language,
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

  await page.evaluate(
    async ({ episode, wav, asset }) => {
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
              [asset]: new Blob([Uint8Array.from(wav)], { type: "audio/wav" }),
            },
            stamp: crypto.randomUUID(),
          });
        });
      } finally {
        db.close();
      }
    },
    { episode, wav: [...wav], asset },
  );
  await page.goto(`/?view=studio&episode=${episodeId}`);
  const panel = page.getByRole("region", {
    name: english("episode.video.title"),
  });
  const render = panel.getByRole("button", {
    name: english("video.panel.render"),
  });
  await expect(render).toBeEnabled({ timeout: 15_000 });
  return {
    panel,
    render,
    duration,
    episode,
    wav: [...wav],
    unexpected,
  };
}

function zipFiles(zip: Buffer) {
  const files = new Map<string, Buffer>();
  for (let offset = 0; zip.readUInt32LE(offset) === 0x04034b50;) {
    const start = offset + 30;
    const nameEnd = start + zip.readUInt16LE(offset + 26);
    const contentStart = nameEnd + zip.readUInt16LE(offset + 28);
    const end = contentStart + zip.readUInt32LE(offset + 18);
    files.set(
      zip.toString("utf8", start, nameEnd),
      zip.subarray(contentStart, end),
    );
    offset = end;
  }
  return files;
}

test("Studio renders a finished episode, persists approval and exports the reviewed publish ZIP", async ({
  page,
  context,
  baseURL,
}) => {
  test.setTimeout(90_000);
  const { panel, render, duration, unexpected } = await openFinishedEpisode(
    page,
    context,
    baseURL!,
  );
  await panel.getByLabel(english("video.panel.theme")).selectOption("light");
  const scene = panel.getByRole("combobox", {
    name: english("video.panel.scene"),
  });
  await expect(scene.locator("option")).toHaveText([
    english("video.scene.waveform"),
    english("video.scene.studio3d"),
  ]);
  await scene.selectOption("waveform");
  await expect(panel.getByLabel(english("video.studio3d.palette"))).toHaveCount(
    0,
  );
  const worker = page.waitForEvent("worker", {
    predicate: (value) => value.url().includes("render-worker-"),
  });
  await render.click();
  expect((await worker).url()).toContain("/assets/");
  const preview = panel.locator("video");
  await expect(preview).toHaveAttribute("src", /^blob:/, { timeout: 45_000 });
  await expect
    .poll(() => preview.evaluate((video: HTMLVideoElement) => video.duration))
    .toBeCloseTo(duration, 1);
  await expect
    .poll(() =>
      preview.evaluate((video: HTMLVideoElement) => [
        video.videoWidth,
        video.videoHeight,
      ]),
    )
    .toEqual([1920, 1080]);
  const mp4Bytes = await preview.evaluate(
    async (video: HTMLVideoElement) =>
      (await (await fetch(video.currentSrc)).blob()).size,
  );
  expect(mp4Bytes).toBeGreaterThan(0);
  // Allow 10% for rate-control variation and 64 KiB for short-file mux overhead.
  const targetBytes = (duration * (2_400_000 + 64_000)) / 8;
  expect(mp4Bytes).toBeLessThan(targetBytes * 1.1 + 64 * 1024);
  await expect(
    panel.getByText(/Video avc1\..*Audio Opus.*SHA-256 [0-9a-f]{12}/u),
  ).toBeVisible();
  await expect(panel.locator("code")).toHaveText(
    english("video.panel.ffmpegCommand"),
  );
  await expect(
    panel.getByRole("button", { name: english("video.panel.copyCommand") }),
  ).toBeEnabled();
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: new URL(baseURL!).origin,
  });
  await panel
    .getByRole("button", { name: english("video.panel.copyCommand") })
    .click();
  await expect(panel.getByText(english("video.panel.copied"))).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    english("video.panel.ffmpegCommand"),
  );

  const [mp4] = await Promise.all([
    page.waitForEvent("download"),
    panel
      .getByRole("button", {
        name: english("video.panel.download"),
        exact: true,
      })
      .click(),
  ]);
  expect(mp4.suggestedFilename()).toBe("video.mp4");
  expect((await buffer(await mp4.createReadStream())).length).toBe(mp4Bytes);

  const packageButton = panel.getByRole("button", {
    name: english("publish.review.downloadPackage"),
  });
  const approve = panel.getByRole("button", {
    name: english("publish.review.approve"),
    exact: true,
  });
  const reject = panel.getByRole("button", {
    name: english("publish.review.reject"),
    exact: true,
  });
  await expect(packageButton).toBeDisabled();
  await approve.focus();
  await approve.press("Enter");
  await expect(packageButton).toBeEnabled();
  await reject.click();
  await expect(
    panel.getByText(english("publish.review.rejected")),
  ).toBeVisible();
  await expect(packageButton).toBeDisabled();
  await approve.click();
  await expect(packageButton).toBeEnabled();

  const title = panel.getByLabel(english("publish.review.title"));
  await title.fill("Reviewed fixture title");
  await expect(packageButton).toBeDisabled();
  await panel
    .getByLabel(english("publish.review.summary"))
    .fill("Reviewed fixture summary.");
  await panel.getByLabel(english("publish.review.tags")).fill("fixture, tests");
  await panel
    .getByLabel(english("publish.review.chapterTitle", { time: "0:00" }))
    .fill("Reviewed opening");
  await approve.click();
  await expect(packageButton).toBeEnabled();

  await page.reload();
  await expect(preview).toHaveAttribute("src", /^blob:/);
  await expect(scene).toHaveValue("waveform");
  const sceneReceipt = await page.evaluate(async () => {
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
      const receipt = records.find(({ kind }) => kind === "video")?.metadata
        ?.studioVideo;
      return { sceneId: receipt?.sceneId, chapters: receipt?.chapterScenes };
    } finally {
      db.close();
    }
  });
  expect(sceneReceipt).toEqual({
    sceneId: "waveform",
    chapters: dialogue.map(({ chapterId }) => ({
      chapterId,
      sceneId: "waveform",
    })),
  });
  await expect(panel.getByLabel(english("video.panel.theme"))).toHaveValue(
    "light",
  );
  await expect(title).toHaveValue("Reviewed fixture title");
  await expect(packageButton).toBeEnabled();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    packageButton.click(),
  ]);
  expect(download.suggestedFilename()).toBe("publish-package.zip");
  const files = zipFiles(await buffer(await download.createReadStream()));
  expect([...files.keys()].sort()).toEqual([
    "captions.srt",
    "chapters.txt",
    "checklist.md",
    "description.txt",
    "tags.txt",
    "thumbnail.png",
    "title.txt",
    "video.mp4",
  ]);
  expect(files.get("video.mp4")!.length).toBe(mp4Bytes);
  expect(files.get("captions.srt")?.toString()).toMatch(
    /^1\r?\n00:00:00,000 --> 00:00:\d{2},\d{3}\r?\n/u,
  );
  expect(files.get("thumbnail.png")!.subarray(0, 8)).toEqual(
    Buffer.from("89504e470d0a1a0a", "hex"),
  );
  expect(files.get("title.txt")!.toString()).toBe("Reviewed fixture title");
  expect(files.get("description.txt")!.toString()).toContain(
    "Reviewed fixture summary.",
  );
  expect(files.get("description.txt")!.toString()).toContain(
    chinese("publish.description.aiNotice"),
  );
  expect(files.get("checklist.md")!.toString()).toContain(
    english("publish.checklist.heading"),
  );
  expect(files.get("tags.txt")!.toString()).toBe("fixture, tests");
  expect(files.get("chapters.txt")!.toString()).toMatch(
    /^0:00 Reviewed opening\n0:01 /u,
  );

  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 850 });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    expect(
      await panel.evaluate(
        (element) => element.scrollWidth - element.clientWidth,
      ),
    ).toBeLessThanOrEqual(1);
  }
  await page
    .getByRole("button", { name: english("episode.script.edit") })
    .click();
  await page
    .getByLabel(english("episode.script.episodeTitle"))
    .fill("Revised script title");
  await page
    .getByRole("button", { name: english("episode.script.save"), exact: true })
    .click();
  await expect(panel.getByText(english("episode.video.stale"))).toBeVisible();
  await expect(preview).toHaveCount(0);
  await expect(packageButton).toHaveCount(0);
  expect(unexpected).toEqual([]);
});

test("renders portrait locally on the same duration clock as the assembled WAV", async ({
  page,
  context,
  baseURL,
}) => {
  test.setTimeout(90_000);
  const { duration, episode, wav, unexpected } = await openFinishedEpisode(
    page,
    context,
    baseURL!,
  );
  // The fixture server serves the built app. Bundle the same entry points
  // in memory so the portrait case can call them without a test-only app API.
  const modules = await build({
    configFile: false,
    logLevel: "error",
    // Library mode leaves dependency process.env references (React) untouched.
    define: { "process.env.NODE_ENV": '"production"', "process.env": "{}" },
    build: {
      write: false,
      lib: {
        entry: {
          timeline: resolve("src/video/timeline.ts"),
          render: resolve("src/video/render.ts"),
        },
        formats: ["es"],
        fileName: (_, name) => `${name}.js`,
      },
    },
  });
  const chunks = new Map(
    (Array.isArray(modules) ? modules : [modules]).flatMap((module) =>
      "output" in module
        ? module.output.flatMap((item) =>
            item.type === "chunk" ? [[item.fileName, item.code] as const] : [],
          )
        : [],
    ),
  );
  expect(chunks.has("timeline.js") && chunks.has("render.js")).toBe(true);
  await page.route("**/__video-test/**", async (route) => {
    const name = new URL(route.request().url()).pathname.slice(
      "/__video-test/".length,
    );
    const code = chunks.get(name);
    await route.fulfill(
      code === undefined
        ? { status: 404 }
        : { contentType: "text/javascript", body: code },
    );
  });
  const { title, caption } = videoLayout(1080, 1920, "portrait");
  const result = await page.evaluate(
    async ({ episode, wav, timelineModule, renderModule, title, caption }) => {
      const { buildTimeline } = await import(timelineModule);
      const { renderVideo } = await import(renderModule);
      const audioContext = new OfflineAudioContext(1, 1, 24_000);
      const audio = await audioContext.decodeAudioData(
        Uint8Array.from(wav).buffer,
      );
      const plan = buildTimeline(episode, {
        resolution: { width: 1080, height: 1920 },
      });
      const receipt = await renderVideo({
        plan,
        audio,
        theme: "light",
        sceneId: "waveform",
      });
      const video = document.createElement("video");
      const url = URL.createObjectURL(receipt.blob);
      try {
        await new Promise<void>((resolve, reject) => {
          video.onloadedmetadata = () => resolve();
          video.onerror = () =>
            reject(new Error("Could not read rendered video metadata"));
          video.preload = "auto";
          video.src = url;
        });
        if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
          await new Promise<void>((resolve, reject) => {
            video.onloadeddata = () => resolve();
            video.onerror = () => reject(new Error("Could not decode frame 0"));
          });
        }
        const frame = document.createElement("canvas");
        frame.width = video.videoWidth;
        frame.height = video.videoHeight;
        const pixels = frame.getContext("2d")!;
        pixels.drawImage(video, 0, 0);
        function sample(box: typeof title) {
          const { data } = pixels.getImageData(
            Math.ceil(box.x),
            Math.ceil(box.y),
            Math.floor(box.width) - 1,
            Math.floor(box.height) - 1,
          );
          let ink = 0;
          let plate = 0;
          for (let offset = 0; offset < data.length; offset += 4) {
            const red = data[offset];
            const green = data[offset + 1];
            const blue = data[offset + 2];
            // Allow codec rounding around the light palette's ink and plate.
            if (red < 70 && green < 80 && blue < 100) ink++;
            if (red > 244 && green > 245 && blue > 251) plate++;
          }
          return { ink, plate };
        }
        return {
          width: video.videoWidth,
          height: video.videoHeight,
          duration: video.duration,
          orientation: receipt.orientation,
          frameTime: video.currentTime,
          titleInk: sample(title).ink,
          captionPixels: sample(caption),
        };
      } finally {
        video.removeAttribute("src");
        URL.revokeObjectURL(url);
      }
    },
    {
      episode,
      wav,
      timelineModule: "/__video-test/timeline.js",
      renderModule: "/__video-test/render.js",
      title,
      caption,
    },
  );
  expect([result.width, result.height, result.orientation]).toEqual([
    1080,
    1920,
    "portrait",
  ]);
  expect(result.duration).toBeCloseTo(duration, 1);
  expect(result.frameTime).toBe(0);
  expect(result.titleInk).toBeGreaterThan(200);
  expect(result.captionPixels.ink).toBeGreaterThan(200);
  expect(result.captionPixels.plate).toBeGreaterThan(10_000);
  expect(unexpected).toEqual([]);
});

test("a rejected video write preserves the last approved export", async ({
  page,
  context,
  baseURL,
}) => {
  test.setTimeout(120_000);
  const { panel, render, unexpected } = await openFinishedEpisode(
    page,
    context,
    baseURL!,
  );
  await render.click();
  const preview = panel.locator("video");
  await expect(preview).toHaveAttribute("src", /^blob:/, { timeout: 45_000 });
  const approve = panel.getByRole("button", {
    name: english("publish.review.approve"),
    exact: true,
  });
  const download = panel.getByRole("button", {
    name: english("publish.review.downloadPackage"),
  });
  await approve.click();
  await expect(download).toBeEnabled();
  const title = panel.getByLabel(english("publish.review.title"));
  const originalTitle = await title.inputValue();
  const palette = panel.getByLabel(english("video.panel.theme"));
  const originalPalette = await palette.inputValue();
  await palette.selectOption(originalPalette === "sunset" ? "aurora" : "sunset");
  await expect(download).toBeHidden();
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, key) {
      if (this.name === "artifacts" && value?.kind === "video") {
        const request = key === undefined ? put.call(this, value) : put.call(this, value, key);
        // Roll back the pending transaction as the browser would on quota failure.
        queueMicrotask(() => this.transaction.abort());
        return request;
      }
      return key === undefined ? put.call(this, value) : put.call(this, value, key);
    };
  });

  await render.click();
  await expect(
    panel.getByText(english("video.panel.saveFailed")),
  ).toBeVisible({ timeout: 45_000 });
  await expect(download).toBeHidden();

  await page.reload();
  await expect(preview).toHaveAttribute("src", /^blob:/);
  await expect(title).toHaveValue(originalTitle);
  await expect(palette).toHaveValue(originalPalette);
  await expect(download).toBeEnabled();
  expect(unexpected).toEqual([]);
});

test("cancelling a real render after frames are submitted leaves no saved video", async ({
  page,
  context,
  baseURL,
}) => {
  const { panel, render, unexpected } = await openFinishedEpisode(
    page,
    context,
    baseURL!,
  );
  await panel.evaluate((element, cancelLabel) => {
    // Click the real cancel control as soon as a measured frame is presented.
    const observer = new MutationObserver(() => {
      const progress = element.querySelector("progress");
      if (!progress || progress.value <= 0 || progress.value >= progress.max)
        return;
      const cancel = [...element.querySelectorAll("button")].find(
        (button) => button.textContent === cancelLabel,
      );
      if (!cancel || cancel.disabled) return;
      observer.disconnect();
      (element as HTMLElement).dataset.cancelledAt = String(progress.value);
      cancel.click();
    });
    observer.observe(element, {
      childList: true,
      attributes: true,
      subtree: true,
    });
  }, english("video.panel.cancel"));
  await render.click();
  await expect(panel).toHaveAttribute("data-cancelled-at", /^[1-9]\d*$/u);
  await expect(panel.getByText(english("video.panel.cancelled"))).toBeVisible();
  await expect(panel.locator("video")).toHaveCount(0);
  expect(
    await page.evaluate(
      () =>
        new Promise<number>((resolve, reject) => {
          const request = indexedDB.open("knowledge-podcast-agent", 1);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const db = request.result;
            const count = db
              .transaction("artifacts")
              .objectStore("artifacts")
              .count();
            count.onsuccess = () => {
              db.close();
              resolve(count.result);
            };
            count.onerror = () => {
              db.close();
              reject(count.error);
            };
          };
        }),
    ),
  ).toBe(0);
  await page.reload();
  await expect(render).toBeEnabled();
  await expect(panel.locator("video")).toHaveCount(0);
  expect(unexpected).toEqual([]);
});
