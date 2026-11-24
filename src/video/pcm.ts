import type { VideoTurn } from "./timeline.ts";
import type { PcmSource } from "./pcm-source.ts";
import type { VideoScene } from "./scenes/types.ts";

export type PcmAudio = {
  sampleRate: number;
  channels: readonly (Float32Array | Int16Array)[];
  /** Streamed render inputs expose PCM here instead of as full channel arrays. */
  source?: PcmSource;
};

export type WindowedVideoScene = VideoScene & {
  prepareFrame?(index: number, signal: AbortSignal): void | Promise<void>;
};

/** Replay smoothing in episode order, retaining only a short ring for nearby seeks. */
export function frameEnvelope(
  frames: number,
  stride: number,
  step: (index: number, output: Float32Array) => void | Promise<void>,
  reset: () => void,
) {
  const capacity = 32;
  const ring = new Float32Array(capacity * stride);
  const silence = new Float32Array(stride);
  let next = 0;

  function slot(index: number) {
    const offset = (index % capacity) * stride;
    return ring.subarray(offset, offset + stride);
  }

  function read(
    index: number,
    signal?: AbortSignal,
  ): Float32Array | Promise<Float32Array> {
    if (index < 0 || index >= frames) return silence;
    if (index < next - capacity) {
      reset();
      next = 0;
    }
    function advance(): Float32Array | Promise<Float32Array> {
      let batch = 0;
      while (next <= index) {
        signal?.throwIfAborted();
        if (signal && batch === 120) {
          return new Promise<void>((resume) => setTimeout(resume, 0)).then(
            advance,
          );
        }
        const work = step(next, slot(next));
        if (work)
          return work.then(() => {
            next++;
            return advance();
          });
        next++;
        batch++;
      }
      return slot(index);
    }
    return advance();
  }

  function frame(index: number) {
    const values = read(index);
    if (values instanceof Promise)
      throw new Error("PCM frame requires preparation");
    return values;
  }

  function prepareFrame(index: number, signal: AbortSignal) {
    const values = read(index, signal);
    if (values instanceof Promise) return values.then(() => {});
  }

  return { read, frame, prepareFrame };
}

export function sampleAmplitude(
  channel: Float32Array | Int16Array,
  index: number,
) {
  return channel instanceof Int16Array
    ? channel[index] / 32768
    : channel[index];
}

export function turnSampleRange(scene: VideoTurn, sampleRate: number) {
  return {
    start: Math.round(scene.start * sampleRate),
    end: Math.round(scene.end * sampleRate),
    source: Math.round(scene.audioStart * sampleRate),
  };
}
