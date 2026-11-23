import type { Episode, Language } from "../../shared/factory.ts";
import {
  createTranslator,
  setLocale,
  type Locale,
} from "../../src/i18n/index.ts";
import {
  encodeThumbnail,
  thumbnailDesign,
} from "../../src/publish/thumbnail.ts";
import type { ThumbnailOptions } from "../../src/publish/thumbnail.ts";
import { displayTextCounts, displayWordCount } from "../../src/text/wrap.ts";
import { videoLayout, type PixelBox } from "../../src/video/design/layout.ts";
import {
  designTokens,
  type Orientation,
} from "../../src/video/design/tokens.ts";
import {
  ensureVideoFonts,
  videoFont,
  videoFontFamilies,
} from "../../src/video/fonts/loader.ts";
import { overlayCopy, prepareOverlay } from "../../src/video/overlay.ts";
import type { PcmAudio } from "../../src/video/pcm.ts";
import { renderVideo } from "../../src/video/render.ts";
import { getScene } from "../../src/video/scenes/registry.ts";
import {
  buildTimeline,
  layoutCaptionCues,
  type TimelinePlan,
} from "../../src/video/timeline.ts";
import { themePalette } from "../../src/video/themes.ts";

export const rubric = {
  captions: {
    criterion: "Caption legibility and sync",
    points: 18,
    assessable: 9,
  },
  contrast: {
    criterion: "Contrast and host identity",
    points: 12,
    assessable: 8,
  },
  framing: { criterion: "Framing and collision", points: 12, assessable: 8 },
  typography: {
    criterion: "Typography and localization",
    points: 10,
    assessable: 8,
  },
  opening: {
    criterion: "Opening, chapters and callouts",
    points: 8,
    assessable: 7,
  },
  flash: { criterion: "Motion and flash safety", points: 10, assessable: 8 },
  craft: {
    criterion: "Scene craft and audio response",
    points: 8,
    assessable: 0,
  },
  thumbnail: { criterion: "Thumbnail", points: 10, assessable: 8 },
  repeatability: {
    criterion: "Repeatability and fallback",
    points: 7,
    assessable: 6,
  },
  performance: { criterion: "Performance", points: 5, assessable: 0 },
} as const;

export type Criterion = keyof typeof rubric;
export type Issue = { criterion: Criterion; detail: string; frame?: number };
export type FlashDiagnostic = {
  path: "raw" | "decoded";
  kind: "general" | "saturated red";
  maxCellFlashesPerSecond: number;
  softLimit: number;
  exceedsSoftLimit: boolean;
};
export type VisualCase = {
  language: Language;
  orientation: Orientation;
  scene: "waveform" | "studio3d";
};

type Geometry = ReturnType<typeof videoLayout>;
type TextRole =
  | "caption"
  | "host"
  | "wordmark"
  | "chapter"
  | "progress"
  | "title"
  | "callout"
  | "chapterIndex";
type Canvas2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type Pixels = Uint8ClampedArray<ArrayBuffer>;
const fps = 30;
const seed = 51; // The reference Studio 3D scene also uses seed 51 for particles.
const referenceFrames = [0, 15, 30, 60, 120];
const studio = {
  paletteId: "aurora",
  cameraPresetId: "drift",
  moodId: "calm",
  intensity: 0.55,
} as const;
const motion = designTokens.common.motion;
const wordmarkLocales = { zh: "zh-CN", en: "en", ms: "ms", sg: "en" } as const;
const interfaceLocales = { zh: "en", en: "ms", ms: "en", sg: "ms" } as const;

// Each spoken chapter has two turns. The Mandarin examples preserve the
// review's question particle, opening phrase, and mid-clause break regressions.
const copy = {
  zh: {
    locale: "zh-CN",
    title: "组屋如何混居",
    chapters: ["一起住的城市", "买卖如何改变", "共享空间"],
    turns: [
      "新加坡的组屋里，不只讲理念。",
      "邻居天天见面，才会慢慢熟悉。",
      "那它怎么真的影响买卖呢？",
      "二手组屋交易里，选择也会改变。",
      "先看看大家如何共享空间。",
      "小小改变，也能帮到邻居。",
    ],
    callout: "邻里共享空间",
  },
  en: {
    locale: "en",
    title: "Homes We Share",
    chapters: ["A shared block", "How sales work", "Shared space"],
    turns: [
      "Why do neighbors share space?",
      "Alexandra Montgomery walks 2 km.",
      "What changes when homes are sold?",
      "The market has several rules.",
      "We met in the cafe\u0301 after lunch.",
      "Shared tables make introductions easier.",
    ],
    callout: "Shared space matters",
  },
  ms: {
    locale: "ms",
    title: "Jiran Kita",
    chapters: ["Jiran setempat", "Urus niaga", "Ruang bersama"],
    turns: [
      "Bagaimana kita berkongsi ruang?",
      "Nurul berjalan sejauh 2 km.",
      "Bilakah rumah boleh dijual?",
      "Pembeli boleh mempertimbangkan pilihan.",
      "Kami bertemu di kafe\u0301 komuniti.",
      "Jiran baharu berkenalan di sini.",
    ],
    callout: "Ruang untuk semua",
  },
  sg: {
    locale: "zh-CN",
    title: "组屋与 HDB",
    chapters: ["组屋里的邻居", "HDB 怎么卖", "共享空间"],
    turns: [
      "新加坡的组屋里，HDB 住户常碰面。",
      "从 cafe\u0301 走 2 km 就到。",
      "那 HDB 转售真的有影响吗？",
      "买家先了解 resale 规则。",
      "在组屋里，jiran 一起喝茶。",
      "一起分享 common space。",
    ],
    callout: "组屋共享空间",
  },
} satisfies Record<
  Language,
  {
    locale: Locale;
    title: string;
    chapters: string[];
    turns: string[];
    callout: string;
  }
>;

export function fixture(
  options: VisualCase,
  // End the stress tail at 17.8 s so its last frame has a full interval.
  durations = [2.7, 2.9, 2.7, 2.4, 2.55, 2.2, 0.3, 0.44],
) {
  const content = copy[options.language];
  // Append two rapid chapter changes with synthetic bursts and no spoken cue.
  // They share the main export so the flash gate sees the actual transitions.
  const chapters = [...content.chapters, ...content.chapters.slice(0, 2)].map(
    (title, index) => ({
      id: `chapter-${index + 1}`,
      title,
      angle: "Visual QA",
      claimIds: [],
    }),
  );
  const turns: NonNullable<Episode["script"]>["turns"] = durations.map(
    (_, index) => ({
      id: `turn-${index + 1}`,
      text: content.turns[index] ?? "",
      chapterId:
        chapters[
          index < content.turns.length
            ? Math.floor(index / 2)
            : content.chapters.length + index - content.turns.length
        ].id,
      host: index % 2 ? "B" : "A",
      claimIds: [],
    }),
  );
  const episode: Episode = {
    id: "00000000-0000-4000-8000-000000000063",
    topic: content.title,
    language: options.language,
    revision: 1,
    updated: "2026-11-23T00:00:00.000Z",
    voices: { A: "marin", B: "cedar" },
    outline: { chapters, model: "fixture" },
    script: { title: content.title, turns, model: "fixture" },
    render: {
      revision: 1,
      model: "fixture",
      clips: Object.fromEntries(
        turns.map(({ id }, index) => [
          id,
          {
            asset: `${id}.wav`,
            duration: durations[index],
          },
        ]),
      ),
    },
  };
  const plan = buildTimeline(episode, {
    fps,
    resolution:
      options.orientation === "portrait"
        ? { width: 1080, height: 1920 }
        : { width: 1920, height: 1080 },
    paletteId: "aurora",
    mood: "calm",
    transition: "fade",
    hostNames: { A: "Lin", B: "Alexandra Montgomery-Smith" },
    callouts: [
      { chapterId: chapters[0].id, text: content.callout, start: 2.1 },
    ],
  });
  const sampleRate = 24_000;
  const samples = new Float32Array(Math.ceil(plan.duration * sampleRate));
  let state = seed;
  const levels = [0.02, 0.73, 0.022, 2.4, 0.025, 0.91, 0.025, 2.4];
  const voicedTurns = plan.scenes.filter((scene) => scene.kind === "turn");
  voicedTurns.forEach(({ audioStart, start, end }, index) => {
    const first = Math.round(audioStart * sampleRate);
    const count = Math.round((end - start) * sampleRate);
    for (let sample = 0; sample < count; sample++) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      const time = sample / sampleRate;
      const syllable =
        0.18 + 0.82 * Math.sin(Math.PI * (4.1 + index * 0.31) * time + 1) ** 4;
      const fundamental = 2 * Math.PI * (112 + 28 * (index % 2)) * time;
      const voice =
        0.68 * Math.sin(fundamental + 0.6) +
        0.22 * Math.sin(fundamental * 2.1) +
        0.1 * (state / 2 ** 31 - 0.5);
      samples[first + sample] = Math.max(
        -1,
        Math.min(1, levels[index] * syllable * voice),
      );
    }
  });
  const audio: PcmAudio = { sampleRate, channels: [samples] };
  return {
    episode,
    plan,
    audio,
    content,
    voicedTurns,
  };
}

function boxFromFractions(
  [left, top, right, bottom]: readonly number[],
  width: number,
  height: number,
): PixelBox {
  return {
    x: left * width,
    y: top * height,
    width: (right - left) * width,
    height: (bottom - top) * height,
  };
}

function contains(outer: PixelBox, inner: PixelBox, tolerance = 1e-6) {
  return (
    inner.x >= outer.x - tolerance &&
    inner.y >= outer.y - tolerance &&
    inner.x + inner.width <= outer.x + outer.width + tolerance &&
    inner.y + inner.height <= outer.y + outer.height + tolerance
  );
}

function isBox(value: unknown): value is PixelBox {
  return (
    typeof value === "object" &&
    value !== null &&
    ["x", "y", "width", "height"].every((key) => key in value)
  );
}

function boxesOf(geometry: Geometry): Record<string, PixelBox> {
  return Object.fromEntries(
    Object.entries(geometry).flatMap(([name, value]) => {
      if (isBox(value)) return [[name, value] as const];
      if (Array.isArray(value))
        return value.flatMap((box, index) =>
          isBox(box) ? [[`${name}[${index}]`, box] as const] : [],
        );
      return [];
    }),
  );
}

const linear = Array.from({ length: 256 }, (_, channel) => {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
});
const luma = (pixels: Pixels, index: number) =>
  0.2126 * linear[pixels[index]] +
  0.7152 * linear[pixels[index + 1]] +
  0.0722 * linear[pixels[index + 2]];
const contrast = (a: number, b: number) =>
  (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
const colorDistance = (a: Pixels, i: number, b: Pixels, j: number) =>
  Math.max(
    Math.abs(a[i] - b[j]),
    Math.abs(a[i + 1] - b[j + 1]),
    Math.abs(a[i + 2] - b[j + 2]),
  );

function context(width: number, height: number) {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Visual QA requires Canvas 2D");
  return ctx;
}

async function sha256(pixels: Pixels) {
  const digest = await crypto.subtle.digest("SHA-256", pixels);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

type TextProbe = {
  text: string;
  role: TextRole;
  box: PixelBox;
  bounds: PixelBox;
  alpha: Pixels;
  before: Pixels;
};

function measureGlyphs(
  ctx: Canvas2D,
  text: string,
  x: number,
  y: number,
  maxWidth?: number,
) {
  const metrics = ctx.measureText(text);
  const scale =
    maxWidth === undefined ? 1 : Math.min(1, maxWidth / metrics.width);
  const left = Math.max(
    0,
    Math.floor(x - metrics.actualBoundingBoxLeft * scale) - 8,
  );
  const top = Math.max(0, Math.floor(y - metrics.actualBoundingBoxAscent) - 8);
  const right = Math.min(
    ctx.canvas.width,
    Math.ceil(x + metrics.actualBoundingBoxRight * scale) + 8,
  );
  const bottom = Math.min(
    ctx.canvas.height,
    Math.ceil(y + metrics.actualBoundingBoxDescent) + 8,
  );
  if (right <= left || bottom <= top) return;
  const box = { x: left, y: top, width: right - left, height: bottom - top };
  const mask = context(box.width, box.height);
  mask.font = ctx.font;
  mask.textBaseline = ctx.textBaseline;
  mask.textAlign = ctx.textAlign;
  mask.direction = ctx.direction;
  mask.fontKerning = ctx.fontKerning;
  mask.letterSpacing = ctx.letterSpacing;
  mask.wordSpacing = ctx.wordSpacing;
  if (maxWidth === undefined) mask.fillText(text, x - left, y - top);
  else mask.fillText(text, x - left, y - top, maxWidth);
  const alpha = mask.getImageData(0, 0, box.width, box.height).data;
  let minX = box.width,
    minY = box.height,
    maxX = -1,
    maxY = -1;
  for (let row = 0; row < box.height; row++) {
    for (let column = 0; column < box.width; column++) {
      if (alpha[(row * box.width + column) * 4 + 3] < 128) continue;
      minX = Math.min(minX, column);
      minY = Math.min(minY, row);
      maxX = Math.max(maxX, column);
      maxY = Math.max(maxY, row);
    }
  }
  if (maxX < 0) return;
  return {
    box,
    alpha,
    bounds: {
      x: left + minX,
      y: top + minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
    },
  };
}

function observeText(
  ctx: Canvas2D,
  onText: (text: string, x: number, y: number, maxWidth?: number) => void,
) {
  const fillText = ctx.fillText.bind(ctx);
  ctx.fillText = (text, x, y, maxWidth?) => {
    onText(text, x, y, maxWidth);
    if (maxWidth === undefined) fillText(text, x, y);
    else fillText(text, x, y, maxWidth);
  };
}

function textRole(
  geometry: Geometry,
  ctx: Canvas2D,
  x: number,
  y: number,
): TextRole | undefined {
  const size = Number.parseFloat(
    ctx.font.match(/\b\d+(?:\.\d+)?px\b/u)?.[0] ?? "NaN",
  );
  const matches = (role: keyof Geometry["type"]) =>
    Math.abs(geometry.type[role] - size) < 0.02;
  if (matches("progress") && ctx.textAlign === "right") return "progress";
  if (
    matches("wordmark") &&
    x < geometry.wordmark.x + geometry.wordmark.width &&
    y < geometry.wordmark.y + geometry.wordmark.height
  )
    return "wordmark";
  if (matches("progress")) return "chapterIndex";
  return (["caption", "host", "chapter", "title", "callout"] as const).find(
    matches,
  );
}

type Sample = { pixels: number; min: number | null };

function sampleInk(
  probe: TextProbe,
  raw: Pixels,
  width: number,
  pairDecoded = true,
) {
  const { box, alpha, before } = probe;
  const pairs: number[] = [];
  let pixels = 0;
  let minimum = Infinity;
  for (let y = 1; y < box.height - 1; y++) {
    for (let x = 1; x < box.width - 1; x++) {
      const i = (y * box.width + x) * 4;
      // Restrict the ratio to substantial glyph interiors. Small text may
      // have one-pixel stems, so require one solid axial neighbor.
      if (
        alpha[i + 3] < 250 ||
        ![i - 4, i + 4, i - box.width * 4, i + box.width * 4].some(
          (j) => alpha[j + 3] >= 240,
        )
      )
        continue;
      const offset = ((box.y + y) * width + box.x + x) * 4;
      minimum = Math.min(minimum, contrast(luma(raw, offset), luma(before, i)));
      pixels++;
      if (!pairDecoded) continue;
      // Find untouched pixels from the same plate or local gradient. Match
      // the raw background at the glyph to exclude other text and markers.
      let neighbor: number | undefined;
      const { height, width: stride } = box;
      for (const delta of [4, -4, 6, -6, 8, -8, 12, -12]) {
        for (const [nx, ny] of [
          [x + delta, y],
          [x, y + delta],
        ]) {
          if (nx <= 0 || nx >= stride - 1 || ny <= 0 || ny >= height - 1)
            continue;
          const at = (ny * stride + nx) * 4;
          const pixel = ((box.y + ny) * width + box.x + nx) * 4;
          if (
            alpha[at + 3] ||
            alpha[at - 1] ||
            alpha[at + 7] ||
            colorDistance(raw, pixel, before, i) > 5
          )
            continue;
          neighbor = pixel;
          break;
        }
        if (neighbor !== undefined) break;
      }
      if (neighbor !== undefined) pairs.push(offset, neighbor);
    }
  }
  return {
    raw: {
      pixels,
      min: Number.isFinite(minimum) ? minimum : null,
    } satisfies Sample,
    pairs,
  };
}

function decodedInk(pixels: Pixels, pairs: number[]): Sample {
  let minimum = Infinity;
  for (let index = 0; index < pairs.length; index += 2) {
    minimum = Math.min(
      minimum,
      contrast(luma(pixels, pairs[index]), luma(pixels, pairs[index + 1])),
    );
  }
  return {
    pixels: pairs.length / 2,
    min: Number.isFinite(minimum) ? minimum : null,
  };
}

function makeProbe(
  ctx: Canvas2D,
  role: TextRole,
  text: string,
  x: number,
  y: number,
  maxWidth: number | undefined,
  masks: Map<string, ReturnType<typeof measureGlyphs>>,
): TextProbe | undefined {
  const key = JSON.stringify([
    text,
    x,
    y,
    maxWidth,
    ctx.font,
    ctx.textBaseline,
    ctx.textAlign,
    ctx.direction,
    ctx.fontKerning,
    ctx.letterSpacing,
    ctx.wordSpacing,
  ]);
  if (!masks.has(key)) masks.set(key, measureGlyphs(ctx, text, x, y, maxWidth));
  const glyphs = masks.get(key);
  if (!glyphs) return;
  const { box } = glyphs;
  const background = context(box.width, box.height);
  background.drawImage(
    ctx.canvas,
    box.x,
    box.y,
    box.width,
    box.height,
    0,
    0,
    box.width,
    box.height,
  );
  return {
    role,
    text,
    ...glyphs,
    before: background.getImageData(0, 0, box.width, box.height).data,
  };
}

const minimumDecodedEdgePixels = 8;

export function safeExterior(
  pixels: Pixels,
  titleSafe: PixelBox,
  width: number,
  height: number,
) {
  const edges = new Set<number>();
  const safeRight = Math.ceil(titleSafe.x + titleSafe.width);
  for (let y = 2; y < height - 2; y++) {
    const safeRow = y >= titleSafe.y && y < titleSafe.y + titleSafe.height;
    for (let x = 2; x < width - 2; x++) {
      if (safeRow && x >= titleSafe.x && x < safeRight) x = safeRight;
      if (x >= width - 2) break;
      const offset = (y * width + x) * 4;
      // Both a diagonal 2D gradient and a radial WebGL backdrop are allowed.
      // A visible edge in the reserved region changes faster than either.
      if (
        colorDistance(pixels, offset - 8, pixels, offset + 8) > 24 ||
        colorDistance(pixels, offset - width * 8, pixels, offset + width * 8) >
          24
      )
        edges.add(y * width + x);
    }
  }
  const total = edges.size;
  const first = edges.values().next().value;
  let largestComponent = 0;
  let connectedPixels = 0;
  // Candidates are at least two pixels from the image border, so neighbor
  // offsets cannot wrap into another row or leave the image.
  for (const pixel of edges) {
    const component = [pixel];
    edges.delete(pixel);
    for (const next of component) {
      for (const row of [-width, 0, width]) {
        for (const column of [-1, 0, 1]) {
          const adjacent = next + row + column;
          if (edges.delete(adjacent)) component.push(adjacent);
        }
      }
    }
    largestComponent = Math.max(largestComponent, component.length);
    if (component.length >= minimumDecodedEdgePixels)
      connectedPixels += component.length;
  }
  return {
    total,
    largestComponent,
    connectedPixels,
    first:
      first === undefined
        ? null
        : { x: first % width, y: Math.floor(first / width) },
  };
}

// A 10-degree field is approximated by a half-width, half-height window.
// The integral image measures every such window, including overlapping ones.
function exceedsFieldArea(cells: Uint8Array, width: number, height: number) {
  const fieldWidth = width / 2;
  const fieldHeight = height / 2;
  const quarterField = (fieldWidth * fieldHeight) / 4;
  if (cells.reduce((sum, value) => sum + value, 0) <= quarterField)
    return false;
  const stride = width + 1;
  const sums = new Uint32Array(stride * (height + 1));
  for (let y = 1; y <= height; y++) {
    let row = 0;
    for (let x = 1; x <= width; x++) {
      row += cells[(y - 1) * width + x - 1];
      sums[y * stride + x] = row + sums[(y - 1) * stride + x];
    }
  }
  for (let y = 0; y <= height - fieldHeight; y++) {
    for (let x = 0; x <= width - fieldWidth; x++) {
      const top = y * stride + x;
      const bottom = top + fieldHeight * stride;
      if (
        sums[bottom + fieldWidth] -
          sums[bottom] -
          sums[top + fieldWidth] +
          sums[top] >
        quarterField
      )
        return true;
    }
  }
  return false;
}

function flashCounter(
  width: number,
  height: number,
  threshold: number,
  eligible: (before: number, after: number, saturated: boolean) => boolean,
) {
  const size = width * height;
  const low = new Float64Array(size);
  const high = new Float64Array(size);
  const lowSaturation = new Uint8Array(size);
  const highSaturation = new Uint8Array(size);
  const lastDirection = new Int8Array(size);
  const pending = new Uint8Array(size);
  const paired = new Uint8Array(size);
  const second = Array.from({ length: fps }, () => new Uint8Array(size));
  const counts = new Uint8Array(size);
  const result = {
    maxFieldFlashesPerSecond: 0,
    maxCellFlashesPerSecond: 0,
    fieldFlashFrames: [] as number[],
    peakFrameDelta: 0,
    qualifyingTransitions: 0,
  };
  let previous: Float64Array = new Float64Array(size);
  let previousFrame = 0;
  let fieldStart = 0;

  return {
    result,
    add(frame: number, values: Float64Array, saturation?: Uint8Array) {
      if (frame === 0) {
        low.set(values);
        high.set(values);
        if (saturation) {
          lowSaturation.set(saturation);
          highSaturation.set(saturation);
        }
        previous = values;
        return;
      }
      // Decoded samples can skip a frame. Expire its slot in the source
      // timeline so the cell counts still cover a rolling second.
      for (let skipped = previousFrame + 1; skipped < frame; skipped++) {
        const expired = second[skipped % fps];
        for (let cell = 0; cell < size; cell++) counts[cell] -= expired[cell];
        expired.fill(0);
      }
      const expired = second[frame % fps];
      paired.fill(0);
      for (let cell = 0; cell < size; cell++) {
        const value = values[cell];
        result.peakFrameDelta = Math.max(
          result.peakFrameDelta,
          Math.abs(value - previous[cell]),
        );
        const saturated = saturation?.[cell] ?? 0;
        if (value <= low[cell]) {
          low[cell] = value;
          lowSaturation[cell] = saturated;
        }
        if (value >= high[cell]) {
          high[cell] = value;
          highSaturation[cell] = saturated;
        }
        // Retain the last extrema to detect ramps as well as hard cuts.
        let direction = 0;
        if (
          lastDirection[cell] <= 0 &&
          value - low[cell] >= threshold &&
          eligible(low[cell], value, Boolean(saturated || lowSaturation[cell]))
        )
          direction = 1;
        if (
          lastDirection[cell] >= 0 &&
          high[cell] - value >= threshold &&
          eligible(
            high[cell],
            value,
            Boolean(saturated || highSaturation[cell]),
          )
        )
          direction = -1;
        if (direction) {
          lastDirection[cell] = direction;
          low[cell] = high[cell] = value;
          lowSaturation[cell] = highSaturation[cell] = saturated;
          paired[cell] = pending[cell];
          pending[cell] = 1 - paired[cell];
          result.qualifyingTransitions++;
        }
        counts[cell] += paired[cell] - expired[cell];
        expired[cell] = paired[cell];
        result.maxCellFlashesPerSecond = Math.max(
          result.maxCellFlashesPerSecond,
          counts[cell],
        );
      }
      previous = values;
      previousFrame = frame;
      if (exceedsFieldArea(paired, width, height))
        result.fieldFlashFrames.push(frame);
      while (result.fieldFlashFrames[fieldStart] <= frame - fps) fieldStart++;
      result.maxFieldFlashesPerSecond = Math.max(
        result.maxFieldFlashesPerSecond,
        result.fieldFlashFrames.length - fieldStart,
      );
    },
  };
}

export function flashAnalysis(width: number, height: number) {
  const general = flashCounter(
    width,
    height,
    0.1,
    (before, after) => Math.min(before, after) < 0.8,
  );
  const red = flashCounter(
    width,
    height,
    20,
    (_before, _after, saturated) => saturated,
  );
  return {
    general: general.result,
    saturatedRed: red.result,
    add(frame: number, pixels: Pixels) {
      const levels = new Float64Array(width * height);
      const reds = new Float64Array(levels.length);
      const saturation = new Uint8Array(levels.length);
      for (let cell = 0; cell < levels.length; cell++) {
        const i = cell * 4;
        levels[cell] = luma(pixels, i);
        const r = linear[pixels[i]],
          g = linear[pixels[i + 1]],
          b = linear[pixels[i + 2]];
        reds[cell] = Math.max(0, r - g - b) * 320;
        saturation[cell] = Number(r > 0 && r / (r + g + b) >= 0.8);
      }
      general.add(frame, levels);
      red.add(frame, reds, saturation);
    },
  };
}

export function flashAssessment(
  evidence: ReturnType<typeof flashSampler>["evidence"],
) {
  const issues: Issue[] = [];
  const diagnostics: FlashDiagnostic[] = [];
  for (const path of ["raw", "decoded"] as const) {
    for (const [kind, result] of [
      ["general", evidence[path].general],
      ["saturated red", evidence[path].saturatedRed],
    ] as const) {
      if (result.maxFieldFlashesPerSecond > 3)
        issues.push({
          criterion: "flash",
          detail: `${path} ${kind} exceeded 3 field flashes in one second: ${JSON.stringify(result)}`,
        });
      const softLimit = 10;
      diagnostics.push({
        path,
        kind,
        maxCellFlashesPerSecond: result.maxCellFlashesPerSecond,
        softLimit,
        exceedsSoftLimit: result.maxCellFlashesPerSecond > softLimit,
      });
    }
  }
  return { issues, diagnostics };
}

function flashSampler(orientation: Orientation) {
  const [width, height] = orientation === "landscape" ? [160, 90] : [90, 160];
  const canvas = context(width, height);
  const raw = flashAnalysis(width, height);
  const decoded = flashAnalysis(width, height);
  return {
    sample(image: CanvasImageSource) {
      canvas.drawImage(image, 0, 0, width, height);
      return canvas.getImageData(0, 0, width, height).data;
    },
    raw,
    decoded,
    evidence: {
      grid: [width, height],
      raw: { general: raw.general, saturatedRed: raw.saturatedRed },
      decoded: { general: decoded.general, saturatedRed: decoded.saturatedRed },
    },
  };
}

function observeVideoFrames(observe: (source: CanvasImageSource) => void) {
  return new Proxy(VideoFrame, {
    construct(target, args) {
      const frame: VideoFrame = Reflect.construct(target, args);
      try {
        observe(args[0]);
        return frame;
      } catch (error) {
        frame.close();
        throw error;
      }
    },
  });
}

function firstFrame(time: number) {
  return Math.ceil((time - 0.5e-6) * fps);
}

function frameSet(
  boundaries: number[],
  frameCount: number,
  extras: number[] = [],
) {
  return [
    ...new Set([
      ...referenceFrames,
      ...extras,
      ...boundaries.flatMap((frame) => [frame - 1, frame, frame + 1]),
    ]),
  ]
    .filter((frame) => frame >= 0 && frame < frameCount)
    .sort((a, b) => a - b);
}

function captionEvidence(
  turn: ReturnType<typeof fixture>["voicedTurns"][number],
  sourceText: string,
  cues: ReturnType<typeof layoutCaptionCues>,
  geometry: Geometry,
  measure: Canvas2D,
  locale: string,
  add: (issue: Issue) => void,
) {
  const source = sourceText.normalize("NFC").trim().replace(/\s+/gu, " ");
  const words = [
    ...source.matchAll(
      /[\p{Script=Latin}\p{N}][\p{Script=Latin}\p{N}\p{M}]*(?:['’\-][\p{Script=Latin}\p{N}][\p{Script=Latin}\p{N}\p{M}]*)*/gu,
    ),
  ];
  const [maxLines, cjkLimit, latinLimit] = geometry.text.caption;
  const width = geometry.caption.width - 2 * geometry.captionPad.x;
  const graphemes = new Intl.Segmenter(locale, { granularity: "grapheme" });
  const badStart = /^[\p{Pe}\p{Pf},.!?:;%、。，．・：；？！…呢吗吧啊嘛啦]/u;
  const badEnd = /[\p{Ps}\p{Pi}的地得了着过和与在对把被从向为以及或而]$/u;
  let cueOffset = 0;
  let lineOffset = 0;
  for (const cue of cues) {
    const frame = firstFrame(cue.start);
    const problem = (detail: string) =>
      add({
        criterion: "captions",
        frame,
        detail: `${turn.turnId}: ${detail}`,
      });
    if (!cue.lines.length || cue.lines.length > Math.min(2, maxLines))
      problem(`unexpected line count ${cue.lines.length}`);
    const cueText = cue.text ?? cue.lines.join(" ");
    if (source[cueOffset] === " ") cueOffset++;
    if (!source.startsWith(cueText, cueOffset))
      problem(`cue text differs at offset ${cueOffset}: ${cueText}`);
    cueOffset += cueText.length;
    for (const [index, line] of cue.lines.entries()) {
      if (source[lineOffset] === " ") lineOffset++;
      if (!source.startsWith(line, lineOffset))
        problem(`line differs at offset ${lineOffset}: ${line}`);
      lineOffset += line.length;
      if (
        words.some(
          (word) =>
            word.index < lineOffset && lineOffset < word.index + word[0].length,
        )
      )
        problem(`Latin word split after ${line}`);
      if (badStart.test(line) || badEnd.test(line))
        problem(`illegal line edge: ${line}`);
      const { cjk, latin } = displayTextCounts(line, locale);
      if (
        (cjk ? cjk + latin / 2 > cjkLimit : latin > latinLimit) ||
        measure.measureText(line).width > width + 0.01
      )
        problem(`line exceeds its budget: ${line}`);
      if (
        index === cue.lines.length - 1 &&
        (cue.lines.length > 1 || cues.length > 1) &&
        ([...graphemes.segment(line)].length === 1 ||
          /^[\p{P}\s]+$/u.test(line) ||
          /^\p{Script=Han}\p{M}*\p{P}*$/u.test(line))
      )
        problem(`orphan final line: ${line}`);
    }
    const { cjk, latin } = displayTextCounts(cueText, locale);
    const minimum = Math.max(
      motion.captionMinMs / 1000,
      cjk / 9 + Math.max(latin / 20, displayWordCount(cueText, locale) / 3),
    );
    const duration = cue.end - cue.start;
    if (
      cue.needsReview ||
      duration + 1e-6 < minimum ||
      duration > motion.captionMaxMs / 1000
    )
      problem(
        `duration ${duration.toFixed(3)} s for ${cueText} (minimum ${minimum.toFixed(3)} s)`,
      );
  }
  if (cueOffset !== source.length || lineOffset !== source.length)
    add({
      criterion: "captions",
      detail: `${turn.turnId}: cue text or rendered lines lost source text`,
    });
  if (!cues.length || firstFrame(cues[0].start) !== firstFrame(turn.start))
    add({
      criterion: "captions",
      detail: `${turn.turnId}: first cue misses the first voiced frame`,
    });
}

async function mediaEvent(
  video: HTMLVideoElement,
  name: "loadeddata" | "seeked",
  label: string,
  start: () => void,
) {
  const listeners = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      const options = { once: true, signal: listeners.signal };
      video.addEventListener(name, () => resolve(), options);
      video.addEventListener(
        "error",
        () =>
          reject(
            new Error(`${label}: ${video.error?.message || "MP4 media error"}`),
          ),
        options,
      );
      timer = setTimeout(
        () =>
          reject(
            new Error(`${label}: timed out after 5000 ms waiting for ${name}`),
          ),
        5_000,
      );
      try {
        start();
      } catch (error) {
        reject(new Error(`${label}: ${String(error)}`, { cause: error }));
      }
    });
  } finally {
    clearTimeout(timer);
    listeners.abort();
  }
}

async function withVideo<T>(
  blob: Blob,
  scope: string,
  consume: (video: HTMLVideoElement) => Promise<T>,
) {
  const url = URL.createObjectURL(blob);
  const video = document.createElement("video");
  video.muted = true;
  video.preload = "auto";
  video.playsInline = true;
  video.width = 160;
  video.height = 90;
  document.body.append(video);
  try {
    await mediaEvent(
      video,
      "loadeddata",
      `Visual QA ${scope}, frame 0, load MP4`,
      () => {
        video.src = url;
      },
    );
    video.pause();
    return await consume(video);
  } finally {
    video.remove();
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

const frameCenter = (frame: number) => (frame + 0.5) / fps;

async function seekFrameCenter(
  video: HTMLVideoElement,
  frame: number,
  scope: string,
) {
  const target = frameCenter(frame);
  const label = `Visual QA ${scope}, frame ${frame}, seek to ${target.toFixed(6)} s`;
  await mediaEvent(video, "seeked", label, () => {
    video.currentTime = target;
  });
  const currentTime = video.currentTime;
  if (!(Math.abs(currentTime - target) <= 0.001))
    throw new Error(
      `Visual QA frame alignment: ${label}, observed currentTime ${currentTime.toFixed(6)} s (tolerance 1 ms)`,
    );
  return currentTime;
}

// The existing presentation-probe unit test uses this optional diagnostic.
// The rubric and reader self-test use seekFrameCenter directly.
const matchesFrameTime = (frame: number, mediaTime: number) =>
  Math.abs(mediaTime - frame / fps) < 0.5 / fps;

export function assertFrameTime(frame: number, mediaTime: number) {
  if (!matchesFrameTime(frame, mediaTime))
    throw new Error(
      `Visual QA frame alignment: frame ${frame}, expected PTS ${(frame / fps).toFixed(6)} s within half a frame, observed mediaTime ${mediaTime.toFixed(6)} s`,
    );
}

export async function seekFrame(video: HTMLVideoElement, frame: number) {
  const scope = "presentation diagnostic";
  if (typeof video.requestVideoFrameCallback !== "function")
    return seekFrameCenter(video, frame, scope);
  let request: number | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const presentation = new Promise<number | undefined>((resolve) => {
      const next: VideoFrameRequestCallback = (_now, { mediaTime }) => {
        if (matchesFrameTime(frame, mediaTime)) resolve(mediaTime);
        else request = video.requestVideoFrameCallback(next);
      };
      timer = setTimeout(() => {
        if (request !== undefined) video.cancelVideoFrameCallback(request);
        request = undefined;
        resolve(undefined);
      }, 50);
      request = video.requestVideoFrameCallback(next);
    });
    const [currentTime, mediaTime] = await Promise.all([
      seekFrameCenter(video, frame, scope),
      presentation,
    ]);
    return mediaTime ?? currentTime;
  } finally {
    clearTimeout(timer);
    if (request !== undefined) video.cancelVideoFrameCallback(request);
  }
}

async function readMovieFrames(
  video: HTMLVideoElement,
  scope: string,
  frames: number[],
  exactFrames: ReadonlySet<number>,
  readExact: (frame: number, currentTime: number) => void,
  readFlash: (frame: number) => void,
) {
  let totalSeekMs = 0;
  let maxSeekMs = 0;
  for (const frame of frames) {
    const started = performance.now();
    const currentTime = await seekFrameCenter(video, frame, scope);
    const seekMs = performance.now() - started;
    totalSeekMs += seekMs;
    maxSeekMs = Math.max(maxSeekMs, seekMs);
    if (exactFrames.has(frame)) readExact(frame, currentTime);
    readFlash(frame);
  }
  return {
    total: frames.length,
    exactFrames: exactFrames.size,
    flashOnlyFrames: frames.length - exactFrames.size,
    seekMs: {
      total: totalSeekMs,
      mean: totalSeekMs / frames.length,
      max: maxSeekMs,
    },
  };
}

export async function runReaderSelfTest() {
  const { ArrayBufferTarget, Muxer } = await import("mp4-muxer");
  const width = 128;
  const height = 64;
  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: "avc", width, height },
    fastStart: false,
  });
  const drawing = context(width, height);
  const calloutEnd = 45 / fps;
  let encodingError: unknown;
  const encoder = new VideoEncoder({
    output(chunk, metadata) {
      try {
        muxer.addVideoChunk(chunk, metadata);
      } catch (error) {
        encodingError = error;
      }
    },
    error(error) {
      encodingError = error;
    },
  });
  try {
    encoder.configure({
      codec: "avc1.420028",
      avc: { format: "avc" },
      width,
      height,
      framerate: fps,
      bitrate: 500_000,
    });
    for (let index = 0; index < 3 * fps; index++) {
      const time = index / fps;
      drawing.fillStyle = "#000";
      drawing.fillRect(0, 0, width, height);
      drawing.fillStyle = "#fff";
      // Seven wide blocks encode the frame index through H.264 compression.
      for (let bit = 0; bit < 7; bit++)
        if (index & (1 << bit)) drawing.fillRect(16 * bit, 0, 16, 32);
      if (time >= 12 / fps && time < calloutEnd) {
        drawing.fillRect(8, 36, 112, 20);
        drawing.fillStyle = "#000";
        drawing.fillText("Callout", 32, 50);
      }
      const timestamp = Math.round(time * 1_000_000);
      const frame = new VideoFrame(drawing.canvas, {
        timestamp,
        duration: Math.round(((index + 1) / fps) * 1_000_000) - timestamp,
      });
      try {
        encoder.encode(frame, { keyFrame: index % 15 === 0 });
      } finally {
        frame.close();
      }
    }
    await encoder.flush();
    if (encodingError) throw encodingError;
  } finally {
    if (encoder.state !== "closed") encoder.close();
  }
  muxer.finalize();
  const blob = new Blob([target.buffer], { type: "video/mp4" });
  const scope = "indexed reader self-test";
  return withVideo(blob, scope, async (video) => {
    const samples = [];
    for (const frame of [0, 15, 14, 29, 30, 45, 44, 59, 60, 89]) {
      await seekFrameCenter(video, frame, scope);
      drawing.drawImage(video, 0, 0);
      const { data } = drawing.getImageData(0, 0, width, height);
      const lit = (x: number, y: number) => data[(y * width + x) * 4] > 128;
      let index = 0;
      for (let bit = 0; bit < 7; bit++)
        if (lit(16 * bit + 8, 16)) index |= 1 << bit;
      samples.push({ frame, index, callout: lit(16, 46) });
    }
    return samples;
  });
}

function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) freeze(item);
    Object.freeze(value);
  }
  return value;
}

// Use the production overlay and scene contracts for random access. The MP4
// entry point visits frames in presentation order, as required by the muxer.
async function shuffledDraws(
  plan: TimelinePlan,
  audio: PcmAudio,
  options: VisualCase,
  frames: number[],
  theme: "light" | "dark",
  rawHashes: Record<number, string>,
) {
  const { width, height } = plan.resolution;
  const output = new OffscreenCanvas(width, height).getContext("2d", {
    alpha: false,
  })!;
  const readback = context(width, height);
  const overlay = prepareOverlay(output, plan);
  const selected = getScene(options.scene);
  const scene = await selected.create(studio);
  const canvas =
    scene.kind === "2d" ? output.canvas : document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const paletteId = themePalette(theme, studio.paletteId);
  const abort = new AbortController();
  const inputs = {
    canvas,
    plan,
    audio,
    theme,
    orientation: options.orientation,
    paletteId,
    mood: studio.moodId,
  };
  const textLayouts = new Map<string, string[]>();
  try {
    if (
      (await scene.init({
        ...inputs,
        signal: abort.signal,
        fail: (error) => abort.abort(error),
      })) === "webgl-unavailable"
    )
      throw new Error("Shuffled draw requires actual WebGL2");
    async function draw(index: number) {
      abort.signal.throwIfAborted();
      const time = index / fps;
      const frame = overlay.frameAt(time);
      overlay.drawBackground(paletteId);
      let hostDrawn = false;
      if (!frame.card && frame.turn) {
        const inputsAtFrame = {
          ...inputs,
          index,
          time,
          turn: frame.turn,
          textLayouts,
        };
        if (scene.kind === "webgl") {
          scene.draw({ ...inputsAtFrame, kind: "webgl" });
          output.drawImage(canvas, 0, 0);
        } else {
          output.save();
          try {
            scene.draw({
              ...inputsAtFrame,
              kind: "2d",
              context: output,
              drawSpeakerLabel: () => {
                if (frame.stageFade) return;
                if (!hostDrawn) overlay.drawHosts(frame, paletteId);
                hostDrawn = true;
              },
            });
          } finally {
            output.restore();
          }
        }
        overlay.drawStageFade(frame, paletteId);
      }
      overlay.draw(frame, paletteId, hostDrawn);
      readback.drawImage(output.canvas, 0, 0);
      return sha256(readback.getImageData(0, 0, width, height).data);
    }
    const shuffled = frames
      .filter((_, index) => index % 2 === 1)
      .reverse()
      .concat(frames.filter((_, index) => index % 2 === 0));
    const mismatches = [];
    for (const frame of shuffled)
      if ((await draw(frame)) !== rawHashes[frame]) mismatches.push(frame);
    return { frames: shuffled, mismatches };
  } finally {
    scene.dispose();
  }
}

type FrameHashes = Record<number, { raw: string; decoded: string }>;

function visualTheme(options: VisualCase) {
  return options.scene === "waveform" && options.orientation === "portrait"
    ? "light"
    : "dark";
}

export async function verifyShuffledDraws(
  options: VisualCase,
  hashes: FrameHashes,
) {
  const { plan, audio } = fixture(options);
  setLocale(interfaceLocales[options.language]);
  await ensureVideoFonts({ texts: overlayCopy(plan).texts });
  const rawHashes = Object.fromEntries(
    Object.entries(hashes).map(([frame, { raw }]) => [frame, raw]),
  );
  return shuffledDraws(
    freeze(plan),
    audio,
    options,
    Object.keys(rawHashes).map(Number),
    visualTheme(options),
    rawHashes,
  );
}

export async function runVisualCase(options: VisualCase) {
  const started = performance.now();
  const scope = `${options.scene}/${options.orientation}/${options.language}`;
  const {
    episode,
    plan: mutablePlan,
    audio,
    content,
    voicedTurns,
  } = fixture(options);
  const plan = freeze(mutablePlan);
  setLocale(interfaceLocales[options.language]);
  const { width, height } = plan.resolution;
  const theme = visualTheme(options);
  const geometry = videoLayout(width, height, options.orientation);
  const boxes = boxesOf(geometry);
  const safe = boxFromFractions(
    designTokens[options.orientation].safe,
    width,
    height,
  );
  const titleSafe = boxFromFractions(
    designTokens.common.titleSafe,
    width,
    height,
  );
  const issues: Issue[] = [];
  const add = (issue: Issue) => {
    issues.push(issue);
  };
  for (const [name, box] of Object.entries(boxes)) {
    if (!contains(safe, box))
      add({
        criterion: "framing",
        detail: `layout box ${name} exceeds the product rectangle`,
      });
  }

  const fonts = await ensureVideoFonts({ texts: overlayCopy(plan).texts });
  const faces = Array.from(document.fonts, ({ family, weight, status }) => ({
    family: family.replace(/["']/gu, ""),
    weight,
    status,
  }));
  const expectedFamilies =
    options.language === "zh" || options.language === "sg"
      ? Object.values(videoFontFamilies)
      : [videoFontFamilies.latin];
  if (
    fonts?.notices.length ||
    fonts?.missingCharacters.length ||
    expectedFamilies.some(
      (name) =>
        !faces.some(
          (face) =>
            face.family === name &&
            face.weight === "600 800" &&
            face.status === "loaded",
        ),
    )
  ) {
    add({
      criterion: "typography",
      detail: `bundled font preflight: ${JSON.stringify({ fonts, faces })}`,
    });
  }
  const measure = context(1, 1);
  measure.font = videoFont(
    designTokens.common.weight.caption,
    geometry.type.caption,
  );
  measure.textAlign = "left";
  measure.textBaseline = "middle";
  const cues = voicedTurns.flatMap((turn, index) => {
    const result = layoutCaptionCues(turn, plan, geometry, measure);
    if (index < content.turns.length)
      captionEvidence(
        turn,
        episode.script!.turns[index].text,
        result,
        geometry,
        measure,
        content.locale,
        add,
      );
    return result;
  });
  const windows = plan.chapterWindows ?? [];
  const chapterStartFrames = windows.map(({ chapterId }) => {
    const turn = voicedTurns.find(
      (candidate) => candidate.chapterId === chapterId,
    )!;
    const samples = audio.channels[0];
    const offset = Math.round(turn.audioStart * audio.sampleRate);
    const voiced = samples
      .subarray(offset, offset + audio.sampleRate)
      .findIndex((sample) => Math.abs(sample) >= 0.005);
    if (voiced < 0) throw new Error(`No voiced onset in ${turn.turnId}`);
    // The frame whose interval contains the audio onset, provided that its
    // presentation timestamp has reached the start of the scheduled turn.
    return Math.max(
      firstFrame(turn.start),
      Math.floor((turn.start + voiced / audio.sampleRate) * fps),
    );
  });
  const titleHold = options.orientation === "landscape" ? 60 : 45;
  const callouts = plan.callouts ?? [];
  const boundaries = [...plan.scenes, ...windows, ...callouts, ...cues].flatMap(
    ({ start, end }) => [firstFrame(start), firstFrame(end)],
  );
  const frameCount = firstFrame(plan.duration);
  const rapidChapters = chapterStartFrames.slice(content.chapters.length);
  const stressStart = rapidChapters[0] ?? frameCount;
  const hashFrames = new Set(
    frameSet(
      [titleHold, ...boundaries.filter((frame) => frame < stressStart)],
      frameCount,
      boundaries.filter((frame) => frame >= stressStart),
    ),
  );
  const frames = frameSet([...boundaries, titleHold], frameCount, [
    frameCount - 1,
    ...cues.map(({ start, end }) => Math.floor(((start + end) / 2) * fps)),
  ]);
  const frameLookup = new Set(frames);
  const chapters = plan.scenes.filter((scene) => scene.kind === "chapter");
  const flashBoundaries = [
    titleHold,
    ...chapterStartFrames,
    ...[...chapters, ...voicedTurns].flatMap(({ start, end }) => [
      firstFrame(start),
      firstFrame(end),
    ]),
  ];
  // Cover the speaker and loud/quiet turn changes at full rate for a
  // quarter second on each side. Keep the entire rapid-chapter tail.
  const denseRadius = Math.ceil(fps / 4);
  const decodedFrames = Array.from(
    { length: frameCount },
    (_, frame) => frame,
  ).filter(
    (frame) =>
      frame % 2 === 0 ||
      frameLookup.has(frame) ||
      frame >= stressStart ||
      flashBoundaries.some(
        (boundary) => Math.abs(frame - boundary) <= denseRadius,
      ),
  );
  if (
    chapterStartFrames.length !== content.chapters.length + 2 ||
    chapterStartFrames[0] !== 0 ||
    chapters.length !== chapterStartFrames.length - 1 ||
    chapters.some(
      ({ start, chapterId }, index) =>
        firstFrame(start) !== chapterStartFrames[index + 1] ||
        chapterId !== windows[index + 1].chapterId,
    )
  ) {
    add({
      criterion: "opening",
      detail:
        "expected live speech on frame 0 and chapter cards at later audio onsets",
    });
  }
  if (rapidChapters.length !== 2 || rapidChapters[1] - rapidChapters[0] >= fps)
    add({
      criterion: "flash",
      detail: "stress fixture missed rapid chapter changes",
    });
  if (callouts.length !== 1)
    add({
      criterion: "opening",
      detail: "expected the fixture callout to fit in chapter 1",
    });
  for (const [index, callout] of callouts.entries()) {
    const containingChapter = windows.find(
      ({ start, end }) => callout.start >= start && callout.end <= end,
    );
    const overlapsCard = plan.scenes.some(
      (scene) =>
        scene.kind !== "turn" &&
        callout.end > scene.start &&
        callout.start < scene.end + motion.calloutClearOfCardMs / 1000 - 1e-6,
    );
    const closeToPrevious =
      index > 0 &&
      callout.start - callouts[index - 1].start <
        motion.calloutStartGapMs / 1000 - 1e-6;
    if (
      !containingChapter ||
      overlapsCard ||
      closeToPrevious ||
      firstFrame(callout.end) - firstFrame(callout.start) !==
        (motion.calloutMs / 1000) * fps
    ) {
      add({
        criterion: "opening",
        frame: firstFrame(callout.start),
        detail: "callout violates hold, chapter bounds or clearance",
      });
    }
  }
  const flash = flashSampler(options.orientation);
  const readback = context(width, height);
  const rawHashes = new Map<number, Promise<string>>();
  const decodedHashes = new Map<number, Promise<string>>();
  const rawExterior = new Map<number, ReturnType<typeof safeExterior>>();
  const masks = new Map<string, ReturnType<typeof measureGlyphs>>();
  const pendingText: TextProbe[] = [];
  const titleFrames = new Set<number>();
  type CapturedText = {
    role: TextRole;
    text: string;
    bounds: PixelBox;
    raw: Sample;
    pairs: number[];
  };
  const observations = new Map<number, CapturedText[]>();
  let index = 0;
  let hasExportCanvas = false;
  const VideoFrameReader = observeVideoFrames((canvas) => {
    flash.raw.add(index, flash.sample(canvas));
    if (frameLookup.has(index)) {
      readback.drawImage(canvas, 0, 0);
      const { data } = readback.getImageData(0, 0, width, height);
      if (hashFrames.has(index)) rawHashes.set(index, sha256(data));
      rawExterior.set(index, safeExterior(data, titleSafe, width, height));
      observations.set(
        index,
        pendingText.map((probe) => ({
          role: probe.role,
          text: probe.text,
          bounds: probe.bounds,
          ...sampleInk(probe, data, width),
        })),
      );
    }
    index++;
    pendingText.length = 0;
  });
  const renderStarted = performance.now();
  const rendered = await renderVideo({
    plan,
    audio,
    theme,
    sceneId: options.scene,
    studio3d: studio,
    deps: {
      VideoFrame: VideoFrameReader,
      createCanvas(w, h) {
        if (hasExportCanvas) return document.createElement("canvas");
        hasExportCanvas = true;
        const canvas = new OffscreenCanvas(w, h);
        const drawing = canvas.getContext("2d", { alpha: false })!;
        observeText(drawing, (text, x, y, maxWidth) => {
          if (!text?.trim()) return;
          const role = textRole(geometry, drawing, x, y);
          if (role === "title") titleFrames.add(index);
          if (!frameLookup.has(index)) return;
          const probe =
            role && makeProbe(drawing, role, text, x, y, maxWidth, masks);
          if (probe) pendingText.push(probe);
        });
        return canvas;
      },
    },
  });
  const renderMs = performance.now() - renderStarted;
  if (
    rendered.sceneId !== options.scene ||
    rendered.sceneNotices.length ||
    rendered.chapterScenes.length !== windows.length ||
    rendered.chapterScenes.some(({ sceneId }) => sceneId !== options.scene)
  ) {
    add({
      criterion: "repeatability",
      detail: `scene ${rendered.sceneId} with notices ${JSON.stringify(rendered.sceneNotices)}`,
    });
    if (options.scene === "studio3d")
      add({ criterion: "flash", detail: "Studio 3D was not exercised" });
  }
  if (rendered.fontNotices.length)
    add({
      criterion: "typography",
      detail: `renderer font notices: ${JSON.stringify(rendered.fontNotices)}`,
    });
  if (index !== frameCount)
    throw new Error(
      `Expected ${frameCount} rendered frames, received ${index}`,
    );

  const frameEvidence: {
    frame: number;
    currentTime: number;
    exterior: {
      raw: ReturnType<typeof safeExterior>;
      decoded: ReturnType<typeof safeExterior>;
    };
    expectedTitle: boolean;
    chapter: number;
    text: {
      role: TextRole;
      text: string;
      bounds: PixelBox;
      raw: Sample;
      decoded: Sample;
    }[];
  }[] = [];
  const exteriorEdges = { raw: 0, decoded: 0, decodedLargestComponent: 0 };
  let minimumRaw = Infinity;
  let minimumDecoded = Infinity;
  const measuredRoles = new Set<TextRole>();
  const roleContrast = new Map<TextRole, { raw: number; decoded: number }>();
  const mismatches = Array.from(
    { length: frameCount },
    (_, frame) => frame,
  ).filter((frame) => titleFrames.has(frame) !== frame < titleHold);
  if (mismatches.length)
    add({
      criterion: "opening",
      frame: mismatches[0],
      detail: `title draw expected on frames 0–${titleHold - 1}; ${mismatches.length} frames differ`,
    });
  const wordmarkLocale = wordmarkLocales[options.language];
  const expectedWordmark = createTranslator(wordmarkLocale)("video.wordmark");
  if (!rendered.videoCodec.startsWith("avc1."))
    throw new Error(
      `Expected H.264 for the decoded checks, received ${rendered.videoCodec}`,
    );
  async function readVideo(video: HTMLVideoElement) {
    if (video.videoWidth !== width || video.videoHeight !== height)
      throw new Error(
        `Decoded dimensions ${video.videoWidth}×${video.videoHeight} do not match ${width}×${height}`,
      );
    function readExact(frame: number, currentTime: number) {
      readback.drawImage(video, 0, 0);
      const { data } = readback.getImageData(0, 0, width, height);
      if (hashFrames.has(frame)) decodedHashes.set(frame, sha256(data));
      const raw = rawExterior.get(frame)!;
      const decoded = safeExterior(data, titleSafe, width, height);
      exteriorEdges.raw = Math.max(exteriorEdges.raw, raw.total);
      exteriorEdges.decoded = Math.max(exteriorEdges.decoded, decoded.total);
      exteriorEdges.decodedLargestComponent = Math.max(
        exteriorEdges.decodedLargestComponent,
        decoded.largestComponent,
      );
      if (raw.total || decoded.connectedPixels)
        add({
          criterion: "framing",
          frame,
          detail: `Strong edges outside title-safe: ${raw.total} raw, ${decoded.total} decoded (${decoded.largestComponent} in largest connected component)`,
        });
      const observed = observations.get(frame) ?? [];
      const textEvidence = observed.map(
        ({ role, text, raw, pairs, bounds }) => {
          const decoded = decodedInk(data, pairs);
          const criterion =
            role === "title" || role === "callout" ? "opening" : "contrast";
          measuredRoles.add(role);
          if (!contains(safe, bounds, 1))
            add({
              criterion: "framing",
              frame,
              detail: `${role} ink exceeds the product rectangle: ${text}`,
            });
          if (!contains(titleSafe, bounds, 1))
            add({
              criterion: "framing",
              frame,
              detail: `${role} ink exceeds title-safe: ${text}`,
            });
          if (raw.min !== null) minimumRaw = Math.min(minimumRaw, raw.min);
          if (decoded.min !== null)
            minimumDecoded = Math.min(minimumDecoded, decoded.min);
          const previous = roleContrast.get(role);
          roleContrast.set(role, {
            raw: Math.min(previous?.raw ?? Infinity, raw.min ?? Infinity),
            decoded: Math.min(
              previous?.decoded ?? Infinity,
              decoded.min ?? Infinity,
            ),
          });
          if (
            raw.pixels < 8 ||
            decoded.pixels < 8 ||
            raw.min === null ||
            raw.min < 4.5 ||
            decoded.min === null ||
            decoded.min < 4.5
          ) {
            add({
              criterion,
              frame,
              detail: `${role} ${JSON.stringify(text)} raw/decoded ratios ${raw.min?.toFixed(2) ?? "missing"}/${decoded.min?.toFixed(2) ?? "missing"}, ${raw.pixels}/${decoded.pixels} samples`,
            });
          }
          return { role, text, bounds, raw, decoded };
        },
      );
      const forRole = (role: TextRole) =>
        textEvidence.filter((run) => run.role === role);
      const hasInk = (role: TextRole) =>
        forRole(role).some(
          ({ decoded }) => decoded.pixels >= 8 && (decoded.min ?? 0) >= 4.5,
        );
      const matching = (role: TextRole, lines: string[]) =>
        JSON.stringify(forRole(role).map(({ text }) => text)) ===
        JSON.stringify(lines);
      const matchesCardText = (role: "title" | "chapter", title: string) =>
        forRole(role)
          .map(({ text }) => text)
          .join("")
          .replace(/\s+/gu, "") === title.replace(/\s+/gu, "");
      const chapter = chapterStartFrames.findLastIndex(
        (start) => frame >= start,
      );
      const expectedTitle = frame < titleHold;
      const chapterCard = chapters.find(
        ({ start, end }) =>
          frame >= firstFrame(start) && frame < firstFrame(end),
      );
      const expectedChapter = Boolean(chapterCard);
      const activeCue = cues.find(
        ({ start, end }) =>
          frame >= firstFrame(start) && frame < firstFrame(end),
      );
      if (
        hasInk("title") !== expectedTitle ||
        Boolean(forRole("title").length) !== expectedTitle ||
        (expectedTitle && !matchesCardText("title", content.title))
      )
        add({
          criterion: "opening",
          frame,
          detail: `opening title ink expected ${expectedTitle}`,
        });
      if (
        hasInk("chapter") !== expectedChapter ||
        Boolean(forRole("chapter").length) !== expectedChapter ||
        (chapterCard && !matchesCardText("chapter", chapterCard.title))
      )
        add({
          criterion: "opening",
          frame,
          detail: `chapter title ink expected ${expectedChapter}`,
        });
      if (
        chapter >= 0 &&
        (!matching("progress", [`${chapter + 1} / ${windows.length}`]) ||
          !hasInk("progress"))
      )
        add({
          criterion: "opening",
          frame,
          detail: `missing or incorrect chapter progress ${chapter + 1} / ${windows.length}`,
        });
      if (!matching("wordmark", [expectedWordmark]) || !hasInk("wordmark"))
        add({
          criterion: "typography",
          frame,
          detail: `expected decoded ${wordmarkLocale} wordmark ${JSON.stringify(expectedWordmark)}, drew ${JSON.stringify(forRole("wordmark").map(({ text }) => text))}`,
        });
      if (
        !matching("caption", activeCue?.lines ?? []) ||
        Boolean(activeCue) !== hasInk("caption")
      )
        add({
          criterion: "captions",
          frame,
          detail: "visible caption differs from measured cue",
        });
      if (frame === 0 && !hasInk("caption"))
        add({
          criterion: "opening",
          frame,
          detail: "opening caption ink missing",
        });
      const calloutExpected = callouts.some(
        ({ start, end }) =>
          frame >= firstFrame(start) && frame < firstFrame(end),
      );
      if (hasInk("callout") !== calloutExpected)
        add({
          criterion: "opening",
          frame,
          detail: `callout ink expected ${calloutExpected}`,
        });
      const calloutInk = forRole("callout");
      if (
        calloutInk.some(({ bounds }) =>
          [geometry.caption, ...geometry.hostChips].some(
            (box) =>
              bounds.x < box.x + box.width &&
              bounds.x + bounds.width > box.x &&
              bounds.y < box.y + box.height &&
              bounds.y + bounds.height > box.y,
          ),
        )
      ) {
        add({
          criterion: "opening",
          frame,
          detail: "callout ink overlaps a caption or host chip",
        });
      }
      frameEvidence.push({
        frame,
        currentTime,
        exterior: { raw, decoded },
        expectedTitle,
        chapter: chapter + 1,
        text: textEvidence,
      });
    }
    return readMovieFrames(
      video,
      scope,
      decodedFrames,
      frameLookup,
      readExact,
      (frame) => flash.decoded.add(frame, flash.sample(video)),
    );
  }
  const decodeStarted = performance.now();
  const decode = await withVideo(rendered.blob, scope, readVideo);
  const decodeMs = performance.now() - decodeStarted;
  const hashes: FrameHashes = Object.fromEntries(
    await Promise.all(
      [...hashFrames].map(async (frame) => [
        frame,
        {
          raw: await rawHashes.get(frame)!,
          decoded: await decodedHashes.get(frame)!,
        },
      ]),
    ),
  );
  for (const role of [
    "caption",
    "host",
    "wordmark",
    "chapter",
    "progress",
    "chapterIndex",
  ] as const) {
    if (!measuredRoles.has(role))
      add({ criterion: "contrast", detail: `no ${role} glyph samples` });
  }
  const assessment = flashAssessment(flash.evidence);
  issues.push(...assessment.issues);
  return {
    issues,
    hashes,
    flashDiagnostics: assessment.diagnostics,
    metrics: {
      resolution: { width, height },
      fps,
      seed,
      frameCount,
      decode,
      elapsedMs: {
        render: renderMs,
        decode: decodeMs,
        total: performance.now() - started,
      },
      frames,
      hashFrames: [...hashFrames],
      titleHold,
      titleFrames: [...titleFrames],
      chapterStartFrames,
      rapidChapters,
      boxes,
      titleSafe,
      faces,
      cues,
      callouts,
      codecs: { video: rendered.videoCodec, audio: rendered.audioCodec },
      scene: {
        id: rendered.sceneId,
        palette: rendered.paletteId,
        options: rendered.studio3d,
      },
      contrast: {
        raw: Number.isFinite(minimumRaw) ? minimumRaw : null,
        decoded: Number.isFinite(minimumDecoded) ? minimumDecoded : null,
        byRole: Object.fromEntries(roleContrast),
      },
      exteriorEdges,
      frameEvidence: frameEvidence.sort((a, b) => a.frame - b.frame),
      flash: { ...flash.evidence, decodedFrames },
    },
  };
}

export async function runThumbnails() {
  const cases = [
    {
      variant: "topic-graphic",
      headline: "组屋如何混居",
      topicGraphic: "housing-blocks",
    },
    { variant: "host-pair", headline: "邻里怎样共享空间" },
    { variant: "headline", headline: "社区空间人人共享" },
  ] as const satisfies readonly ThumbnailOptions[];
  const issues: Issue[] = [];
  const thumbnails = [];
  for (const options of cases) {
    const { variant, headline } = options;
    const fail = (detail: string) =>
      issues.push({ criterion: "thumbnail", detail: `${variant}: ${detail}` });
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { colorSpace: "srgb", alpha: false })!;
    const probes: TextProbe[] = [];
    const masks = new Map<string, ReturnType<typeof measureGlyphs>>();
    observeText(ctx, (text, x, y, maxWidth) => {
      if (y < 120) probes.length = 0; // A retry starts with the wordmark.
      const probe = makeProbe(
        ctx,
        y < 120 ? "wordmark" : "title",
        text,
        x,
        y,
        maxWidth,
        masks,
      );
      if (probe) probes.push(probe);
    });
    try {
      const png = await encodeThumbnail(canvas, {
        ...options,
        language: "zh",
        paletteId: "aurora",
        seed,
      });
      const image = await createImageBitmap(png);
      try {
        const { width, height } = image;
        const pixels = context(width, height);
        pixels.drawImage(image, 0, 0);
        const { data } = pixels.getImageData(0, 0, width, height);
        if (
          width !== 1280 ||
          height !== 720 ||
          png.type !== "image/png" ||
          !png.size ||
          png.size >= 2_000_000
        )
          fail(`PNG size ${width}×${height}, ${png.size} bytes (${png.type})`);
        const [left, top, right, bottom] =
          thumbnailDesign.layouts[variant].text;
        const textBox = {
          x: left,
          y: top,
          width: right - left,
          height: bottom - top,
        };
        const badge = boxFromFractions(
          thumbnailDesign.durationBadgeExclusion,
          width,
          height,
        );
        const headlineRuns = probes.filter(({ role }) => role === "title");
        if (
          headlineRuns.map(({ text }) => text).join("") !== headline ||
          headlineRuns.some(({ bounds }) => !contains(textBox, bounds))
        )
          fail("headline is missing, incomplete or outside its box");
        const expectedWordmark = createTranslator("zh-CN")("video.wordmark");
        if (
          probes.find(({ role }) => role === "wordmark")?.text !==
          expectedWordmark
        )
          fail(
            `PNG did not draw the Mandarin episode wordmark ${expectedWordmark}`,
          );
        let badgeInk = 0;
        for (let y = Math.ceil(badge.y - 0.5); y < height; y++) {
          for (let x = Math.ceil(badge.x - 0.5); x < width; x++) {
            const at = (y * width + x) * 4;
            const background = x * 4;
            if (colorDistance(data, at, data, background) > 2) badgeInk++;
          }
        }
        if (badgeInk)
          fail(`${badgeInk} content pixels in duration badge exclusion`);
        const text = probes.map((probe) => ({
          text: probe.text,
          bounds: probe.bounds,
          ...sampleInk(probe, data, width, false).raw,
        }));
        if (
          !text.length ||
          text.some(
            ({ min, pixels }) => pixels < 8 || min === null || min < 4.5,
          )
        )
          fail(`text contrast below 4.5:1: ${JSON.stringify(text)}`);
        const glyphMask = context(width, height);
        for (const { alpha, box } of headlineRuns) {
          const run = context(box.width, box.height);
          run.putImageData(new ImageData(alpha, box.width, box.height), 0, 0);
          glyphMask.drawImage(run.canvas, box.x, box.y);
        }
        const previewWidth = 160;
        const previewHeight = 90;
        const preview = context(previewWidth, previewHeight);
        const mask = context(previewWidth, previewHeight);
        preview.imageSmoothingQuality = mask.imageSmoothingQuality = "high";
        preview.drawImage(image, 0, 0, previewWidth, previewHeight);
        mask.drawImage(glyphMask.canvas, 0, 0, previewWidth, previewHeight);
        const small = preview.getImageData(
          0,
          0,
          previewWidth,
          previewHeight,
        ).data;
        const alpha = mask.getImageData(0, 0, previewWidth, previewHeight).data;
        let longest = 0;
        let run = 0;
        for (let y = 0; y < previewHeight; y++) {
          let ink = 0;
          for (let x = 0; x < previewWidth; x++) {
            const pixel = (y * previewWidth + x) * 4;
            const background = ((previewHeight - 1) * previewWidth + x) * 4;
            if (
              alpha[pixel + 3] >= 64 &&
              contrast(luma(small, pixel), luma(small, background)) >= 3
            )
              ink++;
          }
          run = ink >= 3 ? run + 1 : 0;
          longest = Math.max(longest, run);
        }
        if (longest < 8) fail(`CJK ink height ${longest} px at 160×90`);
        thumbnails.push({
          variant,
          width,
          height,
          bytes: png.size,
          badgeInk,
          textBox,
          text,
          inkHeightAt160: longest,
        });
      } finally {
        image.close();
      }
    } catch (error) {
      fail(String(error));
    }
  }
  return { thumbnails, issues };
}

export async function runFallback(orientation: Orientation) {
  const { plan, audio } = fixture(
    { scene: "studio3d", orientation, language: "en" },
    [2.4, 0.6],
  );
  const rendered = await renderVideo({
    plan: freeze(plan),
    audio,
    theme: "dark",
    sceneId: "studio3d",
    studio3d: studio,
    deps: {
      createCanvas(width, height) {
        const canvas = new OffscreenCanvas(width, height);
        const getContext = canvas.getContext.bind(canvas);
        Object.defineProperty(canvas, "getContext", {
          value: (kind: string, options: unknown) =>
            kind === "webgl2"
              ? null
              : Reflect.apply(getContext, canvas, [kind, options]),
        });
        return canvas;
      },
    },
  });
  const scope = `fallback/${orientation}`;
  const plays = await withVideo(rendered.blob, scope, async (video) => {
    await seekFrameCenter(video, 75, scope);
    return (
      video.videoWidth === plan.resolution.width &&
      video.videoHeight === plan.resolution.height
    );
  });
  const passed =
    plays &&
    rendered.sceneId === "waveform" &&
    rendered.sceneNotices.some(
      (notice) =>
        notice.reason === "webgl-unavailable" &&
        notice.fallbackSceneId === "waveform",
    );
  return {
    passed,
    plays,
    sceneId: rendered.sceneId,
    notices: rendered.sceneNotices,
  };
}
