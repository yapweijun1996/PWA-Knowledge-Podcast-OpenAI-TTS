import type { VideoTurn } from "./timeline.ts";

export type PcmAudio = {
  sampleRate: number;
  channels: readonly (Float32Array | Int16Array)[];
};

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
