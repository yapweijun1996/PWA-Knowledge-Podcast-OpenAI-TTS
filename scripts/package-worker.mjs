import { execFileSync } from "node:child_process";
import { lstatSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

const archive = process.argv[2] ?? "dist-worker/knowledge-podcast-worker.tar.gz";
const html = readFileSync("dist-private/index.html", "utf8");
const bundles = Array.from(
  html.matchAll(/(?:src|href)="[^"]*\/(assets\/[\w-]+\.(?:js|css))"/g),
  (match) => "dist-private/" + match[1],
);
if (![".js", ".css"].every((suffix) => bundles.some((file) => file.endsWith(suffix))))
  throw new Error("Missing private application bundle in the built shell");

// Package only named runtime files, even when the working tree contains operator data.
const files = [
  "package.json",
  "deploy/WORKER.md",
  ...["index.html", "sw.js", "manifest.webmanifest", "icon.svg", "icon-192.png",
      "icon-512.png", "pcm-capture-worklet.js"].map((file) => "dist-private/" + file),
  ...bundles,
  ...["audio", "http", "jobs", "main", "mp3", "production", "session", "store",
      "worker-lock"].map((file) => "server/" + file + ".mjs"),
  ...["audio-record", "edit", "episode-backup", "episode-record", "factory",
      "preferences"].map((file) => "shared/" + file + ".ts"),
  ...["claims", "errors", "languages", "openai", "qa", "research", "research-audit",
      "script", "transcript"].map((file) => "shared/pipeline/" + file + ".ts"),
];
for (const file of files) {
  if (!lstatSync(file).isFile()) throw new Error("Expected a regular release file: " + file);
}
mkdirSync(dirname(archive), { recursive: true });
execFileSync("tar", ["-czf", archive, ...files], {
  env: { ...process.env, COPYFILE_DISABLE: "1" },
});
