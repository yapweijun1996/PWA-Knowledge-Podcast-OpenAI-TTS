import { defineConfig } from "@playwright/test";

const port = process.env.PLAYWRIGHT_FACTORY_PORT ?? "8797";
const baseURL = `http://127.0.0.1:${port}`;
const webkit = process.env.PLAYWRIGHT_FACTORY_BROWSER === "webkit";

export default defineConfig({
  testDir: "./tests",
  testMatch: "factory*.browser.ts",
  grep: webkit ? /manual Studio creation/ : undefined,
  use: { baseURL, browserName: webkit ? "webkit" : "chromium" },
  webServer: {
    command: "node tests/fixtures/factory-server.mjs",
    url: baseURL,
    env: { PLAYWRIGHT_FACTORY_PORT: port },
  },
});
