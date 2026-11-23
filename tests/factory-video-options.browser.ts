import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { wave } from "../server/audio.mjs";
import type { Episode } from "../shared/factory.ts";
import type { AgentArtifact } from "../src/agent/artifacts.ts";
import { createTranslator } from "../src/i18n/index.ts";
import { encodeCaptionTrack } from "../src/video/caption-track.ts";

test.use({ serviceWorkers: "block" });

const english = createTranslator("en");
const title = "Neighborhood ties";
const asset = "video-options-fixture.wav";
const id = "10000000-0000-4000-8000-000000000062";
const duration = 1.5;
const text =
  "A common meeting place can help neighbors get to know one another.";
const episode: Episode = {
  id,
  topic: title,
  revision: 1,
  language: "en",
  updated: "2026-11-23T00:00:00.000Z",
  voices: { A: "marin", B: "cedar" },
  outline: {
    model: "fixture",
    chapters: [{ id: "intro", title, angle: text, claimIds: [] }],
  },
  script: {
    model: "fixture",
    title,
    turns: [{ id: "turn", chapterId: "intro", host: "A", text, claimIds: [] }],
  },
  render: {
    revision: 1,
    model: "fixture",
    clips: { turn: { asset: "turn.wav", duration } },
  },
  finished: {
    revision: 1,
    asset,
    duration,
    model: "fixture",
    intendedText: text,
    chapters: [{ title, start: 0 }],
    qa: { status: "matched", reasons: [] },
    transcript: { text, similarity: 100, model: "fixture" },
  },
};

test("Studio renders portrait options, restores its receipt, shows guides and gates the publish package", async ({
  page,
  context,
  baseURL,
}) => {
  test.setTimeout(120_000);
  const origin = new URL(baseURL!).origin;
  const unexpectedRequests: string[] = [];
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (
      url.protocol === "blob:" ||
      (url.origin === origin && request.method() === "GET")
    ) {
      await route.continue();
    } else {
      unexpectedRequests.push(
        `${request.method()} ${url.origin}${url.pathname}`,
      );
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
  await page.evaluate(
    async ({ episode, asset, wav }) => {
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
            stamp: "video-options-fixture",
          });
        });
      } finally {
        db.close();
      }
    },
    { episode, asset, wav: [...wave([Buffer.alloc(duration * 48_000)])] },
  );
  await page.goto(`/?view=studio&episode=${id}`);

  const panel = page.getByRole("region", {
    name: english("episode.video.title"),
  });
  const render = panel.getByRole("button", {
    name: english("video.panel.render"),
  });
  const orientation = panel.getByLabel(
    english("video.panel.options.orientation"),
  );
  const palette = panel.getByLabel(english("video.panel.theme"));
  const mood = panel.getByLabel(english("video.panel.options.mood"));
  const motion = panel.getByLabel(english("video.panel.options.reducedMotion"));
  const variant = panel.getByLabel(english("publish.review.thumbnailVariant"));
  const headline = panel.getByLabel(
    english("publish.review.thumbnailHeadline"),
    { exact: true },
  );
  const image = panel.getByRole("img", {
    name: english("publish.review.thumbnailPreview"),
  });
  const video = panel.locator("video");
  const approve = panel.getByRole("button", {
    name: english("publish.review.approve"),
    exact: true,
  });
  const exportPackage = panel.getByRole("button", {
    name: english("publish.review.downloadPackage"),
  });
  await expect(render).toBeEnabled({ timeout: 15_000 });
  await expect(panel.getByLabel(english("video.panel.scene"))).toHaveValue(
    "waveform",
  );
  await expect(orientation).toHaveValue("landscape");
  await expect(palette).toHaveValue("aurora");
  await expect(mood).toHaveValue("calm");
  await expect(motion).not.toBeChecked();
  await expect(variant).toHaveValue("host-pair");
  await expect(headline).toHaveValue("");

  const thumbnailPixel = () =>
    image.evaluate((canvas: HTMLCanvasElement) => [
      canvas.width,
      canvas.height,
      ...canvas.getContext("2d")!.getImageData(0, 0, 1, 1).data,
    ]);
  await expect
    .poll(async () => {
      const [width, height, red, green, blue, alpha] = await thumbnailPixel();
      return (
        width === 1280 &&
        height === 720 &&
        alpha === 255 &&
        red + green + blue > 0
      );
    })
    .toBe(true);
  const originalPixel = await thumbnailPixel();
  await orientation.selectOption("portrait");
  await palette.selectOption("ocean");
  await mood.selectOption("urgent");
  await motion.check();
  await variant.selectOption("headline");
  await headline.fill(title);
  await expect(headline).toHaveAttribute("aria-invalid", "false");
  await expect
    .poll(async () => {
      const pixel = await thumbnailPixel();
      return (
        pixel.slice(2, 5).some((channel) => channel > 0) &&
        pixel.some((value, index) => value !== originalPixel[index])
      );
    })
    .toBe(true);
  await render.click();
  await expect(video).toHaveAttribute("src", /^blob:/, { timeout: 45_000 });
  await expect
    .poll(() =>
      video.evaluate((element: HTMLVideoElement) => [
        element.videoWidth,
        element.videoHeight,
      ]),
    )
    .toEqual([1080, 1920]);

  const receipt = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("knowledge-podcast-agent", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<AgentArtifact["metadata"]>((resolve, reject) => {
        const request = db
          .transaction("artifacts")
          .objectStore("artifacts")
          .getAll();
        request.onsuccess = () =>
          resolve(
            request.result.find((item) => item.kind === "video")?.metadata,
          );
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  });
  expect(receipt?.studioVideo).toMatchObject({
    width: 1080,
    height: 1920,
    paletteId: "ocean",
    orientation: "portrait",
    options: {
      orientation: "portrait",
      paletteId: "ocean",
      mood: "urgent",
      reducedMotion: true,
      thumbnailVariant: "headline",
      thumbnailHeadline: title,
    },
  });

  expect(receipt?.captionTrack?.videoSha256).toBe(receipt?.studioVideo?.sha256);
  const track = receipt?.captionTrack;
  expect(track?.cues.length).toBeGreaterThan(0);
  expect(track!.cues[0].startMs).toBe(0);
  expect(
    track!.cues.every(
      ({ speaker, endMs }) => speaker === "Host A" && endMs <= duration * 1000,
    ),
  ).toBe(true);
  const previewCaptions = panel.getByLabel(
    english("publish.review.previewCaptions"),
  );
  await previewCaptions.check();
  await expect
    .poll(() =>
      video.evaluate((element: HTMLVideoElement) =>
        Array.from(element.textTracks[0]?.cues ?? []).map((cue) => [
          cue.id,
          Math.round(cue.startTime * 1000),
          Math.round(cue.endTime * 1000),
          (cue as VTTCue).text,
        ]),
      ),
    )
    .toEqual(
      track!.cues.map(({ startMs, endMs, speaker, lines }, index) => [
        String(index + 1),
        startMs,
        endMs,
        `${speaker}: ${lines.join("\n")}`,
      ]),
    );
  await previewCaptions.uncheck();
  await expect(video.locator("track")).toHaveCount(0);

  const guides = panel.getByLabel(english("video.panel.options.guides"));
  const guideLayer = panel.locator(".video-preview-guides");
  await expect(guideLayer).toHaveCount(0);
  await guides.check();
  await expect(guideLayer.locator(".video-preview-safe")).toBeVisible();
  await expect(guideLayer.locator(".video-preview-mask-rail")).toBeVisible();
  await expect(guideLayer.locator(".video-preview-mask-bottom")).toBeVisible();
  await guides.uncheck();
  await expect(guideLayer).toHaveCount(0);
  await expect(video).toBeVisible();
  await approve.click();
  await expect(exportPackage).toBeEnabled();
  const zipped = page.waitForEvent("download");
  await exportPackage.click();
  const buffer = await readFile((await (await zipped).path())!);
  expect(buffer.includes(Buffer.from("captions.srt"))).toBe(true);
  expect(buffer.includes(Buffer.from(encodeCaptionTrack(track!, "srt")))).toBe(
    true,
  );
  await page.reload();
  await expect(video).toBeVisible();
  await expect(orientation).toHaveValue("portrait");
  await expect(palette).toHaveValue("ocean");
  await expect(mood).toHaveValue("urgent");
  await expect(motion).toBeChecked();
  await expect(variant).toHaveValue("headline");
  await expect(headline).toHaveValue(title);
  await expect(exportPackage).toBeEnabled();

  const storyboard = panel.locator(".storyboard");
  await storyboard.locator("summary").click();
  await storyboard
    .getByRole("button", { name: english("video.storyboard.create") })
    .click();
  const chapter = storyboard.getByRole("group", { name: title });
  await chapter
    .getByLabel(english("video.studio3d.palette"))
    .selectOption("sunset");
  await chapter
    .getByRole("button", { name: english("video.storyboard.addCallout") })
    .click();
  const callout = chapter.getByLabel(english("video.storyboard.callout"));
  await callout.fill("https://example.com");
  const saveDraft = storyboard.getByRole("button", {
    name: english("video.storyboard.save"),
  });
  await saveDraft.click();
  await expect(storyboard.getByRole("status")).toHaveText(
    english("video.storyboard.invalid"),
  );
  await callout.fill("A meeting place");
  await saveDraft.click();
  await expect(storyboard.getByRole("status")).toHaveText(
    english("video.storyboard.saved"),
  );
  await expect(exportPackage).toBeEnabled();
  await storyboard
    .getByRole("button", { name: english("video.storyboard.apply") })
    .click();
  await expect(
    panel.getByText(english("video.storyboard.stale")),
  ).toBeVisible();
  await expect(exportPackage).toHaveCount(0);
  await render.click();
  await expect(video).toBeVisible({ timeout: 45_000 });
  await expect(exportPackage).toBeDisabled();
  await page.reload();
  await expect(video).toBeVisible();
  await storyboard.locator("summary").click();
  await expect(
    storyboard.getByText(english("video.storyboard.active")),
  ).toBeVisible();
  await expect(
    chapter.getByLabel(english("video.studio3d.palette")),
  ).toHaveValue("sunset");
  await expect(callout).toHaveValue("A meeting place");
  await storyboard.locator("summary").click();

  await headline.fill(
    "A headline much longer than the thumbnail layout can fit",
  );
  const error = panel.getByText(
    english("publish.thumbnail.needsShorterHeadline"),
  );
  await expect(error).toBeVisible();
  await expect(headline).toHaveAttribute("aria-invalid", "true");
  await expect(
    panel.getByText(english("video.panel.options.stale")),
  ).toBeVisible();
  await expect(video).toHaveCount(0);
  await expect(exportPackage).toHaveCount(0);
  await render.click();
  await expect(video).toBeVisible({ timeout: 45_000 });
  await expect(error).toBeVisible();
  await expect(exportPackage).toBeDisabled();
  await expect(
    panel.getByRole("button", {
      name: english("publish.review.downloadThumbnail"),
    }),
  ).toBeDisabled();
  expect(unexpectedRequests).toEqual([]);
});
