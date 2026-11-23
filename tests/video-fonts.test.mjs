import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { brotliDecompressSync } from "node:zlib";
import { studioBase } from "../shared/factory.ts";
import { scCoverageBase64 } from "../src/video/fonts/coverage-data.ts";
import {
  ensureVideoFonts,
  missingCharacters,
  videoFont,
  videoFontFamilies,
} from "../src/video/fonts/loader.ts";
import {
  matchesVideoFontIntegrity,
  videoFontManifest,
} from "../src/video/fonts/manifest.ts";

const fontsDirectory = new URL("../public/fonts/", import.meta.url);
const filenames = Object.fromEntries(
  videoFontManifest.shards.map(({ id, file }) => [id, file]),
);

// Read the BMP cmap shared by the Unicode and Windows entries of these WOFF2s.
function cmapCharacters(woff) {
  let cursor = 48;
  let offset = 0;
  let cmap;
  function readBase128() {
    let length = 0;
    let byte;
    do {
      byte = woff[cursor++];
      length = length * 128 + (byte & 0x7f);
    } while (byte & 0x80);
    return length;
  }
  for (let index = 0; index < woff.readUInt16BE(12); index++) {
    const flags = woff[cursor++];
    const tag = flags & 0x3f;
    const version = flags >> 6;
    if (tag === 63) cursor += 4;
    const length = readBase128();
    if (tag === 0) cmap = { offset, length };
    // The known WOFF2 glyf and loca tags use transform version zero.
    const transformed =
      tag === 10 || tag === 11 ? version === 0 : version !== 0;
    offset += transformed ? readBase128() : length;
  }
  assert.ok(cmap);
  const stream = brotliDecompressSync(
    woff.subarray(cursor, cursor + woff.readUInt32BE(20)),
  );
  const table = stream.subarray(cmap.offset, cmap.offset + cmap.length);
  const subtable = table.subarray(table.readUInt32BE(8));
  assert.equal(subtable.readUInt16BE(0), 4);
  const segmentCount = subtable.readUInt16BE(6) / 2;
  const characters = new Set();
  for (let index = 0; index < segmentCount; index++) {
    const end = subtable.readUInt16BE(14 + index * 2);
    const start = subtable.readUInt16BE(16 + (segmentCount + index) * 2);
    const delta = subtable.readInt16BE(16 + (segmentCount * 2 + index) * 2);
    const offsetIndex = 16 + (segmentCount * 3 + index) * 2;
    const glyphOffset = subtable.readUInt16BE(offsetIndex);
    for (let point = start; point <= end; point++) {
      const glyph = glyphOffset
        ? subtable.readUInt16BE(offsetIndex + glyphOffset + (point - start) * 2)
        : point;
      if ((!glyphOffset || glyph !== 0) && ((glyph + delta) & 0xffff) !== 0) {
        characters.add(String.fromCodePoint(point));
      }
    }
  }
  return characters;
}

test("the versioned font manifest pins real WOFF2 payloads and exact coverage", () => {
  assert.equal(videoFontManifest.version, 1);
  const cMaps = {};
  for (const shard of videoFontManifest.shards) {
    const bytes = readFileSync(new URL(shard.file, fontsDirectory));
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    assert.equal(bytes.byteLength, shard.bytes, shard.id);
    assert.equal(sha256, shard.sha256, shard.id);
    assert.equal(bytes.toString("ascii", 0, 4), "wOF2", shard.id);
    assert.ok(matchesVideoFontIntegrity(shard, bytes, sha256));
    assert.equal(matchesVideoFontIntegrity(shard, bytes, "wrong"), false);
    assert.equal(
      matchesVideoFontIntegrity(shard, bytes.subarray(1), sha256),
      false,
    );
    const glyphs = (cMaps[shard.id] = cmapCharacters(bytes));
    if (!shard.coverageFile) continue;
    const text = readFileSync(
      new URL(shard.coverageFile, fontsDirectory),
      "utf8",
    );
    assert.equal(
      Buffer.from(scCoverageBase64[shard.id], "base64").toString("utf8"),
      text,
    );
    const listed = new Set(text);
    assert.equal(listed.size, [...text].length, "coverage entries are unique");
    assert.equal(
      [...listed].filter((character) => /[\u4e00-\u9fff]/u.test(character))
        .length,
      shard.id === "sc-core" ? 3755 : 3008,
    );
    if (shard.id === "sc-core") {
      assert.equal(listed.size, 3880);
      for (let point = 0x20; point <= 0x7e; point++)
        listed.add(String.fromCodePoint(point));
    }
    assert.deepEqual(glyphs, listed);
  }
  assert.equal(cMaps.latin.size, 356);
  assert.deepEqual(
    missingCharacters([
      ...Object.values(cMaps).map((glyphs) => [...glyphs].join("")),
    ]),
    [],
  );
});

const deferred = () => Promise.withResolvers();

function fakeFonts({
  fetchResult,
  loadResult,
  ready = Promise.resolve(),
  baseURL,
} = {}) {
  const requests = [];
  const faces = [];
  const added = [];
  const fonts = {
    add(face) {
      added.push(face);
    },
    ready,
  };
  const environment = {
    baseURL,
    fonts,
    async fetch(url) {
      requests.push(url);
      return (
        fetchResult?.(url) ??
        new Response(new Uint8Array([0x77, 0x4f, 0x46, 0x32]))
      );
    },
    FontFace: class {
      constructor(family, source, descriptors) {
        this.family = family;
        this.source = source;
        this.descriptors = descriptors;
        faces.push(this);
      }
      async load() {
        await loadResult?.(this);
        return this;
      }
    },
  };
  return { environment, requests, faces, added };
}

test("preflight loads core and Latin at the app base and only requests level 2 when needed", async () => {
  const { environment, requests, faces, added } = fakeFonts();
  assert.deepEqual(
    await ensureVideoFonts({
      texts: ["组屋里的混居，Café dan komuniti."],
      environment,
    }),
    {
      notices: [],
      missingCharacters: [],
    },
  );
  const expected = [filenames["sc-core"], filenames.latin].map(
    (file) => `${studioBase}fonts/${file}`,
  );
  assert.deepEqual(requests, expected);
  assert.deepEqual(new Set(added), new Set(faces));
  assert.deepEqual(
    faces.map(({ family, descriptors }) => [family, descriptors.weight]),
    [
      [videoFontFamilies.sc, "600 800"],
      [videoFontFamilies.latin, "600 800"],
    ],
  );
  assert.match(
    videoFont(800, 54),
    /^800 54px "PS Noto Sans SC", "PS Noto Sans"/,
  );
  assert.deepEqual(await ensureVideoFonts({ texts: ["亍"], environment }), {
    notices: [],
    missingCharacters: [],
  });
  assert.deepEqual(requests, [
    ...expected,
    `${studioBase}fonts/${filenames["sc-l2"]}`,
  ]);
  assert.equal(added.length, 3);
});

test("preflight waits for every face and the font set and deduplicates concurrent calls per set", async () => {
  const face = deferred();
  const ready = deferred();
  const { environment, requests, added } = fakeFonts({
    loadResult: () => face.promise,
    ready: ready.promise,
    baseURL: "/nested/app",
  });
  let done = false;
  const first = ensureVideoFonts({ texts: [], environment }).then(() => {
    done = true;
  });
  const second = ensureVideoFonts({ texts: [], environment });
  await new Promise(setImmediate);
  assert.equal(done, false);
  assert.deepEqual(added, []);
  assert.deepEqual(requests, [
    `/nested/app/fonts/${filenames["sc-core"]}`,
    `/nested/app/fonts/${filenames.latin}`,
  ]);
  face.resolve();
  await new Promise(setImmediate);
  assert.equal(added.length, 2);
  assert.equal(done, false);
  ready.resolve();
  await Promise.all([first, second]);
  assert.equal(done, true);
  const other = fakeFonts();
  await ensureVideoFonts({ texts: [], environment: other.environment });
  assert.equal(other.requests.length, 2);
});

test("missing glyphs, failed shards and missing font API produce diagnostic codes", async () => {
  const texts = ["中文\n café\t→🪷𠮷", "🪷"];
  assert.deepEqual(missingCharacters(texts), ["🪷", "𠮷"]);
  assert.deepEqual(await ensureVideoFonts({ texts }), {
    notices: ["font.missingCharacters", "font.apiUnavailable"],
    missingCharacters: ["🪷", "𠮷"],
  });
  let level2Fails = true;
  const { environment, requests } = fakeFonts({
    fetchResult: (url) =>
      url.endsWith(filenames["sc-l2"]) && level2Fails
        ? new Response(null, { status: 404 })
        : undefined,
    loadResult: (face) => {
      if (face.family === videoFontFamilies.latin)
        throw new Error("Invalid font data");
    },
  });
  assert.deepEqual(
    await ensureVideoFonts({ texts: [...texts, "亍"], environment }),
    {
      notices: [
        "font.missingCharacters",
        "font.shardUnavailable.latin",
        "font.shardUnavailable.sc-l2",
      ],
      missingCharacters: ["🪷", "𠮷"],
    },
  );
  level2Fails = false;
  assert.deepEqual(await ensureVideoFonts({ texts: ["亍"], environment }), {
    notices: ["font.shardUnavailable.latin"],
    missingCharacters: [],
  });
  assert.equal(requests.length, 5);
});

test("abort rejects the caller before loading or while waiting without discarding shared faces", async () => {
  const ready = deferred();
  const { environment, requests } = fakeFonts({ ready: ready.promise });
  const cancelled = new AbortController();
  cancelled.abort();
  await assert.rejects(
    ensureVideoFonts({ texts: [], environment, signal: cancelled.signal }),
    { name: "AbortError" },
  );
  assert.deepEqual(requests, []);

  const controller = new AbortController();
  const pending = ensureVideoFonts({
    texts: [],
    environment,
    signal: controller.signal,
  });
  await new Promise(setImmediate);
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
  ready.resolve();
  assert.deepEqual(await ensureVideoFonts({ texts: [], environment }), {
    notices: [],
    missingCharacters: [],
  });
  assert.equal(requests.length, 2);
});

test("preflight uses the worker font set when there is no document", async (t) => {
  const { environment, added } = fakeFonts();
  const descriptors = Object.getOwnPropertyDescriptors(globalThis);
  t.after(() => {
    for (const key of ["FontFace", "fonts", "fetch"]) {
      if (descriptors[key])
        Object.defineProperty(globalThis, key, descriptors[key]);
      else delete globalThis[key];
    }
  });
  Object.assign(globalThis, {
    FontFace: environment.FontFace,
    fonts: environment.fonts,
    fetch: environment.fetch,
  });
  assert.deepEqual(await ensureVideoFonts({ texts: ["亍"] }), {
    notices: [],
    missingCharacters: [],
  });
  assert.equal(added.length, 3);
});
