import { defineConfig } from "@playwright/test";

const port = process.env.PLAYWRIGHT_PORT || "4173";
const baseURL = `http://127.0.0.1:${port}/PWA-Knowledge-Podcast-OpenAI-TTS/`;

// The selected tests use free local demo audio and never require provider keys.
export default defineConfig({
  testDir: "./tests",
  testMatch: ["studio.spec.ts", "offline-demo.spec.ts"],
  grep: /save, simulate|responsive|offline demo/,
  use: { baseURL, browserName: "firefox" },
  workers: 1,
  webServer: {
    command: `npm run preview -- --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
  },
});
