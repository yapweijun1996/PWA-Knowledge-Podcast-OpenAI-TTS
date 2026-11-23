import type { Episode, Host } from "../../shared/factory.ts";
import { t } from "../i18n/index.ts";
import {
  displayTextCounts,
  displayWordCount,
  joinCaptionLines,
  normalizeDisplayText,
  paginateText,
  type TextPage,
} from "../text/wrap.ts";
import { videoLayout } from "./design/layout.ts";
import type { PaletteId } from "./design/palettes.ts";
import { designTokens, type Orientation } from "./design/tokens.ts";

type Resolution = { width: 1920; height: 1080 } | { width: 1080; height: 1920 };
export type VideoMood = "calm" | "curious" | "urgent" | "warm" | "serious";
type Transition = "cut" | "fade";
type CalloutRequest = { chapterId: string; start: number; text: string };

export type TimelineOptions = {
  fps?: number;
  resolution?: Resolution;
  chapterSceneIds?: Readonly<Record<string, string>>;
  callouts?: readonly CalloutRequest[];
  hostNames?: Readonly<Partial<Record<Host, string>>>;
  showName?: string;
  endCard?: boolean;
  paletteId?: PaletteId;
  mood?: VideoMood;
  transition?: Transition;
};

type Interval = { start: number; end: number };
export type CaptionCue = Interval & {
  lines: string[];
  text?: string;
  needsReview?: boolean;
};
type Scene = Interval &
  (
    | { kind: "intro" | "end"; title: string }
    | { kind: "chapter"; chapterId: string; title: string; sceneId?: string }
    | {
        kind: "turn";
        chapterId: string;
        turnId: string;
        speakerId: Host;
        audioStart: number;
        captions: CaptionCue[];
        captionSource?: string;
        captionHoldUntil?: number;
      }
  );

export type VideoTurn = Extract<Scene, { kind: "turn" }>;
export type ChapterWindow = Interval & { chapterId: string; sceneId?: string };

export type TimelinePlan = {
  duration: number;
  fps: number;
  resolution: Resolution;
  estimated: boolean;
  scenes: Scene[];
  chapters: { title: string; start: number; timestamp: string }[];
  chapterWindows?: ChapterWindow[];
  callouts?: (Interval & { text: string })[];
  hostNames?: Partial<Record<Host, string>>;
  showName?: string;
  locale?: string;
  paletteId?: PaletteId;
  mood?: VideoMood;
  transition?: Transition;
};

const { motion } = designTokens.common;
// Match the pause in the worker's assembled episode WAV.
const turnPause = 0.23;
const seconds = (value: number) => Number(value.toFixed(6));
// Compare against the same microsecond clock used by the encoders.
const nextFrame = (time: number, fps: number) =>
  Math.ceil((seconds(time) - 0.5e-6) * fps) / fps;
export const beforeEnd = (time: number, end: number) => time + 0.5e-6 < end;

export function planOrientation({
  resolution,
}: Pick<TimelinePlan, "resolution">): Orientation {
  return resolution.height > resolution.width ? "portrait" : "landscape";
}

function estimateDuration(text: string) {
  const { cjk, latin } = displayTextCounts(text.replace(/\s/gu, ""));
  return Math.max(0.75, cjk / 4 + latin / 15);
}

type CaptionMeasurer = Parameters<typeof paginateText>[0];

/** Allocate estimated cue times on the frame grid while preserving the voiced audio clock. */
export function layoutCaptionCues(
  turn: VideoTurn,
  plan: Pick<TimelinePlan, "fps" | "locale" | "hostNames">,
  geometry: ReturnType<typeof videoLayout>,
  context?: CaptionMeasurer,
): CaptionCue[] {
  const locale = plan.locale ?? "en";
  const width = geometry.caption.width - 2 * geometry.captionPad.x;
  const nominal = {
    measureText(line: string) {
      const { cjk, latin } = displayTextCounts(line, locale);
      return { width: geometry.type.caption * (cjk + latin * 0.59) };
    },
  };
  const paginate = (text: string) =>
    paginateText(context ?? nominal, text, width, {
      limits: geometry.text.caption,
      locale,
      keepTogether: Object.values(plan.hostNames ?? {}),
    });
  const fps = plan.fps ?? 30;
  if (turn.captionSource === undefined) {
    if (!context) return turn.captions;
    return turn.captions.flatMap((cue) => {
      const pages = paginate(cue.text ?? joinCaptionLines(cue.lines));
      if (pages.length === 1) return [{ ...cue, lines: pages[0].lines }];
      return timeCaptionPages(pages, cue, fps, locale);
    });
  }
  return timeCaptionPages(
    paginate(turn.captionSource),
    turn,
    fps,
    locale,
    turn.captionHoldUntil,
  );
}

function timeCaptionPages(
  pages: readonly TextPage[],
  interval: Interval,
  fps: number,
  locale: string,
  maxHold = interval.end,
): CaptionCue[] {
  if (!pages.length) return [];
  const rates = pages.map(({ text }) => {
    const { cjk, latin } = displayTextCounts(text, locale);
    const words = displayWordCount(text, locale);
    return {
      hard: cjk / 9 + Math.max(latin / 20, words / 3),
      target: cjk / 7 + Math.max(latin / 17, (words * 60) / 160),
    };
  });
  const start = Math.min(interval.end, nextFrame(interval.start, fps));
  const minimum = motion.captionMinMs / 1000;
  const required = rates.reduce(
    (sum, { hard }) => sum + Math.max(hard, minimum),
    0,
  );
  const end = seconds(
    Math.min(maxHold, Math.max(interval.end, start + required)),
  );
  const available = Math.max(0, end - start);
  const maxCue = motion.captionMaxMs / 1000;
  const weights = rates.map(({ target }) =>
    Math.min(
      motion.captionTargetMs[1] / 1000,
      Math.max(motion.captionTargetMs[0] / 1000, target),
    ),
  );
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
  // Satisfy the hard reading-rate budgets first when the turn has enough time.
  const bases =
    required <= available
      ? rates.map(({ hard }) => Math.max(hard, minimum))
      : rates.map(() => 0);
  const remaining = available - bases.reduce((sum, base) => sum + base, 0);
  let cursor = start;
  return pages.map(({ text, lines }, index) => {
    const framesLeft = pages.length - index - 1;
    const share = bases[index] + (remaining * weights[index]) / weightTotal;
    const nearest = Math.round((cursor + share) * fps) / fps;
    const latest = end - framesLeft / fps;
    const cut =
      framesLeft === 0
        ? end
        : seconds(
            latest < cursor + 1 / fps
              ? Math.min(end, Math.max(cursor, nearest))
              : Math.min(latest, Math.max(cursor + 1 / fps, nearest)),
          );
    const duration = cut - cursor;
    const review =
      duration + 1e-6 < Math.max(minimum, rates[index].hard) ||
      duration > maxCue;
    const cue = {
      start: seconds(cursor),
      end: cut,
      text,
      lines,
      ...(review ? { needsReview: true } : {}),
    };
    cursor = cut;
    return cue;
  });
}

function chapterTimestamp(start: number) {
  const whole = Math.floor(start);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

function scheduleCallouts(
  requests: readonly CalloutRequest[],
  windows: readonly ChapterWindow[],
  scenes: readonly Scene[],
  geometry: ReturnType<typeof videoLayout>,
  fps: number,
  locale: string,
): NonNullable<TimelinePlan["callouts"]> {
  const result: NonNullable<TimelinePlan["callouts"]> = [];
  let previous = -Infinity;
  for (const chapter of windows) {
    const card = scenes.find(
      (scene) => scene.kind === "chapter" && scene.start === chapter.start,
    );
    const earliest = nextFrame(
      card ? card.end + motion.calloutClearOfCardMs / 1000 : chapter.start,
      fps,
    );
    const boundaries = scenes.flatMap((scene) => {
      if (
        scene.kind !== "turn" ||
        scene.start < chapter.start ||
        scene.start >= chapter.end
      )
        return [];
      const clauses =
        scene.captionSource?.match(
          /[^。！？；;，,!?]+[。！？；;，,!?]*|[。！？；;，,!?]+/gu,
        ) ?? [];
      const total = clauses.reduce((sum, clause) => sum + clause.length, 0);
      let consumed = 0;
      return [
        nextFrame(scene.start, fps),
        ...clauses.slice(0, -1).map((clause) => {
          consumed += clause.length;
          return nextFrame(
            scene.start + ((scene.end - scene.start) * consumed) / total,
            fps,
          );
        }),
      ];
    });
    let count = 0;
    for (const request of requests
      .filter((item) => item.chapterId === chapter.chapterId)
      .sort((a, b) => a.start - b.start)) {
      if (count === 3) break;
      const text = normalizeDisplayText(request.text);
      const { cjk, latin } = displayTextCounts(text, locale);
      if (
        !Number.isFinite(request.start) ||
        !text ||
        (cjk ? cjk + latin / 2 > 20 : latin > 46)
      )
        continue;
      const threshold = Math.max(
        earliest,
        request.start,
        previous + motion.calloutStartGapMs / 1000,
      );
      const start = boundaries.find((boundary) => boundary >= threshold - 1e-6);
      if (start === undefined) continue;
      const end = seconds(nextFrame(start + motion.calloutMs / 1000, fps));
      // The next chapter takes the rail immediately, even in an episode with pauses.
      if (end > chapter.end) continue;
      const width =
        geometry.callout.width -
        3 * geometry.calloutPad.x -
        geometry.stroke.calloutRule;
      if (
        paginateText(
          {
            measureText(line) {
              const counts = displayTextCounts(line, locale);
              return {
                width:
                  geometry.type.callout * (counts.cjk + counts.latin * 0.59),
              };
            },
          },
          text,
          width,
          { locale, limits: geometry.text.callout },
        ).length !== 1
      )
        continue;
      result.push({ text, start: seconds(start), end });
      previous = start;
      count++;
    }
  }
  return result;
}

/** Plan half-open voiced intervals on the source clock and independent card overlays. */
export function buildTimeline(
  episode: Episode,
  options: TimelineOptions = {},
): TimelinePlan {
  const fps = options.fps ?? 30;
  const resolution = options.resolution ?? { width: 1920, height: 1080 };
  const { width, height } = resolution;
  if (!Number.isFinite(fps) || fps <= 0)
    throw new RangeError(t("video.timeline.invalidFrameRate"));
  const orientation = planOrientation({ resolution });
  const [nativeWidth, nativeHeight] = designTokens[orientation].frame;
  if (width !== nativeWidth || height !== nativeHeight)
    throw new RangeError(t("video.timeline.invalidResolution"));
  const geometry = videoLayout(width, height, orientation);
  const locale =
    episode.language === "zh" || episode.language === "sg"
      ? "zh-CN"
      : (episode.language ?? "en");
  const plan: TimelinePlan = {
    duration: 0,
    fps,
    resolution: { ...resolution },
    estimated: false,
    scenes: [],
    chapters: [],
    chapterWindows: [],
    locale,
    ...(options.showName === undefined ? {} : { showName: options.showName }),
    ...(options.paletteId === undefined
      ? {}
      : { paletteId: options.paletteId }),
    ...(options.mood === undefined ? {} : { mood: options.mood }),
    ...(options.transition === undefined
      ? {}
      : { transition: options.transition }),
  };
  if (options.hostNames) {
    const { A, B, C } = options.hostNames;
    plan.hostNames = {
      ...(A === undefined ? {} : { A }),
      ...(B === undefined ? {} : { B }),
      ...(C === undefined ? {} : { C }),
    };
  }
  const windows = plan.chapterWindows!;
  const chaptersById = new Map(
    episode.outline?.chapters.map((chapter) => [chapter.id, chapter]),
  );
  const clips =
    episode.render?.revision === episode.revision
      ? episode.render.clips
      : undefined;
  const turns = episode.script?.turns ?? [];
  let position = 0;
  for (const [index, turn] of turns.entries()) {
    if (index > 0) position += turnPause;
    const start = seconds(position);
    if (turn.chapterId !== windows.at(-1)?.chapterId) {
      const chapter = chaptersById.get(turn.chapterId);
      if (!chapter) throw new Error(t("video.timeline.missingChapter"));
      const previous = windows.at(-1);
      if (previous) previous.end = start;
      const overrides = options.chapterSceneIds;
      const sceneId =
        overrides && Object.hasOwn(overrides, chapter.id)
          ? overrides[chapter.id]
          : undefined;
      windows.push({
        chapterId: chapter.id,
        start,
        end: start,
        ...(sceneId === undefined ? {} : { sceneId }),
      });
      plan.chapters.push({
        title: chapter.title,
        start,
        timestamp: chapterTimestamp(start),
      });
      if (previous) {
        const cardStart = nextFrame(start, fps);
        const frames = Math.round(
          (motion.chapterMs[orientation === "landscape" ? 0 : 1] / 1000) * fps,
        );
        plan.scenes.push({
          kind: "chapter",
          chapterId: chapter.id,
          title: chapter.title,
          start,
          end: seconds(cardStart + Math.max(1, frames) / fps),
          ...(sceneId === undefined ? {} : { sceneId }),
        });
      }
    }
    const duration = clips?.[turn.id]?.duration;
    const measured =
      duration !== undefined && Number.isFinite(duration) && duration > 0;
    plan.estimated ||= !measured;
    position += measured ? duration : estimateDuration(turn.text);
    const end = seconds(position);
    const next = turns[index + 1];
    const hold =
      next?.host === turn.host && next.chapterId === turn.chapterId
        ? seconds(end + 0.2)
        : undefined;
    const scene: VideoTurn = {
      kind: "turn",
      chapterId: turn.chapterId,
      turnId: turn.id,
      speakerId: turn.host,
      start,
      end,
      audioStart: start,
      captionSource: normalizeDisplayText(turn.text),
      captions: [],
      ...(hold === undefined ? {} : { captionHoldUntil: hold }),
    };
    scene.captions = layoutCaptionCues(scene, plan, geometry);
    plan.scenes.push(scene);
  }
  const last = windows.at(-1);
  if (last) last.end = seconds(position);
  for (const scene of plan.scenes) {
    if (scene.kind !== "chapter") continue;
    const chapter = windows.find(({ start }) => start === scene.start)!;
    scene.end = Math.min(scene.end, chapter.end);
  }
  if (options.callouts?.length)
    plan.callouts = scheduleCallouts(
      options.callouts,
      windows,
      plan.scenes,
      geometry,
      fps,
      locale,
    );
  if (options.endCard || !turns.length) {
    const title = episode.script?.title ?? episode.topic;
    const start = seconds(position);
    const cardMs = motion.titleMs[orientation === "landscape" ? 0 : 1];
    position += cardMs / 1000;
    plan.scenes.push({
      kind: turns.length ? "end" : "intro",
      title,
      start,
      end: seconds(position),
    });
  }
  plan.duration = seconds(position);
  return plan;
}

export function latestStarted<T extends { start: number }>(
  items: readonly T[],
  time: number,
) {
  let low = 0;
  let high = items.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (!beforeEnd(time, items[mid].start)) low = mid + 1;
    else high = mid;
  }
  return items[low - 1] as T | undefined;
}
