import type { Episode, Host } from "../../shared/factory.ts";

type Resolution = { width: 1920; height: 1080 } | { width: 1080; height: 1920 };

export type TimelineOptions = { fps?: number; resolution?: Resolution };

type Interval = { start: number; end: number };
type CaptionCue = Interval & { lines: string[] };
type Scene = Interval &
  (
    | { kind: "intro"; title: string }
    | { kind: "chapter"; chapterId: string; title: string }
    | {
        kind: "turn";
        chapterId: string;
        turnId: string;
        speakerId: Host;
        audioStart: number;
        captions: CaptionCue[];
      }
  );

export type TimelinePlan = {
  duration: number;
  fps: number;
  resolution: Resolution;
  estimated: boolean;
  scenes: Scene[];
  chapters: { title: string; start: number; timestamp: string }[];
};

const introDuration = 2;
const chapterCardDuration = 1.5;
// Match the pause in the worker's assembled episode WAV.
const turnPause = 0.23;
const wide =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\u3000-\u303f\uff01-\uff60]/u;
const seconds = (value: number) => Number(value.toFixed(6));

// Preview estimates count non-whitespace code points: 4 CJK or 15 other
// characters per second, with a minimum of 750 ms for any untimed turn.
function estimateDuration(text: string) {
  let duration = 0;
  for (const character of text.replace(/\s/gu, "")) {
    duration += wide.test(character) ? 1 / 4 : 1 / 15;
  }
  return Math.max(0.75, duration);
}

function wrapCaption(text: string, limit: number) {
  const characters = Array.from(text.trim().replace(/\s+/gu, " "));
  const lines: string[] = [];
  let start = 0;
  while (start < characters.length) {
    let end = start;
    let width = 0;
    let breakAt = start;
    while (end < characters.length) {
      const character = characters[end];
      const isWide = wide.test(character);
      if (
        character === " " ||
        isWide ||
        (end > start && wide.test(characters[end - 1]))
      ) {
        breakAt = end;
      }
      width += isWide ? 2 : 1;
      if (width > limit) break;
      end++;
    }
    if (end < characters.length && breakAt > start) end = breakAt;
    lines.push(characters.slice(start, end).join("").trimEnd());
    start = characters[end] === " " ? end + 1 : end;
  }
  return lines;
}

function captionCues(text: string, limit: number, start: number, end: number) {
  const lines = wrapCaption(text, limit);
  const weights = lines.map(
    (line) => Array.from(line.replace(/ /g, "")).length,
  );
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const cues: CaptionCue[] = [];
  let consumed = 0;
  let cueStart = start;
  for (let index = 0; index < lines.length; index += 2) {
    consumed += weights[index] + (weights[index + 1] ?? 0);
    const cueEnd = seconds(start + ((end - start) * consumed) / total);
    cues.push({
      start: cueStart,
      end: cueEnd,
      lines: lines.slice(index, index + 2),
    });
    cueStart = cueEnd;
  }
  return cues;
}

function chapterTimestamp(start: number) {
  const whole = Math.floor(start);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/**
 * Plan half-open video intervals in script order. Cards add silent time;
 * audioStart remains relative to the assembly before cards were added.
 * Uncovered inter-turn pauses retain the previous visual. Only current-revision
 * clip durations can establish individual turn boundaries in the audio.
 */
export function buildTimeline(
  episode: Episode,
  options: TimelineOptions = {},
): TimelinePlan {
  const fps = options.fps ?? 30;
  const { width, height } = options.resolution ?? { width: 1920, height: 1080 };
  if (!Number.isFinite(fps) || fps <= 0)
    throw new RangeError("视频帧率必须为正数。");
  const portrait = width === 1080 && height === 1920;
  if (!portrait && (width !== 1920 || height !== 1080)) {
    throw new RangeError("视频分辨率必须为 1920×1080 或 1080×1920。");
  }

  const chaptersById = new Map(
    episode.outline?.chapters.map((chapter) => [chapter.id, chapter]),
  );
  const clips =
    episode.render?.revision === episode.revision
      ? episode.render.clips
      : undefined;
  const scenes: Scene[] = [
    {
      kind: "intro",
      title: episode.script?.title ?? episode.topic,
      start: 0,
      end: introDuration,
    },
  ];
  const chapters: TimelinePlan["chapters"] = [];
  let currentChapter: string | undefined;
  let audioPosition = 0;
  let position = introDuration;
  let estimated = false;
  for (const [index, turn] of (episode.script?.turns ?? []).entries()) {
    if (index > 0) {
      position += turnPause;
      audioPosition += turnPause;
    }
    if (turn.chapterId !== currentChapter) {
      const chapter = chaptersById.get(turn.chapterId);
      if (!chapter) throw new Error("节目脚本引用了不存在的章节。");
      const start = chapters.length === 0 ? 0 : seconds(position);
      chapters.push({
        title: chapter.title,
        start,
        timestamp: chapterTimestamp(start),
      });
      scenes.push({
        kind: "chapter",
        chapterId: chapter.id,
        title: chapter.title,
        start: seconds(position),
        end: seconds(position + chapterCardDuration),
      });
      position += chapterCardDuration;
      currentChapter = chapter.id;
    }

    const duration = clips?.[turn.id]?.duration;
    const measured =
      duration !== undefined && Number.isFinite(duration) && duration > 0;
    const turnDuration = measured ? duration : estimateDuration(turn.text);
    estimated ||= !measured;
    const start = seconds(position);
    position += turnDuration;
    const end = seconds(position);
    scenes.push({
      kind: "turn",
      chapterId: turn.chapterId,
      turnId: turn.id,
      speakerId: turn.host,
      start,
      end,
      audioStart: seconds(audioPosition),
      captions: captionCues(turn.text, portrait ? 24 : 42, start, end),
    });
    audioPosition += turnDuration;
  }

  return {
    duration: seconds(position),
    fps,
    resolution: portrait
      ? { width: 1080, height: 1920 }
      : { width: 1920, height: 1080 },
    estimated,
    scenes,
    chapters,
  };
}
