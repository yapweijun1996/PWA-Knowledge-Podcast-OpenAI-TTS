import { fileURLToPath } from "node:url";
import { build } from "vite";

const spikePath = (path) => fileURLToPath(new URL(path, import.meta.url));

await build({
  root: spikePath("../harness/"),
  configFile: false,
  envDir: false,
  publicDir: false,
  cacheDir: spikePath("../dist/.vite/"),
  worker: { format: "es" },
  build: {
    outDir: spikePath("../dist/"),
    emptyOutDir: true,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [{ name: "three", test: /[/\\]node_modules[/\\]three[/\\]/ }],
        },
      },
    },
  },
});
