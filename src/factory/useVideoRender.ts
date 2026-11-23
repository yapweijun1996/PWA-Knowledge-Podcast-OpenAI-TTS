import { useEffect, useRef, useState } from "react";
import { openDB } from "idb";
import type { Episode } from "../../shared/factory.ts";
import {
  browserAgentArtifacts,
  type AgentArtifact,
} from "../agent/artifacts.ts";
import { createTranslator, t, type MessageKey } from "../i18n/index.ts";
import { buildPublishPackage, publishLocales } from "../publish/package.ts";
import { probeVideoSupport } from "../video/capabilities.ts";
import { renderVideo } from "../video/render.ts";
import { defaultSceneId, getScene } from "../video/scenes/registry.ts";
import {
  defaultStudio3dSettings,
  resolveStudio3dOptions,
  studio3dSceneId,
  type Studio3dOptions,
  type Studio3dSettings,
} from "../video/scenes/studio3d/presets.ts";
import { WebglContextLostError } from "../video/scenes/types.ts";
import type { VideoTheme } from "../video/themes.ts";
import { buildTimeline, type TimelinePlan } from "../video/timeline.ts";
import { redact } from "./browser-key.ts";
import type { AudioCheck } from "./library-model.ts";

type StudioVideo = NonNullable<
  NonNullable<AgentArtifact["metadata"]>["studioVideo"]
>;
export type VideoArtifact = AgentArtifact & {
  metadata: { studioVideo: StudioVideo };
};
export type PublishReview = StudioVideo["review"];
type Chapters = TimelinePlan["chapters"];
type Source = Pick<AgentArtifact, "episodeId" | "revision" | "sourceStamp">;

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
  const saved =
    artifact.metadata?.studioVideo?.studio3d ?? defaultStudio3dSettings;
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

const sampleRate = 24_000;
const turnPause = 0.23;
// Match renderVideo's encoded budget and leave room for mux overhead at
// its configured 5 Mbps video and 64 kbps mono audio rates.
const maxEncodedBytes = 128 * 1024 ** 2;
const maxPcmBytes = 32 * 1024 ** 2;
const maxVideoBytesPerSecond = (5_000_000 + 64_000) / 8;
export const maxVideoSeconds = Math.floor(
  (maxEncodedBytes - 1024 ** 2) / maxVideoBytesPerSecond,
);

export function videoWithinLimits(duration: number, audioDuration: number) {
  return (
    Number.isFinite(duration) &&
    duration > 0 &&
    duration <= maxVideoSeconds &&
    Number.isFinite(audioDuration) &&
    audioDuration > 0 &&
    audioDuration <= maxVideoSeconds &&
    audioDuration * sampleRate * Float32Array.BYTES_PER_ELEMENT <= maxPcmBytes
  );
}

export function planStudioVideo(episode: Episode, audioDuration: number) {
  const plan = buildTimeline(episode);
  const turns = plan.scenes.filter((scene) => scene.kind === "turn");
  const last = turns.at(-1);
  if (!last) throw new Error("Missing timeline turns");
  const sourceEnd = last.audioStart + last.end - last.start;
  if (!plan.estimated && Math.abs(sourceEnd - audioDuration) <= 1 / sampleRate)
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
  const fitted = buildTimeline({
    ...episode,
    render: { revision: episode.revision, model: "", clips },
  });
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

function defaultReview(episode: Episode, plan: TimelinePlan): PublishReview {
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
  previous?: StudioVideo,
) {
  if (!previous) return defaultReview(episode, plan);
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
      : defaultReview(episode, plan).chapterTitles,
  };
}

export function buildReviewedPublishPackage(
  episode: Episode,
  artifact: VideoArtifact,
  thumbnailBlob: Blob,
) {
  const { timeline, review, durationSeconds } = artifact.metadata.studioVideo;
  const checked = validatePublishReview(review, timeline.chapters);
  if (!checked.value || review.status !== "approved")
    throw new Error("Publish approval required");
  const content = JSON.stringify(episode);
  if (redact(content) !== content)
    throw new Error("Current key in episode content");
  const { title, summary, tags, chapterTitles } = checked.value;
  const plan = {
    ...buildTimeline(episode),
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
    thumbnailBlob,
  });
  const translate = createTranslator(publishLocales[episode.language]);

  // The builder owns the chapter, source and disclosure sections and ZIP.
  // Replace only editable fields in the builder's text entries before zipping.
  for (const file of result.files) {
    if (!("text" in file)) continue;
    if (file.name === t("publish.files.title")) file.text = title;
    if (file.name === t("publish.files.tags")) file.text = tags;
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

export function useVideoRender(episode: Episode, audio: AudioCheck) {
  const [support, setSupport] = useState<boolean>();
  const [theme, setTheme] = useState<VideoTheme>("dark");
  const [sceneId, setSceneId] = useState<string>(defaultSceneId);
  const [studio3d, setStudio3dSettings] = useState(defaultStudio3dSettings);
  const [stored, setStored] = useState<{
    revision: number;
    asset?: string;
    blob?: Blob;
    source?: Source;
    artifact?: VideoArtifact;
    stale?: boolean;
    failed?: boolean;
  }>();
  const [state, setState] = useState<RenderState>({ phase: "idle" });
  const [reviewEdit, setReviewEdit] = useState<{
    review: PublishReview;
    saving: boolean;
  }>();
  const activeRender = useRef<AbortController>(null);
  const activeSave = useRef<AbortController>(null);
  const { id, revision, finished } = episode;
  const asset = finished?.asset;
  const blob = audio?.blob;
  const duration = audio?.duration;
  const loadingAudio = audio === undefined;
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
  const artifact = sceneStale ? undefined : savedArtifact;

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
            setStored({ ...input, source, artifact: saved as VideoArtifact });
            setTheme(saved.metadata.studioVideo.theme);
            setSceneId(getScene(savedVideoSceneId(saved)).id);
            setStudio3dSettings(
              resolveStudio3dOptions(saved.metadata.studioVideo.studio3d).settings,
            );
          } else {
            const stale = await hasPreviousVideo(id);
            if (!load.signal.aborted) setStored({ ...input, source, stale });
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
  }, [id, revision, asset, blob, loadingAudio]);

  function setStudio3d(options: Studio3dOptions) {
    setStudio3dSettings(resolveStudio3dOptions(options).settings);
  }

  async function start() {
    const source = snapshot?.source;
    if (
      !source ||
      !blob ||
      !duration ||
      !support ||
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
      const plan = { ...planStudioVideo(episode, duration), allowVp9: true };
      if (!videoWithinLimits(plan.duration, duration)) {
        setState({ phase: "failed", message: "video.panel.limit" });
        return;
      }
      let total = Math.ceil(plan.duration * plan.fps);
      // Keep the count on the same microsecond clock as renderVideo.
      if (
        total > 1 &&
        Math.round(((total - 1) / plan.fps) * 1e6) >=
          Math.round(plan.duration * 1e6)
      )
        total--;
      setState({ phase: "rendering", frames: 0, total });
      const decoder = new OfflineAudioContext(1, 1, sampleRate);
      const buffer = await blob.arrayBuffer();
      signal.throwIfAborted();
      // decodeAudioData consumes the ArrayBuffer. renderVideo reads its channel
      // views directly, avoiding a second PCM allocation.
      const pcm = await decoder.decodeAudioData(buffer);
      signal.throwIfAborted();
      if (
        pcm.length * pcm.numberOfChannels * Float32Array.BYTES_PER_ELEMENT >
        maxPcmBytes
      ) {
        setState({ phase: "failed", message: "video.panel.limit" });
        return;
      }
      const { blob: mp4, ...receipt } = await renderVideo({
        plan,
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
      });
      signal.throwIfAborted();
      const next: VideoArtifact = {
        ...source,
        id: videoArtifactKey(source),
        kind: "video",
        blob: mp4,
        metadata: {
          studioVideo: {
            ...receipt,
            theme,
            timeline: { chapters: plan.chapters, estimated: plan.estimated },
            review: reviewAfterRender(
              episode,
              plan,
              savedArtifact?.metadata.studioVideo,
            ),
          },
        },
      };
      failure = "video.panel.saveFailed";
      await browserAgentArtifacts.put(next, signal);
      signal.throwIfAborted();
      if (receipt.sceneId !== sceneId) setSceneId(receipt.sceneId);
      setStored({ revision, asset, blob, source, artifact: next });
      setState({ phase: "done" });
    } catch (error) {
      if (!signal.aborted)
        setState({
          phase: "failed",
          message:
            error instanceof WebglContextLostError
              ? "video.render.webglContextLost"
              : failure,
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
      metadata: { studioVideo: { ...artifact.metadata.studioVideo, review } },
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
    theme,
    setTheme,
    sceneId,
    setSceneId,
    studio3d,
    setStudio3d,
    sceneStale,
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
