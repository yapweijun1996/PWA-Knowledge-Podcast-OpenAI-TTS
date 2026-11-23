import type { Language } from "../../shared/factory.ts";
import {
  createTranslator,
  defaultLocale,
  t,
  type Locale,
} from "../i18n/index.ts";
import { wrapText } from "../text/wrap.ts";
import { palettes } from "../video/design/palettes.ts";
import { designTokens } from "../video/design/tokens.ts";
import { ensureVideoFonts, videoFont } from "../video/fonts/loader.ts";
import { themePalette } from "../video/themes.ts";
import {
  cjkHeadlineLength,
  deriveThumbnailHeadline,
  headlineGraphemes,
  isCjkHeadline,
  publishLocales,
  thumbnailHeadlineErrors,
  validateThumbnailHeadline,
  type ThumbnailHeadline,
  type ThumbnailHeadlineError,
} from "./thumbnail-headline.ts";
import {
  chooseTopicGraphic,
  drawHostPair,
  drawTopicGraphic,
  type GraphicBox,
  type GraphicContext,
  type TopicGraphic,
} from "./topic-graphics.ts";

export {
  deriveThumbnailHeadline,
  thumbnailHeadlineErrors,
  thumbnailHeadlineLimits,
  validateThumbnailHeadline,
  type ThumbnailHeadline,
  type ThumbnailHeadlineError,
} from "./thumbnail-headline.ts";

export const thumbnailSize = { width: 1280, height: 720 } as const;
export const thumbnailByteLimit = 2_000_000;
export type ThumbnailTheme = "light" | "dark";
export type ThumbnailVariant = "topic-graphic" | "host-pair" | "headline";
export type ThumbnailPaletteId = keyof typeof palettes;

export const thumbnailDesign = {
  inset: [80, 72],
  durationBadgeExclusion: [0.79, 0.78, 1, 1],
  headlineSizeH: 0.136,
  headlineMinSizeH: 0.119,
  headlineLeading: 1.1,
  wordmarkSizeH: designTokens.common.thumbnailWordmarkSizeH,
  accentRuleY: 0.33,
  accentRuleH: 0.009,
  accentRuleGapH: 0.03,
  maxLines: 2,
  layouts: {
    "topic-graphic": {
      text: [80, 155, 755, 540],
      graphic: [800, 112, 1190, 530],
      cjkPerLine: 6,
    },
    "host-pair": {
      text: [80, 155, 734, 540],
      graphic: [768, 120, 1188, 535],
      cjkPerLine: 6,
    },
    headline: { text: [80, 150, 1160, 530], graphic: null, cjkPerLine: 8 },
  },
} as const;

export type ThumbnailOptions = {
  title?: string;
  headline?: ThumbnailHeadline;
  variant?: ThumbnailVariant;
  paletteId?: ThumbnailPaletteId;
  theme?: ThumbnailTheme;
  language?: Language;
  locale?: Locale;
  topicKeywords?: string | readonly string[];
  topicGraphic?: TopicGraphic;
  seed?: number;
  wordmark?: string;
};

type LegacyThumbnailOptions = {
  title: string;
  theme: ThumbnailTheme;
  language?: Language;
};

type TextMetrics = { width: number } & Partial<
  Pick<
    globalThis.TextMetrics,
    | "actualBoundingBoxLeft"
    | "actualBoundingBoxRight"
    | "actualBoundingBoxAscent"
    | "actualBoundingBoxDescent"
  >
>;
type TextContext = Pick<
  CanvasRenderingContext2D,
  | "save"
  | "restore"
  | "fillStyle"
  | "fillRect"
  | "font"
  | "textBaseline"
  | "textAlign"
  | "fillText"
> & { measureText(text: string): TextMetrics };
export type ThumbnailContext = TextContext &
  GraphicContext &
  Pick<CanvasRenderingContext2D, "createLinearGradient">;

type HeadlineLayout = {
  lines: string[];
  x: number;
  baselines: number[];
  fontSize: number;
  bounds: GraphicBox[];
  inkHeight: number | null;
};

export type ThumbnailLayoutMetadata = {
  variant: ThumbnailVariant;
  headlineBounds: readonly GraphicBox[];
  wordmarkBounds: GraphicBox;
  decorationBounds: GraphicBox;
  headlineInk: string;
  wordmarkInk: string;
  backdropColors: readonly string[];
  /** Native-pixel height of the shortest CJK line, or Latin x-height. */
  inkHeight: number | null;
  script: "cjk" | "latin";
};

export type ThumbnailResult =
  | {
      variant: ThumbnailVariant;
      headline: ThumbnailHeadline;
      lines: string[];
      fontSize: number;
      /** Available from the full canvas renderer. */
      layoutMetadata?: ThumbnailLayoutMetadata;
      needsShorterHeadline: false;
      error?: never;
    }
  | {
      variant: ThumbnailVariant;
      headline: ThumbnailHeadline | null;
      lines: [];
      needsShorterHeadline: boolean;
      error: ThumbnailHeadlineError;
    };

const contrastFloor = 4.5;
const stops = [0, 0.55, 1] as const;
const { width, height } = thumbnailSize;
const hostPairShiftPx = 12;

type RGB = readonly [number, number, number];

function rgb(hex: string): RGB {
  return [
    Number.parseInt(hex.slice(1, 3), 16) / 255,
    Number.parseInt(hex.slice(3, 5), 16) / 255,
    Number.parseInt(hex.slice(5, 7), 16) / 255,
  ];
}

function linear(value: number) {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function srgb(value: number) {
  return value <= 0.0031308
    ? 12.92 * value
    : 1.055 * value ** (1 / 2.4) - 0.055;
}

function hex(channels: readonly number[]) {
  return (
    "#" +
    channels
      .map((channel) =>
        Math.round(channel * 255)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}

function luminance(color: string) {
  const [r, g, b] = rgb(color);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

export function thumbnailContrastRatio(first: string, second: string) {
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Score canvas geometry and gradient-stop contrast without sampling pixels. */
export function thumbnailChecks(layoutMetadata: ThumbnailLayoutMetadata) {
  const {
    variant,
    headlineBounds,
    wordmarkBounds,
    decorationBounds,
    headlineInk,
    wordmarkInk,
    backdropColors,
    script,
    inkHeight,
  } = layoutMetadata;
  const { text, graphic } = thumbnailDesign.layouts[variant];
  const [left, top] = thumbnailDesign.inset;
  const safe = [left, top, width - left, height - top] as const;
  const [badgeLeft, badgeTop] = thumbnailDesign.durationBadgeExclusion;
  const keyBounds = [...headlineBounds, wordmarkBounds, decorationBounds];
  const inside = (box: GraphicBox, area: GraphicBox) =>
    box[0] >= area[0] &&
    box[1] >= area[1] &&
    box[2] <= area[2] &&
    box[3] <= area[3];
  const ratio =
    backdropColors.length === 0
      ? 0
      : Math.min(
          ...backdropColors.flatMap((color) => [
            thumbnailContrastRatio(headlineInk, color),
            thumbnailContrastRatio(wordmarkInk, color),
          ]),
        );
  const minimum = script === "cjk" ? 8 : 6;
  const pixels = inkHeight === null ? null : inkHeight * (90 / height);
  return {
    bounds:
      headlineBounds.length > 0 &&
      headlineBounds.every((box) => inside(box, text)) &&
      inside(decorationBounds, graphic ?? text) &&
      keyBounds.every((box) => inside(box, safe)),
    contrast: { ratio, passed: ratio >= contrastFloor },
    badgeClearance: keyBounds.every(
      (box) => box[2] <= badgeLeft * width || box[3] <= badgeTop * height,
    ),
    inkHeight160x90: {
      pixels,
      minimum,
      passed: pixels !== null && pixels >= minimum,
    },
  };
}

/** Composite neutral colour into the backdrop until the ink clears the floor. */
export function ensureThumbnailContrast(ink: string, backdrop: string) {
  const lightInk =
    thumbnailContrastRatio(ink, "#000000") >=
    thumbnailContrastRatio(ink, "#FFFFFF");
  const neutral = lightInk ? 0 : 1;
  const inkLuminance = luminance(ink);
  const passes = (color: string, floor: number) =>
    (lightInk
      ? luminance(color) <= inkLuminance
      : luminance(color) >= inkLuminance) &&
    thumbnailContrastRatio(ink, color) >= floor;

  if (passes(backdrop, contrastFloor + 0.02)) return backdrop;
  const channels = rgb(backdrop);
  let lo = 0;
  let hi = 256;
  while (hi - lo > 1) {
    const alpha = Math.floor((lo + hi) / 2);
    const candidate = hex(
      channels.map((channel) => channel + ((neutral - channel) * alpha) / 256),
    );
    if (passes(candidate, contrastFloor + 0.02)) hi = alpha;
    else lo = alpha;
  }
  return hex(
    channels.map((channel) => channel + ((neutral - channel) * hi) / 256),
  );
}

function backdropColor(
  palette: (typeof palettes)[ThumbnailPaletteId],
  color: string,
) {
  return ensureThumbnailContrast(
    palette.ink,
    ensureThumbnailContrast(palette.secondaryInk, color),
  );
}

function thumbnailBackdrop(
  ctx: ThumbnailContext,
  palette: (typeof palettes)[ThumbnailPaletteId],
  reduced: boolean,
) {
  if (reduced) {
    const fill = backdropColor(palette, palette.stops[1]);
    return { fill, colors: [fill] };
  }

  const gradient = ctx.createLinearGradient(0, 0, width, 0);
  const colors: string[] = [];
  const addStop = (offset: number, color: string) => {
    const adjusted = backdropColor(palette, color);
    gradient.addColorStop(offset, adjusted);
    colors.push(adjusted);
  };
  const channels = palette.stops.map((stop) => rgb(stop).map(linear));
  // Canvas interpolates its stops in sRGB. Subdivide the two linear-light spans.
  for (let span = 0; span < 2; span++) {
    for (let sample = 0; sample < 16; sample++) {
      const progress = sample / 16;
      const color = hex(
        channels[span].map((channel, i) =>
          srgb(channel + (channels[span + 1][i] - channel) * progress),
        ),
      );
      addStop(stops[span] + (stops[span + 1] - stops[span]) * progress, color);
    }
  }
  addStop(1, palette.stops[2]);
  return { fill: gradient, colors };
}

export function resolveThumbnailVariant(options: ThumbnailOptions) {
  const locale =
    options.locale ??
    (options.language && publishLocales[options.language]) ??
    defaultLocale;
  const graphic =
    options.topicGraphic ??
    chooseTopicGraphic(
      options.topicKeywords ?? options.title ?? options.headline ?? "",
      locale,
    );
  const variant = options.variant ?? (graphic ? "topic-graphic" : "host-pair");
  // An explicitly chosen topic layout still needs a focal graphic.
  if (variant === "topic-graphic" && !graphic)
    return { variant: "host-pair", graphic: null } as const;
  return { variant, graphic };
}

function prepareThumbnail(options: ThumbnailOptions) {
  const title = options.title?.normalize("NFC");
  const customHeadline = options.headline?.normalize("NFC");
  const locale =
    options.locale ??
    (options.language && publishLocales[options.language]) ??
    defaultLocale;
  const { variant, graphic } = resolveThumbnailVariant({
    ...options,
    title,
    headline: customHeadline,
  });
  const wordmarkLocale = options.language
    ? publishLocales[options.language]
    : locale;
  const defaultWordmark =
    createTranslator(wordmarkLocale)("video.wordmark").normalize("NFC");
  const headline =
    (customHeadline ??
      (variant === "headline" && graphic === "housing-blocks"
        ? createTranslator(locale)("publish.thumbnail.housingClaim")
        : deriveThumbnailHeadline(title ?? "", locale, variant === "headline")))
      ?.normalize("NFC") ?? null;
  const label = options.wordmark?.normalize("NFC").trim() ?? "";
  const limit = isCjkHeadline(label)
    ? designTokens.landscape.text.wordmark[1]
    : designTokens.landscape.text.wordmark[2];
  const wordmark =
    label &&
    !/[<>\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u.test(label) &&
    headlineGraphemes(label, wordmarkLocale).length <= limit
      ? label
      : defaultWordmark;
  const palette =
    palettes[options.paletteId ?? themePalette(options.theme ?? "dark")];
  return {
    variant,
    graphic,
    locale,
    headline,
    wordmark,
    defaultWordmark,
    palette,
    seed: options.seed ?? 0,
  };
}

function inkBounds(
  metrics: TextMetrics,
  x: number,
  baseline: number,
  size: number,
): GraphicBox {
  return [
    x - (metrics.actualBoundingBoxLeft ?? 0),
    baseline - (metrics.actualBoundingBoxAscent ?? size * 0.82),
    x + (metrics.actualBoundingBoxRight ?? metrics.width),
    baseline + (metrics.actualBoundingBoxDescent ?? size * 0.18),
  ];
}

const [ruleLeft] = thumbnailDesign.inset;
const ruleTop = thumbnailDesign.accentRuleY * height;
const ruleWidth = 94;
const ruleHeight = thumbnailDesign.accentRuleH * height;
const accentRule = [
  ruleLeft,
  ruleTop,
  ruleLeft + ruleWidth,
  ruleTop + ruleHeight,
] as const;

function fitHeadline(
  ctx: TextContext,
  headline: string,
  locale: Locale,
  variant: ThumbnailVariant,
): HeadlineLayout | null {
  const {
    text: [left, top, right, bottom],
    cjkPerLine,
  } = thumbnailDesign.layouts[variant];
  const maxWidth = right - left;
  const inkStart =
    variant === "headline"
      ? accentRule[3] + thumbnailDesign.accentRuleGapH * height
      : top;
  const cjk = isCjkHeadline(headline);
  const min = thumbnailDesign.headlineMinSizeH * height;
  const max = thumbnailDesign.headlineSizeH * height;
  for (let size = max; ; size = Math.max(min, size - 1)) {
    ctx.font = videoFont(designTokens.common.weight.thumbnail, size);
    const lines = wrapText(
      {
        measureText(line) {
          if (cjk && cjkHeadlineLength(line, locale) > cjkPerLine) {
            return { width: maxWidth + 1 };
          }
          const metrics = ctx.measureText(line);
          return {
            width:
              Math.max(metrics.width, metrics.actualBoundingBoxRight ?? 0) +
              Math.max(0, metrics.actualBoundingBoxLeft ?? 0),
          };
        },
      },
      headline,
      maxWidth,
      locale,
    );
    const last = lines.at(-1)?.replace(/[^\p{L}\p{M}\p{N}]/gu, "") ?? "";
    if (
      lines.length <= thumbnailDesign.maxLines &&
      (lines.length === 1 || headlineGraphemes(last, locale).length > 1) &&
      (!cjk ||
        lines.every((line) => cjkHeadlineLength(line, locale) <= cjkPerLine))
    ) {
      const measures = lines.map((line) => ctx.measureText(line));
      const offset = Math.max(
        0,
        ...measures.map((metrics) => metrics.actualBoundingBoxLeft ?? 0),
      );
      const requiredWidth = Math.max(
        ...measures.map((m) =>
          Math.max(m.width, m.actualBoundingBoxRight ?? 0),
        ),
      );
      const leading = size * thumbnailDesign.headlineLeading;
      const inkTop = Math.min(
        ...measures.map(
          (m, i) => i * leading - (m.actualBoundingBoxAscent ?? size * 0.82),
        ),
      );
      const inkBottom = Math.max(
        ...measures.map(
          (m, i) => i * leading + (m.actualBoundingBoxDescent ?? size * 0.18),
        ),
      );
      if (
        requiredWidth + offset <= maxWidth &&
        inkBottom - inkTop <= bottom - inkStart
      ) {
        const baseline =
          variant === "headline"
            ? inkStart - inkTop
            : (top + bottom - inkTop - inkBottom) / 2;
        const x = left + offset;
        const baselines = lines.map((_, i) => baseline + i * leading);
        const inkMetrics = cjk ? measures : [ctx.measureText("x")];
        const inkHeight = Math.min(
          ...inkMetrics.map(
            (metrics) =>
              (metrics.actualBoundingBoxAscent ?? NaN) +
              (metrics.actualBoundingBoxDescent ?? NaN),
          ),
        );
        return {
          lines,
          x,
          baselines,
          fontSize: size,
          bounds: measures.map((metrics, i) =>
            inkBounds(metrics, x, baselines[i], size),
          ),
          inkHeight: Number.isFinite(inkHeight) ? inkHeight : null,
        };
      }
    }
    if (size === min) return null;
  }
}

function drawPreparedThumbnail(
  ctx: ThumbnailContext,
  prepared: ReturnType<typeof prepareThumbnail>,
  reduced: boolean,
): ThumbnailResult {
  const {
    variant,
    graphic,
    palette,
    locale,
    headline,
    wordmark,
    defaultWordmark,
    seed,
  } = prepared;
  const { graphic: graphicBox } = thumbnailDesign.layouts[variant];
  ctx.save();
  try {
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    const validation =
      headline === null ? null : validateThumbnailHeadline(headline, locale);
    const layout = validation?.value
      ? fitHeadline(ctx, validation.value, locale, variant)
      : null;

    const backdrop = thumbnailBackdrop(ctx, palette, reduced);
    ctx.fillStyle = backdrop.fill;
    ctx.fillRect(0, 0, width, height);

    const [left, top] = thumbnailDesign.inset;
    const wordmarkSize = thumbnailDesign.wordmarkSizeH * height;
    ctx.font = videoFont(
      designTokens.common.weight.thumbnailWordmark,
      wordmarkSize,
    );
    const maxWordmarkWidth = width * designTokens.common.wordmarkMaxWidthW[0];
    const safeLabel =
      ctx.measureText(wordmark).width <= maxWordmarkWidth
        ? wordmark
        : defaultWordmark;
    const mark = ctx.measureText(safeLabel);
    const markX = left + Math.max(0, mark.actualBoundingBoxLeft ?? 0);
    const markBaseline =
      top + (mark.actualBoundingBoxAscent ?? wordmarkSize * 0.82);
    ctx.fillStyle = palette.secondaryInk;
    ctx.fillText(safeLabel, markX, markBaseline);

    if (graphicBox) {
      if (variant === "topic-graphic" && graphic)
        drawTopicGraphic(ctx, graphic, graphicBox, palette, seed, reduced);
      if (variant === "host-pair") {
        const [left, top, right, bottom] = graphicBox;
        drawHostPair(
          ctx,
          [left - hostPairShiftPx, top, right - hostPairShiftPx, bottom],
          palette,
          reduced,
        );
      }
    } else {
      ctx.fillStyle = palette.hostA;
      ctx.fillRect(ruleLeft, ruleTop, ruleWidth, ruleHeight);
    }

    if (!layout || !validation?.value) {
      const error =
        validation?.error ?? thumbnailHeadlineErrors.needsShorterHeadline;
      return {
        variant,
        headline,
        lines: [],
        needsShorterHeadline:
          error === thumbnailHeadlineErrors.needsShorterHeadline,
        error,
      };
    }

    ctx.font = videoFont(designTokens.common.weight.thumbnail, layout.fontSize);
    ctx.fillStyle = palette.ink;
    for (const [index, line] of layout.lines.entries()) {
      ctx.fillText(line, layout.x, layout.baselines[index]);
    }
    return {
      variant,
      headline: validation.value,
      lines: layout.lines,
      fontSize: layout.fontSize,
      layoutMetadata: {
        variant,
        headlineBounds: layout.bounds,
        wordmarkBounds: inkBounds(mark, markX, markBaseline, wordmarkSize),
        decorationBounds: graphicBox ?? accentRule,
        headlineInk: palette.ink,
        wordmarkInk: palette.secondaryInk,
        backdropColors: backdrop.colors,
        inkHeight: layout.inkHeight,
        script: isCjkHeadline(validation.value) ? "cjk" : "latin",
      },
      needsShorterHeadline: false,
    };
  } finally {
    ctx.restore();
  }
}

/** Draw onto a 1280×720 sRGB canvas with its default transform. */
export function drawThumbnail(
  ctx: ThumbnailContext,
  options: ThumbnailOptions,
): ThumbnailResult;
export function drawThumbnail(
  ctx: TextContext,
  options: LegacyThumbnailOptions,
): ThumbnailResult;
export function drawThumbnail(
  ctx: ThumbnailContext | TextContext,
  options: ThumbnailOptions,
): ThumbnailResult {
  if (!("createLinearGradient" in ctx))
    return drawLegacyThumbnail(ctx, options);
  return drawPreparedThumbnail(ctx, prepareThumbnail(options), false);
}

/** Compatibility for callers using the original text-only drawing interface. */
function drawLegacyThumbnail(
  ctx: TextContext,
  options: ThumbnailOptions,
): ThumbnailResult {
  const colors = options.theme === "light" ? palettes.light : palettes.aurora;
  const locale =
    options.locale ?? (options.language && publishLocales[options.language]);
  const headline = (
    (options.headline ?? options.title)?.trim() ||
    (locale ? createTranslator(locale) : t)("publish.content.untitled")
  ).normalize("NFC");
  const inset = 104;
  const textWidth = width - 2 * inset;
  const fontSize = 84;
  ctx.save();
  try {
    ctx.fillStyle = colors.stops[0];
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = colors.hostA;
    ctx.fillRect(inset, 104, 96, 8);
    ctx.font = videoFont(designTokens.common.weight.thumbnail, fontSize);
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = colors.ink;
    const lines = wrapText(ctx, headline, textWidth, locale, 3);
    const firstY = 350 - (lines.length - 1) * 51;
    for (const [index, line] of lines.entries()) {
      ctx.fillText(line, inset, firstY + index * 102, textWidth);
    }
    return {
      variant: "headline",
      headline,
      lines,
      fontSize,
      needsShorterHeadline: false,
    };
  } finally {
    ctx.restore();
  }
}

export type ThumbnailCanvas = {
  width: number;
  height: number;
  getContext(
    type: "2d",
    options: CanvasRenderingContext2DSettings,
  ): ThumbnailContext | null;
  toBlob(callback: BlobCallback, type: "image/png"): void;
};

export type ThumbnailErrorCode =
  | ThumbnailHeadlineError
  | "publish.thumbnail.fontUnavailable"
  | "publish.thumbnail.pngEncodingFailed"
  | "publish.thumbnail.pngTooLarge";

export class ThumbnailError extends Error {
  readonly code: ThumbnailErrorCode;

  constructor(code: ThumbnailErrorCode, locale?: Locale) {
    super((locale ? createTranslator(locale) : t)(code));
    this.name = "ThumbnailError";
    this.code = code;
  }
}

export function assertThumbnailSize(blob: Blob, locale?: Locale) {
  if (blob.size >= thumbnailByteLimit)
    throw new ThumbnailError("publish.thumbnail.pngTooLarge", locale);
}

export async function encodeThumbnail(
  canvas: ThumbnailCanvas,
  options: ThumbnailOptions,
  loadFonts = ensureVideoFonts,
): Promise<Blob> {
  const prepared = prepareThumbnail(options);
  const { headline, locale, wordmark, defaultWordmark } = prepared;
  if (headline === null)
    throw new ThumbnailError(
      thumbnailHeadlineErrors.needsShorterHeadline,
      locale,
    );
  const { error } = validateThumbnailHeadline(headline, locale);
  if (error) throw new ThumbnailError(error, locale);

  const { missingCharacters } = await loadFonts({
    texts: [headline, wordmark, defaultWordmark],
  });
  if (missingCharacters.length)
    throw new ThumbnailError("publish.thumbnail.fontUnavailable", locale);

  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { colorSpace: "srgb", alpha: false });
  if (!ctx)
    throw new ThumbnailError("publish.thumbnail.pngEncodingFailed", locale);

  for (const reduced of [false, true]) {
    const result = drawPreparedThumbnail(ctx, prepared, reduced);
    if (result.error) throw new ThumbnailError(result.error, locale);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((value) => {
        if (value?.size && value.type === "image/png") resolve(value);
        else
          reject(
            new ThumbnailError("publish.thumbnail.pngEncodingFailed", locale),
          );
      }, "image/png");
    });
    if (blob.size < thumbnailByteLimit) return blob;
  }
  throw new ThumbnailError("publish.thumbnail.pngTooLarge", locale);
}
