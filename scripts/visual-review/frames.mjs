import { build } from "vite";
import { chromium } from "playwright-core";
import http from "node:http"; import { writeFileSync, readFileSync, existsSync } from "node:fs"; import { join, extname } from "node:path";
import { fileURLToPath } from "node:url"; import { mkdirSync } from "node:fs";
const R = fileURLToPath(new URL("../..", import.meta.url)), HERE = R + "scripts/visual-review";
const D = process.argv[2]; if (!D) throw new Error("Usage: node scripts/visual-review/frames.mjs <output-dir> <jobs-json> [thumbs|thumbs-explicit]");
mkdirSync(D + "/out", { recursive: true });
await build({ root: R, configFile: false, logLevel: "error", publicDir: false, define: { "process.env.NODE_ENV": '"production"', "process.env": "{}" }, build: { outDir: D + "/out", emptyOutDir: true, minify: false, rollupOptions: { output: { codeSplitting: false } }, lib: { entry: HERE + "/entry.ts", formats: ["es"], fileName: () => "e.js" } } });
const types = { ".js": "text/javascript", ".woff2": "font/woff2", ".txt": "text/plain" };
const srv = http.createServer((q, r) => { const u = q.url.split("?")[0]; let f = u === "/e.js" ? D + "/out/e.js" : u.startsWith("/fonts/") ? R + "/public" + u : null; if (f && existsSync(f)) { r.setHeader("content-type", types[extname(f)] || "application/octet-stream"); return r.end(readFileSync(f)); } if (u === "/") { r.setHeader("content-type", "text/html"); return r.end("<title>v</title>"); } r.statusCode = 404; r.end(); });
await new Promise((ok) => srv.listen(0, "127.0.0.1", ok));
const b = await chromium.launch({ args: ["--enable-unsafe-swiftshader"] }); const p = await b.newPage(); p.on("pageerror", (e) => console.log("PAGEERR", String(e).slice(0, 300)));
await p.goto("http://127.0.0.1:" + srv.address().port);
const jobs = JSON.parse(process.argv[3]);
for (const j of jobs) {
  const res = await p.evaluate(async (o) => (await import("/e.js")).render(o), j);
  res.frames.forEach((f, i) => writeFileSync(`${D}/${j.name}-${i}.png`, Buffer.from(f.split(",")[1], "base64")));
  console.log(j.name, JSON.stringify({ mib: res.mib, ms: res.ms, dur: res.duration, scene: res.receipt.sceneId, orient: res.receipt.orientation, palette: res.receipt.paletteId, fonts: res.receipt.fontNotices, review: res.receipt.captionReviewCount, chapters: res.chapters.map((c) => c.timestamp + " " + c.title) }));
}
const thumbMode = process.argv[4];
if (thumbMode === "thumbs" || thumbMode === "thumbs-explicit") {
  const thumbs = await p.evaluate(async (mode) => {
    const entry = await import("/e.js");
    return mode === "thumbs-explicit" ? entry.thumbsExplicit() : entry.thumbs();
  }, thumbMode);
  const prefix = thumbMode === "thumbs-explicit" ? "thumb-explicit" : "thumb";
  thumbs.forEach((png, i) => writeFileSync(`${D}/${prefix}-${i}.png`, Buffer.from(png.split(",")[1], "base64")));
  console.log(thumbMode, thumbs.length);
}
await b.close(); srv.close();
