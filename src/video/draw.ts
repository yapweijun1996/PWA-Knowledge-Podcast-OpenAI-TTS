import type { Host } from "../../shared/factory.ts";
import { t } from "../i18n/index.ts";
import { joinCaptionLines, wrapText } from "../text/wrap.ts";
import type { TimelinePlan } from "./timeline.ts";
import { videoThemes, type VideoTheme } from "./themes.ts";

export type DrawingContext = Pick<
  CanvasRenderingContext2D,
  | "fillStyle"
  | "font"
  | "textAlign"
  | "textBaseline"
  | "fillRect"
  | "fillText"
  | "measureText"
>;

export type PcmAudio = {
  sampleRate: number;
  channels: readonly (Float32Array | Int16Array)[];
};

type TurnScene = Extract<TimelinePlan["scenes"][number], { kind: "turn" }>;

const font = 'system-ui, "PingFang SC", "Microsoft YaHei", sans-serif';

export function sampleAmplitude(
  channel: Float32Array | Int16Array,
  index: number,
) {
  return channel instanceof Int16Array
    ? channel[index] / 32768
    : channel[index];
}

export function turnSampleRange(scene: TurnScene, sampleRate: number) {
  return {
    start: Math.round(scene.start * sampleRate),
    end: Math.round(scene.end * sampleRate),
    source: Math.round(scene.audioStart * sampleRate),
  };
}

function wavePeaks(
  audio: PcmAudio,
  time: number,
  scene: TurnScene,
  bins: number,
) {
  const { start, end, source } = turnSampleRange(scene, audio.sampleRate);
  const last = Math.min(audio.channels[0].length, source + end - start);
  const windowStart = source + (time - 0.24) * audio.sampleRate - start;
  const binWidth = (0.48 * audio.sampleRate) / bins;
  return Array.from({ length: bins }, (_, bin) => {
    const from = Math.max(source, Math.round(windowStart + bin * binWidth));
    const to = Math.min(last, Math.round(windowStart + (bin + 1) * binWidth));
    let peak = 0;
    for (const channel of audio.channels) {
      for (let index = from; index < to; index++) {
        const amplitude = Math.abs(sampleAmplitude(channel, index));
        if (amplitude > peak) peak = amplitude;
      }
    }
    return Math.min(1, peak);
  });
}

function latestStarted<T extends { start: number }>(
  items: readonly T[],
  time: number,
) {
  let low = 0;
  let high = items.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (items[mid].start <= time) low = mid + 1;
    else high = mid;
  }
  return items[low - 1] as T | undefined;
}

function drawLines(
  context: DrawingContext,
  lines: readonly string[],
  x: number,
  y: number,
  lineHeight: number,
  maxWidth: number,
) {
  lines.forEach((line, index) => {
    context.fillText(
      line,
      x,
      y + (index - (lines.length - 1) / 2) * lineHeight,
      maxWidth,
    );
  });
}

/** Draw a complete frame from timeline time and source samples. */
export function drawFrame(
  context: DrawingContext,
  plan: TimelinePlan,
  audio: PcmAudio,
  theme: VideoTheme,
  time: number,
  speakerLabels?: ReadonlyMap<Host, string>,
  textLayouts?: Map<string, string[]>,
) {
  const { width, height } = plan.resolution;
  const scale = Math.min(width, height) / 1080;
  const portrait = height > width;
  const colors = videoThemes[theme];
  const scene = latestStarted(plan.scenes, time);

  function layout(text: string, maxWidth: number) {
    const key = `${context.font}\n${maxWidth}\n${text}`;
    const cached = textLayouts?.get(key);
    if (cached) return cached;
    const lines = wrapText(context, text, maxWidth);
    textLayouts?.set(key, lines);
    return lines;
  }

  context.fillStyle = colors.background;
  context.fillRect(0, 0, width, height);
  context.textAlign = "center";
  context.textBaseline = "middle";
  if (!scene) return;

  if (scene.kind !== "turn") {
    context.fillStyle = colors.accent;
    context.fillRect(
      width / 2 - 36 * scale,
      height * 0.32,
      72 * scale,
      6 * scale,
    );
    const titleWidth = width * 0.78;
    let size = (portrait ? 72 : 94) * scale;
    context.font = `700 ${size}px ${font}`;
    let lines = layout(scene.title, titleWidth);
    while (
      size > 1 &&
      (lines.length * size * 1.2 > height * 0.29 ||
        lines.some((line) => context.measureText(line).width > titleWidth))
    ) {
      size *= 0.85;
      context.font = `700 ${size}px ${font}`;
      lines = layout(scene.title, titleWidth);
    }
    context.fillStyle = colors.text;
    drawLines(context, lines, width / 2, height * 0.52, size * 1.2, titleWidth);
    return;
  }

  const panelX = width * 0.09;
  const panelWidth = width - panelX * 2;
  const center = height * 0.47;
  context.fillStyle = colors.panel;
  context.fillRect(panelX, center - 144 * scale, panelWidth, 288 * scale);
  context.fillStyle = colors.accent;
  context.font = `650 ${36 * scale}px ${font}`;
  const name = scene.speakerId;
  context.fillText(
    speakerLabels?.get(name) ?? t("video.caption.speaker", { name }),
    width / 2,
    center - 96 * scale,
  );

  const waveX = panelX + 44 * scale;
  const waveWidth = panelWidth - 88 * scale;
  const baseline = center + 30 * scale;
  context.fillStyle = colors.baseline;
  context.fillRect(waveX, baseline - scale, waveWidth, 2 * scale);
  if (time >= scene.end) return;

  const bins = portrait ? 56 : 88;
  const peaks = wavePeaks(audio, time, scene, bins);
  const step = waveWidth / bins;
  const barWidth = step * 0.52;
  context.fillStyle = colors.accent;
  peaks.forEach((peak, index) => {
    const amplitude = peak * 81 * scale;
    if (amplitude > 0) {
      const x = waveX + (index + 0.5) * step - barWidth / 2;
      context.fillRect(x, baseline - amplitude, barWidth, amplitude * 2);
    }
  });

  const cue = latestStarted(scene.captions, time);
  if (!cue || time >= cue.end) return;
  const size = (portrait ? 54 : 62) * scale;
  context.fillStyle = colors.text;
  context.font = `650 ${size}px ${font}`;
  const lines = layout(joinCaptionLines(cue.lines), panelWidth);
  drawLines(context, lines, width / 2, height * 0.75, size * 1.22, panelWidth);
}
