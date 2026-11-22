import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "factory*.browser.ts",
  use: { baseURL: "http://127.0.0.1:8797", browserName: "chromium" },
  webServer: {
    command: "node tests/fixtures/factory-server.mjs",
    url: "http://127.0.0.1:8797",
  },
});
