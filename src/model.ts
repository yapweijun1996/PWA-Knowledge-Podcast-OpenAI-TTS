import { createTranslator, defaultLocale, t } from "./i18n/index.ts";

export type Voice = "marin" | "cedar" | "coral";
export type AudioProvenance = {
  requestedModel: string;
  requestedInstructions?: string;
  effectiveModel?: string;
  effectiveVoice?: string;
  responseStatus?: "completed" | "incomplete";
};
export type AudioTake = {
  audio: Blob;
  audioKind: "demo" | "openai";
  audioFor: string;
  voice: Voice;
  instructions: string;
  audioVerified?: boolean;
  provenance?: AudioProvenance;
};
export type Segment = {
  id: string;
  text: string;
  audio?: Blob;
  audioKind?: "demo" | "openai";
  audioFor?: string;
  voice?: Voice;
  instructions?: string;
  audioVerified?: boolean;
  provenance?: AudioProvenance;
  alternative?: AudioTake;
};
export type Project = {
  id: string;
  title: string;
  language: string;
  segments: Segment[];
  voice: Voice;
  instructions: string;
  notes: string;
  updated: number;
  revision?: string;
};
export const presets = {
  Documentary:
    "Speak in a calm, clear documentary style, with measured pacing.",
  Curious: "Speak with warmth and curiosity, with natural pauses.",
  Neutral: "Speak clearly and evenly, without dramatic emphasis.",
};
// The legacy sample is Mandarin episode content and carries the zh-CN language tag.
const sampleContent = createTranslator(defaultLocale);
export const sampleText = [
  sampleContent("studio.sample.introduction"),
  sampleContent("studio.sample.localRainfall"),
  sampleContent("studio.sample.measurements"),
  sampleContent("studio.sample.comparison"),
  sampleContent("studio.sample.stationData"),
];
export function makeProject(sample = false): Project {
  return {
    id: crypto.randomUUID(),
    title: sample
      ? sampleContent("studio.sample.title")
      : t("studio.project.untitled"),
    language: "zh-CN",
    segments: (sample ? sampleText : [""]).map((text) => ({
      id: crypto.randomUUID(),
      text,
    })),
    voice: "marin",
    instructions: presets.Documentary,
    notes: "",
    updated: Date.now(),
  };
}
export function current(
  s: Segment,
  p: Project,
  kind: "demo" | "openai" = "demo",
) {
  return (
    !!s.audio &&
    (s.audioKind ?? "demo") === kind &&
    s.audioFor === s.text &&
    s.voice === p.voice &&
    s.instructions === p.instructions
  );
}
