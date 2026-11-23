import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { build } from "vite";

// Bundle in memory and fulfill the browser's requests locally for a secure context.
const bundle = await build({
  configFile: false,
  envFile: false,
  logLevel: "error",
  build: {
    write: false,
    minify: false,
    lib: {
      entry: fileURLToPath(
        new URL("../src/video/probe-page.ts", import.meta.url),
      ),
      formats: ["es"],
      fileName: "video-probe",
    },
  },
});
const entry = bundle[0].output.find(
  (item) => item.type === "chunk" && item.isEntry,
);
assert.ok(entry, "The video probe bundle has no entry module");

const channel = process.env.VIDEO_PROBE_CHANNEL || undefined;
const browser = await chromium.launch({ channel });
try {
  const context = await browser.newContext({ serviceWorkers: "block" });
  const origin = "https://video-probe.invalid";
  await context.route("**/*", (route) => {
    const url = route.request().url();
    if (url === `${origin}/`) {
      return route.fulfill({
        contentType: "text/html",
        body: '<!doctype html><meta charset="utf-8"><title>视频渲染测试</title>',
      });
    }
    if (url === `${origin}/probe.js`) {
      return route.fulfill({
        contentType: "text/javascript",
        body: entry.code,
      });
    }
    return route.abort();
  });
  const page = await context.newPage();
  await page.goto(origin);
  await page.evaluate(() => {
    void import("/probe.js")
      .then(({ runVideoProbe }) => runVideoProbe())
      .then(
        (result) => {
          window.videoProbeOutcome = { result };
        },
        (error) => {
          window.videoProbeOutcome = { error: error?.stack ?? String(error) };
        },
      );
  });
  const outcome = await page.waitForFunction(
    () => window.videoProbeOutcome,
    null,
    { timeout: 120_000 },
  );
  const { error, result } = await outcome.jsonValue();
  if (error) throw new Error(error);
  assert.match(result.sha256, /^[a-f0-9]{64}$/);
  assert.ok(
    ["avc1.420028", "vp09.00.40.08"].includes(result.videoCodec),
    `Unexpected video codec: ${result.videoCodec}`,
  );
  assert.equal(
    result.audioCodec,
    result.aacSupported ? "aac" : "opus",
    "The renderer did not select the preferred supported audio codec",
  );
  assert.ok(result.bytes > 0);
  assert.ok(result.decodedVideoBytes > 0, "The MP4 video track did not decode");
  assert.ok(result.decodedAudioBytes > 0, "The MP4 audio track did not decode");
  assert.ok(result.playedSeconds >= 0.25, "Playback did not advance");
  assert.ok(
    Math.abs(result.seekedSeconds - 3) <= 1 / result.fps,
    "Playback did not seek to the caption scene",
  );
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
