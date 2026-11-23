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

type ThumbnailCase = ThumbnailOptions & {
  variant: ThumbnailVariant;
  ink: string;
  right: number;
  expectedBackdrop?: string;
  expectedHeadline?: string;
};

const variants: readonly ThumbnailCase[] = [
  {
    variant: "topic-graphic",
    paletteId: "aurora",
    language: "zh",
    headline: "组屋如何混居",
    ink: "#F5F7FC",
    right: 755,
  },
  {
    variant: "host-pair",
    paletteId: "sunset",
    language: "zh",
    headline: "邻里怎样共享空间",
    ink: "#F5F7FC",
    right: 734,
  },
  {
    variant: "headline",
    paletteId: "light",
    language: "zh",
    headline: "社区空间人人共享",
    ink: "#172238",
    right: 1160,
  },
  {
    variant: "host-pair",
    language: "zh",
    headline: "邻里怎样共享空间",
    ink: "#F5F7FC",
    right: 734,
    expectedBackdrop: "#0b1220",
  },
  {
    variant: "host-pair",
    language: "zh",
    title: "组屋里的混居，是怎么被设计出来的",
    topicKeywords: "住房政策",
    ink: "#F5F7FC",
    right: 734,
    expectedBackdrop: "#0b1220",
    expectedHeadline: "组屋如何混居",
  },
  {
    variant: "topic-graphic",
    language: "zh",
    title: "组屋里的混居，是怎么被设计出来的",
    topicKeywords: "住房政策",
    ink: "#F5F7FC",
    right: 755,
    expectedBackdrop: "#0b1220",
    expectedHeadline: "组屋如何混居",
  },
  {
    variant: "headline",
    language: "en",
    title: "Designing our neighbourhoods",
    topicKeywords: "Housing policy",
    ink: "#F5F7FC",
    right: 1160,
    expectedBackdrop: "#0b1220",
    expectedHeadline: "Mixed housing by design",
  },
  {
    variant: "headline",
    language: "ms",
    title: "Reka bentuk kejiranan kita",
    topicKeywords: "Dasar perumahan",
    ink: "#F5F7FC",
    right: 1160,
    expectedBackdrop: "#0b1220",
    expectedHeadline: "Perumahan campuran dengan reka bentuk",
  },
  {
    variant: "headline",
    language: "zh",
    title: "邻里怎样共享空间",
    topicKeywords: "住房政策",
    ink: "#F5F7FC",
    right: 1160,
    expectedBackdrop: "#0b1220",
    expectedHeadline: "组屋混居靠设计",
  },
  {
    variant: "headline",
    paletteId: undefined,
    language: "en",
    // Lowercase letters with no ascenders or descenders exercise x-height.
    headline: "more room",
    ink: "#F5F7FC",
    right: 1160,
  },
];

test("exports thumbnail PNGs with clear headlines and a clear duration badge", async ({
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
        drawThumbnail,
        encodeThumbnail,
        thumbnailChecks,
        thumbnailContrastRatio,
        thumbnailDesign,
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
        ink,
        right,
        expectedBackdrop,
        expectedHeadline,
        ...options
      } of cases) {
        const { variant, language } = options;
        let headlineForFonts: string | undefined;
        const canvas = document.createElement("canvas");
        const png = await encodeThumbnail(
          canvas,
          options,
          async ({ texts }) => {
            headlineForFonts = texts[0];
            return { notices: [], missingCharacters: [] };
          },
        );
        const rendered = drawThumbnail(canvas.getContext("2d")!, options);
        if (rendered.error || !rendered.layoutMetadata) {
          throw new Error(`Missing ${variant} thumbnail layout`);
        }
        const { layoutMetadata } = rendered;
        const measuredInkRight = Math.max(
          ...layoutMetadata.headlineBounds.map((box) => box[2]),
        );
        // Art may move into the nominal text box, so cap the headline scan at
        // the end of the actual text. The geometry check still gates the box.
        const headlineScanRight = Math.min(right, Math.ceil(measuredInkRight) + 2);
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

        let overlapDelta = 0;
        let sidewallColorDelta = 0;
        let roofPixels = 0;
        let roofColorDelta = 0;
        let roofWindowPixels = 0;
        if (variant === "topic-graphic") {
          const [artLeft, artTop, artRight, artBottom] =
            layoutMetadata.decorationBounds;
          const nominalLeft = thumbnailDesign.layouts[variant].graphic[0];
          const shift = artLeft - nominalLeft;
          // The lit rear window reaches x=979. Sample the forward side past
          // its own inset windows, adjusting for the new placement.
          const shadedPlate = fromHex("#345a5b");
          for (let x = 975 + shift; x < 979 + shift; x++) {
            for (let y = 305; y < 309; y++) {
              const overlap = (y * width + x) * 4;
              const reference = ((y + 15) * width + x) * 4;
              for (let channel = 0; channel < 3; channel++) {
                overlapDelta = Math.max(
                  overlapDelta,
                  Math.abs(data[overlap + channel] - data[reference + channel]),
                );
                sidewallColorDelta = Math.max(
                  sidewallColorDelta,
                  Math.abs(data[reference + channel] - shadedPlate[channel]),
                );
              }
            }
          }

          const size = Math.min(artRight - artLeft, artBottom - artTop);
          const squareLeft = (artLeft + artRight - size) / 2;
          const squareTop = (artTop + artBottom - size) / 2;
          const pad = 1 / size;
          const roof = fromHex("#569b92");
          const rearWindow = fromHex("#b29af0");
          for (let y = Math.ceil(0.35 * height); y < 0.38 * height; y++) {
            const localY = (y + 0.5 - squareTop) / size;
            if (localY <= 0.33 + pad || localY >= 0.38 - pad) continue;
            const edge = 0.08 + (0.074 * (0.38 - localY)) / 0.05;
            for (
              let x = Math.ceil(0.73 * width) + shift;
              x < 0.76 * width + shift;
              x++
            ) {
              const localX = (x + 0.5 - squareLeft) / size;
              if (localX <= edge + pad || localX >= edge + 0.31 - pad) continue;
              const i = (y * width + x) * 4;
              roofPixels++;
              if (rearWindow.every((channel, k) => Math.abs(data[i + k] - channel) <= 1)) {
                roofWindowPixels++;
              }
              for (let k = 0; k < 3; k++) {
                roofColorDelta = Math.max(
                  roofColorDelta, Math.abs(data[i + k] - roof[k]),
                );
              }
            }
          }
        }

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
        let headlineRight = 0;
        for (let y = 150; y < 540; y++) {
          for (let x = 80; x < headlineScanRight; x++) {
            const i = (y * width + x) * 4;
            if (isInk(i)) {
              headlinePixels++;
              headlineRight = Math.max(headlineRight, x + 1);
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
              x < Math.floor(headlineScanRight * scale);
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

        const columnHasArt = (
          pixels: Uint8ClampedArray,
          w: number,
          baseline: number,
          x: number,
          top: number,
          bottom: number,
        ) => {
          for (let y = top; y < bottom; y++) {
            const offset = (y * w + x) * 4;
            if ([0, 1, 2].some(
              (k) => Math.abs(pixels[offset + k] - pixels[baseline + 4 * x + k]) >= 16,
            )) {
              return true;
            }
          }
          return false;
        };
        const artScanLeft = Math.ceil(measuredInkRight) + 4;
        let topicArtLeft: number | null = null;
        if (variant === "topic-graphic") {
          for (let x = artScanLeft; x < 1190; x++) {
            if (columnHasArt(data, width, lastRow, x, 150, 416)) {
              topicArtLeft = x;
              break;
            }
          }
        }

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
            let x = Math.ceil(artScanLeft * scale);
            x < Math.floor(1188 * scale);
            x++
          ) {
            if (!columnHasArt(pixels, w, baseline, x, top, bottom)) continue;
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
            return { width: end - start, highContrastRows };
          });
          const gap = spans.length === 2 ? spans[1].start - spans[0].end : 0;
          return { w, gap, visible, firstHostLeft: spans[0]?.start };
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
          bounds: thumbnailChecks(layoutMetadata).bounds,
          inkHeights,
          hostPair,
          headlineRight,
          topicArtLeft,
          expectedBackdrop,
          backdropStart: toHex(data, lastRow),
          expectedHeadline,
          headlineForFonts,
          overlapDelta,
          sidewallColorDelta,
          roofPixels,
          roofColorDelta,
          roofWindowPixels,
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
    expect(report.bounds, report.variant).toBe(true);
    expect(report.headlinePixels, report.variant).toBeGreaterThan(0);
    expect(report.lowestContrast, report.variant).toBeGreaterThanOrEqual(4.5);
    if (report.expectedBackdrop)
      expect(report.backdropStart, report.variant).toBe(report.expectedBackdrop);
    if (report.expectedHeadline)
      expect(report.headlineForFonts, report.variant).toBe(report.expectedHeadline);
    if (report.variant === "topic-graphic") {
      expect(report.topicArtLeft, "topic graphic pixels").not.toBeNull();
      const headlineArtGap = report.topicArtLeft! - report.headlineRight;
      expect(headlineArtGap, "headline-to-topic gap").toBeGreaterThan(0);
      expect(headlineArtGap, "headline-to-topic gap").toBeLessThanOrEqual(120);
      expect(report.sidewallColorDelta, "shaded plate color")
        .toBeLessThanOrEqual(2);
      expect(report.overlapDelta, "rear window bleed through foreground wall")
        .toBeLessThanOrEqual(1);
      expect(report.roofPixels, "foreground roof overlap sample").toBeGreaterThan(100);
      expect(report.roofWindowPixels, "window-coloured pixels inside the roof").toBe(0);
      expect(report.roofColorDelta, "foreground roof color across the overlap")
        .toBeLessThanOrEqual(2);
    }
    const inkFloor = report.language === "zh" ? 8 : 6;
    expect(report.inkHeights[0], report.variant).toBeGreaterThanOrEqual(
      inkFloor,
    );
    expect(report.inkHeights[1], report.variant).toBeGreaterThanOrEqual(
      2 * inkFloor,
    );
    for (const { w, gap, visible, firstHostLeft } of report.hostPair) {
      expect(visible, `${w}px host silhouettes`).toHaveLength(2);
      expect(gap, `${w}px host gap`).toBeGreaterThanOrEqual(
        w === 1280 ? 16 : 1,
      );
      if (w === 1280) {
        expect(gap, `${w}px host gap`).toBeLessThanOrEqual(24);
        const headlineArtGap = firstHostLeft! - report.headlineRight;
        expect(headlineArtGap, "headline-to-art gap").toBeGreaterThan(0);
        expect(headlineArtGap, "headline-to-art gap").toBeLessThanOrEqual(120);
        expect(headlineArtGap, "headline-to-art gap").toBeLessThanOrEqual(
          772 - report.headlineRight,
        );
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
