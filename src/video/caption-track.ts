import type { Host } from "../../shared/factory.ts";
import type { CaptionCue } from "./timeline.ts";

export type CaptionTrack = {
  videoSha256: string;
  locale: string;
  cues: readonly SubtitleCue[];
};

type SubtitleCue = {
  startMs: number;
  endMs: number;
  speaker: string;
  lines: string[];
};

type DisplayedCaption = { cue: CaptionCue; speakerId: Host };

const subtitleText = (text: string) =>
  text
    .normalize("NFC")
    .replace(
      /[<>{}]/gu,
      (value) => ({ "<": "＜", ">": "＞", "{": "｛", "}": "｝" })[value]!,
    )
    .replace(/[\s\p{Cc}\u202a-\u202e\u2066-\u2069]+/gu, " ")
    .trim();

export function recordCaptionTrack(
  locale: string,
  speakerNames: Readonly<Record<Host, string>>,
  durationMicros: number,
) {
  const cues: SubtitleCue[] = [];
  const durationMs = Math.floor(durationMicros / 1000);
  let active: (DisplayedCaption & { startMicros: number }) | undefined;

  function finishCue(nextMicros: number) {
    if (!active) return;
    const startMs = Math.round(active.startMicros / 1000);
    const endMs = Math.min(durationMs, Math.round(nextMicros / 1000));
    const speaker =
      subtitleText(speakerNames[active.speakerId]) || active.speakerId;
    const lines = active.cue.lines.map(subtitleText).filter(Boolean);
    if (endMs > startMs && lines.length)
      cues.push({ startMs, endMs, speaker, lines });
  }

  return {
    observe(timestampMicros: number, caption?: DisplayedCaption) {
      if (
        active?.cue === caption?.cue &&
        active?.speakerId === caption?.speakerId
      )
        return;
      finishCue(timestampMicros);
      active = caption && { ...caption, startMicros: timestampMicros };
    },
    complete(videoSha256: string): CaptionTrack | undefined {
      finishCue(durationMicros);
      active = undefined;
      if (cues.length) return { locale, videoSha256, cues };
    },
  };
}

function timecode(ms: number, separator: "," | ".") {
  const pad = (value: number, length = 2) =>
    String(value).padStart(length, "0");
  return (
    [
      pad(Math.floor(ms / 3_600_000)),
      pad(Math.floor(ms / 60_000) % 60),
      pad(Math.floor(ms / 1000) % 60),
    ].join(":") +
    separator +
    pad(ms % 1000, 3)
  );
}

const escapeVtt = (value: string) => value.replaceAll("&", "&amp;");

export const captionFileName = "captions.srt";
export function encodeCaptionTrack(track: CaptionTrack, format: "srt" | "vtt") {
  const separator = format === "vtt" ? "." : ",";
  const chunks = track.cues.map(({ startMs, endMs, speaker, lines }, index) => {
    const text = `${subtitleText(speaker)}: ${lines.map(subtitleText).filter(Boolean).join("\n")}`;
    return [
      String(index + 1),
      `${timecode(startMs, separator)} --> ${timecode(endMs, separator)}`,
      format === "vtt" ? escapeVtt(text) : text,
    ].join("\n");
  });
  return (format === "vtt" ? "WEBVTT\n\n" : "") + chunks.join("\n\n") + "\n";
}
