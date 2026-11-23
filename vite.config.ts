import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { contentSecurityPolicy } from "./config/csp.ts";
import { studioBase } from "./shared/factory.ts";

// GitHub Pages cannot set response headers. Enforce this policy in built HTML;
// Vite's development server needs its own injected styles and HMR connection.
export default defineConfig(({ mode }) => ({
  base: studioBase,
  worker: { format: "es" },
  build: { outDir: mode === "private" ? "dist-private" : "dist" },
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
              content: contentSecurityPolicy(),
            },
            injectTo: "head-prepend",
          },
        ],
      },
    },
  ],
}));
