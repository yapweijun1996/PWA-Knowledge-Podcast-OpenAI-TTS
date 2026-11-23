import { expect, test, type BrowserContext, type Page } from "@playwright/test";
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
const fallbackOrientations = ["landscape", "portrait"] as const;
const videoFixtures = cases.map((options) => ({
  options,
  scope: `${options.scene}/${options.orientation}/${options.language}`,
}));
const fixtureCriteria: Record<string, Criterion[]> = Object.fromEntries([
  ...videoFixtures.map(({ scope }) => [scope, videoCriteria]),
  ["thumbnails", ["thumbnail"]],
  ...fallbackOrientations.map((orientation) => [
    `fallback/${orientation}`,
    ["repeatability"],
  ]),
]);
const fixtureTimeoutMs = 120_000;
// Reserve time under the overall test cap even if all four videos time out.
const auxiliaryTimeoutMs = 30_000;

// Pin the Chromium graphics backend used by the existing 3D render tests.
test.use({
  serviceWorkers: "block",
  launchOptions: {
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  },
});

async function serveHarness(context: BrowserContext, baseURL: string) {
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
  await context.route("**/*", async (route) => {
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

async function watchdog<T>(
  label: string,
  timeoutMs: number,
  operation: () => Promise<T>,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    if (timeoutMs <= 0) throw new Error("fixture time budget exhausted");
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error(`timed out after ${Math.ceil(timeoutMs)} ms`)),
        timeoutMs,
      );
    });
    return await Promise.race([timeout, operation()]);
  } catch (error) {
    throw new Error(`Visual QA ${label}: ${String(error)}`, { cause: error });
  } finally {
    clearTimeout(timer);
  }
}

test("visual QA reader decodes frame indices and a callout cut at frame 45", async ({
  page,
  context,
  baseURL,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Chromium H.264 reference profile");
  test.setTimeout(60_000);
  const { url, moduleURL } = await watchdog(
    "reader self-test / build harness (frame n/a)",
    20_000,
    () => serveHarness(context, baseURL!),
  );
  await page.goto(url, { timeout: 5_000 });
  const samples = await watchdog(
    "reader self-test / encode and decode (frames 0 through 89)",
    30_000,
    () =>
      page.evaluate(async (moduleURL) => {
        const harness: Harness = await import(moduleURL);
        return harness.runReaderSelfTest();
      }, moduleURL),
  );
  expect(samples.indexed).toEqual([
    { frame: 0, index: 0, callout: false },
    { frame: 15, index: 15, callout: true },
    { frame: 14, index: 14, callout: true },
    { frame: 29, index: 29, callout: true },
    { frame: 30, index: 30, callout: true },
    { frame: 45, index: 45, callout: false },
    { frame: 44, index: 44, callout: true },
    { frame: 59, index: 59, callout: false },
    { frame: 60, index: 60, callout: false },
    { frame: 89, index: 89, callout: false },
  ]);
  expect(samples.native).toEqual(samples.indexed);
});

test("visual rubric for real Chromium MP4s and thumbnails", async ({
  context,
  baseURL,
  browserName,
}, testInfo) => {
  test.skip(
    browserName !== "chromium",
    "Chromium WebCodecs and SwiftShader reference profile",
  );
  test.setTimeout(620_000);
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
  const timings: Record<
    string,
    {
      stepsMs: Record<string, number>;
      totalMs: number;
      video?: {
        renderMs: number;
        decodeMs: number;
        frames: number;
        sampledFrames: number;
      };
    }
  > = {};
  const add = (scope: string, items: Issue[]) =>
    issues.push(...items.map((issue) => ({ ...issue, scope })));
  const block = (scope: string, criteria: Criterion[], error: unknown) => {
    harnessErrors.push({ scope, criteria, detail: String(error) });
  };
  type RunStep = <T>(name: string, operation: () => Promise<T>) => Promise<T>;
  async function runFixture(
    url: string,
    scope: string,
    timeoutMs: number,
    run: (page: Page, step: RunStep) => Promise<void>,
  ) {
    await test.step(scope, async () => {
      const started = performance.now();
      timings[scope] = { stepsMs: {}, totalMs: 0 };
      const timing = timings[scope];
      async function step<T>(name: string, operation: () => Promise<T>) {
        const stepStarted = performance.now();
        try {
          return await watchdog(
            `${scope} / ${name}`,
            timeoutMs - (stepStarted - started),
            operation,
          );
        } finally {
          timing.stepsMs[name] = performance.now() - stepStarted;
        }
      }
      let page: Page | undefined;
      try {
        const opened = await step("open page (frame n/a)", () =>
          context.newPage(),
        );
        page = opened;
        await step("load page (frame n/a)", () => opened.goto(url));
        opened.on("console", (message) => {
          if (
            message.type() === "info" &&
            message.text().startsWith("Visual QA: ")
          )
            console.log(`${scope} ${message.text().slice(11)}`);
        });
        await run(opened, step);
      } catch (error) {
        block(
          scope,
          evidence[scope] ? ["repeatability"] : fixtureCriteria[scope],
          error,
        );
      } finally {
        timing.totalMs = performance.now() - started;
        if (page) {
          const opened = page;
          await watchdog(`${scope} / close page (frame n/a)`, 2_000, () =>
            opened.close(),
          ).catch(() => {});
        }
      }
    });
  }
  try {
    const { url, moduleURL } = await watchdog(
      "harness / build and route (frame n/a)",
      20_000,
      () => serveHarness(context, baseURL!),
    );
    for (const { options, scope } of videoFixtures) {
      await runFixture(url, scope, fixtureTimeoutMs, async (page, step) => {
        const result = await step(
          "render and decode (all sampled frames)",
          () =>
            page.evaluate(
              async ({ moduleURL, options }) => {
                const harness: Harness = await import(moduleURL);
                return harness.runVisualCase(options);
              },
              { moduleURL, options },
            ),
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
        const { elapsedMs, decode } = result.metrics;
        timings[scope].video = {
          renderMs: elapsedMs.render,
          decodeMs: elapsedMs.decode,
          frames: decode.total,
          sampledFrames: decode.sampledFrames,
        };
        // A navigation discards the document, font set, GPU scene and module
        // cache. Keep the Chromium build, graphics flags and inputs fixed.
        await step("reload for fresh draws (frame n/a)", () => page.reload());
        const shuffled = await step("fresh shuffled draws (hash frames)", () =>
          page.evaluate(
            async ({ moduleURL, options, hashes }) => {
              const harness: Harness = await import(moduleURL);
              return harness.verifyShuffledDraws(options, hashes);
            },
            { moduleURL, options, hashes: result.hashes },
          ),
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
      });
    }
    await runFixture(
      url,
      "thumbnails",
      auxiliaryTimeoutMs,
      async (page, step) => {
        const result = await step(
          "encode three thumbnail PNGs (frame n/a)",
          () =>
            page.evaluate(async (moduleURL) => {
              const harness: Harness = await import(moduleURL);
              return harness.runThumbnails();
            }, moduleURL),
        );
        evidence.thumbnails = result.thumbnails;
        add("thumbnails", result.issues);
      },
    );
    for (const orientation of fallbackOrientations) {
      const scope = `fallback/${orientation}`;
      await runFixture(url, scope, auxiliaryTimeoutMs, async (page, step) => {
        const result = await step(
          "render and decode WebGL fallback (frame 75)",
          () =>
            page.evaluate(
              async ({ moduleURL, orientation }) => {
                const harness: Harness = await import(moduleURL);
                return harness.runFallback(orientation);
              },
              { moduleURL, orientation },
            ),
        );
        evidence[scope] = result;
        if (!result.passed)
          add(scope, [
            { criterion: "repeatability", detail: JSON.stringify(result) },
          ]);
      });
    }
  } catch (error) {
    block("harness", [...videoCriteria, "thumbnail"], error);
  }
  function score(
    selected: typeof issues,
    blocked: typeof harnessErrors,
    included?: Criterion[],
  ) {
    const ids = included ?? (Object.keys(rubric) as Criterion[]);
    const criteria = ids.map((id) => {
      const criterion = rubric[id];
      const failures = selected.filter((issue) => issue.criterion === id);
      const blockers = blocked.filter(({ criteria }) => criteria.includes(id));
      const status =
        criterion.assessable === 0
          ? "NOT_ASSESSABLE"
          : blockers.length
            ? "BLOCKED"
            : failures.length
              ? "FAIL"
              : "PASS";
      return {
        id,
        ...criterion,
        status,
        earned: status === "PASS" ? criterion.assessable : 0,
        failures,
        blockers,
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
          ({ scope }) =>
            !scope.includes("/") || scope.split("/")[1] === orientation,
        ),
      ),
    ]),
  );
  const byFixture = Object.fromEntries(
    Object.entries(fixtureCriteria).map(([scope, included]) => [
      scope,
      score(
        issues.filter((issue) => issue.scope === scope),
        harnessErrors.filter(
          (error) =>
            error.scope === scope ||
            (error.scope === "harness" && !evidence[scope]),
        ),
        included,
      ),
    ]),
  );
  const summary = `**Automated visual QA: ${earned} / ${assessable} assessable points · ${Math.round((100 * earned) / assessable)}%.**`;
  await testInfo.attach("visual-qa-report.json", {
    body: JSON.stringify(
      {
        version: 5,
        summary,
        earned,
        assessable,
        criteria,
        byOrientation,
        byFixture,
        harnessErrors,
        warnings,
        elapsedMs: performance.now() - started,
        timings,
        evidence,
      },
      null,
      2,
    ),
    contentType: "application/json",
  });
  console.log(summary);
  for (const [scope, result] of Object.entries(byFixture)) {
    const timing = timings[scope];
    const blocked = result.criteria.some(({ status }) => status === "BLOCKED");
    const status = blocked
      ? "BLOCKED"
      : result.earned < result.assessable
        ? "FAIL"
        : "PASS";
    const breakdown = timing
      ? [
          `total ${(timing.totalMs / 1000).toFixed(2)} s`,
          ...Object.entries(timing.stepsMs).map(
            ([step, ms]) => `${step} ${(ms / 1000).toFixed(2)} s`,
          ),
        ]
      : [];
    if (timing?.video) {
      const { renderMs, decodeMs, frames, sampledFrames } = timing.video;
      breakdown.push(
        `render ${(renderMs / 1000).toFixed(2)} s`,
        `decode ${(decodeMs / 1000).toFixed(2)} s`,
        `${sampledFrames} sampled of ${frames} decoded frames`,
      );
    }
    console.log(
      `${scope} ${status} ${result.earned}/${result.assessable} · ${breakdown.join(" · ") || "no fixture timing"}`,
    );
  }
  // The attachment has every occurrence. Keep the terminal failure focused.
  const firstFailures = criteria.flatMap(({ id, failures }) =>
    failures.length
      ? [{ criterion: id, count: failures.length, first: failures[0] }]
      : [],
  );
  expect(
    { harnessErrors, firstFailures },
    "Visual QA blocked evidence or rubric failures (full details in visual-qa-report.json)",
  ).toEqual({ harnessErrors: [], firstFailures: [] });
});
