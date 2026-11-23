import { expect, test, type Page } from "@playwright/test";
import { build } from "vite";
import { videoFontManifest } from "../src/video/fonts/manifest.ts";
import {
  rubric,
  type Criterion,
  type FlashDiagnostic,
  type Issue,
  type VisualCase,
} from "./fixtures/visual-qa.ts";

type Harness = typeof import("./fixtures/visual-qa.ts");
const cases: VisualCase[] = [
  { language: "zh", orientation: "landscape", scene: "waveform" },
  { language: "en", orientation: "portrait", scene: "waveform" },
  { language: "ms", orientation: "landscape", scene: "studio3d" },
  { language: "sg", orientation: "portrait", scene: "studio3d" },
];
const videoCriteria: Criterion[] = [
  "captions",
  "contrast",
  "framing",
  "typography",
  "opening",
  "flash",
  "repeatability",
];

// Pin the Chromium graphics backend used by the existing 3D render tests.
test.use({
  serviceWorkers: "block",
  launchOptions: {
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  },
});

async function serveHarness(page: Page, baseURL: string) {
  const result = await build({
    configFile: false,
    envFile: false,
    publicDir: false,
    base: "/",
    logLevel: "silent",
    define: { "process.env.NODE_ENV": '"production"', "process.env": "{}" },
    build: {
      write: false,
      minify: false,
      target: "esnext",
      lib: { entry: "tests/fixtures/visual-qa.ts", formats: ["es"] },
    },
  });
  const output = Array.isArray(result) ? result[0] : result;
  if (!("output" in output)) throw new Error("Visual QA bundle unavailable");
  const chunks = output.output.filter((item) => item.type === "chunk");
  const main = chunks.find(({ isEntry }) => isEntry);
  if (!main) throw new Error("Visual QA bundle entry missing");
  const root = "/__visual-qa__/";
  const origin = new URL(baseURL).origin;
  const scripts = new Map(
    chunks.map(({ fileName, code }) => [root + fileName, code]),
  );
  const fonts = new Set(
    videoFontManifest.shards.map(({ file }) => `/fonts/${file}`),
  );
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === origin && route.request().method() === "GET") {
      if (url.pathname === root)
        return route.fulfill({
          contentType: "text/html",
          body: "<!doctype html><meta charset=utf-8>",
        });
      const script = scripts.get(url.pathname);
      if (script)
        return route.fulfill({ contentType: "text/javascript", body: script });
      if (fonts.has(url.pathname))
        return route.fulfill({
          contentType: "font/woff2",
          path: `./public${url.pathname}`,
        });
    }
    return route.abort();
  });
  return { url: origin + root, moduleURL: origin + root + main.fileName };
}

test("visual rubric for real Chromium MP4s and thumbnails", async ({
  page,
  baseURL,
  browserName,
}, testInfo) => {
  test.skip(
    browserName !== "chromium",
    "Chromium WebCodecs and SwiftShader reference profile",
  );
  test.setTimeout(360_000);
  const started = performance.now();
  const issues: (Issue & { scope: string })[] = [];
  const harnessErrors: {
    scope: string;
    criteria: Criterion[];
    detail: string;
  }[] = [];
  const warnings: (FlashDiagnostic & { scope: string; status: "WARNING" })[] =
    [];
  const evidence: Record<string, unknown> = {};
  const add = (scope: string, items: Issue[]) =>
    issues.push(...items.map((issue) => ({ ...issue, scope })));
  const block = (scope: string, criteria: Criterion[], error: unknown) => {
    const detail = String(error);
    if (detail.includes("Visual QA frame alignment"))
      harnessErrors.push({ scope, criteria, detail });
    else
      add(
        scope,
        criteria.map((criterion) => ({ criterion, detail })),
      );
  };
  try {
    const { url, moduleURL } = await serveHarness(page, baseURL!);
    for (const options of cases) {
      const scope = `${options.scene}/${options.orientation}/${options.language}`;
      await test.step(scope, async () => {
        try {
          await page.goto(url);
          const result = await page.evaluate(
            async ({ moduleURL, options }) => {
              const harness: Harness = await import(moduleURL);
              return harness.runVisualCase(options);
            },
            { moduleURL, options },
          );
          add(scope, result.issues);
          warnings.push(
            ...result.flashDiagnostics
              .filter(
                ({ maxCellFlashesPerSecond }) => maxCellFlashesPerSecond > 0,
              )
              .map((diagnostic) => ({
                ...diagnostic,
                scope,
                status: "WARNING" as const,
              })),
          );
          evidence[scope] = result;
          // A navigation discards the document, font set, GPU scene and module
          // cache. Keep the Chromium build, graphics flags and inputs fixed.
          await page.reload();
          const shuffled = await page.evaluate(
            async ({ moduleURL, options, hashes }) => {
              const harness: Harness = await import(moduleURL);
              return harness.verifyShuffledDraws(options, hashes);
            },
            { moduleURL, options, hashes: result.hashes },
          );
          add(
            scope,
            shuffled.mismatches.map((frame) => ({
              criterion: "repeatability",
              frame,
              detail: "raw SHA-256 changed on fresh shuffled draw",
            })),
          );
          evidence[scope] = { ...result, shuffled };
        } catch (error) {
          block(
            scope,
            evidence[scope] ? ["repeatability"] : videoCriteria,
            error,
          );
        }
      });
    }
    await test.step("three thumbnail PNGs", async () => {
      try {
        const result = await page.evaluate(async (moduleURL) => {
          const harness: Harness = await import(moduleURL);
          return harness.runThumbnails();
        }, moduleURL);
        evidence.thumbnails = result.thumbnails;
        add("thumbnails", result.issues);
      } catch (error) {
        block("thumbnails", ["thumbnail"], error);
      }
    });
    await test.step("WebGL initialization fallback", async () => {
      for (const orientation of ["landscape", "portrait"] as const) {
        const scope = `fallback/${orientation}`;
        try {
          const result = await page.evaluate(
            async ({ moduleURL, orientation }) => {
              const harness: Harness = await import(moduleURL);
              return harness.runFallback(orientation);
            },
            { moduleURL, orientation },
          );
          evidence[scope] = result;
          if (!result.passed)
            block(scope, ["repeatability"], JSON.stringify(result));
        } catch (error) {
          block(scope, ["repeatability"], error);
        }
      }
    });
  } catch (error) {
    block("harness", [...videoCriteria, "thumbnail"], error);
  }
  function score(selected: typeof issues, blocked: typeof harnessErrors) {
    const criteria = Object.entries(rubric).map(([id, criterion]) => {
      const failures = selected.filter((issue) => issue.criterion === id);
      const status =
        criterion.assessable === 0
          ? "NOT_ASSESSABLE"
          : failures.length
            ? "FAIL"
            : blocked.some(({ criteria }) => criteria.includes(id as Criterion))
              ? "BLOCKED"
              : "PASS";
      return {
        id,
        ...criterion,
        status,
        earned: status === "PASS" ? criterion.assessable : 0,
        failures,
      };
    });
    const assessable = criteria.reduce(
      (sum, criterion) => sum + criterion.assessable,
      0,
    );
    const earned = criteria.reduce(
      (sum, criterion) => sum + criterion.earned,
      0,
    );
    return { criteria, assessable, earned };
  }
  const { criteria, assessable, earned } = score(issues, harnessErrors);
  const byOrientation = Object.fromEntries(
    ["landscape", "portrait"].map((orientation) => [
      orientation,
      score(
        issues.filter(
          ({ scope }) =>
            !scope.includes("/") || scope.split("/")[1] === orientation,
        ),
        harnessErrors.filter(
          ({ scope }) => scope.split("/")[1] === orientation,
        ),
      ),
    ]),
  );
  const summary = `**Automated visual QA: ${earned} / ${assessable} assessable points · ${Math.round((100 * earned) / assessable)}%.**`;
  await testInfo.attach("visual-qa-report.json", {
    body: JSON.stringify(
      {
        version: 3,
        summary,
        earned,
        assessable,
        criteria,
        byOrientation,
        harnessErrors,
        warnings,
        elapsedMs: performance.now() - started,
        evidence,
      },
      null,
      2,
    ),
    contentType: "application/json",
  });
  console.log(summary);
  expect(
    harnessErrors,
    "Visual QA could not verify MP4 frame alignment",
  ).toEqual([]);
  // The attachment has every occurrence. Keep the terminal failure focused.
  const firstFailures = criteria.flatMap(({ id, failures }) =>
    failures.length
      ? [{ criterion: id, count: failures.length, first: failures[0] }]
      : [],
  );
  expect(
    firstFailures,
    "Visual rubric failures (full details in visual-qa-report.json)",
  ).toEqual([]);
});
