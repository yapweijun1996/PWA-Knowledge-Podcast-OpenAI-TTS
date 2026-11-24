import { defineConfig } from "@playwright/test";

const port = process.env.PLAYWRIGHT_FACTORY_PORT ?? "8797";
const baseURL = `http://127.0.0.1:${port}`;
const webkit = process.env.PLAYWRIGHT_FACTORY_BROWSER === "webkit";
const browserName = webkit ? "webkit" : ("chromium" as const);
// Real video renders (especially software WebGL) saturate the CPU. Run them
// alone, after the rest, so timing-sensitive tests are not starved.
const renderTests = /(factory-video(-3d)?|visual-qa)\.browser\.ts$/;
const budgetTest = /factory-video-3d-budget\.browser\.ts$/;

export default defineConfig({
  testDir: "./tests",
  grep: webkit ? /manual Studio creation/ : undefined,
  use: { baseURL, browserName },
  webServer: {
    command: "node tests/fixtures/factory-server.mjs",
    url: baseURL,
    env: { PLAYWRIGHT_FACTORY_PORT: port },
  },
  projects: [
    {
      name: "factory",
      testMatch: "factory*.browser.ts",
      testIgnore: [renderTests, budgetTest],
    },
    {
      name: "render",
      testMatch: renderTests,
      dependencies: ["factory"],
      fullyParallel: false,
      workers: 1,
    },
    {
      name: "perf",
      testMatch: budgetTest,
      dependencies: ["render"],
      workers: 1,
    },
  ],
});
