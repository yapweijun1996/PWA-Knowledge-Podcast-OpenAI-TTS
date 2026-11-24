import {
  mapPcmWindow,
  memoryPcmSource,
  type PcmSource,
} from "../pcm-source.ts";
import {
  frameEnvelope,
  turnSampleRange,
  type PcmAudio,
  type WindowedVideoScene,
} from "../pcm.ts";
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
import type { DrawingContext, VideoSceneFrame } from "./types.ts";

export const waveformSceneId = "waveform";
const halfWindowSeconds = 0.24;

export function wavePeaks(
  audio: PcmAudio,
  time: number,
  turn: VideoTurn,
  bins: number,
) {
  const peaks = readWavePeaks(memoryPcmSource(audio), time, turn, bins);
  if (peaks instanceof Promise) throw new Error("Expected in-memory PCM");
  return peaks;
}

function readWavePeaks(
  audio: PcmSource,
  time: number,
  turn: VideoTurn,
  bins: number,
) {
  if (!bins) return [];
  const { sampleRate } = audio;
  const { start, end, source } = turnSampleRange(turn, sampleRate);
  const sourceEnd = source + end - start;
  const last = Math.min(audio.length, sourceEnd);
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
  const ranges = Array.from({ length: bins }, (_, bin) => {
    const binStart = windowStart + bin * binWidth;
    const from =
      binWidth < 1 ? Math.floor(binStart + binWidth / 2) : Math.round(binStart);
    const to = Math.min(
      last,
      Math.max(from + 1, Math.round(windowStart + (bin + 1) * binWidth)),
    );
    return { from, to };
  });
  const startSample = ranges[0].from;
  const endSample = ranges.at(-1)!.to;
  return mapPcmWindow(
    audio.readWindow(startSample, endSample - startSample),
    (planes) =>
      ranges.map(({ from, to }) => {
        let peak = 0;
        for (const channel of planes) {
          for (
            let index = from - startSample;
            index < to - startSample;
            index++
          ) {
            const amplitude = Math.abs(channel[index]);
            if (amplitude > peak) peak = amplitude;
          }
        }
        return Math.min(1, peak);
      }),
  );
}

export function prepareWaveform(
  plan: TimelinePlan,
  audio: PcmAudio | PcmSource,
  orientation = planOrientation(plan),
) {
  const { width, height } = plan.resolution;
  const geometry = videoLayout(width, height, orientation);
  const bins = geometry.waveBarsPerHost;
  const fps = plan.fps ?? 30;
  const turns = plan.scenes.filter((scene) => scene.kind === "turn");
  const count = Math.ceil((plan.duration ?? turns.at(-1)?.end ?? 0) * fps);
  const source =
    "readWindow" in audio ? audio : (audio.source ?? memoryPcmSource(audio));
  const [attack, release] = designTokens.common.motion.waveAttackReleaseMs.map(
    (milliseconds) => 1 - Math.exp(-1000 / (fps * milliseconds)),
  );
  let current: VideoTurn | undefined;
  let smoothed = 0;
  const envelope = frameEnvelope(
    count,
    bins,
    (index, output) => {
      const time = index / fps;
      const turn = latestStarted(turns, time);
      if (turn !== current) {
        smoothed = 0;
        current = turn;
      }
      if (!turn || time >= turn.end || turn.speakerId === "C") {
        output.fill(0);
        return;
      }
      function smooth(peaks: number[]) {
        const targets = peaks.map((peak) =>
          Math.sqrt(Math.max(0, (peak - 0.012) / (1 - 0.012))),
        );
        const mean = targets.reduce((sum, target) => sum + target, 0) / bins;
        const rising = mean > smoothed;
        smoothed += (mean - smoothed) * (rising ? attack : release);
        // Smooth the rail as a whole to preserve the shape of moving peaks.
        const gain = rising
          ? smoothed / mean
          : (1 - smoothed) / (1 - mean || 1);
        const offset = rising ? 0 : smoothed - gain * mean;
        targets.forEach((target, bin) => {
          output[bin] = offset + gain * target;
        });
      }
      const peaks = readWavePeaks(source, time, turn, bins);
      return peaks instanceof Promise ? peaks.then(smooth) : smooth(peaks);
    },
    () => {
      current = undefined;
      smoothed = 0;
    },
  );
  return { geometry, ...envelope };
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
  const { geometry } = waveform;
  const levels = waveform.frame(index);
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
      const amplitude = speaking ? (levels[bin] ?? 0) : 0;
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

export function createWaveformScene(): WindowedVideoScene {
  let waveform: ReturnType<typeof prepareWaveform> | undefined;
  return {
    id: waveformSceneId,
    kind: "2d",
    init({ plan, audio, orientation }) {
      waveform = prepareWaveform(plan, audio, orientation);
    },
    prepareFrame(index, signal) {
      return waveform?.prepareFrame(index, signal);
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
