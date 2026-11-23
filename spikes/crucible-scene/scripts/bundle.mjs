import { copyFile, readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { build, version as viteVersion } from "vite";

const spikePath = (path) => fileURLToPath(new URL(path, import.meta.url));
const crucibleModule = /[/\\]node_modules[/\\]@codepawlhq[/\\]crucible[/\\]/;
const threeModule = /[/\\]node_modules[/\\]three[/\\]/;
const graphs = {};

function sizeReport(mode) {
  return {
    name: `crucible-size-${mode}`,
    generateBundle(_options, bundle) {
      const chunks = new Map();
      const threeModules = new Set();
      const threeAddons = new Set();
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== "chunk") continue;
        const ids = Object.entries(chunk.modules)
          .filter(([, module]) => module.renderedLength > 0)
          .map(([id]) => id.replaceAll("\\", "/"));
        for (const id of ids) {
          if (threeModule.test(id)) {
            threeModules.add(id.split("/node_modules/three/").at(-1));
            const addon = id.split("/node_modules/three/examples/jsm/")[1];
            if (addon) threeAddons.add(addon);
          }
          if (crucibleModule.test(id) && /\/gltf-meshopt-[^/]+\.js$/.test(id))
            threeAddons.add(
              "libs/meshopt_decoder.module.js (vendored in Crucible)",
            );
        }
        const sourceModules = ids.filter((id) => !id.startsWith("\0"));
        chunks.set(chunk.fileName, {
          entry: chunk.isEntry,
          imports: chunk.imports,
          crucible:
            sourceModules.length > 0 &&
            sourceModules.every((id) => crucibleModule.test(id)),
        });
      }
      graphs[mode] = {
        chunks,
        threeModules: [...threeModules].sort(),
        threeAddons: [...threeAddons].sort(),
      };
    },
  };
}

const codeSplitting = {
  groups: [
    {
      name: "crucible",
      tags: ["$initial"],
      test: crucibleModule,
      includeDependenciesRecursively: false,
    },
  ],
};

const dist = spikePath("../dist/");
await build({
  root: spikePath("../harness/"),
  configFile: false,
  envDir: false,
  publicDir: false,
  cacheDir: spikePath("../dist/.vite/"),
  logLevel: "warn",
  plugins: [sizeReport("main")],
  worker: {
    format: "es",
    plugins: () => [sizeReport("worker")],
    rolldownOptions: { output: { codeSplitting } },
  },
  build: {
    outDir: dist,
    emptyOutDir: true,
    rolldownOptions: { output: { codeSplitting } },
  },
});

const noticeRoot = spikePath("../node_modules/@codepawlhq/crucible/");
await Promise.all([
  copyFile(noticeRoot + "LICENSE", dist + "CRUCIBLE-LICENSE.txt"),
  copyFile(
    noticeRoot + "THIRD-PARTY-NOTICES.md",
    dist + "THIRD-PARTY-NOTICES.md",
  ),
]);

const files = (await readdir(dist + "assets")).filter((name) =>
  name.endsWith(".js"),
);
const sizes = new Map(
  await Promise.all(
    files.map(async (name) => {
      const file = `assets/${name}`;
      const code = await readFile(dist + file);
      return [
        file,
        { minifiedBytes: code.length, gzipBytes: gzipSync(code).length },
      ];
    }),
  ),
);

function sumSizes(files) {
  const total = { minifiedBytes: 0, gzipBytes: 0 };
  for (const file of files) {
    const { minifiedBytes, gzipBytes } = sizes.get(file);
    total.minifiedBytes += minifiedBytes;
    total.gzipBytes += gzipBytes;
  }
  return total;
}

const reports = {};
const listedFiles = new Set();
for (const [mode, { chunks, threeModules, threeAddons }] of Object.entries(
  graphs,
)) {
  const initial = new Set();
  function visit(file) {
    if (initial.has(file)) return;
    initial.add(file);
    chunks.get(file).imports.forEach(visit);
  }
  for (const [file, chunk] of chunks) {
    listedFiles.add(file);
    if (chunk.entry) visit(file);
  }
  const crucible = [...chunks.keys()].filter(
    (file) => chunks.get(file).crucible,
  );
  reports[mode] = {
    startupFiles: [...initial],
    startupJavaScript: sumSizes(initial),
    startupCrucible: sumSizes(crucible.filter((file) => initial.has(file))),
    emittedCrucible: sumSizes(crucible),
    threeModules,
    threeAddons,
  };
}
const otherFiles = [...sizes.keys()].filter((file) => !listedFiles.has(file));
console.log(
  JSON.stringify(
    {
      viteVersion,
      ...reports,
      otherJavaScriptAssets: otherFiles.map((file) => ({
        file,
        ...sizes.get(file),
      })),
      allJavaScript: sumSizes(sizes.keys()),
    },
    null,
    2,
  ),
);
