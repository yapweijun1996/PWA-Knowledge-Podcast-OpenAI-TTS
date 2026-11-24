import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { openDB } from "idb";
import type { Episode } from "../../shared/factory.ts";
import {
  browserAgentArtifacts,
  type AgentArtifact,
  type StudioVideoOptions,
} from "../agent/artifacts.ts";
import { redactCredentials } from "../agent/runtime.ts";
import {
  createTranslator,
  resolveLocale,
  t,
  type MessageKey,
} from "../i18n/index.ts";
import {
  deriveThumbnailHeadline,
  publishLocales,
  thumbnailHeadlineErrors,
  validateThumbnailHeadline,
} from "../publish/thumbnail-headline.ts";
import type {
  ThumbnailOptions,
  ThumbnailVariant,
} from "../publish/thumbnail.ts";
import { probeVideoSupport } from "../video/capabilities.ts";
import {
  estimateVideoExport,
  maxVideoPcmBytes,
  studioWavChannels,
  studioWavSampleRate,
} from "../video/limits.ts";
import type { Studio3dSettings } from "../video/scenes/studio3d/presets.ts";
import type { TimelineOptions, TimelinePlan } from "../video/timeline.ts";
import {
  sameStoryboard,
  storyboardMoods,
  type Storyboard,
} from "../video/storyboard.ts";
import { get as getBrowserKey, redact } from "./browser-key.ts";
import type { AudioCheck } from "./library-model.ts";

type StudioVideo = NonNullable<
  NonNullable<AgentArtifact["metadata"]>["studioVideo"]
>;
export type VideoArtifact = AgentArtifact & {
  metadata: NonNullable<AgentArtifact["metadata"]> & {
    studioVideo: StudioVideo;
  };
};
export type PublishReview = StudioVideo["review"];
type Chapters = TimelinePlan["chapters"];
type Source = Pick<AgentArtifact, "episodeId" | "revision" | "sourceStamp">;
type DesignTokens = typeof import("../video/design/tokens.ts").designTokens;

const defaultSceneId = "waveform";
const studio3dSceneId = "studio3d";
const defaultCamera = { cameraPresetId: "drift", intensity: 0.55 } as const;
const redactThumbnailText = (text: string) =>
  redactCredentials(text, getBrowserKey());
export const videoOrientations = ["landscape", "portrait"] as const;
export const videoPalettes = [
  "aurora",
  "sunset",
  "mono",
  "ocean",
  "light",
] as const;
export const videoMoods = storyboardMoods;
export const thumbnailVariants = [
  "topic-graphic",
  "host-pair",
  "headline",
] as const;

function videoResolution(
  tokens: DesignTokens,
  orientation: StudioVideoOptions["orientation"],
) {
  const [landscapeWidth, landscapeHeight] = tokens.landscape.frame;
  const [portraitWidth, portraitHeight] = tokens.portrait.frame;
  return orientation === "portrait"
    ? { width: portraitWidth, height: portraitHeight }
    : { width: landscapeWidth, height: landscapeHeight };
}

export async function defaultVideoThumbnailVariant(
  language: Episode["language"],
  topic: string,
  title: string,
) {
  const { resolveThumbnailVariant } = await import("../publish/thumbnail.ts");
  return resolveThumbnailVariant({
    language,
    topicKeywords: [redactThumbnailText(topic), redactThumbnailText(title)],
  }).variant;
}

function optionValue<T>(choices: readonly T[], value: unknown, fallback: T) {
  return choices.find((choice) => choice === value) ?? fallback;
}

export function resolveVideoOptions(
  variant: ThumbnailVariant,
  receipt?: Partial<StudioVideo>,
): StudioVideoOptions {
  const input = receipt?.options;
  const paletteId = optionValue(
    videoPalettes,
    input?.paletteId ??
      receipt?.paletteId ??
      (receipt?.sceneId === studio3dSceneId
        ? receipt.studio3d?.paletteId
        : receipt?.theme === "light"
          ? "light"
          : undefined),
    "aurora",
  );
  return {
    orientation: optionValue(
      videoOrientations,
      input?.orientation ?? receipt?.orientation,
      "landscape",
    ),
    paletteId:
      receipt?.sceneId === studio3dSceneId && paletteId === "light"
        ? "aurora"
        : paletteId,
    mood: optionValue(
      videoMoods,
      input?.mood ?? receipt?.studio3d?.moodId,
      "calm",
    ),
    reducedMotion:
      (input?.reducedMotion ?? receipt?.studio3d?.reducedMotion) === true,
    thumbnailVariant: optionValue(
      thumbnailVariants,
      input?.thumbnailVariant,
      variant,
    ),
    thumbnailHeadline:
      typeof input?.thumbnailHeadline === "string"
        ? input.thumbnailHeadline
        : "",
  };
}

export function videoThumbnailInput(
  episode: Episode,
  options: StudioVideoOptions,
  title = episode.script?.title || episode.topic,
) {
  const locale = publishLocales[episode.language];
  const raw = options.thumbnailHeadline;
  const sanitizedTitle = redactThumbnailText(title);
  const containsKey = redactThumbnailText(raw) !== raw;
  const headline =
    (raw && !containsKey
      ? raw
      : deriveThumbnailHeadline(sanitizedTitle, locale)) ?? "";
  const validation = validateThumbnailHeadline(headline, locale);
  const error = containsKey
    ? "publish.review.thumbnailKey"
    : (!raw && !headline) ||
        validation.error === thumbnailHeadlineErrors.cjkTooLong ||
        validation.error === thumbnailHeadlineErrors.latinTooLong
      ? "publish.thumbnail.needsShorterHeadline"
      : validation.error;
  const input = {
    title: sanitizedTitle,
    language: episode.language,
    locale,
    topicKeywords: [
      redactThumbnailText(episode.topic),
      redactThumbnailText(episode.script?.title ?? ""),
    ],
    variant: options.thumbnailVariant,
    paletteId: options.paletteId,
    headline,
  } satisfies ThumbnailOptions;
  return { input, error } as const;
}

const artifactPrefix = (episodeId: string) =>
  `studio-video:${JSON.stringify(episodeId)}:`;

export function videoArtifactKey(source: Source) {
  return `${artifactPrefix(source.episodeId)}${source.revision}:${source.sourceStamp}`;
}

function savedVideoSceneId(artifact: AgentArtifact) {
  return artifact.metadata?.studioVideo?.sceneId ?? defaultSceneId;
}

export function isCurrentVideo(
  artifact: AgentArtifact,
  source?: Source,
  sceneId?: string,
  studio3d?: Studio3dSettings,
) {
  const saved = artifact.metadata?.studioVideo?.studio3d ?? {
    ...defaultCamera,
    paletteId: "aurora",
  };
  return (
    !!source &&
    artifact.kind === "video" &&
    artifact.episodeId === source.episodeId &&
    artifact.revision === source.revision &&
    artifact.sourceStamp === source.sourceStamp &&
    artifact.id === videoArtifactKey(source) &&
    (sceneId === undefined || savedVideoSceneId(artifact) === sceneId) &&
    (sceneId !== studio3dSceneId ||
      studio3d === undefined ||
      (studio3d.paletteId === saved.paletteId &&
        studio3d.cameraPresetId === saved.cameraPresetId &&
        studio3d.intensity === saved.intensity))
  );
}

export function sameVideoOptions(
  left: StudioVideoOptions,
  right: StudioVideoOptions,
) {
  return (
    left.orientation === right.orientation &&
    left.paletteId === right.paletteId &&
    left.mood === right.mood &&
    left.reducedMotion === right.reducedMotion &&
    left.thumbnailVariant === right.thumbnailVariant &&
    left.thumbnailHeadline === right.thumbnailHeadline
  );
}

const stamps = new WeakMap<Blob, Promise<string>>();
function audioStamp(blob: Blob) {
  let stamp = stamps.get(blob);
  if (!stamp) {
    stamp = blob
      .arrayBuffer()
      .then((bytes) => crypto.subtle.digest("SHA-256", bytes))
      .then((hash) =>
        Array.from(new Uint8Array(hash), (byte) =>
          byte.toString(16).padStart(2, "0"),
        ).join(""),
      )
      .catch((error: unknown) => {
        stamps.delete(blob);
        throw error;
      });
    stamps.set(blob, stamp);
  }
  return stamp;
}

async function hasPreviousVideo(episodeId: string) {
  // A key-only lookup in the existing artifact store avoids loading old MP4s.
  const db = await openDB("knowledge-podcast-agent");
  try {
    const prefix = artifactPrefix(episodeId);
    return (
      (await db.getKey(
        "artifacts",
        IDBKeyRange.bound(prefix, prefix + "\uffff"),
      )) !== undefined
    );
  } finally {
    db.close();
  }
}

const turnPause = 0.23;

const preflightMessages = {
  invalid: "video.panel.planFailed",
  duration: "video.panel.limit",
  pcm: "video.panel.pcmLimit",
  encoded: "video.panel.encodedLimit",
  storage: "video.panel.storageLimit",
} as const satisfies Record<
  NonNullable<ReturnType<typeof estimateVideoExport>["constraint"]>,
  MessageKey
>;

async function readStorageEstimate() {
  try {
    return await navigator.storage?.estimate?.();
  } catch {
    return undefined;
  }
}

function estimateStudioExport(
  plan: TimelinePlan,
  audioDuration: number,
  orientation: StudioVideoOptions["orientation"],
  sceneId: string,
  storage?: StorageEstimate,
) {
  const scenes = (plan.chapterWindows ?? []).map(
    (chapter) => chapter.sceneId ?? sceneId,
  );
  if (scenes.length === 0) scenes.push(sceneId);
  return estimateVideoExport({
    audioDuration,
    videoDuration: plan.duration,
    fps: plan.fps,
    orientation,
    scene: scenes.includes(studio3dSceneId)
      ? scenes.every((id) => id === studio3dSceneId)
        ? "studio3d"
        : "mixed"
      : "waveform",
    sampleRate: studioWavSampleRate,
    channels: studioWavChannels,
    storage,
  });
}

export async function planStudioVideo(
  episode: Episode,
  audioDuration: number,
  options?: Pick<
    StudioVideoOptions,
    "orientation" | "paletteId" | "mood" | "reducedMotion"
  >,
  storyboard?: Storyboard,
) {
  const [{ buildTimeline }, { designTokens }] = await Promise.all([
    import("../video/timeline.ts"),
    import("../video/design/tokens.ts"),
  ]);
  const timelineOptions: TimelineOptions = {
    resolution: videoResolution(
      designTokens,
      options?.orientation ?? "landscape",
    ),
    paletteId: options?.paletteId === "light" ? undefined : options?.paletteId,
    mood: options?.mood,
    reducedMotion: options?.reducedMotion,
    storyboard,
  };
  const plan = buildTimeline(episode, timelineOptions);
  const turns = plan.scenes.filter((scene) => scene.kind === "turn");
  const last = turns.at(-1);
  if (!last) throw new Error("Missing timeline turns");
  const sourceEnd = last.audioStart + last.end - last.start;
  if (
    !plan.estimated &&
    Math.abs(sourceEnd - audioDuration) <= 1 / studioWavSampleRate
  )
    return plan;

  // Fit timing estimates to the complete WAV. Use the final audio's chapter
  // starts as anchors when they agree with the timeline's chapter breaks.
  const starts = turns.flatMap((turn, index) =>
    index === 0 || turns[index - 1].chapterId !== turn.chapterId ? [index] : [],
  );
  const anchors = (episode.finished?.chapters ?? []).map(({ start }) => start);
  const fits = (indices: number[], offsets: number[]) =>
    indices.length === offsets.length &&
    offsets[0] === 0 &&
    indices.every((first, index) => {
      const next = indices[index + 1] ?? turns.length;
      const end = offsets[index + 1] ?? audioDuration;
      const pauses = next - first - (next === turns.length ? 1 : 0);
      return end <= audioDuration && end - offsets[index] > pauses * turnPause;
    });
  const useAnchors = fits(starts, anchors);
  const indices = useAnchors ? starts : [0];
  const offsets = useAnchors ? anchors : [0];
  if (!fits(indices, offsets)) throw new Error("Invalid source audio timing");

  const clips: NonNullable<Episode["render"]>["clips"] = {};
  for (const [index, first] of indices.entries()) {
    const next = indices[index + 1] ?? turns.length;
    const end = offsets[index + 1] ?? audioDuration;
    const pauses = next - first - (next === turns.length ? 1 : 0);
    const group = turns.slice(first, next);
    const length = group.reduce((sum, turn) => sum + turn.end - turn.start, 0);
    const scale = (end - offsets[index] - pauses * turnPause) / length;
    for (const turn of group) {
      clips[turn.turnId] = {
        asset: "",
        duration: (turn.end - turn.start) * scale,
      };
    }
  }
  const fitted = buildTimeline(
    { ...episode, render: { revision: episode.revision, model: "", clips } },
    timelineOptions,
  );
  return {
    ...fitted,
    // A guessed turn boundary may land inside speech. Keep its following
    // 230 ms of source audio before starting the next scene or chapter card.
    scenes: fitted.scenes.map((scene, index) =>
      scene.kind === "turn" && fitted.scenes[index + 1]
        ? { ...scene, end: fitted.scenes[index + 1].start }
        : scene,
    ),
    estimated: true,
  };
}

export const reviewLimits = {
  title: 100,
  summary: 2000,
  tags: 500,
  chapter: 70,
};
const bytes = (text: string) => new TextEncoder().encode(text).length;
const cleanLine = (text: string) =>
  text
    .replace(/[<>\u202a-\u202e\u2066-\u2069]/gu, "")
    .replace(/[\s\p{Cc}]+/gu, " ")
    .trim();

export function renameVideoChapter(
  review: PublishReview,
  index: number,
  title: string,
) {
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= review.chapterTitles.length ||
    title === review.chapterTitles[index]
  )
    return review;
  return {
    ...review,
    status: "pending" as const,
    chapterTitles: review.chapterTitles.map((value, position) =>
      position === index ? title : value,
    ),
  };
}

export function validatePublishReview(
  review: PublishReview,
  chapters: Chapters,
) {
  const content = JSON.stringify(review);
  if (redact(content) !== content)
    return { error: "publish.review.keyInContent" } as const;
  const title = cleanLine(review.title);
  const summary = review.summary
    .split(/\r\n?|\n/u)
    .map(cleanLine)
    .join("\n")
    .trim();
  const tags = [
    ...new Set(
      review.tags
        .split(/[,\uFF0C]/u)
        .map(cleanLine)
        .filter(Boolean),
    ),
  ].join(", ");
  const chapterTitles = review.chapterTitles.map(cleanLine);
  if (!title || title.length > reviewLimits.title)
    return { error: "publish.review.invalidTitle" } as const;
  if (!summary || bytes(summary) > reviewLimits.summary)
    return { error: "publish.review.invalidSummary" } as const;
  if (bytes(tags) > reviewLimits.tags)
    return { error: "publish.review.invalidTags" } as const;
  if (
    !chapters.length ||
    chapters.length !== chapterTitles.length ||
    chapters[0].start !== 0 ||
    chapters.some(({ start, timestamp }, index) => {
      const whole = Math.floor(start);
      const expected = `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
      return (
        !Number.isFinite(start) ||
        start < 0 ||
        timestamp !== expected ||
        (index > 0 && whole <= Math.floor(chapters[index - 1].start)) ||
        !chapterTitles[index] ||
        chapterTitles[index].length > reviewLimits.chapter
      );
    })
  )
    return { error: "publish.review.invalidChapters" } as const;
  return { value: { ...review, title, summary, tags, chapterTitles } } as const;
}

type PublishBuilder =
  typeof import("../publish/package.ts").buildPublishPackage;

function defaultReview(
  episode: Episode,
  plan: TimelinePlan,
  buildPublishPackage: PublishBuilder,
): PublishReview {
  const { files } = buildPublishPackage({ episode, plan });
  const read = (name: MessageKey) => {
    const file = files.find((item) => item.name === t(name));
    return file && "text" in file ? file.text : "";
  };
  return {
    title: read("publish.files.title"),
    summary: read("publish.files.description").split("\n\n", 1)[0],
    tags: read("publish.files.tags"),
    chapterTitles: read("publish.files.chapters")
      .split("\n")
      .map((line) => line.slice(line.indexOf(" ") + 1)),
    status: "pending",
  };
}

function reviewAfterRender(
  episode: Episode,
  plan: TimelinePlan,
  buildPublishPackage: PublishBuilder,
  previous?: StudioVideo,
) {
  if (!previous) return defaultReview(episode, plan, buildPublishPackage);
  const sameChapters =
    plan.chapters.length === previous.timeline.chapters.length &&
    plan.chapters.every(({ title, start }, index) => {
      const before = previous.timeline.chapters[index];
      return before.title === title && before.start === start;
    });
  return {
    ...previous.review,
    status: "pending" as const,
    chapterTitles: sameChapters
      ? previous.review.chapterTitles
      : defaultReview(episode, plan, buildPublishPackage).chapterTitles,
  };
}

export async function buildReviewedPublishPackage(
  episode: Episode,
  artifact: VideoArtifact,
  thumbnailBlob: Blob,
) {
  const receipt = artifact.metadata.studioVideo;
  const { timeline, review, durationSeconds } = receipt;
  const checked = validatePublishReview(review, timeline.chapters);
  if (
    !checked.value ||
    review.status !== "approved" ||
    artifact.episodeId !== episode.id ||
    artifact.revision !== episode.revision
  )
    throw new Error("Publish approval required");
  const content = JSON.stringify(episode);
  if (redact(content) !== content)
    throw new Error("Current key in episode content");
  const { title, summary, tags, chapterTitles } = checked.value;
  const [{ buildPublishPackage }, defaultVariant, { designTokens }] =
    await Promise.all([
      import("../publish/package.ts"),
      defaultVideoThumbnailVariant(
        episode.language,
        episode.topic,
        episode.script?.title ?? "",
      ),
      import("../video/design/tokens.ts"),
    ]);
  const options = resolveVideoOptions(defaultVariant, receipt);
  const { input: thumbnail, error } = videoThumbnailInput(
    episode,
    {
      ...options,
      paletteId:
        receipt.storyboard?.chapters[0]?.paletteId ?? options.paletteId,
    },
    title,
  );
  if (error) throw new Error(t(error));
  const plan: TimelinePlan = {
    fps: 30,
    resolution: videoResolution(designTokens, options.orientation),
    scenes: [],
    duration: durationSeconds,
    estimated: timeline.estimated,
    chapters: timeline.chapters.map((chapter, index) => ({
      ...chapter,
      title: chapterTitles[index],
    })),
  };
  const result = buildPublishPackage({
    episode,
    plan,
    videoBlob: artifact.blob,
    captionTrack:
      artifact.metadata.captionTrack?.videoSha256 === receipt.sha256
        ? artifact.metadata.captionTrack
        : undefined,
    thumbnailBlob,
    thumbnail,
  });
  const translate = createTranslator(publishLocales[episode.language]);

  // The builder owns the chapter, source and disclosure sections and ZIP.
  // Replace only editable fields in the builder's text entries before zipping.
  for (const file of result.files) {
    if (!("text" in file)) continue;
    if (file.name === t("publish.files.title")) file.text = title;
    if (file.name === t("publish.files.tags")) file.text = tags;
    if (file.name === t("publish.files.checklist")) {
      const cover = t("publish.checklist.portraitCover");
      const orientation = t(
        options.orientation === "portrait"
          ? "publish.review.portraitOrientation"
          : "publish.review.landscapeOrientation",
      );
      file.text = file.text.replace(cover, () =>
        options.orientation === "portrait"
          ? `${orientation}\n${cover}`
          : orientation,
      );
    }
    if (file.name === t("publish.files.description")) {
      const [, chapters, sources, notice] = file.text.split("\n\n");
      const [heading, ...lines] = sources.split("\n");
      const omitted = translate("publish.description.omittedSources");
      const alreadyOmitted = lines.at(-1) === omitted;
      if (alreadyOmitted) lines.pop();
      const description = (trimmed: boolean) =>
        [
          summary,
          chapters,
          [heading, ...lines, ...(trimmed ? [omitted] : [])].join("\n"),
          notice,
        ].join("\n\n");
      let trimmed = alreadyOmitted;
      while (lines.length && bytes(description(trimmed)) > 5000) {
        lines.pop();
        trimmed = true;
      }
      file.text = description(trimmed);
    }
  }
  return result;
}

type RenderState =
  | { phase: "idle" | "done" | "cancelling" | "cancelled" }
  | { phase: "rendering"; frames: number; total: number }
  | { phase: "failed"; message: MessageKey };

export function useVideoRender(
  episode: Episode,
  audio: AudioCheck,
  storyboard?: Storyboard,
) {
  const [support, setSupport] = useState<boolean>();
  const [options, setOptions] = useState(() =>
    resolveVideoOptions("host-pair"),
  );
  const [sceneId, setSceneId] = useState<string>(defaultSceneId);
  const [camera, setCamera] =
    useState<Pick<Studio3dSettings, "cameraPresetId" | "intensity">>(
      defaultCamera,
    );
  const studio3d: Studio3dSettings = {
    ...camera,
    paletteId: options.paletteId === "light" ? "aurora" : options.paletteId,
  };
  const [stored, setStored] = useState<{
    revision: number;
    asset?: string;
    blob?: Blob;
    source?: Source;
    artifact?: VideoArtifact;
    stale?: boolean;
    failed?: boolean;
    defaultVariant?: ThumbnailVariant;
    scenes?: ReturnType<
      typeof import("../video/scenes/registry.ts").listScenes
    >;
    cameraLabels?: typeof import("../video/scenes/studio3d/presets.ts").cameraLabels;
    tokens?: DesignTokens;
  }>();
  const [state, setState] = useState<RenderState>({ phase: "idle" });
  const [reviewEdit, setReviewEdit] = useState<{
    review: PublishReview;
    saving: boolean;
  }>();
  const activeRender = useRef<AbortController>(null);
  const activeSave = useRef<AbortController>(null);
  const storageRequest = useRef(0);
  const { id, revision, finished } = episode;
  const asset = finished?.asset;
  const blob = audio?.blob;
  const duration = audio?.duration;
  const loadingAudio = audio === undefined;
  const { orientation, paletteId, mood, reducedMotion } = options;
  const planInput = useMemo(
    () => ({
      episode,
      duration,
      storyboard,
      options: { orientation, paletteId, mood, reducedMotion },
    }),
    [episode, duration, storyboard, orientation, paletteId, mood, reducedMotion],
  );
  const [planned, setPlanned] = useState<{
    input: typeof planInput;
    plan?: TimelinePlan;
  }>();
  const [storage, setStorage] = useState<StorageEstimate>();
  const refreshStorage = useCallback(async () => {
    const latest = ++storageRequest.current;
    const estimate = await readStorageEstimate();
    if (latest === storageRequest.current) setStorage(estimate);
    return estimate;
  }, []);
  const plan = planned?.input === planInput ? planned.plan : undefined;
  const preflight =
    plan && duration
      ? estimateStudioExport(plan, duration, orientation, sceneId, storage)
      : undefined;
  const snapshot =
    stored?.revision === revision &&
    stored.asset === asset &&
    stored.blob === blob
      ? stored
      : undefined;
  const savedArtifact = snapshot?.artifact;
  const sceneStale =
    !!savedArtifact &&
    !isCurrentVideo(savedArtifact, snapshot?.source, sceneId, studio3d);
  const optionsStale =
    !!savedArtifact &&
    !sameVideoOptions(
      options,
      resolveVideoOptions(
        snapshot.defaultVariant ?? "host-pair",
        savedArtifact.metadata.studioVideo,
      ),
    );
  const storyboardStale =
    !!savedArtifact &&
    !sameStoryboard(storyboard, savedArtifact.metadata.studioVideo.storyboard);
  const artifact =
    sceneStale || optionsStale || storyboardStale ? undefined : savedArtifact;
  const keyInHeadline =
    redactThumbnailText(options.thumbnailHeadline) !==
    options.thumbnailHeadline;
  const { language, topic } = episode;
  const scriptTitle = episode.script?.title ?? "";

  useEffect(() => {
    const { episode, duration, options, storyboard } = planInput;
    if (!duration) return;
    let current = true;
    void planStudioVideo(episode, duration, options, storyboard).then(
      (plan) => current && setPlanned({ input: planInput, plan }),
      () => current && setPlanned({ input: planInput }),
    );
    return () => {
      current = false;
    };
  }, [planInput]);

  useEffect(() => {
    if (!blob) return;
    void refreshStorage();
    window.addEventListener("focus", refreshStorage);
    return () => {
      storageRequest.current++;
      window.removeEventListener("focus", refreshStorage);
    };
  }, [blob, savedArtifact?.blob, refreshStorage]);

  useEffect(() => {
    const leave = () => activeRender.current?.abort();
    window.addEventListener("pagehide", leave);
    return () => window.removeEventListener("pagehide", leave);
  }, []);

  useEffect(() => {
    let current = true;
    void probeVideoSupport(globalThis).then(({ videoFrame, codecs }) => {
      if (current)
        setSupport(
          videoFrame &&
            (codecs.avc1 || codecs.vp09) &&
            (codecs.mp4a || codecs.opus) &&
            typeof globalThis.AudioData === "function" &&
            typeof globalThis.OfflineAudioContext === "function" &&
            !!globalThis.crypto?.subtle,
        );
    });
    return () => {
      current = false;
    };
  }, []);

  useEffect(() => {
    const load = new AbortController();
    const input = { revision, asset, blob };
    setState({ phase: "idle" });
    setReviewEdit(undefined);
    if (!loadingAudio)
      void (async () => {
        try {
          const [registry, presets, defaultVariant, { designTokens }] =
            await Promise.all([
              import("../video/scenes/registry.ts"),
              import("../video/scenes/studio3d/presets.ts"),
              defaultVideoThumbnailVariant(language, topic, scriptTitle),
              import("../video/design/tokens.ts"),
            ]);
          const panel = {
            ...input,
            defaultVariant,
            scenes: registry.listScenes(),
            cameraLabels: presets.cameraLabels,
            tokens: designTokens,
          };
          const source =
            blob && asset && globalThis.crypto?.subtle
              ? {
                  episodeId: id,
                  revision,
                  sourceStamp: `${asset}:${await audioStamp(blob)}`,
                }
              : undefined;
          // Initialize the existing store even when only a stale key can match.
          const saved = await browserAgentArtifacts.get(
            source ? videoArtifactKey(source) : "",
          );
          load.signal.throwIfAborted();
          if (saved?.metadata?.studioVideo && isCurrentVideo(saved, source)) {
            const receipt = saved.metadata.studioVideo;
            setStored({ ...panel, source, artifact: saved as VideoArtifact });
            setOptions(resolveVideoOptions(defaultVariant, receipt));
            setSceneId(registry.getScene(savedVideoSceneId(saved)).id);
            const { cameraPresetId, intensity } =
              presets.resolveStudio3dOptions(receipt.studio3d).settings;
            setCamera({ cameraPresetId, intensity });
          } else {
            const stale = await hasPreviousVideo(id);
            if (!load.signal.aborted) {
              setStored({ ...panel, source, stale });
              setOptions(resolveVideoOptions(defaultVariant));
              setSceneId(defaultSceneId);
              setCamera(defaultCamera);
            }
          }
        } catch {
          if (!load.signal.aborted) setStored({ ...input, failed: true });
        }
      })();
    return () => {
      load.abort();
      activeRender.current?.abort();
      activeRender.current = null;
      activeSave.current?.abort();
      activeSave.current = null;
    };
  }, [id, revision, asset, blob, loadingAudio, language, topic, scriptTitle]);

  function selectScene(nextSceneId: string) {
    if (nextSceneId === studio3dSceneId && options.paletteId === "light")
      setOptions({ ...options, paletteId: "aurora" });
    setSceneId(nextSceneId);
  }

  async function start() {
    const source = snapshot?.source;
    if (
      !source ||
      !blob ||
      !duration ||
      !plan ||
      !preflight?.allowed ||
      !support ||
      keyInHeadline ||
      activeRender.current ||
      activeSave.current ||
      reviewEdit
    )
      return;
    const controller = new AbortController();
    activeRender.current = controller;
    const { signal } = controller;
    let failure: MessageKey = "video.panel.failed";
    setState({ phase: "rendering", frames: 0, total: 0 });
    try {
      const content = JSON.stringify(episode);
      if (redact(content) !== content) {
        setState({ phase: "failed", message: "video.panel.keyInContent" });
        return;
      }
      const estimate = await refreshStorage();
      signal.throwIfAborted();
      const { constraint } = estimateStudioExport(
        plan,
        duration,
        orientation,
        sceneId,
        estimate,
      );
      if (constraint) {
        setState({ phase: "idle" });
        return;
      }
      const [{ renderEpisodeVideo }, { buildPublishPackage }, { WebglContextLostError }] =
        await Promise.all([
          import("../video/render-client.ts"),
          import("../publish/package.ts"),
          import("../video/scenes/types.ts"),
        ]);
      signal.throwIfAborted();
      let total = Math.ceil(plan.duration * plan.fps);
      // Keep the count on the same microsecond clock as renderVideo.
      if (
        total > 1 &&
        Math.round(((total - 1) / plan.fps) * 1e6) >=
          Math.round(plan.duration * 1e6)
      )
        total--;
      setState({ phase: "rendering", frames: 0, total });
      const decoder = new OfflineAudioContext(1, 1, studioWavSampleRate);
      const buffer = await blob.arrayBuffer();
      signal.throwIfAborted();
      // decodeAudioData consumes the ArrayBuffer. Only worker dispatch copies
      // the decoded channel arrays.
      const pcm = await decoder.decodeAudioData(buffer);
      signal.throwIfAborted();
      if (
        pcm.length * pcm.numberOfChannels * Float32Array.BYTES_PER_ELEMENT >
        maxVideoPcmBytes
      ) {
        setState({ phase: "failed", message: "video.panel.pcmLimit" });
        return;
      }
      const theme = options.paletteId === "light" ? "light" : "dark";
      const {
        blob: mp4,
        captionTrack,
        ...receipt
      } = await renderEpisodeVideo({
        locale: resolveLocale(),
        plan: { ...plan, allowVp9: true },
        audio: pcm,
        theme,
        sceneId,
        studio3d,
        signal,
        onProgress(fraction) {
          // The renderer reserves the last fraction for muxing and hashing.
          const frames = Math.min(total, Math.round(fraction * (total + 1)));
          setState((previous) =>
            previous.phase === "rendering" && previous.frames !== frames
              ? { phase: "rendering", frames, total }
              : previous,
          );
        },
      }).catch((error: unknown) => {
        if (error instanceof WebglContextLostError)
          failure = "video.render.webglContextLost";
        throw error;
      });
      signal.throwIfAborted();
      const next: VideoArtifact = {
        ...source,
        id: videoArtifactKey(source),
        kind: "video",
        blob: mp4,
        metadata: {
          ...(captionTrack ? { captionTrack } : {}),
          studioVideo: {
            ...receipt,
            theme,
            options,
            timeline: { chapters: plan.chapters, estimated: plan.estimated },
            review: reviewAfterRender(
              episode,
              plan,
              buildPublishPackage,
              savedArtifact?.metadata.studioVideo,
            ),
          },
        },
      };
      if (
        redactThumbnailText(options.thumbnailHeadline) !==
        options.thumbnailHeadline
      ) {
        setState({ phase: "failed", message: "publish.review.thumbnailKey" });
        return;
      }
      failure = "video.panel.saveFailed";
      await browserAgentArtifacts.put(next, signal);
      signal.throwIfAborted();
      if (receipt.sceneId !== sceneId) setSceneId(receipt.sceneId);
      setStored({ ...snapshot, revision, asset, blob, source, artifact: next });
      setState({ phase: "done" });
    } catch {
      if (!signal.aborted)
        setState({
          phase: "failed",
          message: failure,
        });
      else if (activeRender.current === controller)
        setState({ phase: "cancelled" });
    } finally {
      if (activeRender.current === controller) activeRender.current = null;
    }
  }

  function cancel() {
    if (!activeRender.current) return;
    activeRender.current.abort();
    setState({ phase: "cancelling" });
  }

  async function saveReview(review: PublishReview) {
    if (!artifact || activeRender.current) return;
    activeSave.current?.abort();
    if (
      validatePublishReview(
        review,
        artifact.metadata.studioVideo.timeline.chapters,
      ).error === "publish.review.keyInContent"
    ) {
      activeSave.current = null;
      setReviewEdit({ review, saving: false });
      return;
    }
    const controller = new AbortController();
    activeSave.current = controller;
    const next = {
      ...artifact,
      metadata: {
        ...artifact.metadata,
        studioVideo: { ...artifact.metadata.studioVideo, review },
      },
    };
    setReviewEdit({ review, saving: true });
    try {
      await browserAgentArtifacts.put(next, controller.signal);
      if (!controller.signal.aborted) {
        setStored({ ...snapshot, revision, asset, blob, artifact: next });
        setReviewEdit(undefined);
      }
    } catch {
      if (!controller.signal.aborted) setReviewEdit({ review, saving: false });
    } finally {
      if (activeSave.current === controller) activeSave.current = null;
    }
  }

  return {
    support,
    estimate: preflight?.estimate,
    preflightReason: preflight?.constraint
      ? preflightMessages[preflight.constraint]
      : duration && planned?.input === planInput && !plan
        ? "video.panel.planFailed" as const
        : undefined,
    planning: !!duration && planned?.input !== planInput,
    options,
    setOptions,
    keyInHeadline,
    sceneId,
    setSceneId: selectScene,
    scenes: snapshot?.scenes ?? [],
    cameraLabels: snapshot?.cameraLabels,
    tokens: snapshot?.tokens,
    hasTopicGraphic: snapshot?.defaultVariant === "topic-graphic",
    camera,
    setCamera,
    sceneStale,
    optionsStale,
    storyboardStale,
    artifact,
    state,
    start,
    cancel,
    saveReview,
    reviewEdit,
    loading: !snapshot,
    loadFailed: snapshot?.failed,
    stale: snapshot?.stale,
    available: !!snapshot?.source,
  };
}
