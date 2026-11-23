import { joinCaptionLines, wrapText } from "../text/wrap.ts";
import type { DrawingContext, TextLayoutCache } from "./scenes/types.ts";
import { videoThemes, type VideoTheme } from "./themes.ts";
import {
  latestStarted,
  type TimelinePlan,
  type VideoTurn,
} from "./timeline.ts";

const font = 'system-ui, "PingFang SC", "Microsoft YaHei", sans-serif';

export function frameGeometry(plan: TimelinePlan) {
  const { width, height } = plan.resolution;
  const panelX = width * 0.09;
  return {
    width,
    height,
    scale: Math.min(width, height) / 1080,
    portrait: height > width,
    panelX,
    panelWidth: width - panelX * 2,
    center: height * 0.47,
  };
}

function layout(
  context: DrawingContext,
  textLayouts: TextLayoutCache,
  text: string,
  maxWidth: number,
) {
  const key = `${context.font}\n${maxWidth}\n${text}`;
  const cached = textLayouts.get(key);
  if (cached) return cached;
  const lines = wrapText(context, text, maxWidth);
  textLayouts.set(key, lines);
  return lines;
}

function centerText(context: DrawingContext) {
  context.textAlign = "center";
  context.textBaseline = "middle";
}

function drawLines(
  context: DrawingContext,
  lines: readonly string[],
  x: number,
  y: number,
  lineHeight: number,
  maxWidth: number,
) {
  centerText(context);
  lines.forEach((line, index) => {
    context.fillText(
      line,
      x,
      y + (index - (lines.length - 1) / 2) * lineHeight,
      maxWidth,
    );
  });
}

export function drawBackground(
  context: DrawingContext,
  plan: TimelinePlan,
  theme: VideoTheme,
) {
  const { width, height } = plan.resolution;
  context.fillStyle = videoThemes[theme].background;
  context.fillRect(0, 0, width, height);
}

export function drawTitleCard(
  context: DrawingContext,
  plan: TimelinePlan,
  theme: VideoTheme,
  textLayouts: TextLayoutCache,
  title?: string,
) {
  drawBackground(context, plan, theme);
  if (title === undefined) return;

  const { width, height, scale, portrait } = frameGeometry(plan);
  const colors = videoThemes[theme];
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
  let lines = layout(context, textLayouts, title, titleWidth);
  while (
    size > 1 &&
    (lines.length * size * 1.2 > height * 0.29 ||
      lines.some((line) => context.measureText(line).width > titleWidth))
  ) {
    size *= 0.85;
    context.font = `700 ${size}px ${font}`;
    lines = layout(context, textLayouts, title, titleWidth);
  }
  context.fillStyle = colors.text;
  drawLines(context, lines, width / 2, height * 0.52, size * 1.2, titleWidth);
}

export function drawSpeakerLabel(
  context: DrawingContext,
  plan: TimelinePlan,
  theme: VideoTheme,
  label: string,
) {
  const { width, scale, center } = frameGeometry(plan);
  centerText(context);
  context.fillStyle = videoThemes[theme].accent;
  context.font = `650 ${36 * scale}px ${font}`;
  context.fillText(label, width / 2, center - 96 * scale);
}

export function drawCaption(
  context: DrawingContext,
  plan: TimelinePlan,
  theme: VideoTheme,
  textLayouts: TextLayoutCache,
  turn: VideoTurn,
  time: number,
) {
  if (time >= turn.end) return;
  const cue = latestStarted(turn.captions, time);
  if (!cue || time >= cue.end) return;
  const { width, height, scale, portrait, panelWidth } = frameGeometry(plan);
  const size = (portrait ? 54 : 62) * scale;
  context.fillStyle = videoThemes[theme].text;
  context.font = `650 ${size}px ${font}`;
  const lines = layout(
    context,
    textLayouts,
    joinCaptionLines(cue.lines),
    panelWidth,
  );
  drawLines(context, lines, width / 2, height * 0.75, size * 1.22, panelWidth);
}
