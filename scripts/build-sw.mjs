import { readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, relative } from "node:path";
async function files(dir) {
  let out = [];
  for (const d of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, d.name);
    if (d.isDirectory()) out.push(...(await files(p)));
    else out.push(p);
  }
  return out;
}
const paths = (await files("dist")).sort();
const hash = createHash("sha256");
hash.update(await readFile("scripts/build-sw.mjs"));
for (const p of paths) hash.update(await readFile(p));
const version = hash.digest("hex").slice(0, 16);
const urls = paths.map((p) => "./" + relative("dist", p));
urls.push("./");
const sw = `const CACHE='podcast-${version}';const URLS=${JSON.stringify(urls)};self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(URLS))));self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('podcast-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));self.addEventListener('message',event=>{if(event.data==='SKIP_WAITING')self.skipWaiting()});self.addEventListener('fetch',event=>{const u=new URL(event.request.url);if(event.request.method!=='GET'||u.origin!==location.origin||!u.pathname.startsWith(self.registration.scope.replace(location.origin,'')))return;event.respondWith(caches.open(CACHE).then(cache=>cache.match(event.request,{ignoreVary:true})).then(hit=>hit||fetch(event.request)))})`;
await writeFile("dist/sw.js", sw);
