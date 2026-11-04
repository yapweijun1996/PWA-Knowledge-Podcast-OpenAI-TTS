import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: "*.spec.ts",
  use: {
    baseURL: "http://127.0.0.1:4173/PWA-Knowledge-Podcast-OpenAI-TTS/",
    browserName: "chromium",
  },
  workers: 1,
  webServer: {
    command: "npm run preview",
    url: "http://127.0.0.1:4173/PWA-Knowledge-Podcast-OpenAI-TTS/",
    reuseExistingServer: true,
  },
});
