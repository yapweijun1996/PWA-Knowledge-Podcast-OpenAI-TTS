import { ArrayBufferTarget, Muxer } from "mp4-muxer";
import { hosts } from "../../shared/factory.ts";
import { t } from "../i18n/index.ts";
import {
  drawFrame,
  sampleAmplitude,
  turnSampleRange,
  type PcmAudio,
} from "./draw.ts";
import type { VideoTheme } from "./themes.ts";
import type { TimelinePlan } from "./timeline.ts";

/** VP9 in MP4 is opt-in because playback compatibility differs from H.264. */
export type VideoRenderPlan = TimelinePlan & { allowVp9?: boolean };

export type VideoAudio =
  | PcmAudio
  | Pick<AudioBuffer, "sampleRate" | "numberOfChannels" | "getChannelData">;

export type VideoRenderDependencies = {
  VideoEncoder?: typeof VideoEncoder;
  AudioEncoder?: typeof AudioEncoder;
  VideoFrame?: typeof VideoFrame;
  AudioData?: typeof AudioData;
  OffscreenCanvas?: typeof OffscreenCanvas;
  createCanvas?: (
    width: number,
    height: number,
  ) => OffscreenCanvas | HTMLCanvasElement;
  crypto?: { subtle: Pick<SubtleCrypto, "digest"> };
};

type RenderOptions = {
  plan: VideoRenderPlan;
  audio: VideoAudio;
  theme: VideoTheme;
  /** Fraction from 0 to 1. The final 1 follows muxing and hashing. */
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
  deps?: VideoRenderDependencies;
};

type EncoderQueue = Pick<
  VideoEncoder,
  "encodeQueueSize" | "addEventListener" | "removeEventListener"
>;

const maxQueueSize = 4;
const maxVideoFramesInFlight = 24;
const maxEncodedBytes = 128 * 1024 * 1024;
const videoBitrate = 900_000;
const keyFrameIntervalSeconds = 4;
const audioBlockSize = 4096;
const opusSampleRate = 48_000;
const opusFrameDuration = 20_000;
const micros = (seconds: number) => Math.round(seconds * 1_000_000);

function getPcm(audio: VideoAudio): PcmAudio {
  if (!Number.isInteger(audio.sampleRate) || audio.sampleRate <= 0) {
    throw new RangeError(t("video.render.invalidSampleRate"));
  }
  const channels =
    "channels" in audio
      ? audio.channels
      : Array.from({ length: audio.numberOfChannels }, (_, index) =>
          audio.getChannelData(index),
        );
  if (
    !channels.length ||
    channels.some(
      (channel) =>
        !(channel instanceof Float32Array || channel instanceof Int16Array) ||
        channel.length !== channels[0].length,
    )
  ) {
    throw new Error(t("video.render.invalidChannels"));
  }
  return { channels, sampleRate: audio.sampleRate };
}

async function isSupported(check: () => Promise<{ supported?: boolean }>) {
  try {
    return (await check()).supported === true;
  } catch {
    return false;
  }
}

function waitFor<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    // A codec operation may reject after cancellation closes its encoder.
    void operation.catch(() => {});
    return Promise.reject(signal.reason);
  }
  return new Promise((resolve, reject) => {
    const stop = () => reject(signal.reason);
    signal.addEventListener("abort", stop, { once: true });
    void operation
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", stop));
  });
}

function waitForQueue(encoder: EncoderQueue, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    function cleanUp() {
      encoder.removeEventListener("dequeue", check);
      signal.removeEventListener("abort", stop);
    }
    function check() {
      if (encoder.encodeQueueSize < maxQueueSize) {
        cleanUp();
        resolve();
      }
    }
    function stop() {
      cleanUp();
      reject(signal.reason);
    }
    encoder.addEventListener("dequeue", check);
    signal.addEventListener("abort", stop, { once: true });
    if (signal.aborted) stop();
    else check();
  });
}

/** Map source PCM onto the output sample clock, leaving cards and gaps silent. */
function audioBlocks(plan: TimelinePlan, audio: PcmAudio, sampleRate: number) {
  const { channels, sampleRate: sourceRate } = audio;
  const resample = sourceRate !== sampleRate;
  const turns = plan.scenes
    .filter((scene) => scene.kind === "turn")
    .map((scene) => {
      const input = turnSampleRange(scene, sourceRate);
      const { start, end } = turnSampleRange(scene, sampleRate);
      const sourceEnd = Math.min(
        channels[0].length,
        input.source + input.end - input.start,
      );
      const available = Math.ceil(
        ((sourceEnd - input.source) * sampleRate) / sourceRate,
      );
      return {
        start,
        end: Math.min(end, start + available),
        source: input.source,
        sourceEnd,
      };
    });
  let current = 0;
  return (offset: number, count: number) => {
    const data = new Float32Array(count * channels.length);
    const blockEnd = offset + count;
    while (current < turns.length && turns[current].end <= offset) current++;
    for (let index = current; index < turns.length; index++) {
      const turn = turns[index];
      if (turn.start >= blockEnd) break;
      const start = Math.max(turn.start, offset);
      const turnOffset = start - turn.start;
      const length = Math.min(blockEnd, turn.end) - start;
      if (length <= 0) continue;
      channels.forEach((channel, plane) => {
        const destination = plane * count + start - offset;
        if (!resample && channel instanceof Float32Array) {
          const source = turn.source + turnOffset;
          data.set(channel.subarray(source, source + length), destination);
          return;
        }
        for (let sample = 0; sample < length; sample++) {
          const position =
            turn.source + ((turnOffset + sample) * sourceRate) / sampleRate;
          const left = Math.floor(position);
          const first = sampleAmplitude(channel, left);
          const right = Math.min(left + 1, turn.sourceEnd - 1);
          data[destination + sample] =
            first +
            (sampleAmplitude(channel, right) - first) * (position - left);
        }
      });
    }
    return data;
  };
}

export async function renderVideo({
  plan,
  audio,
  theme,
  onProgress,
  signal,
  deps = {},
}: RenderOptions) {
  const failure = new AbortController();
  const stop = signal
    ? AbortSignal.any([signal, failure.signal])
    : failure.signal;
  stop.throwIfAborted();

  const {
    duration,
    fps,
    resolution: { width, height },
  } = plan;
  const endTimestamp = micros(duration);
  let totalFrames = Math.ceil(duration * fps);
  if (totalFrames > 1 && micros((totalFrames - 1) / fps) >= endTimestamp)
    totalFrames--;
  if (
    !Number.isSafeInteger(totalFrames) ||
    !Number.isSafeInteger(endTimestamp) ||
    duration <= 0 ||
    fps <= 0 ||
    fps > 1_000_000 ||
    totalFrames < 1 ||
    endTimestamp < 1 ||
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new RangeError(t("video.render.invalidPlan"));
  }
  const pcm = getPcm(audio);
  const numberOfChannels = pcm.channels.length;
  // Keep the baked-in speaker labels consistent if the locale changes mid-render.
  const speakerLabels = new Map(
    hosts.map((name) => [name, t("video.caption.speaker", { name })]),
  );

  const VideoEncoderClass = deps.VideoEncoder ?? globalThis.VideoEncoder;
  const AudioEncoderClass = deps.AudioEncoder ?? globalThis.AudioEncoder;
  const VideoFrameClass = deps.VideoFrame ?? globalThis.VideoFrame;
  const AudioDataClass = deps.AudioData ?? globalThis.AudioData;
  const Canvas = deps.OffscreenCanvas ?? globalThis.OffscreenCanvas;
  const subtle = (deps.crypto ?? globalThis.crypto)?.subtle;
  if (!VideoEncoderClass || !VideoFrameClass)
    throw new Error(t("video.render.noVideoEncoder"));
  if (!AudioEncoderClass || !AudioDataClass)
    throw new Error(t("video.render.noAudioEncoder"));
  if (!subtle) throw new Error(t("video.render.noHash"));

  const videoSettings = {
    width,
    height,
    framerate: fps,
    bitrate: videoBitrate,
    latencyMode: "quality" as const,
  };
  const h264: VideoEncoderConfig = {
    ...videoSettings,
    codec: fps > 30 ? "avc1.42002a" : "avc1.420028",
    avc: { format: "avc" },
  };
  const vp9: VideoEncoderConfig = {
    ...videoSettings,
    codec: fps > 30 ? "vp09.00.41.08" : "vp09.00.40.08",
  };
  async function supportedVideoConfig(config: VideoEncoderConfig) {
    const variable = { ...config, bitrateMode: "variable" as const };
    for (const candidate of [variable, config]) {
      const supported = await waitFor(
        isSupported(() => VideoEncoderClass.isConfigSupported(candidate)),
        stop,
      );
      if (supported) return candidate;
    }
  }
  const avcConfig = await supportedVideoConfig(h264);
  const videoConfig =
    avcConfig ??
    (plan.allowVp9 === true ? await supportedVideoConfig(vp9) : undefined);
  if (!videoConfig) throw new Error(t("video.render.unsupportedVideoCodec"));
  const hasAvc = avcConfig !== undefined;
  let audioConfig: AudioEncoderConfig = {
    codec: "mp4a.40.2",
    sampleRate: pcm.sampleRate,
    numberOfChannels,
    bitrate: numberOfChannels === 1 ? 64_000 : 128_000,
  };
  let audioCodec: "aac" | "opus" = "aac";
  const supportsAudio = (config: AudioEncoderConfig) =>
    waitFor(
      isSupported(() => AudioEncoderClass.isConfigSupported(config)),
      stop,
    );
  if (!(await supportsAudio(audioConfig))) {
    audioCodec = "opus";
    audioConfig = {
      ...audioConfig,
      codec: "opus",
      opus: { frameDuration: opusFrameDuration },
    };
    if (!(await supportsAudio(audioConfig))) {
      audioConfig = { ...audioConfig, sampleRate: opusSampleRate };
      if (
        pcm.sampleRate === opusSampleRate ||
        !(await supportsAudio(audioConfig))
      )
        throw new Error(t("video.render.unsupportedAudioCodec"));
    }
  }
  stop.throwIfAborted();
  const { sampleRate } = audioConfig;
  const totalSamples = Math.round(duration * sampleRate);
  if (!Number.isSafeInteger(totalSamples) || totalSamples < 1) {
    throw new RangeError(t("video.render.invalidAudioDuration"));
  }
  const defaultAudioDuration =
    audioCodec === "opus" ? opusFrameDuration : micros(1024 / sampleRate);

  const canvas = deps.createCanvas
    ? deps.createCanvas(width, height)
    : Canvas
      ? new Canvas(width, height)
      : globalThis.document?.createElement("canvas");
  if (!canvas) throw new Error(t("video.render.noCanvas"));
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error(t("video.render.noDrawingContext"));

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: hasAvc ? "avc" : "vp9", width, height },
    audio: {
      codec: audioCodec,
      // Opus in MP4 uses a 48 kHz track clock, even with lower-rate PCM input.
      sampleRate: audioCodec === "opus" ? opusSampleRate : sampleRate,
      numberOfChannels,
    },
    fastStart: false,
  });
  const getAudioBlock = audioBlocks(plan, pcm, sampleRate);
  let encodedBytes = 0;
  let encodedVideoFrames = 0;
  let hasVideoConfig = false;
  let audioOrigin: number | undefined;
  let encodedAudioChunks = 0;
  let videoEncoder: VideoEncoder | undefined;
  let audioEncoder: AudioEncoder | undefined;

  function copyChunk(chunk: EncodedVideoChunk | EncodedAudioChunk) {
    encodedBytes += chunk.byteLength;
    if (encodedBytes > maxEncodedBytes)
      throw new Error(
        t("video.render.encodedSizeLimit", { size: maxEncodedBytes / 1024 ** 2 }),
      );
    const bytes = new Uint8Array(chunk.byteLength);
    chunk.copyTo(bytes);
    return bytes;
  }

  function output(write: () => void) {
    if (stop.aborted) return;
    try {
      write();
    } catch (error) {
      failure.abort(error);
    }
  }

  try {
    videoEncoder = new VideoEncoderClass({
      error: (cause) =>
        failure.abort(new Error(t("video.render.videoEncodingFailed"), { cause })),
      output: (chunk, metadata) =>
        output(() => {
          const timestamp = micros(encodedVideoFrames / fps);
          if (
            chunk.timestamp !== timestamp ||
            encodedVideoFrames >= totalFrames
          ) {
            throw new Error(t("video.render.unexpectedFrameTimestamp"));
          }
          const end = Math.min(
            endTimestamp,
            micros((encodedVideoFrames + 1) / fps),
          );
          const config = metadata?.decoderConfig;
          hasVideoConfig ||= Boolean(
            hasAvc ? config?.description : config?.colorSpace,
          );
          muxer.addVideoChunkRaw(
            copyChunk(chunk),
            chunk.type,
            timestamp,
            end - timestamp,
            metadata,
          );
          encodedVideoFrames++;
        }),
    });
    audioEncoder = new AudioEncoderClass({
      error: (cause) =>
        failure.abort(new Error(t("video.render.audioEncodingFailed"), { cause })),
      output: (chunk, metadata) =>
        output(() => {
          audioOrigin ??= chunk.timestamp;
          const timestamp = chunk.timestamp - audioOrigin;
          if (timestamp >= endTimestamp) return;
          const length = Math.min(
            chunk.duration ?? defaultAudioDuration,
            endTimestamp - timestamp,
          );
          muxer.addAudioChunkRaw(
            copyChunk(chunk),
            chunk.type,
            timestamp,
            length,
            metadata,
          );
          encodedAudioChunks++;
        }),
    });
    videoEncoder.configure(videoConfig);
    audioEncoder.configure(audioConfig);

    onProgress?.(0);
    let audioOffset = 0;
    let keyFrameAt = 0;
    const keyFrameInterval = Math.max(
      1,
      Math.round(keyFrameIntervalSeconds * fps),
    );
    const textLayouts = new Map<string, string[]>();
    for (let index = 0; index < totalFrames; index++) {
      stop.throwIfAborted();
      if (index - encodedVideoFrames >= maxVideoFramesInFlight) {
        await waitFor(videoEncoder.flush(), stop);
        if (encodedVideoFrames !== index)
          throw new Error(t("video.render.missingFrames"));
        keyFrameAt = index;
      }
      if (videoEncoder.encodeQueueSize >= maxQueueSize)
        await waitForQueue(videoEncoder, stop);
      stop.throwIfAborted();

      const time = index / fps;
      drawFrame(context, plan, pcm, theme, time, speakerLabels, textLayouts);
      const timestamp = micros(time);
      const endTime = Math.min(duration, (index + 1) / fps);
      const frame = new VideoFrameClass(canvas, {
        timestamp,
        duration: micros(endTime) - timestamp,
      });
      const keyFrame = index === keyFrameAt;
      try {
        videoEncoder.encode(frame, { keyFrame });
      } finally {
        frame.close();
      }
      if (keyFrame) keyFrameAt += keyFrameInterval;
      onProgress?.((index + 1) / (totalFrames + 1));
      stop.throwIfAborted();

      const audioEnd =
        index === totalFrames - 1
          ? totalSamples
          : Math.round(endTime * sampleRate);
      while (audioOffset < audioEnd) {
        stop.throwIfAborted();
        if (audioEncoder.encodeQueueSize >= maxQueueSize)
          await waitForQueue(audioEncoder, stop);
        stop.throwIfAborted();
        const count = Math.min(audioBlockSize, totalSamples - audioOffset);
        const data = new AudioDataClass({
          format: "f32-planar",
          sampleRate,
          numberOfChannels,
          numberOfFrames: count,
          timestamp: micros(audioOffset / sampleRate),
          data: getAudioBlock(audioOffset, count),
        });
        try {
          audioEncoder.encode(data);
        } finally {
          data.close();
        }
        audioOffset += count;
      }
      // Let page and worker abort events run even when the encoders keep up.
      if ((index + 1) % 8 === 0)
        await waitFor(new Promise((resolve) => setTimeout(resolve, 0)), stop);
    }

    stop.throwIfAborted();
    await waitFor(
      Promise.all([videoEncoder.flush(), audioEncoder.flush()]),
      stop,
    );
    stop.throwIfAborted();
    if (
      encodedVideoFrames !== totalFrames ||
      !hasVideoConfig ||
      !encodedAudioChunks
    ) {
      throw new Error(t("video.render.incompleteTracks"));
    }
    muxer.finalize();
    const bytes = target.buffer;
    const hash = await waitFor(subtle.digest("SHA-256", bytes), stop);
    stop.throwIfAborted();
    const sha256 = Array.from(new Uint8Array(hash), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    const blob = new Blob([bytes], { type: "video/mp4" });
    onProgress?.(1);
    stop.throwIfAborted();
    return {
      blob,
      sha256,
      durationSeconds: duration,
      width,
      height,
      fps,
      videoCodec: videoConfig.codec,
      audioCodec,
    };
  } finally {
    if (videoEncoder && videoEncoder.state !== "closed") videoEncoder.close();
    if (audioEncoder && audioEncoder.state !== "closed") audioEncoder.close();
  }
}
