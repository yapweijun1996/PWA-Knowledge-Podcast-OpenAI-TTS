import { sampleAmplitude, turnSampleRange, type PcmAudio } from "../pcm.ts";
import { videoLayout } from "../design/layout.ts";
import { palettes } from "../design/palettes.ts";
import { designTokens } from "../design/tokens.ts";
import { themePalette, type VideoPaletteId } from "../themes.ts";
import {
  latestStarted,
  planOrientation,
  type TimelinePlan,
  type VideoTurn,
} from "../timeline.ts";
import type { DrawingContext, VideoScene, VideoSceneFrame } from "./types.ts";

export const waveformSceneId = "waveform";
const halfWindowSeconds = 0.24;

export function wavePeaks(
  audio: PcmAudio,
  time: number,
  turn: VideoTurn,
  bins: number,
  peakAt = (from: number, to: number) => peakSamples(audio, from, to),
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
    return Math.min(1, peakAt(from, to));
  });
}

function peakSamples(audio: PcmAudio, from: number, to: number) {
  let peak = 0;
  for (const channel of audio.channels) {
    for (let index = from; index < to; index++) {
      const amplitude = Math.abs(sampleAmplitude(channel, index));
      if (amplitude > peak) peak = amplitude;
    }
  }
  return peak;
}

function peakReader(audio: PcmAudio) {
  // Windows overlap heavily at 30 fps. Cache full 32-sample blocks and
  // examine the unaligned ends directly to keep the clipped-bin results.
  const blockSize = 32;
  const count = Math.floor(audio.channels[0].length / blockSize);
  const blocks = new Float64Array(count);
  for (let index = 0; index < count; index++) {
    blocks[index] = peakSamples(
      audio,
      index * blockSize,
      (index + 1) * blockSize,
    );
  }
  return (from: number, to: number) => {
    const first = Math.ceil(from / blockSize);
    const last = Math.floor(to / blockSize);
    if (last <= first) return peakSamples(audio, from, to);
    let peak = Math.max(
      peakSamples(audio, from, first * blockSize),
      peakSamples(audio, last * blockSize, to),
    );
    for (let index = first; index < last; index++)
      peak = Math.max(peak, blocks[index]);
    return peak;
  };
}

export function prepareWaveform(
  plan: TimelinePlan,
  audio: PcmAudio,
  orientation = planOrientation(plan),
) {
  const { width, height } = plan.resolution;
  const geometry = videoLayout(width, height, orientation);
  const bins = geometry.waveBarsPerHost;
  const fps = plan.fps ?? 30;
  const turns = plan.scenes.filter((scene) => scene.kind === "turn");
  const count = Math.ceil((plan.duration ?? turns.at(-1)?.end ?? 0) * fps);
  const levels = new Float32Array(count * bins);
  const peakAt = peakReader(audio);
  const [attack, release] = designTokens.common.motion.waveAttackReleaseMs.map(
    (milliseconds) => 1 - Math.exp(-1000 / (fps * milliseconds)),
  );
  let current: VideoTurn | undefined;
  let smoothed = 0;
  for (let index = 0; index < count; index++) {
    const time = index / fps;
    const turn = latestStarted(turns, time);
    if (turn !== current) {
      smoothed = 0;
      current = turn;
    }
    if (!turn || time >= turn.end || turn.speakerId === "C") continue;
    const targets = wavePeaks(audio, time, turn, bins, peakAt).map((peak) =>
      Math.sqrt(Math.max(0, (peak - 0.012) / (1 - 0.012))),
    );
    const mean = targets.reduce((sum, target) => sum + target, 0) / bins;
    const rising = mean > smoothed;
    smoothed += (mean - smoothed) * (rising ? attack : release);
    // Apply attack/release to the rail as a whole so a peak moving between
    // bins keeps its shape. Scale toward zero on attack and toward one on release.
    const gain = rising
      ? smoothed / mean
      : (1 - smoothed) / (1 - mean || 1);
    const offset = rising ? 0 : smoothed - gain * mean;
    targets.forEach((target, bin) => {
      levels[index * bins + bin] = offset + gain * target;
    });
  }
  return { geometry, levels };
}

export function drawWaveform(
  context: DrawingContext,
  waveform: ReturnType<typeof prepareWaveform>,
  {
    index,
    time,
    turn,
    paletteId,
  }: Pick<VideoSceneFrame, "index" | "time" | "turn"> & {
    paletteId: VideoPaletteId;
  },
) {
  const { geometry, levels } = waveform;
  const colors = palettes[paletteId];
  const bins = geometry.waveBarsPerHost;
  const baselineHeight = geometry.stroke.waveRail;
  const tickHeight = designTokens.common.waveIdleTickPx;
  geometry.wave.forEach((rail, host) => {
    const y = rail.y + rail.height / 2;
    context.fillStyle = colors.track;
    context.fillRect(
      rail.x,
      y - baselineHeight / 2,
      rail.width,
      baselineHeight,
    );
    const speaking = time < turn.end && turn.speakerId === (host ? "B" : "A");
    const pitch = rail.width / bins;
    const width = pitch * 0.58;
    context.fillStyle = host ? colors.hostB : colors.hostA;
    for (let bin = 0; bin < bins; bin++) {
      const amplitude = speaking ? (levels[index * bins + bin] ?? 0) : 0;
      // Boost moderate portrait peaks without clipping the differences between bins.
      const lifted =
        amplitude + geometry.waveHeightLift * amplitude * (1 - amplitude);
      const height = Math.min(
        rail.height,
        tickHeight + lifted * (rail.height - tickHeight),
      );
      const x = rail.x + (bin + 0.5) * pitch - width / 2;
      if (context.beginPath && context.roundRect && context.fill) {
        context.beginPath();
        context.roundRect(
          x,
          y - height / 2,
          width,
          height,
          Math.min(geometry.radius.waveBar, width / 2, height / 2),
        );
        context.fill();
      } else {
        context.fillRect(x, y - height / 2, width, height);
      }
    }
  });
}

export function createWaveformScene(): VideoScene {
  let waveform: ReturnType<typeof prepareWaveform> | undefined;
  return {
    id: waveformSceneId,
    kind: "2d",
    init({ plan, audio, orientation }) {
      waveform = prepareWaveform(plan, audio, orientation);
    },
    draw(frame) {
      if (waveform && frame.kind === "2d") {
        drawWaveform(frame.context, waveform, {
          ...frame,
          paletteId:
            frame.paletteId ?? themePalette(frame.theme, frame.plan.paletteId),
        });
      }
    },
    dispose() {
      waveform = undefined;
    },
  };
}
