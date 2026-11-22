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
const dist = process.argv[2] ?? "dist";
const paths = (await files(dist))
  .filter((path) => path !== join(dist, "sw.js"))
  .sort();
const hash = createHash("sha256");
hash.update(await readFile("scripts/build-sw.mjs"));
const assets = [];
for (const path of paths) {
  const data = await readFile(path);
  hash.update(data);
  assets.push({ path: "./" + relative(dist, path), sha256: digest(data) });
}
const index = assets.find((asset) => asset.path === "./index.html");
if (!index) throw new Error("Missing built index.html");
assets.push({ path: "./", sha256: index.sha256 });
const version = hash.digest("hex").slice(0, 16);
const sw = `
const SCOPE = self.registration.scope;
const PREFIX = 'podcast-shell:' + SCOPE + ':';
const CACHE = PREFIX + 'podcast-${version}';
const STATE = 'knowledge-podcast-release:' + SCOPE;
const VERSION = '${version}';
const ASSETS = ${JSON.stringify(assets)};
async function precache() {
  const existed = await caches.has(CACHE);
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
    if (!existed) await caches.delete(CACHE);
    throw error;
  }
}
self.addEventListener('install', event => event.waitUntil(precache()));
async function activateRelease() {
  const state = await caches.open(STATE);
  const record = await state.match(SCOPE);
  const last = record && await record.json();
  const owned = [];
  for (const name of await caches.keys()) {
    if (name.startsWith(PREFIX)) owned.push(name);
    else if (/^podcast-[0-9a-f]{16}$/.test(name)) {
      // Earlier builds used origin-wide names. Clean only a cache wholly owned by this app.
      const cache = await caches.open(name);
      if (await cache.match(SCOPE) && (await cache.keys()).every(key => key.url.startsWith(SCOPE))) owned.push(name);
    }
  }
  const previous = last?.active === CACHE ? last.previous : last?.active;
  const keep = owned.includes(previous) ? previous : owned.filter(name => name !== CACHE).at(-1);
  await state.put(SCOPE, new Response(JSON.stringify({active:CACHE, previous:keep})));
  await Promise.all(owned.filter(name => name !== CACHE && name !== keep).map(name => caches.delete(name)));
  await self.clients.claim();
}
self.addEventListener('activate', event => event.waitUntil(activateRelease()));
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
  if(url.pathname.startsWith("/api/")) return;
  if(event.request.method !== 'GET' || url.origin !== location.origin || !url.pathname.startsWith(self.registration.scope.replace(location.origin, ''))) return;
  event.respondWith((async () => {
    const scope = new URL(self.registration.scope);
    const shell = event.request.mode === 'navigate' &&
      (url.pathname === scope.pathname || url.pathname === scope.pathname + 'index.html');
    const key = shell ? scope : event.request;
    const hit = await (await caches.open(CACHE)).match(key, {ignoreVary:true});
    if(hit) return hit;
    // A tab opened before activation can still request the previous build's assets.
    const state = await (await caches.open(STATE)).match(SCOPE);
    const previous = state && (await state.json()).previous;
    if (previous) {
      const old = await caches.match(key, {cacheName:previous, ignoreVary:true});
      if (old) return old;
    }
    return fetch(event.request);
  })());
});`;
await writeFile(join(dist, "sw.js"), sw);
