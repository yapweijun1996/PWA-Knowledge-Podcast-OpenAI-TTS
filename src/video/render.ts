import { ArrayBufferTarget, Muxer } from "mp4-muxer";
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
const audioBlockSize = 4096;
const opusSampleRate = 48_000;
const opusFrameDuration = 20_000;
const micros = (seconds: number) => Math.round(seconds * 1_000_000);

function getPcm(audio: VideoAudio): PcmAudio {
  if (!Number.isInteger(audio.sampleRate) || audio.sampleRate <= 0) {
    throw new RangeError("音频采样率必须为正整数。");
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
    throw new Error("音频必须包含等长的 PCM 声道。");
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
    throw new RangeError("视频时长、帧率或分辨率无效。");
  }
  const pcm = getPcm(audio);
  const numberOfChannels = pcm.channels.length;

  const VideoEncoderClass = deps.VideoEncoder ?? globalThis.VideoEncoder;
  const AudioEncoderClass = deps.AudioEncoder ?? globalThis.AudioEncoder;
  const VideoFrameClass = deps.VideoFrame ?? globalThis.VideoFrame;
  const AudioDataClass = deps.AudioData ?? globalThis.AudioData;
  const Canvas = deps.OffscreenCanvas ?? globalThis.OffscreenCanvas;
  const subtle = (deps.crypto ?? globalThis.crypto)?.subtle;
  if (!VideoEncoderClass || !VideoFrameClass)
    throw new Error("此浏览器不支持 WebCodecs 视频编码。");
  if (!AudioEncoderClass || !AudioDataClass)
    throw new Error("此浏览器不支持 WebCodecs 音频编码。");
  if (!subtle) throw new Error("此浏览器无法计算视频的 SHA-256 校验值。");

  const videoSettings = {
    width,
    height,
    framerate: fps,
    bitrate: 5_000_000,
    latencyMode: "realtime" as const,
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
  const hasAvc = await waitFor(
    isSupported(() => VideoEncoderClass.isConfigSupported(h264)),
    stop,
  );
  const hasVp9 =
    !hasAvc &&
    plan.allowVp9 === true &&
    (await waitFor(
      isSupported(() => VideoEncoderClass.isConfigSupported(vp9)),
      stop,
    ));
  if (!hasAvc && !hasVp9)
    throw new Error("此浏览器不支持此视频所需的 H.264 或获准的 VP9 编码。");

  const videoConfig = hasAvc ? h264 : vp9;
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
        throw new Error("此浏览器不支持此音频所需的 AAC 或 Opus 编码。");
    }
  }
  stop.throwIfAborted();
  const { sampleRate } = audioConfig;
  const totalSamples = Math.round(duration * sampleRate);
  if (!Number.isSafeInteger(totalSamples) || totalSamples < 1) {
    throw new RangeError("音频时长无效。");
  }
  const defaultAudioDuration =
    audioCodec === "opus" ? opusFrameDuration : micros(1024 / sampleRate);

  const canvas = deps.createCanvas
    ? deps.createCanvas(width, height)
    : Canvas
      ? new Canvas(width, height)
      : globalThis.document?.createElement("canvas");
  if (!canvas) throw new Error("此浏览器无法创建视频画布。");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("此浏览器无法创建二维绘图环境。");

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
      throw new Error("视频超过浏览器渲染的 128 MiB 编码数据上限。");
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
      error: (cause) => failure.abort(new Error("视频编码失败。", { cause })),
      output: (chunk, metadata) =>
        output(() => {
          const timestamp = micros(encodedVideoFrames / fps);
          if (
            chunk.timestamp !== timestamp ||
            encodedVideoFrames >= totalFrames
          ) {
            throw new Error("视频编码器返回了意外的帧时间戳。");
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
      error: (cause) => failure.abort(new Error("音频编码失败。", { cause })),
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
    for (let index = 0; index < totalFrames; index++) {
      stop.throwIfAborted();
      if (index - encodedVideoFrames >= maxVideoFramesInFlight) {
        await waitFor(videoEncoder.flush(), stop);
        if (encodedVideoFrames !== index)
          throw new Error("视频编码器未返回所有帧。");
        keyFrameAt = index;
      }
      if (videoEncoder.encodeQueueSize >= maxQueueSize)
        await waitForQueue(videoEncoder, stop);
      stop.throwIfAborted();

      const time = index / fps;
      drawFrame(context, plan, pcm, theme, time);
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
      if (keyFrame) keyFrameAt += Math.max(1, Math.round(2 * fps));
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
      throw new Error("编码器未生成完整的视频和音频轨道。");
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
