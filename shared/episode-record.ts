import {
  activeHosts,
  episodeId,
  hosts,
  languages,
  limits,
  voices,
  type Episode,
} from "./factory.ts";

const wav = /^episode-[a-f0-9-]{36}\.wav$/;
const mp3 = /^episode-[a-f0-9-]{36}\.mp3$/;
const pcm = /^clip-[a-f0-9]{64}\.pcm$/;
const key = /^[A-Za-z0-9-]{1,40}$/;
const text = (value: unknown, max: number): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= max;
const integer = (value: number, min: number, max: number) =>
  Number.isSafeInteger(value) && value >= min && value <= max;
const seconds = (value: number) =>
  Number.isFinite(value) && value >= 0 && value <= 500;
const array = (value: unknown, max: number): value is unknown[] =>
  Array.isArray(value) && value.length <= max;
const ids = (values: string[], allowed: Set<string>) =>
  array(values, 40) && values.every((id) => allowed.has(id));
const unique = (values: string[]) => new Set(values).size === values.length;
const isURL = (raw: string) => {
  if (!text(raw, 1500)) return false;
  try {
    const url = new URL(raw);
    return (
      ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
};

export function readEpisode(value: unknown): Episode {
  const invalid = () => {
    throw new Error("节目记录格式无效或超过上限。");
  };
  if (!value || typeof value !== "object") return invalid();
  const e = value as Episode;
  if (
    !text(e.id, 36) ||
    !episodeId.test(e.id) ||
    !text(e.topic, limits.topic) ||
    !Object.hasOwn(languages, e.language) ||
    !integer(e.revision, 1, 1_000_000) ||
    !text(e.updated, 50) ||
    !Number.isFinite(Date.parse(e.updated)) ||
    !e.voices ||
    typeof e.voices !== "object" ||
    Object.keys(e.voices).some(
      (host) => !hosts.includes(host as (typeof hosts)[number]),
    ) ||
    activeHosts(e).length === 0 ||
    Object.values(e.voices).some((voice) => !voices.includes(voice)) ||
    !unique(Object.values(e.voices))
  )
    return invalid();

  for (const r of [e.researchDraft, e.research]) {
    if (!r) continue;
    if (
      !text(r.searchedAt, 50) ||
      !text(r.model, 150) ||
      !array(r.sources, 100) ||
      !array(r.claims, 24) ||
      r.sources.some(
        (s) =>
          !s ||
          !text(s.id, 40) ||
          !key.test(s.id) ||
          !isURL(s.url) ||
          !text(s.title, 300) ||
          (s.published !== null && !text(s.published, 10)),
      ) ||
      !unique(r.sources.map((s) => s.id))
    )
      return invalid();
    const sourceIds = new Set(r.sources.map((s) => s.id));
    if (
      r.claims.some(
        (c) =>
          !c ||
          !text(c.id, 40) ||
          !key.test(c.id) ||
          !text(c.text, 450) ||
          !text(c.uncertainty, 900) ||
          !["supported", "qualified", "disputed"].includes(c.status) ||
          !ids(c.sourceIds, sourceIds),
      ) ||
      !unique(r.claims.map((c) => c.id))
    )
      return invalid();
  }
  const claimIds = new Set(e.research?.claims.map((claim) => claim.id));
  if (
    e.production?.exactHosts !== undefined &&
    (e.production.exactHosts !== 2 ||
      e.production.maxHosts !== 2 ||
      (e.outline && activeHosts(e).length !== 2))
  )
    return invalid();
  if (
    e.outline &&
    (!text(e.outline.model, 150) ||
      !array(e.outline.chapters, 7) ||
      !e.outline.chapters.length ||
      e.outline.chapters.some(
        (c) =>
          !c ||
          !text(c.id, 40) ||
          !key.test(c.id) ||
          !text(c.title, 70) ||
          !text(c.angle, 240) ||
          !ids(c.claimIds, claimIds),
      ) ||
      !unique(e.outline.chapters.map((c) => c.id)))
  )
    return invalid();
  if (e.script) {
    if (
      !e.outline ||
      !text(e.script.title, 100) ||
      !text(e.script.model, 150) ||
      !array(e.script.turns, limits.turns) ||
      !e.script.turns.length ||
      e.script.turns.some((turn) => {
        const chapter = e.outline?.chapters.find(
          (c) => c.id === turn?.chapterId,
        );
        return (
          !chapter ||
          !text(turn.id, 40) ||
          !key.test(turn.id) ||
          !activeHosts(e).includes(turn.host) ||
          !text(turn.text, limits.turn) ||
          !ids(turn.claimIds, new Set(chapter.claimIds))
        );
      }) ||
      (e.production?.exactHosts === 2 &&
        !activeHosts(e).every((host) =>
          e.script?.turns.some((turn) => turn.host === host),
        )) ||
      !unique(e.script.turns.map((turn) => turn.id)) ||
      e.script.turns.reduce((sum, turn) => sum + turn.text.length, 0) >
        limits.script
    )
      return invalid();
  }
  if (
    e.plan &&
    (!seconds(e.plan.targetSeconds) || !text(e.plan.rationale, 300))
  )
    return invalid();
  if (
    e.job &&
    (!["research", "outline", "script", "audio", "transcript"].includes(
      e.job.stage,
    ) ||
      !["running", "failed", "cancelled", "interrupted"].includes(
        e.job.status,
      ) ||
      (e.job.message !== undefined && !text(e.job.message, 1000)))
  )
    return invalid();
  if (
    e.render &&
    (!e.script ||
      !integer(e.render.revision, 1, e.revision) ||
      !e.render.clips ||
      Object.entries(e.render.clips).length > limits.turns ||
      Object.entries(e.render.clips).some(
        ([id, clip]) =>
          !text(id, 40) ||
          !key.test(id) ||
          !clip ||
          !text(clip.asset, 80) ||
          !pcm.test(clip.asset) ||
          !seconds(clip.duration),
      ))
  )
    return invalid();
  const f = e.finished;
  if (
    f &&
    (!text(f.asset, 60) ||
      !wav.test(f.asset) ||
      (f.mp3 !== undefined && (!text(f.mp3, 60) || !mp3.test(f.mp3))) ||
      !integer(f.revision, 1, e.revision) ||
      !seconds(f.duration) ||
      !text(f.intendedText, limits.script + limits.turns) ||
      !array(f.chapters, 7) ||
      f.chapters.some((c) => !c || !text(c.title, 70) || !seconds(c.start)) ||
      (f.transcript &&
        (!text(f.transcript.text, 16_000) ||
          !integer(f.transcript.similarity, 0, 100))) ||
      (f.qa &&
        (!["matched", "review"].includes(f.qa.status) ||
          !array(f.qa.reasons, 8) ||
          f.qa.reasons.some((reason) => !text(reason, 300)))))
  )
    return invalid();
  return e;
}

export function episodeAssets(episode: Episode) {
  const result: { asset: string; route: string; type: string }[] = [];
  if (episode.finished) {
    result.push({
      asset: episode.finished.asset,
      route: "audio",
      type: "audio/wav",
    });
    if (episode.finished.mp3)
      result.push({
        asset: episode.finished.mp3,
        route: "mp3",
        type: "audio/mpeg",
      });
  }
  for (const [id, clip] of Object.entries(episode.render?.clips ?? {}))
    result.push({ asset: clip.asset, route: "clip/" + id, type: "audio/wav" });
  return [...new Map(result.map((entry) => [entry.asset, entry])).values()];
}
