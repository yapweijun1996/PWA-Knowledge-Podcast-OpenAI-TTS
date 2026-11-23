import { sampleAmplitude, turnSampleRange, type PcmAudio } from "../pcm.ts";
import { frameGeometry } from "../overlay.ts";
import { videoThemes } from "../themes.ts";
import type { VideoTurn } from "../timeline.ts";
import type { DrawingContext, VideoScene, VideoSceneFrame } from "./types.ts";

export const waveformSceneId = "waveform";
const halfWindowSeconds = 0.24;

export function wavePeaks(
  audio: PcmAudio,
  time: number,
  turn: VideoTurn,
  bins: number,
) {
  const { sampleRate, channels } = audio;
  const { start, end, source } = turnSampleRange(turn, sampleRate);
  const sourceEnd = source + end - start;
  const last = Math.min(channels[0].length, sourceEnd);
  if (
    time < turn.start ||
    time >= turn.end ||
    last <= source ||
    (last < sourceEnd && source + time * sampleRate - start >= last)
  )
    return Array<number>(bins).fill(0);

  // Clip the window before distributing its samples across the full display.
  const windowSize = 2 * halfWindowSeconds * sampleRate;
  const centeredStart =
    source + (time - halfWindowSeconds) * sampleRate - start;
  const centeredEnd = centeredStart + windowSize;
  const windowStart = Math.max(source, centeredStart);
  const windowEnd = Math.min(last, centeredEnd);
  const clipped = windowStart !== centeredStart || windowEnd !== centeredEnd;
  const binWidth = (clipped ? windowEnd - windowStart : windowSize) / bins;
  return Array.from({ length: bins }, (_, bin) => {
    const binStart = windowStart + bin * binWidth;
    const from =
      binWidth < 1 ? Math.floor(binStart + binWidth / 2) : Math.round(binStart);
    const to = Math.min(
      last,
      Math.max(from + 1, Math.round(windowStart + (bin + 1) * binWidth)),
    );
    let peak = 0;
    for (const channel of channels) {
      for (let index = from; index < to; index++) {
        const amplitude = Math.abs(sampleAmplitude(channel, index));
        if (amplitude > peak) peak = amplitude;
      }
    }
    return Math.min(1, peak);
  });
}

export function drawWaveform(
  context: DrawingContext,
  {
    plan,
    audio,
    theme,
    time,
    turn,
  }: Pick<VideoSceneFrame, "plan" | "audio" | "theme" | "time" | "turn">,
  drawSpeakerLabel: () => void,
) {
  const { scale, portrait, panelX, panelWidth, center } = frameGeometry(plan);
  const colors = videoThemes[theme];

  context.fillStyle = colors.panel;
  context.fillRect(panelX, center - 144 * scale, panelWidth, 288 * scale);
  drawSpeakerLabel();

  const waveX = panelX + 44 * scale;
  const waveWidth = panelWidth - 88 * scale;
  const baseline = center + 30 * scale;
  context.fillStyle = colors.baseline;
  context.fillRect(waveX, baseline - scale, waveWidth, 2 * scale);
  if (time >= turn.end) return;

  const bins = portrait ? 56 : 88;
  const peaks = wavePeaks(audio, time, turn, bins);
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
}

export function createWaveformScene(): VideoScene {
  return {
    id: waveformSceneId,
    kind: "2d",
    init() {},
    draw(frame) {
      if (frame.kind === "2d")
        drawWaveform(frame.context, frame, frame.drawSpeakerLabel);
    },
    dispose() {},
  };
}
