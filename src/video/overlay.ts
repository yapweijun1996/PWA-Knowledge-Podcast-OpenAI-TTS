import type { Host } from "../../shared/factory.ts";
import { createTranslator, isLocale, t } from "../i18n/index.ts";
import {
  chooseTopicGraphic,
  drawHostPair,
  drawTopicGraphic,
  type GraphicContext,
} from "../publish/topic-graphics.ts";
import { joinCaptionLines, wrapDisplayText } from "../text/wrap.ts";
import { videoLayout, type PixelBox } from "./design/layout.ts";
import { palettes, type Palette } from "./design/palettes.ts";
import { designTokens } from "./design/tokens.ts";
import { videoFont } from "./fonts/loader.ts";
import type {
  DrawingContext,
  SceneCanvas,
  TextLayoutCache,
} from "./scenes/types.ts";
import type { VideoPaletteId } from "./themes.ts";
import {
  beforeEnd,
  latestStarted,
  layoutCaptionCues,
  planOrientation,
  type TimelinePlan,
  type VideoTurn,
} from "./timeline.ts";

const { leading, motion, weight } = designTokens.common;
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const easeOut = (value: number) => 1 - (1 - clamp(value)) ** 3;
const easeIn = (value: number) => clamp(value) ** 3;
const bottom = (box: PixelBox) => box.y + box.height;
const centerY = (box: PixelBox) => box.y + box.height / 2;
const right = (box: PixelBox) => box.x + box.width;
const centerX = (box: PixelBox) => box.x + box.width / 2;

function decoration(
  time: number,
  start: number,
  end: number,
  enterMs: number,
  exitMs: number,
) {
  const entered = easeOut(((time - start) * 1000) / enterMs);
  const leaving = easeIn(1 - ((end - time) * 1000) / exitMs);
  return entered * (1 - leaving);
}

function rect(
  context: DrawingContext,
  box: PixelBox,
  color: string,
  radius = 0,
) {
  context.fillStyle = color;
  if (radius && context.beginPath && context.roundRect && context.fill) {
    context.beginPath();
    context.roundRect(box.x, box.y, box.width, box.height, radius);
    context.fill();
  } else {
    context.fillRect(box.x, box.y, box.width, box.height);
  }
}

function pixelAlignedPlate(box: PixelBox): PixelBox {
  // Snap inward to the codec's 2×2 chroma grid and keep inside layout bounds.
  const x = Math.ceil(box.x / 2) * 2;
  const y = Math.ceil(box.y / 2) * 2;
  return {
    x,
    y,
    width: Math.max(0, Math.floor(right(box) / 2) * 2 - x),
    height: Math.max(0, Math.floor(bottom(box) / 2) * 2 - y),
  };
}

function linesAt(
  context: DrawingContext,
  lines: readonly string[],
  x: number,
  y: number,
  step: number,
  width: number,
  align: CanvasTextAlign = "left",
) {
  context.textAlign = align;
  context.textBaseline = "middle";
  lines.forEach((line, index) =>
    context.fillText(
      line,
      x,
      y + (index - (lines.length - 1) / 2) * step,
      width,
    ),
  );
}

function supportsCardArt(
  context: DrawingContext,
): context is DrawingContext & GraphicContext {
  return !!(
    context.save &&
    context.restore &&
    context.translate &&
    context.scale &&
    context.beginPath &&
    context.moveTo &&
    context.lineTo &&
    context.closePath &&
    context.bezierCurveTo &&
    context.ellipse &&
    context.fill &&
    context.stroke &&
    context.clip &&
    context.createRadialGradient
  );
}

function linearChannel(value: number) {
  const srgb = value / 255;
  return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}
function srgbChannel(value: number) {
  const srgb =
    value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055;
  return srgb * 255;
}

const backgroundOffsets = [0, 0.55, 1] as const;
const linearStops = (palette: Palette) =>
  palette.stops.map((hex) =>
    [1, 3, 5].map((start) =>
      linearChannel(parseInt(hex.slice(start, start + 2), 16)),
    ),
  );

// A fixed Bayer tile, like the Studio 3D backdrop. Bias sRGB before rounding
// to bytes to break up long quantization bands.
const ditherSide = 8;
function bayer2(x: number, y: number) {
  return 2 * Math.abs(x - y) + y;
}
const backgroundDither = Array.from({ length: ditherSide ** 2 }, (_, index) => {
  const x = index % ditherSide;
  const y = Math.floor(index / ditherSide);
  const rank =
    16 * bayer2(x & 1, y & 1) +
    4 * bayer2((x >> 1) & 1, (y >> 1) & 1) +
    bayer2(x >> 2, y >> 2);
  return ((rank + 0.5) / ditherSide ** 2 - 0.5) * 3;
});
const backgroundRasters = new WeakMap<
  DrawingContext,
  { width: number; height: number; palettes: Map<VideoPaletteId, SceneCanvas> }
>();

function rasterBackground(
  context: DrawingContext,
  width: number,
  height: number,
  paletteId: VideoPaletteId,
) {
  if (!context.drawImage) return;
  let cache = backgroundRasters.get(context);
  if (cache?.width !== width || cache.height !== height) {
    cache = { width, height, palettes: new Map() };
    backgroundRasters.set(context, cache);
  }
  const cached = cache.palettes.get(paletteId);
  if (cached) return cached;

  const canvas =
    typeof OffscreenCanvas === "function"
      ? new OffscreenCanvas(width, height)
      : globalThis.document?.createElement("canvas");
  if (!canvas) return;
  canvas.width = width;
  canvas.height = height;
  const layer = canvas.getContext("2d", { alpha: false });
  if (!layer) return;
  const image = layer.createImageData(width, height);
  const { data } = image;
  const stops = linearStops(palettes[paletteId]);
  const middle = backgroundOffsets[1];
  const steps = 2048;
  const ramp = Array.from({ length: steps + 1 }, (_, index) => {
    const offset = index / steps;
    const pair = offset < middle ? 0 : 1;
    const amount =
      (offset - backgroundOffsets[pair]) /
      (backgroundOffsets[pair + 1] - backgroundOffsets[pair]);
    return stops[pair].map((value, channel) =>
      srgbChannel(value + (stops[pair + 1][channel] - value) * amount),
    );
  });
  const scale = steps / (width ** 2 + height ** 2);
  for (let y = 0, pixel = 0; y < height; y++) {
    const vertical = (y + 0.5) * height;
    const tileRow = (y % ditherSide) * ditherSide;
    for (let x = 0; x < width; x++, pixel += 4) {
      const color = ramp[Math.round(((x + 0.5) * width + vertical) * scale)];
      const bias = backgroundDither[tileRow + (x % ditherSide)];
      data[pixel] = color[0] + bias;
      data[pixel + 1] = color[1] + bias;
      data[pixel + 2] = color[2] + bias;
      data[pixel + 3] = 255;
    }
  }
  layer.putImageData(image, 0, 0);
  cache.palettes.set(paletteId, canvas);
  return canvas;
}

function backgroundFill(
  context: DrawingContext,
  width: number,
  height: number,
  palette: Palette,
) {
  const gradient = context.createLinearGradient?.(0, 0, width, height);
  if (!gradient) return palette.stops[0];
  const colors = linearStops(palette);
  // Canvas gradients interpolate sRGB stops. Sample the linear-light curve
  // densely here so interpolation between samples approximates the curve.
  for (let pair = 0; pair < 2; pair++) {
    for (let step = 0; step <= 32; step++) {
      if (pair === 1 && step === 0) continue;
      const amount = step / 32;
      const values = colors[pair].map((value, channel) =>
        srgbChannel(value + (colors[pair + 1][channel] - value) * amount),
      );
      gradient.addColorStop(
        backgroundOffsets[pair] +
          (backgroundOffsets[pair + 1] - backgroundOffsets[pair]) * amount,
        `rgb(${values.join(", ")})`,
      );
    }
  }
  return gradient;
}

const hostIds = ["A", "B", "C"] as const;

/** Capture catalogue-derived export text before asynchronous preflight. */
export function overlayCopy(
  plan: TimelinePlan,
  labels?: ReadonlyMap<Host, string>,
) {
  const episodeLocale = isLocale(plan.locale) ? plan.locale : "en";
  const wordmark = createTranslator(plan.wordmarkLocale ?? episodeLocale)(
    "video.wordmark",
  ).normalize("NFC");
  const showName = plan.showName?.normalize("NFC") ?? wordmark;
  const hostLabels = Object.fromEntries(
    hostIds.map((name) => [
      name,
      t("video.caption.speaker", { name }).normalize("NFC"),
    ]),
  ) as Record<Host, string>;
  const hostNames = Object.fromEntries(
    hostIds.map((name) => [
      name,
      (
        labels?.get(name) ??
        plan.hostNames?.[name] ??
        hostLabels[name]
      ).normalize("NFC"),
    ]),
  ) as Record<Host, string>;
  const count = plan.chapterWindows?.length || plan.chapters?.length || 0;
  const chapterLabels = Array.from({ length: count }, (_, index) =>
    t("publish.content.chapterNumber", { number: index + 1 }).normalize("NFC"),
  );
  const numbers = new Intl.NumberFormat(plan.locale ?? "en");
  const progressLabels = Array.from(
    { length: count },
    (_, index) => `${numbers.format(index + 1)} / ${numbers.format(count)}`,
  );
  const texts = new Set([
    "…",
    wordmark,
    showName,
    ...Object.values(hostLabels),
    ...Object.values(hostNames),
    ...chapterLabels,
    ...progressLabels,
  ]);
  for (const scene of plan.scenes) {
    if (scene.kind === "turn") {
      for (const cue of scene.captions)
        texts.add((cue.text ?? joinCaptionLines(cue.lines)).normalize("NFC"));
      if (scene.captionSource) texts.add(scene.captionSource.normalize("NFC"));
    } else texts.add(scene.title.normalize("NFC"));
  }
  for (const callout of plan.callouts ?? [])
    texts.add(callout.text.normalize("NFC"));
  return {
    wordmark,
    showName,
    episodeLocale,
    hostLabels,
    hostNames,
    chapterLabels,
    progressLabels,
    texts: [...texts],
  };
}

type TextRole = keyof typeof designTokens.landscape.text;

export function prepareOverlay(
  context: DrawingContext,
  plan: TimelinePlan,
  copy = overlayCopy(plan),
  textLayouts: TextLayoutCache = new Map(),
) {
  const orientation = planOrientation(plan);
  const geometry = videoLayout(
    plan.resolution.width,
    plan.resolution.height,
    orientation,
  );
  const {
    type,
    stroke,
    radius,
    caption,
    captionPad,
    calloutPad,
    marker,
    markerGap,
    hostPad,
  } = geometry;
  const locale = plan.locale ?? "en";
  const turns = plan.scenes.filter((scene) => scene.kind === "turn");
  const cards = plan.scenes.filter((scene) => scene.kind !== "turn");
  const windows =
    plan.chapterWindows ??
    (plan.chapters ?? []).map(({ start }, index, chapters) => ({
      start,
      end: chapters[index + 1]?.start ?? plan.duration,
    }));
  const callouts = plan.callouts ?? [];
  const captionWidth = caption.width - 2 * captionPad.x;
  const calloutWidth =
    geometry.callout.width - 3 * calloutPad.x - stroke.calloutRule;
  const hostWidth =
    geometry.hostChips[0].width - 2 * hostPad.x - marker - markerGap;
  const chapterWidth = geometry.chapter.width - stroke.cardRule - calloutPad.x;
  const titleWidth = geometry.title.width - stroke.cardRule - calloutPad.x;
  const background = new Map<VideoPaletteId, string | CanvasGradient>();
  const canvasFont = (role: keyof typeof type) =>
    videoFont(weight[role], type[role]);
  function wrap(
    role: TextRole,
    source: string,
    width: number,
    truncate = true,
  ) {
    const text = source.normalize("NFC");
    context.font = canvasFont(role);
    context.textAlign = "left";
    context.textBaseline = "middle";
    const key = JSON.stringify([
      role,
      context.font,
      locale,
      orientation,
      width,
      text,
      truncate,
    ]);
    let lines = textLayouts.get(key);
    if (!lines) {
      lines = wrapDisplayText(
        context,
        text,
        width,
        {
          limits: geometry.text[role],
          locale,
          preferClauseBreaks: role === "title" || role === "chapter",
          ...(role === "title" && orientation === "portrait"
            ? { total: { cjk: 12, latinWords: 4 } }
            : {}),
        },
        truncate,
      );
      textLayouts.set(key, lines);
    }
    return lines;
  }
  const wordmark =
    wrap("wordmark", copy.showName, geometry.wordmark.width, false)[0] ??
    wrap("wordmark", copy.wordmark, geometry.wordmark.width)[0];
  const names = Object.fromEntries(
    hostIds.map((host) => [
      host,
      wrap("host", copy.hostNames[host], hostWidth, false)[0] ??
        wrap("host", copy.hostLabels[host], hostWidth)[0],
    ]),
  ) as Record<Host, string>;
  const hostNameWidths = Object.fromEntries(
    hostIds.map((host) => [host, context.measureText(names[host] ?? "").width]),
  ) as Record<Host, number>;
  const cues = new Map(
    turns.map((turn) => {
      context.font = canvasFont("caption");
      context.textAlign = "left";
      context.textBaseline = "middle";
      return [turn, layoutCaptionCues(turn, plan, geometry, context)] as const;
    }),
  );
  const cardLayouts = new Map(
    cards.map((card) => [
      card,
      card.kind === "chapter"
        ? wrap("chapter", card.title, chapterWidth)
        : wrap("title", card.title, titleWidth),
    ]),
  );
  const opening = cards.find(
    (card) => card.kind === "intro" && card.start === 0,
  );
  const topicGraphic =
    opening?.kind === "intro"
      ? chooseTopicGraphic(
          [opening.topic ?? "", opening.title].map((text) =>
            text.normalize("NFC"),
          ),
          copy.episodeLocale,
        )
      : null;
  const graphicContext = supportsCardArt(context) ? context : undefined;
  const stageTransitions = cards.flatMap((card) =>
    card.kind === "chapter" ? [card.start, card.end] : [],
  );
  const halfFade = motion.fadeMs / 2000;
  const openingReveal =
    opening && turns[0]?.start === opening.start && plan.transition !== "cut"
      ? cards.reduce(
          (end, card) =>
            card.kind === "chapter" && card.start < opening.end
              ? Math.max(end, card.end)
              : end,
          opening.end,
        )
      : -Infinity;
  const calloutLayouts = new Map(
    callouts.map((callout) => [
      callout,
      wrap("callout", callout.text, calloutWidth, false),
    ]),
  );

  function drawBackground(paletteId: VideoPaletteId) {
    const raster = rasterBackground(
      context,
      geometry.width,
      geometry.height,
      paletteId,
    );
    if (raster && context.drawImage) {
      context.drawImage(raster, 0, 0);
      return;
    }
    let fill = background.get(paletteId);
    if (!fill) {
      fill = backgroundFill(
        context,
        geometry.width,
        geometry.height,
        palettes[paletteId],
      );
      background.set(paletteId, fill);
    }
    context.fillStyle = fill;
    context.fillRect(0, 0, geometry.width, geometry.height);
  }

  function frameAt(time: number) {
    const turn = latestStarted(turns, time);
    const startedCard = latestStarted(cards, time);
    const currentCard =
      startedCard && beforeEnd(time, startedCard.end) ? startedCard : undefined;
    const card =
      currentCard?.kind !== "end" &&
      opening &&
      !beforeEnd(time, opening.start) &&
      beforeEnd(time, opening.end)
        ? opening
        : currentCard;
    const chapter = latestStarted(windows, time);
    const chapterIndex = chapter ? windows.indexOf(chapter) : -1;
    const elapsed = time - openingReveal;
    const revealingOpening =
      !card && !beforeEnd(time, openingReveal) && elapsed < halfFade;
    let distance = revealingOpening ? Math.max(0, elapsed) : Infinity;
    if (!card && plan.transition === "fade")
      distance = stageTransitions.reduce(
        (nearest, transition) => Math.min(nearest, Math.abs(time - transition)),
        distance,
      );
    const stageFade =
      distance < halfFade
        ? (1 + Math.cos((Math.PI * distance) / halfFade)) / 2
        : 0;
    return {
      turn,
      card,
      chapter,
      chapterIndex,
      time,
      stageFade,
      revealingOpening,
    };
  }

  function markerShape(
    x: number,
    y: number,
    host: Host,
    color: string,
    active: boolean,
    emphasis: number,
  ) {
    const size = marker * (active ? 0.82 + 0.18 * emphasis : 1);
    const border = stroke.hostMarker;
    if (
      host !== "B" &&
      context.beginPath &&
      context.arc &&
      context.fill &&
      context.stroke
    ) {
      context.beginPath();
      context.arc(x, y, (active ? size : size - border) / 2, 0, 2 * Math.PI);
      context.fillStyle = color;
      context.strokeStyle = color;
      context.lineWidth = border;
      if (active) context.fill();
      else context.stroke();
      return;
    }
    const offsets = host === "B" ? [-size * 0.3, size * 0.3] : [0];
    const height = host === "B" ? size * 0.4 : size;
    for (const offset of offsets) {
      const shape = {
        x: x - size / 2,
        y: y + offset - height / 2,
        width: size,
        height,
      };
      if (!active && context.beginPath && context.roundRect && context.stroke) {
        const outline = Math.min(border / 2, height / 3);
        context.beginPath();
        context.roundRect(
          shape.x + outline / 2,
          shape.y + outline / 2,
          size - outline,
          height - outline,
          radius.host,
        );
        context.strokeStyle = color;
        context.lineWidth = outline;
        context.stroke();
      } else rect(context, shape, color, height / 2);
    }
  }

  function chip(
    box: PixelBox,
    host: Host,
    palette: Palette,
    active: boolean,
    emphasis: number,
  ) {
    const width = Math.min(
      box.width,
      hostNameWidths[host] + 2 * hostPad.x + marker + markerGap,
    );
    const badge = { ...box, x: centerX(box) - width / 2, width };
    rect(context, pixelAlignedPlate(badge), palette.plate, radius.host);
    markerShape(
      badge.x + hostPad.x + marker / 2,
      centerY(badge),
      host,
      host === "B" ? palette.hostB : palette.hostA,
      active,
      emphasis,
    );
    context.font = canvasFont("host");
    context.fillStyle = active ? palette.ink : palette.secondaryInk;
    linesAt(
      context,
      [names[host]],
      badge.x + hostPad.x + marker + markerGap,
      centerY(badge),
      0,
      hostWidth,
    );
  }

  function drawHosts(frame: ReturnType<typeof frameAt>, palette: Palette) {
    const { card, turn, time } = frame;
    const speaker = turn?.speakerId;
    const active =
      !!turn &&
      (beforeEnd(time, turn.end) ||
        (card?.kind === "chapter" && card.chapterId === turn.chapterId));
    const emphasis = turn
      ? easeOut(((time - turn.start) * 1000) / motion.hostEmphasisMs)
      : 0;
    if (card) {
      if (
        speaker &&
        (card.kind === "end" ||
          (card.kind === "intro" && active) ||
          (card.kind === "chapter" && card.chapterId === turn?.chapterId))
      )
        chip(geometry.cardChip, speaker, palette, active, emphasis);
      return;
    }
    geometry.hostChips.forEach((box, index) => {
      const host = hostIds[index];
      chip(box, host, palette, speaker === host && active, emphasis);
    });
    if (speaker === "C") {
      const [first] = geometry.hostChips;
      const y = (bottom(geometry.wave[0]) + first.y - first.height) / 2;
      chip(
        { ...first, x: caption.x + (caption.width - first.width) / 2, y },
        "C",
        palette,
        active,
        emphasis,
      );
    }
  }

  return {
    frameAt,
    drawBackground,
    captionReviewCount: [...cues.values()]
      .flat()
      .filter((cue) => cue.needsReview).length,
    drawHosts(frame: ReturnType<typeof frameAt>, paletteId: VideoPaletteId) {
      drawHosts(frame, palettes[paletteId]);
    },
    draw(
      frame: ReturnType<typeof frameAt>,
      paletteId: VideoPaletteId,
      hostsDrawn = false,
    ) {
      const palette = palettes[paletteId];
      const { card, chapter, chapterIndex, turn, time } = frame;
      if (wordmark) {
        context.fillStyle = palette.ink;
        context.font = canvasFont("wordmark");
        linesAt(
          context,
          [wordmark],
          geometry.wordmark.x,
          centerY(geometry.wordmark),
          0,
          geometry.wordmark.width,
        );
      }
      if (chapter) {
        const box = geometry.progress;
        context.font = canvasFont("progress");
        context.fillStyle = palette.ink;
        linesAt(
          context,
          [copy.progressLabels[chapterIndex]],
          right(box),
          box.y + (type.progress * leading.caption) / 2,
          0,
          box.width,
          "right",
        );
        const track = {
          ...box,
          y: bottom(box) - stroke.progress,
          height: stroke.progress,
        };
        const progress = clamp(
          (time - chapter.start) / (chapter.end - chapter.start || 1),
        );
        rect(context, track, palette.track, stroke.progress / 2);
        if (progress > 0)
          rect(
            context,
            { ...track, width: track.width * progress },
            palette.ink,
            stroke.progress / 2,
          );
      }
      if (card) {
        const chapterCard = card.kind === "chapter";
        const role = chapterCard ? "chapter" : "title";
        const box = geometry[role];
        const width = chapterCard ? chapterWidth : titleWidth;
        const x = box.x + stroke.cardRule + calloutPad.x;
        const inkLines = cardLayouts.get(card) ?? [];
        const step = type[role] * leading[role];
        const label = chapterCard && copy.chapterLabels[chapterIndex];
        const total =
          step * inkLines.length +
          (label ? type.progress * leading.caption + geometry.progressGap : 0);
        const top =
          chapterCard && orientation === "portrait"
            ? box.y
            : centerY(box) - total / 2;
        const motionAmount = decoration(
          time,
          card.start,
          card.end,
          motion.cardDecorationInMs,
          motion.cardDecorationOutMs,
        );
        if (motionAmount > 0) {
          rect(
            context,
            {
              x: box.x,
              y:
                top + (1 - motionAmount) * motion.cardTravelH * geometry.height,
              width: stroke.cardRule,
              height: Math.min(
                total * motionAmount,
                bottom(box) - top - motion.cardTravelH * geometry.height,
              ),
            },
            palette.hostA,
          );
        }
        if (label) {
          context.font = canvasFont("progress");
          context.fillStyle = palette.ink;
          linesAt(
            context,
            [label],
            x,
            top + (type.progress * leading.caption) / 2,
            0,
            width,
          );
        }
        context.font = canvasFont(role);
        context.fillStyle = palette.ink;
        linesAt(
          context,
          inkLines,
          x,
          top + total - (inkLines.length * step) / 2,
          step,
          width,
        );
        if (!chapterCard && graphicContext) {
          const graphic = geometry.titleGraphic;
          const inset =
            Math.min(graphic.width, graphic.height) * 0.05 * (1 - motionAmount);
          const box = [
            graphic.x + inset,
            graphic.y + inset,
            right(graphic) - inset,
            bottom(graphic) - inset,
          ] as const;
          if (card.kind === "intro" && topicGraphic)
            drawTopicGraphic(graphicContext, topicGraphic, box, palette, 0);
          else drawHostPair(graphicContext, box, palette);
        }
      }
      if (!hostsDrawn) drawHosts(frame, palette);

      const callout = latestStarted(callouts, time);
      const annotation =
        callout && beforeEnd(time, callout.end) && !card
          ? calloutLayouts.get(callout)
          : undefined;
      if (callout && annotation?.length) {
        const amount = decoration(
          time,
          callout.start,
          callout.end,
          motion.calloutInMs,
          motion.calloutOutMs,
        );
        const step = type.callout * leading.callout;
        const height = annotation.length * step + 2 * calloutPad.y;
        const travel = Math.min(
          motion.calloutTravelH * geometry.height,
          (geometry.callout.height - height) / 2,
        );
        const box = {
          ...geometry.callout,
          y: centerY(geometry.callout) - height / 2 + (1 - amount) * travel,
          height,
        };
        rect(context, pixelAlignedPlate(box), palette.plate, radius.callout);
        if (amount > 0) {
          context.globalAlpha = amount;
          rect(
            context,
            {
              x: box.x + calloutPad.x,
              y: box.y + calloutPad.y,
              width: stroke.calloutRule,
              height: height - 2 * calloutPad.y,
            },
            palette.hostA,
          );
          context.globalAlpha = 1;
        }
        context.fillStyle = palette.ink;
        context.font = canvasFont("callout");
        linesAt(
          context,
          annotation,
          box.x + calloutPad.x + stroke.calloutRule + calloutPad.x,
          centerY(box),
          step,
          calloutWidth,
        );
      }

      const cue = turn && latestStarted(cues.get(turn) ?? [], time);
      if (cue && beforeEnd(time, cue.end)) {
        rect(context, pixelAlignedPlate(caption), palette.plate, radius.caption);
        context.fillStyle = palette.ink;
        context.font = canvasFont("caption");
        linesAt(
          context,
          cue.lines,
          centerX(caption),
          centerY(caption),
          type.caption * leading.caption,
          captionWidth,
          "center",
        );
      }
    },
    drawStageFade(
      frame: ReturnType<typeof frameAt>,
      paletteId: VideoPaletteId,
    ) {
      if (!frame.stageFade) return;
      context.globalAlpha = frame.stageFade;
      if (frame.revealingOpening) drawBackground(paletteId);
      else
        rect(
          context,
          { x: 0, y: 0, width: geometry.width, height: geometry.height },
          palettes[paletteId].plate,
        );
      context.globalAlpha = 1;
    },
  };
}
