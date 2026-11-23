import { validateAudio } from "../../shared/audio-record.ts";
import type {
  Episode,
  EpisodeSummary,
  Language,
} from "../../shared/factory.ts";
import {
  createTranslator,
  defaultLocale,
  t,
  type MessageKey,
} from "../i18n/index.ts";

export const episodeStatuses = {
  ready: "library.status.ready",
  review: "library.status.review",
  stale: "library.status.stale",
  missing: "library.status.missing",
  running: "library.status.running",
  checkpoint: "library.status.checkpoint",
  interrupted: "library.status.interrupted",
  failed: "library.status.failed",
  cancelled: "library.status.cancelled",
  script: "library.status.script",
  draft: "library.status.draft",
  checking: "library.status.checking",
} as const satisfies Record<string, MessageKey>;

export type EpisodeStatus = keyof typeof episodeStatuses;
export type AudioCheck = { blob: Blob; duration: number } | null | undefined;
type AudioStatus = Extract<
  EpisodeStatus,
  "ready" | "review" | "stale" | "missing" | "checking"
>;

export const stageNameKeys = {
  research: "library.stage.research",
  outline: "library.stage.outline",
  script: "library.stage.script",
  audio: "library.stage.audio",
  transcript: "library.stage.transcript",
} as const satisfies Record<NonNullable<Episode["job"]>["stage"], MessageKey>;

// Keep the string-valued interface for existing Episode view callers.
export const stageNames = {
  get research() {
    return t(stageNameKeys.research);
  },
  get outline() {
    return t(stageNameKeys.outline);
  },
  get script() {
    return t(stageNameKeys.script);
  },
  get audio() {
    return t(stageNameKeys.audio);
  },
  get transcript() {
    return t(stageNameKeys.transcript);
  },
};

export const languageNameKeys = {
  en: "library.language.english",
  zh: "library.language.mandarin",
  ms: "library.language.malay",
  sg: "library.language.singaporeMixed",
} as const satisfies Record<Language, MessageKey>;

export const audioClock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

export function finishedWav(episode: Episode, assets: Record<string, Blob>) {
  const blob = episode.finished && assets[episode.finished.asset];
  return blob instanceof Blob && blob.type === "audio/wav" && blob.size > 44
    ? blob
    : undefined;
}

export async function verifyFinishedWav(blob: Blob): Promise<AudioCheck> {
  if (blob.type !== "audio/wav" || blob.size <= 44) return null;
  try {
    await validateAudio(blob, "audio/wav");
    // A validated Studio WAV contains a 44-byte header and mono 16-bit PCM at 24 kHz.
    return { blob, duration: (blob.size - 44) / 48_000 };
  } catch {
    return null;
  }
}

function savedAudioStatus(
  episode: Episode,
  audio: AudioCheck,
): AudioStatus | undefined {
  const { finished } = episode;
  if (!finished) return undefined;
  if (audio === undefined) return "checking";
  if (!audio) return "missing";
  if (finished.revision !== episode.revision) return "stale";
  return finished.transcript && finished.qa?.status === "matched"
    ? "ready"
    : "review";
}

export function episodeState(
  episode: Episode,
  audio: AudioCheck,
  worker?: EpisodeSummary,
) {
  const audioStatus = savedAudioStatus(episode, audio);
  const { job } = episode;
  if (job) {
    const live =
      job.status === "running" &&
      !!episode.syncToken &&
      worker?.syncToken === episode.syncToken &&
      worker.job?.status === "running" &&
      worker.job.stage === job.stage;
    return {
      status: job.status === "running" && !live ? "checkpoint" : job.status,
      audioStatus: audioStatus === "ready" ? undefined : audioStatus,
      stage: job.stage,
    } as const;
  }
  return {
    status: audioStatus ?? (episode.script ? "script" : "draft"),
  } as const;
}

export type LibraryEntry = ReturnType<typeof episodeState> & {
  episode: Episode;
  audio: AudioCheck;
};

export type LibraryControls = {
  query: string;
  status: EpisodeStatus | "";
  language: Language | "";
  sort: "newest" | "oldest" | "title";
};

export const defaultLibraryControls: LibraryControls = {
  query: "",
  status: "",
  language: "",
  sort: "newest",
};

const languageSearch = {
  en: "library.search.english",
  zh: "library.search.mandarin",
  ms: "library.search.malay",
  sg: "library.search.singaporeMixed",
} as const satisfies Record<Language, MessageKey>;
const sourceT = createTranslator(defaultLocale);
const normalize = (value: string) => value.normalize("NFKC").toLowerCase();
const titles = new Intl.Collator(undefined, {
  sensitivity: "base",
  numeric: true,
});

export function episodeTitle(episode: Episode) {
  return episode.script?.title || episode.topic;
}

export function visibleEpisodes(
  entries: LibraryEntry[],
  controls: LibraryControls,
  translate: typeof t = t,
) {
  const terms = normalize(controls.query).trim().split(/\s+/u).filter(Boolean);
  return entries
    .filter(({ episode, status, audioStatus }) => {
      if (
        controls.status &&
        controls.status !== status &&
        controls.status !== audioStatus
      )
        return false;
      if (controls.language && controls.language !== episode.language)
        return false;
      if (!terms.length) return true;
      const { language } = episode;
      const fields = [
        episodeTitle(episode),
        episode.topic,
        language,
        sourceT(languageNameKeys[language]),
        sourceT(languageSearch[language]),
        translate(languageNameKeys[language]),
        translate(languageSearch[language]),
      ].map(normalize);
      return terms.every((term) =>
        fields.some((field) => field.includes(term)),
      );
    })
    .sort((a, b) => {
      const byDate =
        Date.parse(b.episode.updated) - Date.parse(a.episode.updated);
      const byTitle =
        controls.sort === "title"
          ? titles.compare(episodeTitle(a.episode), episodeTitle(b.episode))
          : 0;
      return (
        byTitle ||
        (controls.sort === "oldest" ? -byDate : byDate) ||
        a.episode.id.localeCompare(b.episode.id)
      );
    });
}
