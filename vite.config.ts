import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages cannot set response headers. Enforce this policy in built HTML;
// Vite's development server needs its own injected styles and HMR connection.
const contentSecurityPolicy = [
  "default-src 'none'",
  "base-uri 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "form-action 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self' https://api.openai.com blob:",
  "media-src 'self' blob: mediastream:",
  "worker-src 'self'",
  "manifest-src 'self'",
].join("; ");

export default defineConfig({
  base: "/PWA-Knowledge-Podcast-OpenAI-TTS/",
  plugins: [
    react(),
    {
      name: "pages-content-security-policy",
      apply: "build",
      transformIndexHtml: {
        order: "pre",
        handler: () => [
          {
            tag: "meta",
            attrs: {
              "http-equiv": "Content-Security-Policy",
              content: contentSecurityPolicy,
            },
            injectTo: "head-prepend",
          },
        ],
      },
    },
  ],
});
