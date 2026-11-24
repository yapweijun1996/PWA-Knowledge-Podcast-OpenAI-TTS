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
    language: "zh",
    headline: "组屋如何混居",
    lines: ["组屋如何混居"],
    ink: "#F5F7FC",
    right: 755,
  },
  {
    variant: "host-pair",
    paletteId: "sunset",
    language: "zh",
    headline: "邻里怎样共享空间",
    lines: ["邻里怎样", "共享空间"],
    ink: "#F5F7FC",
    right: 734,
  },
  {
    variant: "headline",
    paletteId: "light",
    language: "zh",
    headline: "社区空间人人共享",
    lines: ["社区空间人人共享"],
    ink: "#172238",
    right: 1160,
  },
  {
    variant: "headline",
    paletteId: undefined,
    language: "en",
    // Lowercase letters with no ascenders or descenders exercise x-height.
    headline: "more room",
    lines: ["more room"],
    ink: "#F5F7FC",
    right: 1160,
  },
] as const satisfies readonly (ThumbnailOptions & {
  variant: ThumbnailVariant;
  ink: string;
  lines: readonly string[];
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
    // Library mode leaves process.env references in dependencies untouched.
    define: { "process.env.NODE_ENV": '"production"', "process.env": "{}" },
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
      for (const {
        variant,
        paletteId,
        headline,
        language,
        ink,
        right,
        lines,
      } of cases) {
        const canvas = document.createElement("canvas");
        const drawing = canvas.getContext("2d", {
          colorSpace: "srgb",
          alpha: false,
        })!;
        const fillText = drawing.fillText.bind(drawing);
        const headlineInk: { text: string; top: number; bottom: number }[] = [];
        drawing.fillText = (text, x, baseline) => {
          if (baseline < 120) {
            headlineInk.length = 0;
          } else {
            const metrics = drawing.measureText(text);
            headlineInk.push({
              text,
              top: baseline - metrics.actualBoundingBoxAscent,
              bottom: baseline + metrics.actualBoundingBoxDescent,
            });
          }
          fillText(text, x, baseline);
        };
        const png = await encodeThumbnail(
          canvas,
          { variant, paletteId, headline, language },
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
        const backgroundDistance = (
          pixels: Uint8ClampedArray,
          w: number,
          x: number,
          y: number,
        ) => {
          const offset = (y * w + x) * 4;
          const background = pixels.length - (w - x) * 4;
          return Math.max(
            Math.abs(pixels[offset] - pixels[background]),
            Math.abs(pixels[offset + 1] - pixels[background + 1]),
            Math.abs(pixels[offset + 2] - pixels[background + 2]),
          );
        };

        const scanArt = (minimumDifference: number) => {
          const bounds = [width, height, 0, 0];
          for (let y = 0; y < height; y++) {
            for (let x = right; x < width; x++) {
              if (backgroundDistance(data, width, x, y) < minimumDifference)
                continue;
              bounds[0] = Math.min(bounds[0], x);
              bounds[1] = Math.min(bounds[1], y);
              bounds[2] = Math.max(bounds[2], x + 1);
              bounds[3] = Math.max(bounds[3], y + 1);
            }
          }
          return bounds;
        };
        const artBounds = variant === "headline" ? null : scanArt(3);
        const buildingRight =
          variant === "topic-graphic" ? scanArt(40)[2] : null;

        let badgeInk = 0;
        for (let y = Math.floor(0.78 * height); y < height; y++) {
          for (let x = Math.floor(0.79 * width); x < width; x++) {
            if (backgroundDistance(data, width, x, y) > 2) badgeInk++;
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

        const previewPixels = (w: number) => {
          const h = (w * 9) / 16;
          const preview = new OffscreenCanvas(w, h);
          const sample = preview.getContext("2d", {
            colorSpace: "srgb",
            willReadFrequently: true,
          })!;
          sample.imageSmoothingQuality = "high";
          sample.drawImage(image, 0, 0, w, h);
          return sample.getImageData(0, 0, w, h).data;
        };

        const inkHeights = [160, 320].map((w) => {
          const h = (w * 9) / 16;
          const pixels = previewPixels(w);
          const baseline = (h - 1) * w * 4;
          const scale = w / width;
          return headlineInk.map(({ top, bottom }) => {
            let tallest = 0;
            let run = 0;
            for (
              let y = Math.floor(top * scale);
              y < Math.ceil(bottom * scale);
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
        });

        const scanHostPair = (w: number) => {
          const h = (w * 9) / 16;
          const pixels = w === width ? data : previewPixels(w);
          const baseline = (h - 1) * w * 4;
          const scale = w / width;
          // Scan only the orb region above the ground shadow, using the
          // unobstructed last row as the background reference for each column.
          const top = Math.ceil(210 * scale);
          const bottom = Math.floor(416 * scale);
          const spans: { start: number; end: number }[] = [];
          for (
            let x = Math.ceil(768 * scale);
            x < Math.floor(1188 * scale);
            x++
          ) {
            let occupied = false;
            for (let y = top; y < bottom && !occupied; y++)
              occupied = backgroundDistance(pixels, w, x, y) >= 16;
            if (!occupied) continue;
            const last = spans.at(-1);
            if (last?.end === x) last.end = x + 1;
            else spans.push({ start: x, end: x + 1 });
          }
          const visible = spans.map(({ start, end }) => {
            let highContrastRows = 0;
            for (let y = top; y < bottom; y++) {
              let ink = 0;
              for (let x = start; x < end; x++) {
                if (
                  thumbnailContrastRatio(
                    toHex(pixels, (y * w + x) * 4),
                    toHex(pixels, baseline + x * 4),
                  ) >= 3
                )
                  ink++;
              }
              if (ink >= (end - start) / 3) highContrastRows++;
            }
            let first = h;
            let last = 0;
            // A higher colour-distance threshold keeps the ground shadow
            // out of the silhouette's measured top and bottom.
            for (let y = top; y < Math.ceil(435 * scale); y++) {
              for (let x = start; x < end; x++) {
                if (backgroundDistance(pixels, w, x, y) >= 45) {
                  first = Math.min(first, y);
                  last = y + 1;
                  break;
                }
              }
            }
            return {
              width: end - start,
              highContrastRows,
              centerY: (first + last) / 2,
            };
          });
          const gap = spans.length === 2 ? spans[1].start - spans[0].end : 0;
          return { w, gap, visible };
        };
        const hostPair =
          variant === "host-pair" ? [1280, 320, 160].map(scanHostPair) : [];
        image.close();
        reports.push({
          variant,
          language,
          width,
          height,
          bytes: png.size,
          type: png.type,
          badgeInk,
          headlinePixels,
          lowestContrast,
          inkHeights,
          lines: headlineInk.map(({ text }) => text),
          expectedLines: lines,
          artBounds,
          buildingRight,
          hostPair,
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
    expect(report.lines, report.variant).toEqual(report.expectedLines);
    const inkFloor = report.language === "zh" ? 11 : 6;
    for (const [index, heights] of report.inkHeights.entries()) {
      for (const height of heights)
        expect(height, report.variant).toBeGreaterThanOrEqual(
          (index + 1) * inkFloor,
        );
    }
    if (report.artBounds) {
      const [left, top, right, bottom] = report.artBounds;
      const box =
        report.variant === "topic-graphic"
          ? [800, 112, 1190, 530]
          : [768, 120, 1188, 535];
      expect(right - left, report.variant).toBeGreaterThan(0);
      expect(bottom - top, report.variant).toBeGreaterThan(0);
      expect(left, report.variant).toBeGreaterThanOrEqual(box[0]);
      expect(top, report.variant).toBeGreaterThanOrEqual(box[1]);
      expect(right, report.variant).toBeLessThanOrEqual(box[2]);
      expect(bottom, report.variant).toBeLessThanOrEqual(box[3]);
    }
    if (report.buildingRight !== null)
      expect(report.buildingRight, report.variant).toBeGreaterThanOrEqual(1170);
    for (const { w, gap, visible } of report.hostPair) {
      expect(visible, `${w}px host silhouettes`).toHaveLength(2);
      expect(gap, `${w}px host gap`).toBeGreaterThanOrEqual(
        w === 1280 ? 16 : 1,
      );
      if (w === 1280) {
        expect(gap, `${w}px host gap`).toBeLessThanOrEqual(24);
        const [a, b] = visible;
        expect(Math.abs(a.centerY - b.centerY)).toBeLessThanOrEqual(0.015 * 720);
        for (const { centerY } of visible)
          expect(Math.abs(centerY / 720 - 0.46)).toBeLessThanOrEqual(0.015);
      }
      for (const orb of visible) {
        expect(orb.width, `${w}px host width`).toBeGreaterThanOrEqual(
          (18 * w) / 160,
        );
        expect(
          orb.highContrastRows,
          `${w}px host contrast rows`,
        ).toBeGreaterThanOrEqual((15 * w) / 160);
      }
    }
  }
});
