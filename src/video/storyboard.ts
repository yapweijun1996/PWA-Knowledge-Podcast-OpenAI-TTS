import type { Episode, Host } from "../../shared/factory.ts";
import { displayTextCounts, normalizeDisplayText } from "../text/wrap.ts";
import { paletteIds, type PaletteId } from "./design/palettes.ts";
import {
  cameraLabels,
  type Studio3dSettings,
} from "./scenes/studio3d/presets.ts";

export const storyboardMoods = [
  "calm",
  "curious",
  "urgent",
  "warm",
  "serious",
] as const;
export type VideoMood = (typeof storyboardMoods)[number];
export const storyboardMetaphors = {
  "voice-rails": "waveform",
  "host-orbs": "studio3d",
} as const;
export const maxStoryboardCallouts = 3;
export const maxCalloutPercent = 90;
export type StoryboardCallout = { afterPercent: number; text: string };
export type StoryboardChapter = {
  chapterId: string;
  mood: VideoMood;
  paletteId: PaletteId;
  visualMetaphor: keyof typeof storyboardMetaphors;
  cameraPresetId: Studio3dSettings["cameraPresetId"];
  callouts: StoryboardCallout[];
};
export type Storyboard = { schemaVersion: 1; chapters: StoryboardChapter[] };

const isChoice = <T extends string>(
  choices: readonly T[],
  value: unknown,
): value is T => choices.some((choice) => choice === value);

function isExactRecord(
  value: unknown,
  keys: readonly string[],
): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return false;
  const prototype = Object.getPrototypeOf(value);
  return (
    (prototype === null || prototype === Object.prototype) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}

export function storyboardScript(episode: Episode) {
  if (!episode.script || !episode.outline) return;
  const chapters: {
    chapterId: string;
    title: string;
    lines: { host: Host; text: string }[];
  }[] = [];
  const seen = new Set<string>();
  for (const { chapterId, host, text } of episode.script.turns) {
    const previous = chapters.at(-1);
    if (previous?.chapterId === chapterId) {
      previous.lines.push({ host, text });
      continue;
    }
    const outline = episode.outline.chapters.find(({ id }) => id === chapterId);
    if (!outline || seen.has(chapterId)) return;
    chapters.push({ chapterId, title: outline.title, lines: [{ host, text }] });
    seen.add(chapterId);
  }
  if (!chapters.length || chapters.length > 7) return;
  return { language: episode.language, title: episode.script.title, chapters };
}

/** Bind the plan to the actual script even when a caller replaces it without bumping the revision. */
export async function storyboardKey(episode: Episode) {
  const script = storyboardScript(episode);
  if (!script) return;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(script)),
  );
  const hash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `storyboard:${episode.id}:${episode.revision}:${hash}`;
}

export function validateStoryboard(
  value: unknown,
  episode: Episode,
): Storyboard | undefined {
  const script = storyboardScript(episode);
  if (
    !script ||
    !isExactRecord(value, ["schemaVersion", "chapters"]) ||
    value.schemaVersion !== 1 ||
    !Array.isArray(value.chapters) ||
    value.chapters.length !== script.chapters.length
  )
    return;

  const chapters: StoryboardChapter[] = [];
  for (const [index, chapter] of value.chapters.entries()) {
    const { chapterId } = script.chapters[index];
    if (
      !isExactRecord(chapter, [
        "chapterId",
        "mood",
        "paletteId",
        "visualMetaphor",
        "cameraPresetId",
        "callouts",
      ]) ||
      chapter.chapterId !== chapterId ||
      !isChoice(storyboardMoods, chapter.mood) ||
      !isChoice(paletteIds, chapter.paletteId) ||
      !isChoice(Object.keys(storyboardMetaphors), chapter.visualMetaphor) ||
      !isChoice(Object.keys(cameraLabels), chapter.cameraPresetId) ||
      (chapter.visualMetaphor === "voice-rails" &&
        chapter.cameraPresetId !== "static") ||
      !Array.isArray(chapter.callouts) ||
      chapter.callouts.length > maxStoryboardCallouts
    )
      return;

    const callouts: StoryboardCallout[] = [];
    for (const callout of chapter.callouts) {
      if (
        !isExactRecord(callout, ["afterPercent", "text"]) ||
        typeof callout.afterPercent !== "number" ||
        !Number.isInteger(callout.afterPercent) ||
        callout.afterPercent < 0 ||
        callout.afterPercent > maxCalloutPercent ||
        callout.afterPercent <= (callouts.at(-1)?.afterPercent ?? -1) ||
        typeof callout.text !== "string" ||
        callout.text.length > 160 ||
        /[<>`\\\p{Cc}\p{Cf}]|(?:\b[a-z][a-z0-9+.-]*:\/\/|\b(?:data|javascript|mailto|file|https?):|\b[a-z0-9-]+\.[a-z]{2,}\b|\/\/)/iu.test(
          callout.text,
        )
      )
        return;
      const text = normalizeDisplayText(callout.text.normalize("NFC"));
      const { cjk, latin } = displayTextCounts(
        text,
        episode.language === "sg" ? "zh-CN" : episode.language,
      );
      if (!text || (cjk ? cjk + latin / 2 > 20 : latin > 46)) return;
      callouts.push({ afterPercent: callout.afterPercent, text });
    }
    chapters.push({
      chapterId,
      mood: chapter.mood,
      paletteId: chapter.paletteId,
      visualMetaphor:
        chapter.visualMetaphor as StoryboardChapter["visualMetaphor"],
      cameraPresetId:
        chapter.cameraPresetId as StoryboardChapter["cameraPresetId"],
      callouts,
    });
  }
  return { schemaVersion: 1, chapters };
}

export function sameStoryboard(first?: Storyboard, second?: Storyboard) {
  return first === second || JSON.stringify(first) === JSON.stringify(second);
}
