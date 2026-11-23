type VideoConfig = {
  codec: string;
  width: number;
  height: number;
  bitrate: number;
  framerate: number;
};

type AudioConfig = {
  codec: string;
  sampleRate: number;
  numberOfChannels: number;
  bitrate: number;
};

type SupportResult = { supported?: boolean };
type SupportCheck = SupportResult | PromiseLike<SupportResult>;
type Encoder<Config> = (new (...args: never[]) => unknown) & {
  isConfigSupported?: (config: Config) => SupportCheck;
};

export type VideoProbeEnvironment = {
  VideoEncoder?: Encoder<VideoConfig>;
  VideoFrame?: unknown;
  OffscreenCanvas?: unknown;
  AudioEncoder?: Encoder<AudioConfig>;
  isConfigSupported?: (
    kind: "video" | "audio",
    config: VideoConfig | AudioConfig,
  ) => SupportCheck;
};

async function supports<Config>(
  encoder: Encoder<Config> | undefined,
  config: Config,
  override?: (config: Config) => SupportCheck,
) {
  if (typeof encoder !== "function") return false;
  try {
    const result = await (override
      ? override(config)
      : encoder.isConfigSupported?.(config));
    return result?.supported === true;
  } catch {
    return false;
  }
}

/**
 * Probe specific encoder configurations without constructing encoders or frames.
 * A true codec result comes from the config check. Canvas and frame availability
 * are reported separately so the caller can evaluate its rendering path.
 */
export async function probeVideoSupport(env: VideoProbeEnvironment) {
  const {
    VideoEncoder,
    VideoFrame,
    OffscreenCanvas,
    AudioEncoder,
    isConfigSupported,
  } = env;
  const videoConfig = {
    width: 1920,
    height: 1080,
    bitrate: 5_000_000,
    framerate: 30,
  };
  const audioConfig = { numberOfChannels: 1, bitrate: 64_000 };
  const checkVideo = isConfigSupported?.bind(env, "video");
  const checkAudio = isConfigSupported?.bind(env, "audio");
  const [avc1, vp09, av01, mp4a, opus] = await Promise.all([
    supports(
      VideoEncoder,
      { ...videoConfig, codec: "avc1.420028" },
      checkVideo,
    ),
    supports(
      VideoEncoder,
      { ...videoConfig, codec: "vp09.00.40.08" },
      checkVideo,
    ),
    supports(
      VideoEncoder,
      { ...videoConfig, codec: "av01.0.08M.08" },
      checkVideo,
    ),
    supports(
      AudioEncoder,
      { ...audioConfig, codec: "mp4a.40.2", sampleRate: 24_000 },
      checkAudio,
    ),
    supports(
      AudioEncoder,
      { ...audioConfig, codec: "opus", sampleRate: 48_000 },
      checkAudio,
    ),
  ]);
  return {
    videoEncoder: typeof VideoEncoder === "function",
    videoFrame: typeof VideoFrame === "function",
    offscreenCanvas: typeof OffscreenCanvas === "function",
    audioEncoder: typeof AudioEncoder === "function",
    codecs: { avc1, vp09, av01, mp4a, opus },
  };
}
