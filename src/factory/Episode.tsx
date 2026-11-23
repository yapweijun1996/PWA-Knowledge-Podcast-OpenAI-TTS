import { useEffect, useState } from "react";
import {
  activeHosts,
  languages,
  limits,
  voices,
  type Edit,
  type Episode,
  type EpisodeSummary,
  type Stage,
} from "../../shared/factory";
import { download } from "../audio";

import { Claims, Evidence, InlineSources } from "./Evidence";
import { EpisodePlayButton } from "./PlaybackBar";
import {
  audioClock as clock,
  episodeState,
  stageNames,
  type AudioCheck,
} from "./library-model";
import type { Playback } from "./playback";
import { useCheckedWav } from "./useLibraryAudio";
import { playbackTrack } from "./usePlayback";
import "./episode.css";

export type Kind = "draft" | "audio" | "transcript";

const stages: Stage[] = [
  "research",
  "outline",
  "script",
  "audio",
  "transcript",
];
const states = {
  running: "进行中",
  failed: "失败",
  cancelled: "已取消",
  interrupted: "已中断",
};
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
  const [consentFor, setConsentFor] = useState("");
  const [draft, setDraft] = useState<{ revision: number; edit: Edit } | null>(
    null,
  );
  const [preview, setPreview] = useState<string | null>(null);
  const running = episode.job?.status === "running";
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
  const retrying = kind && episode.job && !running;
  const consentKey = `${kind}:${episode.revision}:${episode.job?.stage}:${episode.job?.status}`;
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
  const total =
    planned &&
    Object.values(planned.texts).reduce((sum, text) => sum + text.length, 0);
  const changedElsewhere =
    draft !== null && draft.revision !== episode.revision;
  const activeClip = preview ? currentRender?.clips[preview] : undefined;
  const clipAudio = useCheckedWav(activeClip && assets[activeClip.asset]);
  const clipTrack = preview && playbackTrack(episode, clipAudio, preview);
  const finishedTrack = playbackTrack(episode, savedAudio);
  const mp3 = finished?.mp3 ? assets[finished.mp3] : undefined;

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
              {languages[episode.language]} · {hosts.length} 位主持
              {episode.plan
                ? ` · 目标 ${clock(episode.plan.targetSeconds)}`
                : ""}
            </small>
            <h2 id="episode-title" tabIndex={-1}>
              {script?.title ?? episode.topic}
            </h2>
            {script && script.title !== episode.topic && (
              <p className="muted">{episode.topic}</p>
            )}
          </div>
          <button
            className="text-button"
            disabled={working || running || !!draft}
            onClick={() => {
              if (
                window.confirm(
                  "删除这期节目和已同步的音频？若仍有本机检查点，联网后也会删除。",
                )
              )
                onDelete();
            }}
          >
            删除
          </button>
        </div>
        {episode.plan && <p className="muted">{episode.plan.rationale}</p>}
        {savedAudio && (
          <div className="factory-actions episode-audio-jump">
            <a className="outline" href="#audio-title">
              {currentAudio ? "前往成品音频" : "前往上一版成品音频"}
            </a>
          </div>
        )}
        <ol className="factory-stage episode-stage" aria-label="制作阶段">
          {stages.map((stage, index) => (
            <li
              key={stage}
              data-state={
                stageDone[index]
                  ? "done"
                  : episode.job?.stage === stage
                    ? episode.job.status
                    : "waiting"
              }
            >
              <span>{stageNames[stage]}</span>
              <small>
                {stageDone[index]
                  ? "已保存"
                  : episode.job?.stage === stage
                    ? checkpoint
                      ? "上次保存的进度"
                      : states[episode.job.status]
                    : "待开始"}
              </small>
            </li>
          ))}
        </ol>
        {episode.job && (
          <p
            role={running ? "status" : "alert"}
            className={running ? "muted" : "error"}
          >
            {episode.job.message ??
              `${checkpoint ? "上次保存的进度" : states[episode.job.status]} · ${stageNames[episode.job.stage]}${episode.job.stage === "audio" ? `（${clipCount}/${script?.turns.length ?? 0} 段已保存）` : ""}`}
          </p>
        )}
        {running && (
          <button
            className="outline"
            disabled={working || disconnected}
            onClick={onCancel}
          >
            取消任务
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
              我同意本次 OpenAI 请求可能计费。已提交的请求在取消后仍可能计费。
            </label>
            <button
              className="primary"
              disabled={
                working || unavailable || anotherRunning || !!draft || !consent
              }
              onClick={() => {
                setConsentFor("");
                onStart(kind);
              }}
            >
              {retrying
                ? "重试" + stageNames[episode.job!.stage]
                : {
                    draft: "继续制作整集",
                    audio: currentAudio ? "重新配音并核对" : "生成整集配音",
                    transcript: "转录并对照脚本",
                  }[kind]}
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
              {currentAudio ? "成品音频" : "上一版成品音频"}
            </h3>
            {savedAudio && finishedTrack && (
              <p className="muted">
                AI 生成的主持声音 · {clock(savedAudio.duration)} · WAV
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
                    onClick={() =>
                      playback.select(
                        finishedTrack,
                        savedAudio.blob,
                        chapter.start,
                      )
                    }
                  >
                    {clock(chapter.start)} · {chapter.title}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="muted">
              {savedAudio === undefined
                ? "正在检查已保存的 WAV…"
                : "此浏览器没有可用的成品 WAV。"}
            </p>
          )}
          <div className="factory-actions">
            {savedAudio && (
              <button
                className="text-button"
                type="button"
                onClick={() =>
                  download(savedAudio.blob, `podcast-${episode.id}.wav`)
                }
              >
                下载 WAV
              </button>
            )}
            {mp3 instanceof Blob && (
              <button
                className="text-button"
                type="button"
                onClick={() => download(mp3, `podcast-${episode.id}.mp3`)}
              >
                下载 MP3
              </button>
            )}
          </div>
          <div className="episode-review" data-status={finished.qa?.status}>
            <p>
              {finished.qa?.status === "matched"
                ? savedAudio
                  ? "自动转录比对通过。请试听语音与出处。"
                  : "已保存自动转录比对结果。"
                : finished.transcript
                  ? "已转录 · 待试听核对"
                  : "待转录核对"}
            </p>
            {!!finished.qa?.reasons.length && (
              <ul>
                {finished.qa.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            )}
          </div>
          {finished.transcript && (
            <div className="factory-transcript">
              <h4>音频转录与脚本对照</h4>
              <p className="muted">
                字面相似度 {finished.transcript.similarity}
                %。口音、同音字和数字写法都可能影响分数；请试听核对。
              </p>
              <div className="factory-voices episode-transcript-compare">
                <div>
                  <strong>预定脚本</strong>
                  <p>{finished.intendedText}</p>
                </div>
                <div>
                  <strong>从成品音频转录</strong>
                  <p>{finished.transcript.text}</p>
                </div>
              </div>
            </div>
          )}
        </section>
      )}
      <Evidence episode={episode} />
      {script && planned && (
        <section className="factory-panel" aria-labelledby="dialogue-title">
          <div className="factory-row">
            <div>
              <h3 id="dialogue-title">节目脚本</h3>
              <p className="muted">
                {script.turns.length} 段 · {total} 字符
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
                编辑脚本与声音
              </button>
            )}
          </div>
          {draft && (
            <>
              <label className="field">
                节目标题
                <input
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
                    主持 {host} 的声音
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
                        <option key={voice}>{voice}</option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </>
          )}
          {!draft && (
            <p className="muted">
              {hosts
                .map((host) => `主持 ${host} · ${episode.voices[host]}`)
                .join("　")}
            </p>
          )}
          {episode.outline?.chapters.map((chapter) => (
            <div key={chapter.id} className="factory-chapter">
              <h4>{chapter.title}</h4>
              {script.turns
                .filter((turn) => turn.chapterId === chapter.id)
                .map((turn) => (
                  <article className="factory-turn" key={turn.id}>
                    <strong className="factory-host" data-host={turn.host}>
                      主持 {turn.host}
                    </strong>
                    {draft ? (
                      <textarea
                        aria-label={`主持 ${turn.host} · ${turn.id}`}
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
                      <p>{turn.text}</p>
                    )}
                    {(turn.edited || turn.claimIds.length > 0) && (
                      <div className="factory-turn-meta">
                        {turn.edited && <small>人工编辑 · 请复核归属</small>}
                        {episode.research && turn.claimIds.length > 0 && (
                          <>
                            <InlineSources
                              research={episode.research}
                              claimIds={turn.claimIds}
                            />
                            <details>
                              <summary>
                                查看引用（{turn.claimIds.length}）
                              </summary>
                              <Claims
                                research={episode.research}
                                ids={turn.claimIds}
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
                        试听此段
                      </button>
                    )}
                    {preview === turn.id && activeClip && !draft &&
                      (clipTrack && clipAudio ? (
                        <EpisodePlayButton
                          engine={playback}
                          track={clipTrack}
                          blob={clipAudio.blob}
                        />
                      ) : (
                        <p className="muted" role="status">
                          {clipAudio === undefined
                            ? "正在检查片段…"
                            : "此浏览器没有可用的配音片段。"}
                        </p>
                      ))}
                  </article>
                ))}
            </div>
          ))}
          {draft && (
            <div className="factory-action">
              {changedElsewhere && (
                <p className="error" role="alert">
                  其他标签页已更新脚本。请复制需要保留的修改，再放弃本次编辑。
                </p>
              )}
              <button
                className="primary"
                disabled={
                  working ||
                  running ||
                  changedElsewhere ||
                  !planned.title.trim() ||
                  new Set(hosts.map((host) => planned.voices[host])).size !==
                    hosts.length ||
                  (total ?? 0) > limits.script ||
                  Object.values(planned.texts).some((text) => !text.trim())
                }
                onClick={async () => {
                  if (await onEdit(draft.revision, planned)) setDraft(null);
                }}
              >
                保存脚本
              </button>
              <button
                className="outline"
                disabled={working}
                onClick={() => setDraft(null)}
              >
                放弃修改
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
          备份本期节目
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
                  "podcast-record.json",
                )
              }
            >
              导出制作记录
            </button>
          </>
        )}
      </div>
    </div>
  );
}
