import { access, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const dist = fileURLToPath(new URL("../dist", import.meta.url));
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};
const [resolution = "1080p", ...extraArgs] = process.argv.slice(2);
if (extraArgs.length || !["1080p", "720p"].includes(resolution)) {
  throw new Error(
    "Usage: node spikes/three-scene/scripts/probe.mjs [1080p|720p]",
  );
}
await access(resolve(dist, "index.html"));

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://127.0.0.1");
    const asset =
      url.pathname === "/"
        ? "index.html"
        : decodeURIComponent(url.pathname.slice(1));
    const path = resolve(dist, asset);
    const type = mime[extname(path)];
    if (request.method !== "GET" || !path.startsWith(dist + sep) || !type) {
      response.writeHead(404).end();
      return;
    }
    const contents = await readFile(path);
    response
      .writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" })
      .end(contents);
  } catch {
    response.writeHead(404).end();
  }
});

await new Promise((listening, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", listening);
});

let browser;
try {
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader"] });
  const context = await browser.newContext({ serviceWorkers: "block" });
  await context.route("**/*", (route) =>
    new URL(route.request().url()).origin === origin
      ? route.continue()
      : route.abort(),
  );
  const page = await context.newPage();
  page.on("pageerror", (error) => console.error(error));
  await page.goto(`${origin}/?autorun=1&resolution=${resolution}`);
  const handle = await page.waitForFunction(
    () => window.threeSceneResult,
    undefined,
    {
      polling: 100,
      timeout: 300_000,
    },
  );
  const result = await handle.jsonValue();
  console.log(
    JSON.stringify({ chromiumVersion: browser.version(), ...result }, null, 2),
  );
  if (result.main.status !== "PASS" || result.worker.status !== "PASS")
    process.exitCode = 1;
} finally {
  try {
    await browser?.close();
  } finally {
    await new Promise((closed) => server.close(closed));
  }
}
