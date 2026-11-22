import { defineConfig } from "@playwright/test";
const port = process.env.PLAYWRIGHT_PORT ?? "4173";
const baseURL = `http://127.0.0.1:${port}/PWA-Knowledge-Podcast-OpenAI-TTS/`;

export default defineConfig({
  testDir: "./tests",
  testMatch: "*.spec.ts",
  use: {
    baseURL,
    browserName: "chromium",
  },
  workers: 1,
  webServer: {
    command: `npm run preview -- --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
  },
});
