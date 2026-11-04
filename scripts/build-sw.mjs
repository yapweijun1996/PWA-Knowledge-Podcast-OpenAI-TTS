import { readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, relative } from "node:path";

async function files(dir) {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) result.push(...(await files(path)));
    else result.push(path);
  }
  return result;
}
const digest = (data) => createHash("sha256").update(data).digest("hex");
const paths = (await files("dist")).sort();
const hash = createHash("sha256");
hash.update(await readFile("scripts/build-sw.mjs"));
const assets = [];
for (const path of paths) {
  const data = await readFile(path);
  hash.update(data);
  assets.push({ path: "./" + relative("dist", path), sha256: digest(data) });
}
const index = assets.find((asset) => asset.path === "./index.html");
if (!index) throw new Error("Missing built index.html");
assets.push({ path: "./", sha256: index.sha256 });
const version = hash.digest("hex").slice(0, 16);
const sw = `
const CACHE = 'podcast-${version}';
const VERSION = '${version}';
const ASSETS = ${JSON.stringify(assets)};
async function precache() {
  const cache = await caches.open(CACHE);
  try {
    for (const asset of ASSETS) {
      const key = new URL(asset.path, self.registration.scope);
      const url = new URL(key);
      url.searchParams.set('__sw', VERSION);
      const response = await fetch(url, {cache:'no-store', credentials:'same-origin', redirect:'error'});
      if (!response.ok) throw new Error('Asset unavailable');
      const bytes = await response.clone().arrayBuffer();
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b=>b.toString(16).padStart(2,'0')).join('');
      if (hash !== asset.sha256) throw new Error('Asset integrity mismatch');
      await cache.put(key, response);
    }
  } catch (error) {
    await caches.delete(CACHE);
    throw error;
  }
}
self.addEventListener('install', event => event.waitUntil(precache()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('message', event => {
  if(event.data !== 'SKIP_WAITING' && event.data !== 'SKIP_WAITING_IF_SINGLE') return;
  event.waitUntil((async () => {
    const scope = new URL(self.registration.scope);
    const windows = await self.clients.matchAll({type:'window', includeUncontrolled:true});
    const relevant = windows.filter(client => {
      const url = new URL(client.url);
      return url.origin === scope.origin && url.pathname.startsWith(scope.pathname);
    });
    if(relevant.length > 1) { event.ports[0]?.postMessage({ok:false}); return; }
    event.ports[0]?.postMessage({ok:true});
    await self.skipWaiting();
  })());
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if(event.request.method !== 'GET' || url.origin !== location.origin || !url.pathname.startsWith(self.registration.scope.replace(location.origin, ''))) return;
  event.respondWith((async () => {
    const hit = await (await caches.open(CACHE)).match(event.request, {ignoreVary:true});
    if(hit) return hit;
    // Retain prior versioned assets for tabs that were already open at activation.
    for(const name of await caches.keys()) {
      if(name.startsWith('podcast-') && name !== CACHE) {
        const old = await (await caches.open(name)).match(event.request, {ignoreVary:true});
        if(old) return old;
      }
    }
    return fetch(event.request);
  })());
});`;
await writeFile("dist/sw.js", sw);
