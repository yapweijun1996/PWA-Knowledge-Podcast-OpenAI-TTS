export const languages = {
  en: "English",
  zh: "华语 Mandarin",
  ms: "Bahasa Melayu",
  sg: "新加坡混合语",
} as const;
export type Language = keyof typeof languages;

export const voices = ["marin", "cedar", "coral", "alloy"] as const;
export type Voice = (typeof voices)[number];
export const hosts = ["A", "B", "C"] as const;
export type Host = (typeof hosts)[number];

export const limits = {
  topic: 200,
  turns: 42,
  turn: 450,
  script: 12500,
  webCalls: 5,
  projects: 30,
} as const;

export type Source = {
  id: string;
  url: string;
  title: string;
  published: string | null;
};
export type Claim = {
  id: string;
  text: string;
  uncertainty: string;
  status: "supported" | "qualified" | "disputed";
  sourceIds: string[];
  crossCheck?: "independent-domains" | "limited";
};
export type Research = {
  searchedAt: string;
  model: string;
  sources: Source[];
  claims: Claim[];
  auditModel?: string;
};
export type Chapter = {
  id: string;
  title: string;
  angle: string;
  claimIds: string[];
};
export type Turn = {
  id: string;
  chapterId: string;
  host: Host;
  text: string;
  claimIds: string[];
  edited?: boolean;
};
export type Script = { title: string; turns: Turn[]; model: string };
export type Edit = {
  title: string;
  texts: Record<string, string>;
  voices: Partial<Record<Host, Voice>>;
};
export type Stage = "research" | "outline" | "script" | "audio" | "transcript";
export type Job = {
  stage: Stage;
  status: "running" | "failed" | "cancelled" | "interrupted";
  message?: string;
  autoAudio?: boolean;
};
export type Clip = { asset: string; duration: number };
export type Render = {
  revision: number;
  model: string;
  clips: Record<string, Clip>;
};
export type Finished = {
  revision: number;
  asset: string;
  model: string;
  duration: number;
  chapters: { title: string; start: number }[];
  intendedText: string;
  mp3?: string;
  qa?: { status: "matched" | "review"; reasons: string[] };
  transcript?: { text: string; model: string; similarity: number };
};
export type Episode = {
  id: string;
  topic: string;
  language: Language;
  voices: Partial<Record<Host, Voice>>;
  updated: string;
  revision: number;
  syncToken?: string;
  localStamp?: string;
  production?: ProductionBounds;
  plan?: { targetSeconds: number; rationale: string };
  researchDraft?: Research;
  research?: Research;
  outline?: { chapters: Chapter[]; model: string };
  script?: Script;
  job?: Job;
  render?: Render;
  finished?: Finished;
};
export type EpisodeSummary = Pick<
  Episode,
  "id" | "topic" | "language" | "updated" | "job"
> & {
  syncToken?: string;
  localStamp?: string;
  title?: string;
  hasScript: boolean;
  hasAudio: boolean;
};
export type Runtime = {
  authenticated: boolean;
  privateMode: boolean;
  configured?: boolean;
  localProduction?: boolean;
  mp3?: boolean;
  keyMode?: "session" | "environment";
  models?: {
    research: string;
    script: string;
    audio: string;
    transcript: string;
  };
};

export type ProductionBounds = {
  language: Language | "auto";
  allowedLanguages: Language[];
  maxSeconds: number;
  maxHosts: number;
  exactHosts?: 2;
};
export type Preferences = Omit<ProductionBounds, "exactHosts"> & {
  interests: string;
  enabled: boolean;
  cadence: "adaptive" | "daily" | "weekly";
  weeklyLimit: number;
};
export type Schedule = {
  preferences: Preferences;
  nextCheck: string | null;
  running: boolean;
  message: string;
  used: number;
};
export const defaultPreferences: Preferences = {
  interests: "",
  language: "auto",
  allowedLanguages: ["en", "zh", "ms", "sg"],
  maxSeconds: 240,
  maxHosts: 3,
  enabled: false,
  cadence: "adaptive",
  weeklyLimit: 2,
};
export const activeHosts = (episode: Pick<Episode, "voices">) =>
  hosts.filter((host) => !!episode.voices[host]);
export const episodeId = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;

export const studioBase = "/PWA-Knowledge-Podcast-OpenAI-TTS/";
export const studioAPI = "/api/studio";
