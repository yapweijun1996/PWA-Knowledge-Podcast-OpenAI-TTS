import { designTokens, type Orientation } from "./design/tokens.ts";

export const mebibyte = 1024 ** 2;
export const maxVideoSeconds = 300;
export const maxVideoPcmBytes = 32 * mebibyte;
export const maxEncodedBytes = 128 * mebibyte;
const nominalEncodedBudget = maxEncodedBytes * 0.8;
export const studioWavSampleRate = 24_000;
export const studioWavChannels = 1;

export function videoEncodingRates(duration: number, channels: number) {
  const audioBitrate = channels === 1 ? 64_000 : 128_000;
  const fallbackVideoBitrate = 900_000;
  const videoBitrate = Math.max(
    fallbackVideoBitrate,
    Math.min(
      2_400_000,
      Math.floor((nominalEncodedBudget * 8) / duration) - audioBitrate,
    ),
  );
  return { audioBitrate, videoBitrate, fallbackVideoBitrate };
}

type ExportInput = {
  audioDuration: number;
  videoDuration: number;
  fps: number;
  orientation: Orientation;
  scene: "waveform" | "studio3d" | "mixed";
  sampleRate: number;
  channels: number;
  workerCopy?: boolean;
  storage?: Pick<StorageEstimate, "usage" | "quota">;
};

/** Estimates the Episode ArrayBuffer export from nominal codec targets. */
export function estimateVideoExport({
  audioDuration,
  videoDuration,
  fps,
  orientation,
  scene,
  sampleRate,
  channels,
  workerCopy = true,
  storage,
}: ExportInput) {
  if (
    ![audioDuration, videoDuration, fps].every(
      (value) => Number.isFinite(value) && value > 0,
    ) ||
    !Number.isSafeInteger(sampleRate) ||
    sampleRate <= 0 ||
    !Number.isSafeInteger(channels) ||
    channels <= 0
  )
    return {
      allowed: false,
      constraint: "invalid",
      estimate: undefined,
    } as const;

  const samples = Math.round(audioDuration * sampleRate) * channels;
  const wavBytes = 44 + samples * Int16Array.BYTES_PER_ELEMENT;
  const pcmBytes = samples * Float32Array.BYTES_PER_ELEMENT;
  const { audioBitrate, videoBitrate, fallbackVideoBitrate } =
    videoEncodingRates(videoDuration, channels);
  const encodedPayloadBytes =
    (videoDuration * (videoBitrate + audioBitrate)) / 8;
  const fallbackPayloadBytes =
    (videoDuration * (fallbackVideoBitrate + audioBitrate)) / 8;
  // Allow for MP4 tables and for the JSON receipt, including optional captions.
  const mp4Bytes = Math.ceil(encodedPayloadBytes) + mebibyte;
  const additionalStorageBytes = mp4Bytes + mebibyte;
  const originStorageBytes = wavBytes + additionalStorageBytes;

  const { usage, quota } = storage ?? {};
  const availableStorageBytes =
    usage !== undefined &&
    quota !== undefined &&
    Number.isFinite(usage) &&
    Number.isFinite(quota) &&
    usage >= 0 &&
    quota >= 0
      ? Math.max(0, quota - usage)
      : undefined;

  const frames = Math.ceil(videoDuration * fps);
  const waveform = scene !== "studio3d";
  const studio3d = scene !== "waveform";
  const cacheFloatsPerFrame =
    (waveform ? designTokens[orientation].waveBarsPerHost : 0) +
    (studio3d ? 36 : 0);
  const sceneCacheBytes =
    frames * cacheFloatsPerFrame * Float32Array.BYTES_PER_ELEMENT;
  const drawSeconds = [
    (frames * (waveform ? 3 : 16)) / 1000,
    (frames * (studio3d ? 30 : 3)) / 1000,
  ] as const;
  // mp4-muxer 5.2.2 doubles its 64 KiB buffer, then slices the result.
  const muxCapacity = 2 ** Math.ceil(Math.log2(Math.max(64 * 1024, mp4Bytes)));
  const decodePeakBytes = wavBytes + pcmBytes;
  const muxPeakBytes =
    muxCapacity + mp4Bytes + pcmBytes * (workerCopy ? 2 : 1) + sceneCacheBytes;
  const memoryClass =
    Math.max(decodePeakBytes, muxPeakBytes) > maxEncodedBytes
      ? "high"
      : "lower";

  const constraint =
    pcmBytes > maxVideoPcmBytes
      ? "pcm"
      : encodedPayloadBytes > nominalEncodedBudget
        ? "encoded"
        : Math.max(audioDuration, videoDuration) > maxVideoSeconds
          ? "duration"
          : availableStorageBytes !== undefined &&
              additionalStorageBytes > availableStorageBytes
            ? "storage"
            : undefined;
  return {
    allowed: constraint === undefined,
    constraint,
    estimate: {
      videoDuration,
      pcmBytes,
      encodedPayloadBytes,
      fallbackPayloadBytes,
      mp4Bytes,
      decodePeakBytes,
      muxPeakBytes,
      memoryClass,
      drawSeconds,
      additionalStorageBytes,
      originStorageBytes,
      availableStorageBytes,
    },
  } as const;
}
