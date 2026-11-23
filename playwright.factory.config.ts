import { defineConfig } from "@playwright/test";

const port = process.env.PLAYWRIGHT_FACTORY_PORT ?? "8797";
const baseURL = `http://127.0.0.1:${port}`;
const webkit = process.env.PLAYWRIGHT_FACTORY_BROWSER === "webkit";
const browserName = webkit ? "webkit" : ("chromium" as const);
// Real video renders (especially software WebGL) saturate the CPU. Run them
// alone, after the rest, so timing-sensitive tests are not starved.
const renderTests = /(factory-video(-3d)?|visual-qa)\.browser\.ts$/;

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
      testIgnore: renderTests,
    },
    {
      name: "render",
      testMatch: renderTests,
      dependencies: ["factory"],
      fullyParallel: false,
      workers: 1,
    },
  ],
});
