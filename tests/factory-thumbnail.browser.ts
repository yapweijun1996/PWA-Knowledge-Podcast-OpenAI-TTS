import { expect, test } from "@playwright/test";
import { build } from "vite";
import type {
  ThumbnailOptions,
  ThumbnailVariant,
} from "../src/publish/thumbnail.ts";

test.use({ serviceWorkers: "block" });

const fontFiles = {
  "/fonts/noto-sans-sc-core-v1.woff2": "PS Noto Sans SC",
  "/fonts/noto-sans-latin-v1.woff2": "PS Noto Sans",
};

const variants = [
  {
    variant: "topic-graphic",
    paletteId: "aurora",
    headline: "组屋如何混居",
    ink: "#F5F7FC",
    right: 755,
  },
  {
    variant: "host-pair",
    paletteId: "sunset",
    headline: "邻里怎样共享空间",
    ink: "#F5F7FC",
    right: 734,
  },
  {
    variant: "headline",
    paletteId: "light",
    headline: "社区空间人人共享",
    ink: "#172238",
    right: 1160,
  },
] as const satisfies readonly (ThumbnailOptions & {
  variant: ThumbnailVariant;
  ink: string;
  right: number;
})[];

test("exports three thumbnail PNGs with clear headlines and a clear duration badge", async ({
  page,
  baseURL,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Chromium canvas pixel gate");
  const built = await build({
    configFile: false,
    publicDir: false,
    logLevel: "silent",
    build: {
      write: false,
      minify: false,
      target: "esnext",
      lib: {
        entry: "src/publish/thumbnail.ts",
        formats: ["es"],
      },
    },
  });
  const output = Array.isArray(built) ? built[0] : built;
  if (!("output" in output))
    throw new Error("Thumbnail test bundle unavailable");
  const entry = output.output.find(
    (item) => item.type === "chunk" && item.isEntry,
  );
  if (!entry || entry.type !== "chunk")
    throw new Error("Thumbnail test entry missing");

  const origin = new URL(baseURL!).origin;
  const testRoot = "/__thumbnail-test__/";
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === origin && route.request().method() === "GET") {
      if (url.pathname === testRoot) {
        return route.fulfill({
          contentType: "text/html",
          body: "<!doctype html><meta charset=utf-8>",
        });
      }
      if (url.pathname === testRoot + entry.fileName) {
        return route.fulfill({
          contentType: "text/javascript",
          body: entry.code,
        });
      }
      if (Object.hasOwn(fontFiles, url.pathname)) {
        return route.fulfill({
          contentType: "font/woff2",
          path: "./public" + url.pathname,
        });
      }
    }
    return route.abort();
  });

  await page.goto(origin + testRoot);
  const results = await page.evaluate(
    async ({ moduleUrl, fonts, cases }) => {
      const {
        encodeThumbnail,
        thumbnailContrastRatio,
      }: typeof import("../src/publish/thumbnail.ts") = await import(moduleUrl);

      for (const [path, family] of Object.entries(fonts)) {
        const face = new FontFace(family, `url(${path})`, {
          weight: "600 800",
        });
        document.fonts.add(await face.load());
      }
      await document.fonts.ready;

      const reports = [];
      for (const { variant, paletteId, headline, ink, right } of cases) {
        const png = await encodeThumbnail(
          document.createElement("canvas"),
          { variant, paletteId, headline, language: "zh" },
          async () => ({ notices: [], missingCharacters: [] }),
        );
        const image = await createImageBitmap(png);
        const { width, height } = image;
        const full = new OffscreenCanvas(width, height);
        const ctx = full.getContext("2d", {
          colorSpace: "srgb",
          willReadFrequently: true,
        })!;
        ctx.drawImage(image, 0, 0);
        const { data } = ctx.getImageData(0, 0, width, height);
        const lastRow = (height - 1) * width * 4;
        const fromHex = (color: string) =>
          [1, 3, 5].map((at) => Number.parseInt(color.slice(at, at + 2), 16));
        const toHex = (pixels: Uint8ClampedArray, i: number) =>
          "#" +
          [...pixels.subarray(i, i + 3)]
            .map((channel) => channel.toString(16).padStart(2, "0"))
            .join("");
        const inkChannels = fromHex(ink);
        const isInk = (i: number) =>
          inkChannels.every(
            (channel, k) => Math.abs(data[i + k] - channel) <= 1,
          );

        let badgeInk = 0;
        for (let y = Math.floor(0.78 * height); y < height; y++) {
          for (let x = Math.floor(0.79 * width); x < width; x++) {
            const offset = (y * width + x) * 4;
            if (
              [0, 1, 2].some(
                (k) =>
                  Math.abs(data[offset + k] - data[lastRow + x * 4 + k]) > 2,
              )
            )
              badgeInk++;
          }
        }

        let lowestContrast = 21;
        let headlinePixels = 0;
        for (let y = 150; y < 540; y++) {
          for (let x = 80; x < right; x++) {
            const i = (y * width + x) * 4;
            if (isInk(i)) {
              headlinePixels++;
              lowestContrast = Math.min(
                lowestContrast,
                thumbnailContrastRatio(
                  toHex(data, i),
                  toHex(data, lastRow + x * 4),
                ),
              );
            }
          }
        }

        const inkHeights = [160, 320].map((w) => {
          const h = (w * 9) / 16;
          const preview = new OffscreenCanvas(w, h);
          const sample = preview.getContext("2d", {
            colorSpace: "srgb",
            willReadFrequently: true,
          })!;
          sample.imageSmoothingQuality = "high";
          sample.drawImage(image, 0, 0, w, h);
          const pixels = sample.getImageData(0, 0, w, h).data;
          const baseline = (h - 1) * w * 4;
          const scale = w / width;
          let tallest = 0;
          let run = 0;
          for (
            let y = Math.ceil(150 * scale);
            y < Math.floor(540 * scale);
            y++
          ) {
            let inkInRow = 0;
            for (
              let x = Math.ceil(80 * scale);
              x < Math.floor(right * scale);
              x++
            ) {
              const offset = (y * w + x) * 4;
              if (
                thumbnailContrastRatio(
                  toHex(pixels, offset),
                  toHex(pixels, baseline + x * 4),
                ) >= 3
              )
                inkInRow++;
            }
            run = inkInRow >= 3 ? run + 1 : 0;
            tallest = Math.max(tallest, run);
          }
          return tallest;
        });
        image.close();
        reports.push({
          variant,
          width,
          height,
          bytes: png.size,
          type: png.type,
          badgeInk,
          headlinePixels,
          lowestContrast,
          inkHeights,
        });
      }
      return reports;
    },
    {
      moduleUrl: origin + testRoot + entry.fileName,
      fonts: fontFiles,
      cases: variants,
    },
  );

  for (const report of results) {
    expect(report.type, report.variant).toBe("image/png");
    expect([report.width, report.height], report.variant).toEqual([1280, 720]);
    expect(report.bytes, report.variant).toBeGreaterThan(0);
    expect(report.bytes, report.variant).toBeLessThan(2_000_000);
    expect(report.badgeInk, report.variant).toBe(0);
    expect(report.headlinePixels, report.variant).toBeGreaterThan(0);
    expect(report.lowestContrast, report.variant).toBeGreaterThanOrEqual(4.5);
    expect(report.inkHeights[0], report.variant).toBeGreaterThanOrEqual(8);
    expect(report.inkHeights[1], report.variant).toBeGreaterThanOrEqual(16);
  }
});
