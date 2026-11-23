import { designTokens } from "./design/tokens.ts";

const fps = 30;
const frameEpsilon = 1e-9;
const frameAtOrAfter = (seconds: number) =>
  Math.ceil(seconds * fps - frameEpsilon);
const frameAtOrBefore = (seconds: number) =>
  Math.floor(seconds * fps + frameEpsilon);
const nearestFrame = (seconds: number) => Math.round(seconds * fps);
const maxSilenceFrames = 6;
const { captionMinMs, captionMaxMs } = designTokens.common.motion;
const minFrames = frameAtOrAfter(captionMinMs / 1000);
const maxFrames = frameAtOrBefore(captionMaxMs / 1000);

export const captionRateTargets = {
  cjkPerSecond: 7,
  latinPerSecond: 17,
  wordsPerMinute: 160,
} as const;
export const captionRateCeilings = {
  cjkPerSecond: 9,
  latinPerSecond: 20,
  wordsPerMinute: 180,
} as const;

const cjk =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Bopomofo}\u3000-\u303f\uff01-\uff0f\uff1a-\uff20\uff3b-\uff40\uff5b-\uff60]/u;
const graphemes = new Intl.Segmenter("en", { granularity: "grapheme" });
const words = new Intl.Segmenter("en", { granularity: "word" });

function counts(text: string) {
  let cjkCount = 0;
  let latinCount = 0;
  let latinWordCount = 0;
  let latinRun = "";
  let pendingSpaces = "";
  let pendingSpaceCount = 0;

  function finishLatinRun() {
    for (const word of words.segment(latinRun)) {
      if (word.isWordLike) latinWordCount++;
    }
    latinRun = "";
  }

  for (const { segment } of graphemes.segment(text)) {
    if (/^\s+$/u.test(segment)) {
      if (latinRun) {
        pendingSpaces += segment;
        pendingSpaceCount++;
      }
      continue;
    }
    if (cjk.test(segment)) {
      cjkCount++;
      if (latinRun) finishLatinRun();
    } else {
      latinCount += 1 + pendingSpaceCount;
      latinRun += pendingSpaces + segment;
    }
    pendingSpaces = "";
    pendingSpaceCount = 0;
  }
  if (latinRun) finishLatinRun();
  return { cjkCount, latinCount, latinWordCount };
}

/** Cue rates for the supplied duration in seconds, defaulting to a one-second cue. */
export function readingRate(text: string, durationSeconds = 1) {
  const { cjkCount, latinCount, latinWordCount } = counts(text);
  const rate = (count: number) =>
    count === 0 ? 0 : count / Math.max(0, durationSeconds);
  return {
    cjkPerSecond: rate(cjkCount),
    latinPerSecond: rate(latinCount),
    wordsPerMinute: rate(latinWordCount * 60),
  };
}

function secondsAtRate(
  text: string,
  rate: typeof captionRateTargets | typeof captionRateCeilings,
) {
  const { cjkCount, latinCount, latinWordCount } = counts(text);
  return (
    cjkCount / rate.cjkPerSecond +
    Math.max(
      latinCount / rate.latinPerSecond,
      (60 * latinWordCount) / rate.wordsPerMinute,
    )
  );
}

/** Reading time at the hard ceilings, independent of the one-second display minimum. */
export const requiredSeconds = (text: string) =>
  secondsAtRate(text, captionRateCeilings);
export const targetSeconds = (text: string) =>
  secondsAtRate(text, captionRateTargets);
export const snapCaptionTime = (seconds: number) => nearestFrame(seconds) / fps;

export type TimedCaption = { text: string; start: number; end: number };
/** One speaker's speech bounds and confirmed adjacent silence, all in seconds. */
export type CaptionWindow = {
  start: number;
  end: number;
  silenceBefore?: number;
  silenceAfter?: number;
};
export type CaptionTimingFlag = {
  cueIndex: number;
  code: "caption.tooShort" | "caption.tooFast";
};

const clamp = (value: number, low: number, high: number) =>
  Math.max(low, Math.min(value, high));

function shareFrames(weights: readonly number[], frames: number) {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (frames >= total) return weights;
  // Round cumulative shares to preserve the budget exactly and avoid drift.
  let consumed = 0;
  let previous = 0;
  return weights.map((weight) => {
    consumed += weight;
    const next = Math.round((consumed * frames) / total);
    const share = next - previous;
    previous = next;
    return share;
  });
}

/** Repair estimated boundaries in script order. Preserve every cue and its metadata. */
export function rebalanceCues<T extends TimedCaption>(
  cues: readonly T[],
  window: CaptionWindow,
): { cues: T[]; flags: CaptionTimingFlag[] } {
  if (cues.length === 0) return { cues: [], flags: [] };
  const { start, end, silenceBefore = 0, silenceAfter = 0 } = window;
  if (
    ![start, end, silenceBefore, silenceAfter].every(Number.isFinite) ||
    start < 0 ||
    end < start ||
    silenceBefore < 0 ||
    silenceAfter < 0 ||
    cues.some(
      ({ start, end }) => !Number.isFinite(start) || !Number.isFinite(end),
    )
  )
    throw new RangeError("caption.invalidTiming");

  const windowStart = frameAtOrAfter(start);
  const windowEnd = Math.max(windowStart, frameAtOrBefore(end));
  const preferred = cues.map((cue) => ({
    start: clamp(nearestFrame(cue.start), windowStart, windowEnd),
    end: clamp(nearestFrame(cue.end), windowStart, windowEnd),
  }));
  const requiredFrames = cues.map((cue) =>
    frameAtOrAfter(requiredSeconds(cue.text)),
  );
  const lowerBounds = requiredFrames.map((frames) =>
    clamp(frames, minFrames, maxFrames),
  );
  const needed = lowerBounds.reduce((sum, frames) => sum + frames, 0);

  let first = preferred[0].start;
  let last = Math.max(first, preferred[preferred.length - 1].end);
  const extendBy = (available: number) =>
    clamp(needed - (last - first), 0, available);
  last += extendBy(windowEnd - last);
  first -= extendBy(first - windowStart);
  if (last - first < needed) {
    // Borrow confirmed silence only once per speaker window. Prefer the tail
    // so an existing on-speech opening stays in place whenever possible.
    const tail = Math.min(
      maxSilenceFrames,
      frameAtOrBefore(end + silenceAfter) - windowEnd,
    );
    const borrowedAfter = extendBy(Math.max(0, tail));
    last += borrowedAfter;
    const head = Math.min(
      maxSilenceFrames - borrowedAfter,
      windowStart - frameAtOrAfter(Math.max(0, start - silenceBefore)),
    );
    first -= extendBy(head);
  }

  const available = last - first;
  const baseFrames = shareFrames(
    lowerBounds.map(() => minFrames),
    available,
  );
  const extraFrames = shareFrames(
    lowerBounds.map((frames, index) => frames - baseFrames[index]),
    available - baseFrames.reduce((sum, frames) => sum + frames, 0),
  );
  const durations = baseFrames.map(
    (frames, index) => frames + extraFrames[index],
  );
  let remaining = durations.reduce((sum, frames) => sum + frames, 0);
  let previousEnd = first;
  const flags: CaptionTimingFlag[] = [];
  const repaired = cues.map((cue, cueIndex) => {
    const duration = durations[cueIndex];
    const start = clamp(
      preferred[cueIndex].start,
      previousEnd,
      last - remaining,
    );
    remaining -= duration;
    const end = clamp(
      preferred[cueIndex].end,
      start + duration,
      Math.min(last - remaining, start + maxFrames),
    );
    previousEnd = end;
    if (end - start < minFrames)
      flags.push({ cueIndex, code: "caption.tooShort" });
    if (end - start < requiredFrames[cueIndex])
      flags.push({ cueIndex, code: "caption.tooFast" });
    return { ...cue, start: start / fps, end: end / fps };
  });
  return { cues: repaired, flags };
}
