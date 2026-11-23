import { createTranslator, t } from "../i18n/index.ts";
import { recordCaptionTrack } from "./caption-track.ts";
import { ensureVideoFonts } from "./fonts/loader.ts";
import { overlayCopy, prepareOverlay } from "./overlay.ts";
import { sampleAmplitude, turnSampleRange, type PcmAudio } from "./pcm.ts";
import { defaultSceneId, getScene } from "./scenes/registry.ts";
import {
  resolveStudio3dOptions,
  studio3dSceneId,
  type Studio3dOptions,
} from "./scenes/studio3d/presets.ts";
import type {
  SceneCanvas,
  SceneContext,
  SceneNotice,
  VideoScene,
  VideoSceneFrame,
} from "./scenes/types.ts";
import { themePalette, type VideoTheme } from "./themes.ts";
import { planOrientation, type TimelinePlan } from "./timeline.ts";

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
  sceneId?: string;
  studio3d?: Studio3dOptions;
  /** Fraction from 0 to 1. The final 1 follows muxing and hashing. */
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
  deps?: VideoRenderDependencies;
};

type EncoderQueue = Pick<
  VideoEncoder,
  "encodeQueueSize" | "addEventListener" | "removeEventListener"
>;

function drawStage(
  context: SceneContext,
  scene: VideoScene,
  frame: Omit<VideoSceneFrame, "kind">,
  drawSpeakerLabel: () => void,
) {
  if (scene.kind === "2d") {
    context.save();
    try {
      scene.draw({ ...frame, kind: "2d", context, drawSpeakerLabel });
    } finally {
      context.restore();
    }
  } else {
    scene.draw({ ...frame, kind: "webgl" });
    context.drawImage(frame.canvas, 0, 0);
  }
}

const maxQueueSize = 4;
const maxVideoFramesInFlight = 24;
const maxEncodedBytes = 128 * 1024 * 1024;
const minimumVideoBitrate = 900_000;
const maximumVideoBitrate = 2_400_000;
const keyFrameIntervalSeconds = 4;
const audioBlockSize = 4096;
const opusSampleRate = 48_000;
const opusFrameDuration = 20_000;
const micros = (seconds: number) => Math.round(seconds * 1_000_000);

function readMpeg4Descriptor(bytes: Uint8Array, start: number, tag: number) {
  if (bytes[start] !== tag) return;
  let length = 0;
  for (let offset = start + 1; offset < start + 5; offset++) {
    if (offset >= bytes.length) return;
    const byte = bytes[offset];
    length = length * 128 + (byte & 0x7f);
    if (byte & 0x80) continue;
    const payload = offset + 1;
    if (payload + length <= bytes.length) {
      return bytes.subarray(payload, payload + length);
    }
    return;
  }
}

function aacDecoderMetadata(metadata: EncodedAudioChunkMetadata | undefined) {
  const config = metadata?.decoderConfig;
  if (!config?.description) return metadata;
  const { description } = config;
  const bytes = ArrayBuffer.isView(description)
    ? new Uint8Array(
        description.buffer,
        description.byteOffset,
        description.byteLength,
      )
    : new Uint8Array(description);
  if (bytes[0] !== 0x03 && bytes[0] !== 0x04) return metadata;

  // Safari can return an ES_Descriptor. The muxer supplies that wrapper.
  let decoderConfig = readMpeg4Descriptor(bytes, 0, 0x04);
  if (bytes[0] === 0x03) {
    const es = readMpeg4Descriptor(bytes, 0, 0x03);
    if (es && es.length >= 3) {
      const flags = es[2];
      let offset = 3;
      if (flags & 0x80) offset += 2; // Depends on another elementary stream.
      if (flags & 0x40) offset += 1 + (es[offset] ?? es.length);
      if (flags & 0x20) offset += 2; // References an OCR elementary stream.
      decoderConfig = readMpeg4Descriptor(es, offset, 0x04);
    }
  }
  const asc = decoderConfig && readMpeg4Descriptor(decoderConfig, 13, 0x05);
  if (!asc || asc.length < 2) {
    throw new Error(t("video.render.audioEncodingFailed"));
  }
  return { ...metadata, decoderConfig: { ...config, description: asc } };
}

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

/** Map source PCM onto the output sample clock, leaving uncovered gaps silent. */
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
  sceneId = defaultSceneId,
  studio3d,
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
  // Keep the encoded PCM intact while freezing audio-reactive scene geometry.
  const visualPcm = plan.reducedMotion
    ? { ...pcm, channels: pcm.channels.map(() => new Float32Array(0)) }
    : pcm;
  const numberOfChannels = pcm.channels.length;
  const copy = overlayCopy(plan);
  const orientation = planOrientation(plan);
  const mood = plan.mood ?? "calm";
  const sceneNotices: SceneNotice[] = [];
  function resolveScene(id: string, chapterId?: string) {
    const scene = getScene(id);
    if (scene.id !== id) {
      sceneNotices.push({
        reason: "unknown-scene",
        fallbackSceneId: scene.id,
        ...(chapterId === undefined ? {} : { chapterId }),
      });
    }
    return scene;
  }
  const defaultScene = resolveScene(sceneId);
  const chapterSelections =
    plan.chapterWindows ??
    plan.scenes.filter((scene) => scene.kind === "chapter");
  const chapterOverrides = new Map(
    chapterSelections.flatMap((chapter) =>
      chapter.sceneId === undefined
        ? []
        : [
            [
              chapter.chapterId,
              resolveScene(chapter.sceneId, chapter.chapterId),
            ] as const,
          ],
    ),
  );
  const studio = [defaultScene, ...chapterOverrides.values()].some(
    (scene) => scene.id === studio3dSceneId,
  )
    ? resolveStudio3dOptions({
        paletteId: plan.paletteId,
        ...studio3d,
        ...(plan.mood === undefined || plan.mood === "calm"
          ? {}
          : { moodId: plan.mood }),
        ...(plan.reducedMotion ? { reducedMotion: true } : {}),
      })
    : undefined;
  if (studio)
    sceneNotices.push(...studio.notices.map((reason) => ({ reason })));
  let effectiveSceneId = defaultScene.id;
  const paletteFor = (id: string) =>
    id === studio3dSceneId
      ? themePalette("dark", studio?.settings.paletteId)
      : themePalette(theme, plan.paletteId ?? studio?.settings.paletteId);
  const chapterLooks = new Map(
    (plan.chapterWindows ?? []).flatMap(({ chapterId, direction, start }) => {
      if (!direction) return [];
      const settings =
        chapterOverrides.get(chapterId)?.id === studio3dSceneId
          ? resolveStudio3dOptions({
              ...studio?.settings,
              paletteId: direction.paletteId,
              moodId: direction.mood,
              cameraPresetId: direction.cameraPresetId,
              reducedMotion: plan.reducedMotion,
            }).settings
          : undefined;
      const stageKey = settings
        ? JSON.stringify([
            settings.paletteId,
            settings.cameraPresetId,
            settings.moodId,
          ])
        : undefined;
      return [
        [
          chapterId,
          {
            paletteId: direction.paletteId,
            mood: direction.mood,
            start,
            settings,
            stageKey,
          },
        ] as const,
      ];
    }),
  );
  const chapterScenes = new Map<string, string>();
  const activeScenes = new Map<
    string,
    { scene: VideoScene; canvas: SceneCanvas }
  >();

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

  const audioBitrate = numberOfChannels === 1 ? 64_000 : 128_000;
  // Reserve 20% of the estimated budget for variable-rate output.
  const videoBitrate = Math.max(
    minimumVideoBitrate,
    Math.min(
      maximumVideoBitrate,
      Math.floor((maxEncodedBytes * 8 * 0.8) / duration) - audioBitrate,
    ),
  );
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
    // Retain the previous target for encoders that reject the preferred rate.
    const candidates =
      videoBitrate === minimumVideoBitrate
        ? [config]
        : [config, { ...config, bitrate: minimumVideoBitrate }];
    for (const candidate of candidates) {
      const variable = { ...candidate, bitrateMode: "variable" as const };
      for (const settings of [variable, candidate]) {
        const supported = await waitFor(
          isSupported(() => VideoEncoderClass.isConfigSupported(settings)),
          stop,
        );
        if (supported) return settings;
      }
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
    bitrate: audioBitrate,
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

  function makeCanvas(width: number, height: number, preferDom = false) {
    const dom = () => globalThis.document?.createElement("canvas");
    const offscreen = () => Canvas && new Canvas(width, height);
    const { createCanvas } = deps;
    const factories = createCanvas
      ? [() => createCanvas(width, height)]
      : preferDom
        ? [dom, offscreen]
        : [offscreen, dom];
    for (const create of factories) {
      try {
        const canvas = create();
        if (!canvas) continue;
        canvas.width = width;
        canvas.height = height;
        return canvas;
      } catch {
        // Canvas construction can fail in either runtime.
      }
    }
  }
  function supportsWebgl2() {
    try {
      const probe = makeCanvas(1, 1, true);
      const gl = probe?.getContext("webgl2", { antialias: true, alpha: false });
      if (!gl || gl.isContextLost()) return false;
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      return true;
    } catch {
      return false;
    }
  }
  const canvas = makeCanvas(width, height);
  if (!canvas) throw new Error(t("video.render.noCanvas"));
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error(t("video.render.noDrawingContext"));
  const preflight = await waitFor(
    ensureVideoFonts({ texts: copy.texts, signal: stop }),
    stop,
  );
  stop.throwIfAborted();
  const textLayouts = new Map<string, string[]>();
  const overlay = prepareOverlay(context, plan, copy, textLayouts);
  const captionLocale = plan.wordmarkLocale ?? copy.episodeLocale;
  const translateCaption = createTranslator(captionLocale);
  const captionRecorder = plan.estimated
    ? undefined
    : recordCaptionTrack(
        captionLocale,
        {
          A:
            plan.hostNames?.A ||
            translateCaption("video.caption.speaker", { name: "A" }),
          B:
            plan.hostNames?.B ||
            translateCaption("video.caption.speaker", { name: "B" }),
          C:
            plan.hostNames?.C ||
            translateCaption("video.caption.speaker", { name: "C" }),
        },
        endTimestamp,
      );

  let webgl2: boolean | undefined;
  async function initScene(
    selected: ReturnType<typeof getScene>,
    key = selected.id,
    settings = studio?.settings,
  ): Promise<{ scene: VideoScene; canvas: SceneCanvas }> {
    let layer: SceneCanvas | undefined = canvas;
    if (selected.kind === "webgl") {
      const { requiresWebgl2 } = selected;
      layer =
        !requiresWebgl2 || (webgl2 ??= supportsWebgl2())
          ? makeCanvas(width, height, requiresWebgl2)
          : undefined;
    }
    if (layer) {
      const scene = await waitFor(
        Promise.resolve(selected.create(settings)),
        stop,
      );
      const active = { scene, canvas: layer };
      activeScenes.set(key, active);
      stop.throwIfAborted();
      const result = await scene.init({
        canvas: layer,
        plan,
        audio: visualPcm,
        theme,
        orientation,
        paletteId: settings?.paletteId ?? paletteFor(scene.id),
        mood: settings?.moodId ?? mood,
        signal: stop,
        fail: (error) => failure.abort(error),
      });
      stop.throwIfAborted();
      if (result !== "webgl-unavailable") return active;
      activeScenes.delete(key);
      scene.dispose();
    }
    const fallback =
      activeScenes.get(defaultSceneId) ??
      (await initScene(getScene(defaultSceneId)));
    activeScenes.set(key, fallback);
    return fallback;
  }

  const { ArrayBufferTarget, Muxer } = await waitFor(import("mp4-muxer"), stop);
  stop.throwIfAborted();
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
        t("video.render.encodedSizeLimit", {
          size: maxEncodedBytes / 1024 ** 2,
        }),
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
        failure.abort(
          new Error(t("video.render.videoEncodingFailed"), { cause }),
        ),
      output: (chunk, metadata) =>
        output(() => {
          const timestamp = micros(encodedVideoFrames / fps);
          // VideoToolbox can round a microsecond down during conversion to its
          // media clock. Mux the original frame clock and still reject reordering.
          if (
            Math.abs(chunk.timestamp - timestamp) > 1 ||
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
        failure.abort(
          new Error(t("video.render.audioEncodingFailed"), { cause }),
        ),
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
            audioCodec === "aac" ? aacDecoderMetadata(metadata) : metadata,
          );
          encodedAudioChunks++;
        }),
    });
    videoEncoder.configure(videoConfig);
    audioEncoder.configure(audioConfig);

    onProgress?.(0);
    let audioOffset = 0;
    let activeChapterStage: string | undefined;
    let keyFrameAt = 0;
    let previousCard: ReturnType<typeof overlay.frameAt>["card"];
    const keyFrameInterval = Math.max(
      1,
      Math.round(keyFrameIntervalSeconds * fps),
    );
    for (let index = 0; index < totalFrames; index++) {
      stop.throwIfAborted();
      // Fixed batches bound retained frames and keep encoder flush points
      // independent of when output callbacks run.
      if (index > 0 && index % maxVideoFramesInFlight === 0) {
        await waitFor(videoEncoder.flush(), stop);
        if (encodedVideoFrames !== index)
          throw new Error(t("video.render.missingFrames"));
      }
      if (videoEncoder.encodeQueueSize >= maxQueueSize)
        await waitForQueue(videoEncoder, stop);
      stop.throwIfAborted();

      const time = index / fps;
      const overlayFrame = overlay.frameAt(time);
      const { turn, card } = overlayFrame;
      const direction = turn && chapterLooks.get(turn.chapterId);
      const liveTurn =
        turn &&
        (!card ||
          card.kind === "intro" ||
          (card.kind === "chapter" && card.chapterId === turn.chapterId));
      let paletteId = direction?.paletteId ?? paletteFor(effectiveSceneId);
      let labelDrawn = false;
      if (liveTurn) {
        const override = chapterOverrides.get(turn.chapterId);
        const selected = override ?? defaultScene;
        // Allocate at most one customized WebGL scene for the current chapter.
        const chapterStage = direction?.stageKey;
        if (activeChapterStage !== chapterStage) {
          if (activeChapterStage) {
            const previous = activeScenes.get(activeChapterStage);
            activeScenes.delete(activeChapterStage);
            if (previous?.scene.id === studio3dSceneId)
              previous.scene.dispose();
          }
          activeChapterStage = chapterStage;
        }
        const stageKey = chapterStage ?? selected.id;
        const active =
          activeScenes.get(stageKey) ??
          (await initScene(selected, stageKey, direction?.settings));
        if (selected.id !== active.scene.id) {
          const firstUse = override
            ? !chapterScenes.has(turn.chapterId)
            : effectiveSceneId === selected.id;
          if (firstUse) {
            sceneNotices.push({
              reason: "webgl-unavailable",
              fallbackSceneId: active.scene.id,
              ...(override ? { chapterId: turn.chapterId } : {}),
            });
          }
          if (!override) effectiveSceneId = active.scene.id;
        }
        chapterScenes.set(turn.chapterId, active.scene.id);
        paletteId = direction?.paletteId ?? paletteFor(active.scene.id);
        overlay.drawBackground(paletteId);
        if (!card) {
          drawStage(
            context,
            active.scene,
            {
              canvas: active.canvas,
              plan,
              audio: visualPcm,
              theme,
              orientation,
              paletteId,
              mood: direction?.mood ?? mood,
              time,
              ...(direction
                ? { sceneTime: Math.max(0, time - direction.start) }
                : {}),
              index,
              turn,
              textLayouts,
            },
            () => {
              if (overlayFrame.stageFade) return;
              if (!labelDrawn) overlay.drawHosts(overlayFrame, paletteId);
              labelDrawn = true;
            },
          );
          if (!plan.reducedMotion)
            overlay.drawStageFade(overlayFrame, paletteId);
        }
      } else {
        overlay.drawBackground(paletteId);
      }
      overlay.draw(overlayFrame, paletteId, labelDrawn);
      const timestamp = micros(time);
      captionRecorder?.observe(
        timestamp,
        turn && overlayFrame.cue
          ? { cue: overlayFrame.cue, speakerId: turn.speakerId }
          : undefined,
      );
      const endTime = Math.min(duration, (index + 1) / fps);
      const frame = new VideoFrameClass(canvas, {
        timestamp,
        duration: micros(endTime) - timestamp,
      });
      // A sharp full-frame change is a useful random access point. It also
      // keeps prediction from carrying stage detail onto a fresh title card.
      const keyFrame = index === keyFrameAt || card !== previousCard;
      previousCard = card;
      try {
        videoEncoder.encode(frame, { keyFrame });
      } finally {
        frame.close();
      }
      if (keyFrame) keyFrameAt = index + keyFrameInterval;
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
    const captionTrack = captionRecorder?.complete(sha256);
    onProgress?.(1);
    stop.throwIfAborted();
    return {
      blob,
      sha256,
      ...(captionTrack ? { captionTrack } : {}),
      durationSeconds: duration,
      width,
      height,
      fps,
      videoCodec: videoConfig.codec,
      audioCodec,
      sceneId: effectiveSceneId,
      orientation,
      paletteId:
        plan.storyboard?.chapters[0]?.paletteId ?? paletteFor(effectiveSceneId),
      ...(plan.storyboard ? { storyboard: plan.storyboard } : {}),
      fontNotices: preflight?.notices ?? [],
      captionReviewCount: overlay.captionReviewCount,
      ...(studio ? { studio3d: studio.settings } : {}),
      chapterScenes: [...chapterScenes].map(([chapterId, sceneId]) => ({
        chapterId,
        sceneId,
      })),
      sceneNotices,
    };
  } finally {
    if (videoEncoder && videoEncoder.state !== "closed") videoEncoder.close();
    if (audioEncoder && audioEncoder.state !== "closed") audioEncoder.close();
    await Promise.all(
      [...new Set(activeScenes.values())].map(async ({ scene }) =>
        scene.dispose(),
      ),
    );
  }
}
