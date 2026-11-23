import { expect } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { contentSecurityPolicy } from "../config/csp.ts";
import { studioBase } from "../shared/factory.ts";
import type * as VideoFonts from "../src/video/fonts/loader.ts";
import { test } from "./fixtures/guards";

test("registers both bundled font families and loads the level-2 face only on demand", async ({
  page,
}) => {
  const entry = fileURLToPath(
    new URL("../src/video/fonts/loader.ts", import.meta.url),
  );
  const result = await build({
    base: studioBase,
    configFile: false,
    publicDir: false,
    logLevel: "silent",
    build: {
      write: false,
      lib: { entry, formats: ["es"] },
    },
  });
  const output = Array.isArray(result) ? result[0] : result;
  if (!("output" in output)) throw new Error("Missing font test module output");
  const chunk = output.output.find(
    (entry) => entry.type === "chunk" && entry.isEntry,
  );
  if (!chunk || chunk.type !== "chunk")
    throw new Error("Missing bundled font loader");

  const harness = `${studioBase}__font-check__`;
  const module = `${studioBase}__font-check__.js`;
  await page.route(
    (url) => url.pathname === harness,
    (route) =>
      route.fulfill({
        contentType: "text/html; charset=utf-8",
        headers: { "content-security-policy": contentSecurityPolicy() },
        body: "<!doctype html><html lang=en><title>Font test</title><body></body></html>",
      }),
  );
  await page.route(
    (url) => url.pathname === module,
    (route) =>
      route.fulfill({
        contentType: "text/javascript; charset=utf-8",
        body: chunk.code,
      }),
  );

  const requested: string[] = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path.endsWith(".woff2")) requested.push(path);
  });
  await page.goto(harness);
  const first = await page.evaluate(async (moduleURL) => {
    const { ensureVideoFonts, videoFontFamilies }: typeof VideoFonts =
      await import(moduleURL);
    const chinese = "组屋里的混居，（是怎么被设计出来的？）";
    const latin = "Selamat datang, café!";
    const preflight = await ensureVideoFonts({ texts: [chinese, latin] });
    const registered = await Promise.all(
      [600, 800].flatMap((weight) =>
        [
          [videoFontFamilies.sc, chinese],
          [videoFontFamilies.latin, latin],
        ].map(async ([family, sample]) => {
          const font = `${weight} 64px "${family}"`;
          const faces = await document.fonts.load(font, sample);
          return (
            document.fonts.check(font, sample) &&
            faces.some(
              (face) =>
                face.family.replace(/^["']|["']$/g, "") === family &&
                face.weight === "600 800" &&
                face.status === "loaded",
            )
          );
        }),
      ),
    );

    // Proportional East Asian widths distinguish punctuation advances even on
    // machines whose system fallback advances Han by exactly one em as well.
    const span = document.createElement("span");
    span.textContent = chinese;
    span.style.display = "inline-block";
    span.style.whiteSpace = "nowrap";
    span.style.font = `800 64px "${videoFontFamilies.sc}", sans-serif`;
    span.style.fontFeatureSettings = '"palt"';
    document.body.append(span);
    const bundledWidth = span.getBoundingClientRect().width;
    const fallbackWidths = ["sans-serif", "serif", "monospace"].map((family) => {
      span.style.fontFamily = family;
      return span.getBoundingClientRect().width;
    });
    span.remove();
    return {
      preflight,
      registered,
      widthDifference: Math.max(
        ...fallbackWidths.map((width) => Math.abs(bundledWidth - width)),
      ),
    };
  }, module);

  expect(first.preflight).toEqual({ notices: [], missingCharacters: [] });
  expect(first.registered).toEqual([true, true, true, true]);
  expect(first.widthDifference).toBeGreaterThan(0.1);
  expect([...requested].sort()).toEqual([
    `${studioBase}fonts/noto-sans-latin-v1.woff2`,
    `${studioBase}fonts/noto-sans-sc-core-v1.woff2`,
  ]);

  const level2 = await page.evaluate(async (moduleURL) => {
    const { ensureVideoFonts, videoFontFamilies }: typeof VideoFonts =
      await import(moduleURL);
    const character = "亍";
    const preflight = await ensureVideoFonts({ texts: [character] });
    const font = `800 64px "${videoFontFamilies.sc}"`;
    return {
      preflight,
      registered: document.fonts.check(font, character),
      count: document.fonts.size,
    };
  }, module);
  expect(level2).toEqual({
    preflight: { notices: [], missingCharacters: [] },
    registered: true,
    count: 3,
  });
  expect(requested).toHaveLength(3);
  expect(requested[2]).toBe(`${studioBase}fonts/noto-sans-sc-l2-v1.woff2`);
});
