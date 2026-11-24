import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { createFile, MP4BoxBuffer } from "mp4box";
import { build } from "vite";
import type { renderEpisodeVideo } from "../src/video/render-client.ts";

test.use({ serviceWorkers: "block" });

test("renders to OPFS, reopens the MP4 and plays it in Chromium", async ({
  page,
  context,
  baseURL,
}) => {
  test.setTimeout(90_000);
  const prefix = "/__opfs-video-test/";
  const origin = new URL(baseURL!).origin;
  // Serve the app's real render client and worker from an in-memory build.
  const modules = await build({
    configFile: false,
    base: prefix,
    logLevel: "error",
    define: { "process.env.NODE_ENV": '"production"', "process.env": "{}" },
    worker: { format: "es" },
    build: {
      write: false,
      lib: {
        entry: { render: resolve("src/video/render-client.ts") },
        formats: ["es"],
        fileName: (_, name) => `${name}.js`,
      },
    },
  });
  const files = new Map<string, string | Buffer>();
  for (const module of Array.isArray(modules) ? modules : [modules]) {
    if (!("output" in module)) continue;
    for (const file of module.output) {
      const source = file.type === "chunk" ? file.code : file.source;
      files.set(
        file.fileName,
        typeof source === "string" ? source : Buffer.from(source),
      );
    }
  }
  expect(files.has("render.js")).toBe(true);
  const unexpected: string[] = [];
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.protocol === "blob:") return route.continue();
    if (
      url.origin === origin &&
      url.pathname.startsWith(prefix) &&
      request.method() === "GET"
    ) {
      const name = url.pathname.slice(prefix.length);
      if (name === "index.html") {
        return route.fulfill({
          contentType: "text/html",
          body: '<!doctype html><link rel="icon" href="data:,">',
        });
      }
      const body = files.get(name);
      if (body !== undefined) {
        return route.fulfill({
          contentType: name.endsWith(".js")
            ? "text/javascript"
            : "application/octet-stream",
          body,
        });
      }
    }
    unexpected.push(`${request.method()} ${url.origin}${url.pathname}`);
    await route.abort();
  });
  for (const fontFile of [
    "noto-sans-sc-core-v1.woff2",
    "noto-sans-latin-v1.woff2",
  ]) {
    await page.route(`${origin}${prefix}fonts/${fontFile}`, (route) => {
      if (route.request().method() !== "GET") return route.fallback();
      return route.fulfill({
        contentType: "font/woff2",
        path: resolve("public/fonts", fontFile),
      });
    });
  }
  await page.goto(`${prefix}index.html`);

  const result = await page.evaluate(async (moduleUrl) => {
    const client: { renderEpisodeVideo: typeof renderEpisodeVideo } =
      await import(moduleUrl);
    const directory = await navigator.storage.getDirectory();
    const duration = 1.25;
    const sampleRate = 24_000;
    const samples = Float32Array.from(
      { length: duration * sampleRate },
      (_, index) => 0.1 * Math.sin((index * 2 * Math.PI * 330) / sampleRate),
    );
    const receipt = await client.renderEpisodeVideo({
      sink: "opfs",
      locale: "en",
      sceneId: "waveform",
      theme: "dark",
      audio: { sampleRate, channels: [samples] },
      plan: {
        duration,
        fps: 12,
        resolution: { width: 320, height: 180 },
        estimated: false,
        allowVp9: true,
        chapters: [],
        scenes: [
          {
            kind: "turn",
            chapterId: "fixture",
            turnId: "fixture",
            speakerId: "A",
            start: 0,
            end: duration,
            audioStart: 0,
            captions: [{ start: 0, end: duration, lines: ["Fixture audio"] }],
          },
        ],
      },
    });
    if (!receipt.opfsFileName)
      throw new Error("The render returned no OPFS file name");
    try {
      const handle = await directory.getFileHandle(receipt.opfsFileName);
      const file = await handle.getFile();
      const bytes = await file.arrayBuffer();
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      const sha256 = Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");

      const video = document.createElement("video");
      const url = URL.createObjectURL(file.slice(0, file.size, "video/mp4"));
      video.muted = true;
      video.playsInline = true;
      video.preload = "auto";
      document.body.append(video);
      const listeners = new AbortController();
      const options = { signal: listeners.signal };
      try {
        const advanced = new Promise<void>((resolve, reject) => {
          video.addEventListener(
            "timeupdate",
            () => {
              if (video.currentTime >= 0.1) resolve();
            },
            options,
          );
          video.addEventListener(
            "error",
            () => {
              reject(
                new Error(
                  video.error?.message || "The reopened MP4 could not play",
                ),
              );
            },
            options,
          );
        });
        video.src = url;
        await Promise.all([advanced, video.play()]);
        return {
          bytes: Array.from(new Uint8Array(bytes)),
          receiptSha256: receipt.sha256,
          sha256,
          receiptSize: receipt.blob.size,
          width: video.videoWidth,
          height: video.videoHeight,
          duration: video.duration,
          playedTo: video.currentTime,
        };
      } finally {
        listeners.abort();
        video.pause();
        video.removeAttribute("src");
        video.load();
        video.remove();
        URL.revokeObjectURL(url);
      }
    } finally {
      await directory.removeEntry(receipt.opfsFileName);
    }
  }, `${prefix}render.js`);

  const mp4 = createFile(false);
  mp4.onError = (_module, message) => {
    throw new Error(message);
  };
  mp4.appendBuffer(
    MP4BoxBuffer.fromArrayBuffer(Uint8Array.from(result.bytes).buffer, 0),
    true,
  );
  const info = mp4.getInfo();
  expect(info.videoTracks).toHaveLength(1);
  expect(info.videoTracks[0].video).toMatchObject({ width: 320, height: 180 });
  expect(mp4.getTrackSamplesInfo(info.videoTracks[0].id)).toHaveLength(15);
  expect(info.audioTracks).toHaveLength(1);
  expect(info.audioTracks[0].audio?.channel_count).toBe(1);
  expect(result.bytes.length).toBe(result.receiptSize);
  expect(result.sha256).toBe(result.receiptSha256);
  expect([result.width, result.height]).toEqual([320, 180]);
  expect(result.duration).toBeCloseTo(1.25, 1);
  expect(result.playedTo).toBeGreaterThanOrEqual(0.1);
  expect(unexpected).toEqual([]);
});
