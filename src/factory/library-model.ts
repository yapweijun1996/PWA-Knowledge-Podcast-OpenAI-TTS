import { validateAudio } from "../../shared/audio-record.ts";
import {
  languages,
  type Episode,
  type EpisodeSummary,
  type Language,
} from "../../shared/factory.ts";

export const episodeStatuses = {
  ready: "可离线播放",
  review: "待试听核对",
  stale: "上一版音频",
  missing: "音频不可用",
  running: "制作中",
  checkpoint: "上次制作进度",
  interrupted: "已中断",
  failed: "制作失败",
  cancelled: "已取消",
  script: "脚本已保存",
  draft: "研究草稿",
  checking: "正在检查音频",
} as const;

export type EpisodeStatus = keyof typeof episodeStatuses;
export type AudioCheck = { blob: Blob; duration: number } | null | undefined;
type AudioStatus = Extract<
  EpisodeStatus,
  "ready" | "review" | "stale" | "missing" | "checking"
>;

export const stageNames = {
  research: "网页研究",
  outline: "节目大纲",
  script: "节目脚本",
  audio: "节目配音",
  transcript: "音频转录",
} as const;

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

const languageSearch: Record<Language, string> = {
  en: "英语 英文",
  zh: "中文 普通话 汉语 Chinese",
  ms: "马来语 馬來語 Malay",
  sg: "新加坡混合語 Singapore mixed",
};
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
        languages[language],
        languageSearch[language],
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
