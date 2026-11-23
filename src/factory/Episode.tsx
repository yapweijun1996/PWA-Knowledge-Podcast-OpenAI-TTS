import { useEffect, useState } from "react";
import {
  activeHosts,
  limits,
  voices,
  type Edit,
  type Episode,
  type EpisodeSummary,
  type Language,
  type Stage,
  type Voice,
} from "../../shared/factory";
import { download } from "../audio";
import { createTranslator, useI18n, type MessageKey } from "../i18n";

import {
  Claims,
  episodeLanguageTags,
  Evidence,
  InlineSources,
} from "./Evidence";
import { EpisodePlayButton } from "./PlaybackBar";
import { episodeState, type AudioCheck } from "./library-model";
import { formatPlaybackClock, type Playback } from "./playback";
import { useCheckedWav } from "./useLibraryAudio";
import { playbackTrack } from "./usePlayback";
import { VideoPanel } from "./VideoPanel";
import "./episode.css";

export type Kind = "draft" | "audio" | "transcript";

const stages: Stage[] = [
  "research",
  "outline",
  "script",
  "audio",
  "transcript",
];
const stageKeys = {
  research: "episode.stages.research",
  outline: "episode.stages.outline",
  script: "episode.stages.script",
  audio: "episode.stages.audio",
  transcript: "episode.stages.transcript",
} as const satisfies Record<Stage, MessageKey>;

const stateKeys = {
  running: "episode.stages.running",
  failed: "episode.stages.failed",
  cancelled: "episode.stages.cancelled",
  interrupted: "episode.stages.interrupted",
} as const;

const languageKeys = {
  en: "episode.header.languageEnglish",
  zh: "episode.header.languageMandarin",
  ms: "episode.header.languageMalay",
  sg: "episode.header.languageSingaporeMixed",
} as const satisfies Record<Language, MessageKey>;

const voiceKeys = {
  marin: "episode.script.voiceMarin",
  cedar: "episode.script.voiceCedar",
  coral: "episode.script.voiceCoral",
  alloy: "episode.script.voiceAlloy",
} as const satisfies Record<Voice, MessageKey>;

const reviewReasonKeys = [
  "episode.review.noComparison",
  "episode.review.lowSimilarity",
  "episode.review.numberDifference",
  "episode.review.limitedSources",
  "episode.review.durationDifference",
] as const;
const sourceText = createTranslator("zh-CN");
// Existing episodes store the original QA sentences as strings.
const savedReviewReasons = new Map(
  reviewReasonKeys.map((key) => [sourceText(key), key]),
);

export function EpisodeWorkspace({
  episode,
  assets,
  savedAudio,
  playback,
  worker,
  working,
  anotherRunning,
  unavailable,
  disconnected,
  onStart,
  onCancel,
  onEdit,
  onDelete,
  onBackup,
  onDirty,
}: {
  episode: Episode;
  assets: { [asset: string]: Blob };
  savedAudio: AudioCheck;
  playback: Playback;
  worker?: EpisodeSummary;
  working: boolean;
  anotherRunning: boolean;
  unavailable: boolean;
  disconnected: boolean;
  onStart: (kind: Kind) => void;
  onCancel: () => void;
  onEdit: (revision: number, edit: Edit) => Promise<boolean>;
  onDelete: () => void;
  onBackup: () => void;
  onDirty: (dirty: boolean) => void;
}) {
  const { locale, t, formatters } = useI18n();
  const clock = (seconds: number) =>
    formatPlaybackClock(seconds, formatters.number);
  const [consentFor, setConsentFor] = useState("");
  const [draft, setDraft] = useState<{ revision: number; edit: Edit } | null>(
    null,
  );
  const [preview, setPreview] = useState<string | null>(null);
  const { job } = episode;
  const running = job?.status === "running";
  const checkpoint =
    episodeState(episode, savedAudio, worker).status === "checkpoint";
  const currentAudio = episode.finished?.revision === episode.revision;
  const currentRender =
    episode.render?.revision === episode.revision ? episode.render : undefined;
  const clipCount = Object.keys(currentRender?.clips ?? {}).length;
  const hosts = activeHosts(episode);
  const script = episode.script;
  const finished = episode.finished;
  const stageDone = [
    episode.research,
    episode.outline,
    script,
    currentAudio && savedAudio,
    currentAudio && finished?.transcript,
  ];
  const kind = !script
    ? "draft"
    : !currentAudio
      ? "audio"
      : !finished?.transcript
        ? "transcript"
        : null;
  const retrying = kind && !running ? job : undefined;
  const consentKey = `${kind}:${episode.revision}:${job?.stage}:${job?.status}`;
  const consent = consentKey === consentFor;
  const planned =
    script &&
    (draft?.edit ?? {
      title: script.title,
      texts: Object.fromEntries(
        script.turns.map((turn) => [turn.id, turn.text]),
      ),
      voices: episode.voices,
    });
  const total = planned
    ? Object.values(planned.texts).reduce((sum, text) => sum + text.length, 0)
    : 0;
  const changedElsewhere =
    draft !== null && draft.revision !== episode.revision;
  const activeClip = preview ? currentRender?.clips[preview] : undefined;
  const clipAudio = useCheckedWav(activeClip && assets[activeClip.asset]);
  const clipTrack = preview && playbackTrack(episode, clipAudio, preview);
  const finishedTrack = playbackTrack(episode, savedAudio);
  const mp3 = finished?.mp3 ? assets[finished.mp3] : undefined;
  const jobStatus =
    job && t(checkpoint ? "episode.stages.checkpoint" : stateKeys[job.status]);
  const jobStage = job && t(stageKeys[job.stage]);
  const voiceSummaries = hosts.map((host) =>
    t("episode.script.voiceSummary", {
      host,
      voice: t(voiceKeys[episode.voices[host]!]),
    }),
  );
  const contentLanguage = episodeLanguageTags[episode.language];
  const productionBlock = draft
    ? "episode.job.unsaved"
    : working || anotherRunning
      ? "settings.action.working"
      : unavailable
        ? "episode.job.unavailable"
        : !consent
          ? "studio.intake.needsConsent"
          : undefined;
  const scriptBlock =
    working || running
      ? "settings.action.working"
      : changedElsewhere
        ? "episode.script.changedElsewhere"
        : planned &&
            (!planned.title.trim() ||
              new Set(hosts.map((host) => planned.voices[host])).size !==
                hosts.length ||
              total > limits.script ||
              Object.values(planned.texts).some((text) => !text.trim()))
          ? "episode.script.incomplete"
          : undefined;

  useEffect(() => {
    onDirty(!!draft);
  }, [draft, onDirty]);

  useEffect(() => {
    if (!draft) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [draft]);

  return (
    <div className="factory-work episode-workspace">
      <section
        className="factory-panel factory-episode"
        aria-labelledby="episode-title"
      >
        <div className="factory-row episode-heading">
          <div>
            <small className="episode-metadata">
              {episode.plan
                ? formatters.plural(
                    "episode.header.metadataWithTarget",
                    hosts.length,
                    {
                      language: t(languageKeys[episode.language]),
                      duration: clock(episode.plan.targetSeconds),
                    },
                  )
                : formatters.plural("episode.header.metadata", hosts.length, {
                    language: t(languageKeys[episode.language]),
                  })}
            </small>
            <h2 id="episode-title" tabIndex={-1} lang={contentLanguage}>
              {script?.title ?? episode.topic}
            </h2>
            {script && script.title !== episode.topic && (
              <p className="muted" lang={contentLanguage}>
                {episode.topic}
              </p>
            )}
          </div>
          <button
            className="text-button"
            disabled={working || running || !!draft}
            onClick={() => {
              if (window.confirm(t("episode.header.deleteConfirmation")))
                onDelete();
            }}
          >
            {t("episode.header.delete")}
          </button>
        </div>
        {episode.plan && (
          <p className="muted" lang="zh-CN">
            {episode.plan.rationale}
          </p>
        )}
        {savedAudio && (
          <div className="factory-actions episode-audio-jump">
            <a className="outline" href="#audio-title">
              {t(
                currentAudio
                  ? "episode.audio.jumpToCurrent"
                  : "episode.audio.jumpToPrevious",
              )}
            </a>
          </div>
        )}
        <ol
          className="factory-stage episode-stage"
          aria-label={t("episode.stages.label")}
        >
          {stages.map((stage, index) => (
            <li
              key={stage}
              data-state={
                stageDone[index]
                  ? "done"
                  : job?.stage === stage
                    ? job.status
                    : "waiting"
              }
            >
              <span>{t(stageKeys[stage])}</span>
              <small>
                {stageDone[index]
                  ? t("episode.stages.saved")
                  : job?.stage === stage
                    ? jobStatus
                    : t("episode.stages.waiting")}
              </small>
            </li>
          ))}
        </ol>
        {job && jobStatus && jobStage && (
          <p
            role={running ? "status" : "alert"}
            className={running ? "muted" : "error"}
          >
            {job.message ??
              (job.stage === "audio"
                ? formatters.plural("episode.job.audioProgress", clipCount, {
                    status: jobStatus,
                    stage: jobStage,
                    total: script?.turns.length ?? 0,
                  })
                : t("episode.job.progress", {
                    status: jobStatus,
                    stage: jobStage,
                  }))}
          </p>
        )}
        {running && (
          <button
            className="outline"
            disabled={working || disconnected}
            onClick={onCancel}
          >
            {t("episode.job.cancel")}
          </button>
        )}
        {!running && kind && (
          <div className="factory-action">
            <label className="factory-check">
              <input
                type="checkbox"
                checked={consent}
                disabled={working || unavailable || !!draft}
                onChange={(event) =>
                  setConsentFor(event.target.checked ? consentKey : "")
                }
              />
              {t("episode.job.consent")}
            </label>
            {productionBlock && (
              <p className="muted" id="episode-production-blocked">
                {t(productionBlock)}
              </p>
            )}
            <button
              className="primary"
              disabled={!!productionBlock}
              aria-describedby={
                productionBlock ? "episode-production-blocked" : undefined
              }
              onClick={() => {
                setConsentFor("");
                onStart(kind);
              }}
            >
              {retrying
                ? t("episode.job.retry", {
                    stage: t(stageKeys[retrying.stage]),
                  })
                : t(
                    (
                      {
                        draft: "episode.job.continue",
                        audio: currentAudio
                          ? "episode.job.regenerateAudio"
                          : "episode.job.generateAudio",
                        transcript: "episode.job.transcribe",
                      } as const
                    )[kind],
                  )}
            </button>
          </div>
        )}
      </section>
      {finished && (
        <section
          className="factory-panel episode-result"
          aria-labelledby="audio-title"
        >
          <div className="factory-row episode-result-heading">
            <h3 id="audio-title" tabIndex={-1}>
              {t(
                currentAudio
                  ? "episode.audio.current"
                  : "episode.audio.previous",
              )}
            </h3>
            {savedAudio && finishedTrack && (
              <p className="muted">
                {t("episode.audio.metadata", {
                  duration: clock(savedAudio.duration),
                })}
              </p>
            )}
          </div>
          {savedAudio && finishedTrack ? (
            <>
              <div className="factory-actions episode-play">
                <EpisodePlayButton
                  engine={playback}
                  track={finishedTrack}
                  blob={savedAudio.blob}
                />
              </div>
              <div className="factory-chapters">
                {finishedTrack.chapters.map((chapter) => (
                  <button
                    className="outline"
                    key={chapter.start}
                    lang={contentLanguage}
                    onClick={() =>
                      playback.select(
                        finishedTrack,
                        savedAudio.blob,
                        chapter.start,
                      )
                    }
                  >
                    {t("playback.chapters.entry", {
                      time: clock(chapter.start),
                      title: chapter.title,
                    })}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="muted">
              {t(
                savedAudio === undefined
                  ? "episode.audio.checking"
                  : "episode.audio.unavailable",
              )}
            </p>
          )}
          <div className="factory-actions">
            {savedAudio && (
              <button
                className="text-button"
                type="button"
                onClick={() =>
                  download(
                    savedAudio.blob,
                    t("episode.audio.wavFilename", { id: episode.id }),
                  )
                }
              >
                {t("episode.audio.downloadWav")}
              </button>
            )}
            {mp3 instanceof Blob && (
              <button
                className="text-button"
                type="button"
                onClick={() =>
                  download(
                    mp3,
                    t("episode.audio.mp3Filename", { id: episode.id }),
                  )
                }
              >
                {t("episode.audio.downloadMp3")}
              </button>
            )}
          </div>
          <div className="episode-review" data-status={finished.qa?.status}>
            <p>
              {t(
                finished.qa?.status === "matched"
                  ? savedAudio
                    ? "episode.review.matched"
                    : "episode.review.matchedSaved"
                  : finished.transcript
                    ? "episode.review.listen"
                    : "episode.review.transcribe",
              )}
            </p>
            {!!finished.qa?.reasons.length && (
              <ul>
                {finished.qa.reasons.map((reason) => {
                  const key = savedReviewReasons.get(reason);
                  return <li key={reason}>{key ? t(key) : reason}</li>;
                })}
              </ul>
            )}
          </div>
          {finished.transcript && (
            <div className="factory-transcript">
              <h4>{t("episode.transcript.title")}</h4>
              <p className="muted">
                {t("episode.transcript.similarity", {
                  similarity: formatters.number(
                    finished.transcript.similarity / 100,
                    { style: "percent" },
                  ),
                })}
              </p>
              <div className="factory-voices episode-transcript-compare">
                <div>
                  <strong>{t("episode.transcript.intended")}</strong>
                  <p lang={contentLanguage}>{finished.intendedText}</p>
                </div>
                <div>
                  <strong>{t("episode.transcript.actual")}</strong>
                  <p lang={contentLanguage}>{finished.transcript.text}</p>
                </div>
              </div>
            </div>
          )}
        </section>
      )}
      {finished && (
        <VideoPanel episode={episode} audio={currentAudio ? savedAudio : null} />
      )}
      <Evidence episode={episode} />
      {script && planned && (
        <section className="factory-panel" aria-labelledby="dialogue-title">
          <div className="factory-row">
            <div>
              <h3 id="dialogue-title">{t("episode.stages.script")}</h3>
              <p className="muted">
                {formatters.plural(
                  "episode.script.summary",
                  script.turns.length,
                  {
                    characters: formatters.plural(
                      "episode.script.characters",
                      total,
                      {
                        characters: formatters.number(total, {
                          useGrouping: locale !== "zh-CN",
                        }),
                      },
                    ),
                  },
                )}
              </p>
            </div>
            {!draft && (
              <button
                className="outline"
                disabled={working || running}
                onClick={() =>
                  setDraft({ revision: episode.revision, edit: planned })
                }
              >
                {t("episode.script.edit")}
              </button>
            )}
          </div>
          {draft && (
            <>
              <label className="field">
                {t("episode.script.episodeTitle")}
                <input
                  lang={contentLanguage}
                  maxLength={100}
                  value={planned.title}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      edit: { ...planned, title: event.target.value },
                    })
                  }
                />
              </label>
              <div className="factory-voices">
                {hosts.map((host) => (
                  <label className="field" key={host}>
                    {t("episode.script.hostVoice", { host })}
                    <select
                      value={planned.voices[host]}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          edit: {
                            ...planned,
                            voices: {
                              ...planned.voices,
                              [host]: event.target.value,
                            },
                          },
                        })
                      }
                    >
                      {voices.map((voice) => (
                        <option key={voice} value={voice}>
                          {t(voiceKeys[voice])}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </>
          )}
          {!draft && (
            <p className="muted">
              {locale === "zh-CN"
                ? voiceSummaries.join("　")
                : formatters.list(voiceSummaries)}
            </p>
          )}
          {episode.outline?.chapters.map((chapter) => (
            <div key={chapter.id} className="factory-chapter">
              <h4 lang={contentLanguage}>{chapter.title}</h4>
              {script.turns
                .filter((turn) => turn.chapterId === chapter.id)
                .map((turn) => (
                  <article className="factory-turn" key={turn.id}>
                    <strong className="factory-host" data-host={turn.host}>
                      {t("episode.script.host", { host: turn.host })}
                    </strong>
                    {draft ? (
                      <textarea
                        lang={contentLanguage}
                        aria-label={t("episode.script.turnLabel", {
                          host: turn.host,
                          id: turn.id,
                        })}
                        maxLength={limits.turn}
                        rows={3}
                        value={planned.texts[turn.id]}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            edit: {
                              ...planned,
                              texts: {
                                ...planned.texts,
                                [turn.id]: event.target.value,
                              },
                            },
                          })
                        }
                      />
                    ) : (
                      <p lang={contentLanguage}>{turn.text}</p>
                    )}
                    {(turn.edited || turn.claimIds.length > 0) && (
                      <div className="factory-turn-meta">
                        {turn.edited && (
                          <small>{t("episode.script.edited")}</small>
                        )}
                        {episode.research && turn.claimIds.length > 0 && (
                          <>
                            <InlineSources
                              research={episode.research}
                              claimIds={turn.claimIds}
                            />
                            <details>
                              <summary>
                                {formatters.plural(
                                  "episode.script.viewCitations",
                                  turn.claimIds.length,
                                )}
                              </summary>
                              <Claims
                                research={episode.research}
                                ids={turn.claimIds}
                                lang={contentLanguage}
                              />
                            </details>
                          </>
                        )}
                      </div>
                    )}
                    {currentRender?.clips[turn.id] && !draft && (
                      <button
                        className="text-button"
                        onClick={() => setPreview(turn.id)}
                      >
                        {t("episode.script.preview")}
                      </button>
                    )}
                    {preview === turn.id &&
                      activeClip &&
                      !draft &&
                      (clipTrack && clipAudio ? (
                        <EpisodePlayButton
                          engine={playback}
                          track={clipTrack}
                          blob={clipAudio.blob}
                        />
                      ) : (
                        <p className="muted" role="status">
                          {t(
                            clipAudio === undefined
                              ? "episode.script.checkingClip"
                              : "episode.script.clipUnavailable",
                          )}
                        </p>
                      ))}
                  </article>
                ))}
            </div>
          ))}
          {draft && (
            <div className="factory-action">
              {changedElsewhere && (
                <p
                  className="error"
                  role="alert"
                  id={
                    scriptBlock === "episode.script.changedElsewhere"
                      ? "episode-script-blocked"
                      : undefined
                  }
                >
                  {t("episode.script.changedElsewhere")}
                </p>
              )}
              {scriptBlock &&
                scriptBlock !== "episode.script.changedElsewhere" && (
                  <p className="muted" id="episode-script-blocked">
                    {t(scriptBlock)}
                  </p>
                )}
              <button
                className="primary"
                disabled={!!scriptBlock}
                aria-describedby={
                  scriptBlock ? "episode-script-blocked" : undefined
                }
                onClick={async () => {
                  if (await onEdit(draft.revision, planned)) setDraft(null);
                }}
              >
                {t("episode.script.save")}
              </button>
              <button
                className="outline"
                disabled={working}
                onClick={() => setDraft(null)}
              >
                {t("episode.script.discard")}
              </button>
            </div>
          )}
        </section>
      )}
      <div className="factory-actions episode-exports">
        <button
          className="outline"
          disabled={working || !!draft}
          onClick={onBackup}
        >
          {t("episode.exports.backup")}
        </button>
        {script && (
          <>
            <button
              className="outline"
              onClick={() =>
                download(
                  new Blob([JSON.stringify(episode, null, 2)], {
                    type: "application/json",
                  }),
                  t("episode.exports.recordFilename"),
                )
              }
            >
              {t("episode.exports.record")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
