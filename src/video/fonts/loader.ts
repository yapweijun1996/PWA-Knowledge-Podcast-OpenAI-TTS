import { studioBase } from "../../../shared/factory.ts";
import { scCoverageBase64 } from "./coverage-data.ts";
import { type VideoFontShard, videoFontManifest } from "./manifest.ts";

export { videoFontFamilies } from "./manifest.ts";

/** CSS font-family list: bundled faces first, then tested system fallbacks. */
export const videoFontStack =
  '"PS Noto Sans SC", "PS Noto Sans", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';

export type VideoFontWeight = 600 | 700 | 800;

/** A canvas `font` shorthand: weight, size in pixels, family list. */
export function videoFont(weight: VideoFontWeight, sizePx: number): string {
  return `${weight} ${Math.round(sizePx * 100) / 100}px ${videoFontStack}`;
}

export type FontPreflight = {
  /** Stable diagnostic codes for the render receipt. */
  notices: string[];
  /** Characters in the supplied texts that no bundled face covers. */
  missingCharacters: string[];
};

export type VideoFontEnvironment = {
  baseURL?: string;
  fetch: typeof fetch;
  FontFace: typeof FontFace;
  fonts: Pick<FontFaceSet, "add" | "ready">;
};

function coverageSet(base64: string) {
  return new Set(
    new TextDecoder().decode(
      Uint8Array.from(atob(base64), (byte) => byte.charCodeAt(0)),
    ),
  );
}

const coreCoverage = coverageSet(scCoverageBase64["sc-core"]);
const level2Coverage = coverageSet(scCoverageBase64["sc-l2"]);
// Exact Latin cmap ranges. Core's additional ASCII is also covered here.
const latinRanges = [
  [0x20, 0x7e],
  [0xa0, 0x17f],
  [0x2010, 0x2027],
  [0x2030, 0x203a],
  [0x20ac, 0x20ac],
  [0x2122, 0x2122],
] as const;
const unicodeRange = (first: number, last: number) =>
  `U+${first.toString(16)}-${last.toString(16)}`;
const descriptors = {
  // Exclude the Latin face's coverage so the SC-first stack uses Noto Sans
  // for Latin while keeping SC for Han and full-width punctuation.
  "sc-core": [
    ...latinRanges.map(([first], index) =>
      unicodeRange(index === 0 ? 0 : latinRanges[index - 1][1] + 1, first - 1),
    ),
    unicodeRange(latinRanges[latinRanges.length - 1][1] + 1, 0xffff),
  ].join(", "),
  latin: latinRanges
    .map(([first, last]) => unicodeRange(first, last))
    .join(", "),
  "sc-l2": "U+4E00-9FFF",
} as const;

/** Find distinct uncovered code points in first-occurrence order. */
export function missingCharacters(texts: readonly string[]): string[] {
  const missing = new Set<string>();
  for (const text of texts) {
    for (const character of text) {
      const point = character.codePointAt(0)!;
      if (
        /[\t\n\v\f\r]/u.test(character) ||
        coreCoverage.has(character) ||
        level2Coverage.has(character) ||
        latinRanges.some(([first, last]) => point >= first && point <= last)
      )
        continue;
      missing.add(character);
    }
  }
  return [...missing];
}

function browserFontEnvironment(): VideoFontEnvironment | undefined {
  const scope = globalThis as typeof globalThis & { fonts?: FontFaceSet };
  const fonts = scope.document?.fonts ?? scope.fonts;
  if (
    !fonts ||
    typeof globalThis.FontFace !== "function" ||
    typeof globalThis.fetch !== "function"
  ) {
    return undefined;
  }
  return {
    fetch: globalThis.fetch.bind(globalThis),
    FontFace: globalThis.FontFace,
    fonts,
  };
}

const facesBySet = new WeakMap<
  VideoFontEnvironment["fonts"],
  Map<string, Promise<boolean>>
>();

function loadFace(environment: VideoFontEnvironment, shard: VideoFontShard) {
  const base = environment.baseURL ?? import.meta.env?.BASE_URL ?? studioBase;
  const url = `${base.replace(/\/?$/, "/")}fonts/${shard.file}`;
  const { fetch, FontFace, fonts } = environment;
  let faces = facesBySet.get(fonts);
  if (!faces) {
    faces = new Map();
    facesBySet.set(fonts, faces);
  }
  const cached = faces.get(url);
  if (cached) return cached;

  const cache = faces;
  const loading = Promise.resolve()
    .then(async () => {
      try {
        const response = await fetch(url, {
          mode: "same-origin",
          redirect: "error",
        });
        if (!response.ok) return false;
        const face = new FontFace(shard.family, await response.arrayBuffer(), {
          weight: shard.weight,
          unicodeRange: descriptors[shard.id],
        });
        fonts.add(await face.load());
        return true;
      } catch {
        return false;
      }
    })
    .then((loaded) => {
      if (!loaded) cache.delete(url);
      return loaded;
    });
  cache.set(url, loading);
  return loading;
}

function waitForFonts<T>(
  loading: Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  if (!signal) return loading;
  // A cancelled caller stops waiting while other callers can use the shared loads.
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    void loading
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", abort));
  });
}

/** Load and register the bundled faces needed for `texts`, then await them. */
export async function ensureVideoFonts({
  texts,
  signal,
  environment,
}: {
  texts: readonly string[];
  signal?: AbortSignal;
  environment?: VideoFontEnvironment;
}): Promise<FontPreflight> {
  signal?.throwIfAborted();
  const missing = missingCharacters(texts);
  const notices = missing.length ? ["font.missingCharacters"] : [];
  const runtime = environment ?? browserFontEnvironment();
  if (!runtime) {
    return {
      notices: [...notices, "font.apiUnavailable"],
      missingCharacters: missing,
    };
  }

  const needsLevel2 = texts.some((text) =>
    Array.from(text).some((character) => level2Coverage.has(character)),
  );
  const shards = videoFontManifest.shards.filter(
    ({ id }) => id !== "sc-l2" || needsLevel2,
  );
  const completed = Promise.all(
    shards.map((shard) => loadFace(runtime, shard)),
  ).then(async (loaded) => {
    const failures = shards.flatMap(({ id }, index) =>
      loaded[index] ? [] : [`font.shardUnavailable.${id}`],
    );
    try {
      await runtime.fonts.ready;
    } catch {
      failures.push("font.apiUnavailable");
    }
    return failures;
  });
  const failures = await waitForFonts(completed, signal);
  signal?.throwIfAborted();
  return { notices: [...notices, ...failures], missingCharacters: missing };
}
