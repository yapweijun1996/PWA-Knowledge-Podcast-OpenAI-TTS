import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { videoFontAssets } from "../src/video/fonts/manifest.ts";

const archive = resolve(process.argv[2]);
const root = await mkdtemp(join(tmpdir(), "podcast-release-"));
let worker;
let exit;
try {
  execFileSync("tar", ["-xzf", archive, "-C", root]);
  const reservation = createServer();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const port = reservation.address().port;
  await new Promise((done) => reservation.close(done));
  worker = spawn(process.execPath, ["server/main.mjs"], {
    cwd: root,
    env: {
      PATH: process.env.PATH,
      PODCAST_PORT: String(port),
      PODCAST_DATA_DIR: join(root, "spool"),
    },
    stdio: ["ignore", "pipe", "inherit"],
  });
  exit = once(worker, "exit");
  await Promise.race([
    once(worker.stdout, "data"),
    exit.then(() => {
      throw Error("Worker exited before startup");
    }),
    delay(15000, undefined, { ref: false }).then(() => {
      throw Error("Worker startup timed out");
    }),
  ]);
  const url = "http://127.0.0.1:" + port;
  const session = await fetch(url + "/api/studio/session");
  assert.equal(session.headers.get("cache-control"), "no-store");
  const runtime = await session.json();
  assert.equal(runtime.localProduction, true);
  assert.equal(runtime.configured, false);
  const shell = await fetch(url);
  assert.equal(shell.status, 200);
  const html = await shell.text();
  assert.match(html, /manifest.webmanifest/);
  assert.match(html.replaceAll("&#39;", "'"), /\bfont-src 'self';/);
  const sw = await fetch(new URL("sw.js", shell.url));
  assert.equal(sw.status, 200);
  const serviceWorker = await sw.text();
  assert.match(serviceWorker, /addEventListener\('install'/);
  const precache = JSON.parse(serviceWorker.match(/^const ASSETS = (.+);$/m)[1]);
  const precachePaths = new Set(precache.map(({ path }) => path));
  for (const path of videoFontAssets)
    assert.ok(precachePaths.has(`./${path}`), `Missing precached font asset: ${path}`);
  for (const asset of precache) {
    const response = await fetch(new URL(asset.path, sw.url));
    assert.equal(response.status, 200, asset.path);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(createHash("sha256").update(bytes).digest("hex"), asset.sha256, asset.path);
    if (asset.path.endsWith(".woff2"))
      assert.equal(response.headers.get("content-type"), "font/woff2", asset.path);
  }
  console.log(
    "Packaged worker served its private shell, precached fonts and keyless session.",
  );
} finally {
  if (worker && worker.exitCode === null && !worker.signalCode)
    worker.kill("SIGTERM");
  if (exit) await exit;
  await rm(root, { recursive: true, force: true });
}
