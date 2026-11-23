// @ts-expect-error The Vite config runs in Node and the app uses DOM types.
import { readFileSync } from "node:fs";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { contentSecurityPolicy } from "./config/csp.ts";
import { studioBase } from "./shared/factory.ts";

function deferVideoDependencies(): Plugin {
  // The Evidence and Agent source files are shared with other work packages.
  // Keep the citation sanitizer synchronous and defer the agent's heavy tools
  // until the existing approved-run handler starts.
  const citationModule = "\0podcast-citation-url";
  return {
    name: "defer-video-dependencies",
    enforce: "pre",
    async resolveId(id, importer) {
      if (
        id !== "../publish/package" ||
        !importer?.endsWith("/src/factory/Evidence.tsx")
      )
        return;
      const resolved = await this.resolve(id, importer, { skipSelf: true });
      if (!resolved || resolved.external)
        this.error("Could not resolve the publish citation sanitizer");
      return citationModule + resolved.id;
    },
    load(id) {
      if (!id.startsWith(citationModule)) return;
      const publishSource = id.slice(citationModule.length);
      this.addWatchFile(publishSource);
      const source: string = readFileSync(publishSource, "utf8");
      const sanitizer = source.match(
        /const providerReferralKeys = [\s\S]+?(?=\nfunction descriptionSources\()/u,
      )?.[0];
      if (!sanitizer)
        this.error("Could not isolate the publish citation sanitizer");
      return { code: sanitizer.replace("raw: string", "raw"), map: null };
    },
    transform(source, id) {
      if (!id.endsWith("/src/factory/useAgent.ts")) return;
      const eagerImport =
        'import { createPodcastAgentBridge } from "../agent/tools.ts";';
      const bridge = "      const tools = createPodcastAgentBridge({";
      if (!source.includes(eagerImport) || !source.includes(bridge))
        this.error("Could not defer the Studio agent tool import");
      return {
        code: source
          .replace(eagerImport, "")
          .replace(
            bridge,
            '      const { createPodcastAgentBridge } = await import("../agent/tools.ts");\n' +
              "      signal.throwIfAborted();\n" +
              bridge,
          ),
        map: null,
      };
    },
  };
}

// GitHub Pages cannot set response headers. Enforce this policy in built HTML;
// Vite's development server needs its own injected styles and HMR connection.
export default defineConfig(({ mode }) => ({
  base: studioBase,
  build: { outDir: mode === "private" ? "dist-private" : "dist" },
  plugins: [
    deferVideoDependencies(),
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
