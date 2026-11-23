import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type RefObject,
} from "react";
import {
  defaultPreferences,
  type Edit,
  type Episode,
  type EpisodeSummary,
  type Runtime,
  type Schedule,
} from "../../shared/factory";
import { readPreferences } from "../../shared/preferences";
import { download } from "../audio";
import { StudioError, studio } from "./api";
import { estimateBrowserProduction } from "./browser-production";
import { EpisodeWorkspace, type Kind } from "./Episode";
import { FactoryShell } from "./FactoryShell";
import { LibraryWorkspace } from "./LibraryWorkspace";
import {
  addImported,
  episodePath,
  listRecords,
  loadPrefs,
  localDelete,
  localEdit,
  receive,
  savePrefs,
  subscribe,
  syncLibrary,
  type Record as LibraryRecord,
} from "./library";
import { stageNames } from "./library-model";
import type { FactoryPage, WorkspaceNavigation } from "./navigation";
import { readIntakeDraft, writeIntakeDraft, type IntakeDraft } from "./intake-draft";
import { PlaybackBar } from "./PlaybackBar";
import {
  BrowserCredentials,
  ProductionCredentials,
  ProductionSettings,
} from "./Preferences";
import { backupRecord, restoreRecord } from "../../shared/episode-backup";
import { BrowserContinuation, BrowserCost, StudioIntake } from "./StudioIntake";
import {
  browserCheckpoint,
  browserProductionBounds,
  studioProductionMode,
  useBrowserProduction,
  type StudioMode,
  type WorkerAvailability,
} from "./useBrowserProduction";
import { useLibraryAudio } from "./useLibraryAudio";
import { usePlayback } from "./usePlayback";
import "./factory.css";

type Props = {
  page: FactoryPage;
  visible: boolean;
  navigation: WorkspaceNavigation;
  theme: "system" | "light" | "dark";
  setTheme: (theme: Props["theme"]) => void;
  online: boolean;
  updateReady: boolean;
  updating: boolean;
  updateBlocked: boolean;
  updateError: string;
  onUpdate: () => void;
  onUpdateBlockedChange: (blocked: boolean) => void;
  pausePlayback: RefObject<(() => void) | null>;
};

function errorText(reason: unknown) {
  if (reason instanceof DOMException) {
    if (reason.name === "QuotaExceededError")
      return "浏览器存储空间不足。请备份并释放空间；本机进程仍保留未接收的文件。";
    if (
      [
        "AbortError",
        "TimeoutError",
        "UnknownError",
        "InvalidStateError",
      ].includes(reason.name)
    )
      return "读取或保存中断。请检查浏览器存储和本机进程后重试。";
  }
  return reason instanceof Error ? reason.message : "操作未完成，请重试。";
}

export function Factory({
  page,
  visible,
  navigation,
  theme,
  setTheme,
  online,
  updateReady,
  updating,
  updateBlocked,
  updateError,
  onUpdate,
  onUpdateBlockedChange,
  pausePlayback,
}: Props) {
  const [runtime, setRuntime] = useState<Runtime | null>(null);
  const [reachable, setReachable] = useState(false);
  const [remote, setRemote] = useState<EpisodeSummary[]>([]);
  const [records, setRecords] = useState<LibraryRecord[]>([]);
  const [libraryState, setLibraryState] = useState<
    "loading" | "ready" | "unavailable"
  >("loading");
  const [selected, setSelected] = useState<string | null>(() =>
    new URL(location.href).searchParams.get("episode"),
  );
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [syncIssue, setSyncIssue] = useState("");
  const [intake, setIntake] = useState(readIntakeDraft);
  const { topic, exactHosts } = intake;
  const [consentFor, setConsentFor] = useState<StudioMode | null>(null);
  const [target, setTarget] = useState<StudioMode>("browser");
  const [dirty, setDirty] = useState(false);
  const [preferences, setPreferences] = useState(defaultPreferences);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [usage, setUsage] = useState("");
  const [detailFocus, setDetailFocus] = useState<{
    target: "episode-title" | "audio-title";
  }>();
  const inFlight = useRef(false);
  const deepLink = useRef(selected);
  const scrolledLink = useRef(false);
  const token = useRef<HTMLInputElement>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const workspace = useRef<HTMLDivElement>(null);
  const awaitingCreated = useRef<string | null>(null);
  const browser = useBrowserProduction({ listRecords, receive });
  const row = records.find((record) => record.episode.id === selected);
  const getAudio = useLibraryAudio(records);
  const { engine, audioRef, activeRevision } = usePlayback(
    records,
    libraryState === "ready",
    getAudio,
  );
  const running = remote.find((item) => item.job?.status === "running");
  const connected = online && reachable;
  const canProduce =
    connected &&
    runtime?.authenticated &&
    runtime.configured &&
    runtime.localProduction;
  const busy = pending || updating;
  const workerAvailability: WorkerAvailability = (() => {
    if (!online) return "offline";
    if (!connected || !runtime) return "no-worker";
    if (!runtime.authenticated) return "locked";
    if (!runtime.localProduction) return "no-worker";
    if (!runtime.configured) return "no-key";
    if (running || schedule?.running) return "working";
    return "ready";
  })();
  const workerReady = workerAvailability === "ready";
  const { mode, chooseMode, availability } = studioProductionMode(
    browser.keySet,
    workerAvailability,
    target,
  );
  const consent = consentFor === mode;
  const bounds = browserProductionBounds(preferences, exactHosts);
  const workerRow = remote.find((item) => item.id === selected);
  const workspaceVisible = page === "library" || page === "studio";
  const savedSelection = row?.episode.id;
  const resumable = row && !workerRow && browserCheckpoint(row);
  const browserSelected = !!selected && selected === browser.activeId;
  const browserAvailable = online && browser.keySet && libraryState === "ready";
  const episode = row?.episode;
  const displayedEpisode =
    resumable && episode?.job?.status === "running"
      ? { ...episode, job: { ...episode.job, status: "interrupted" as const } }
      : episode;

  useEffect(() => {
    if (page !== "studio") setConsentFor(null);
  }, [page]);

  useEffect(() => {
    if (savedSelection && awaitingCreated.current === savedSelection) {
      awaitingCreated.current = null;
    }
  }, [savedSelection]);

  useEffect(() => {
    if (detailFocus && visible && workspaceVisible) {
      workspace.current
        ?.querySelector<HTMLElement>(`#${detailFocus.target}`)
        ?.focus();
      setDetailFocus(undefined);
    }
  }, [detailFocus, visible, workspaceVisible]);

  useEffect(() => {
    if (
      !visible ||
      page !== "library" ||
      !savedSelection ||
      savedSelection !== deepLink.current ||
      scrolledLink.current
    )
      return;
    scrolledLink.current = true;
    if (document.activeElement === document.body) {
      workspace.current?.querySelector("#factory-selection")?.scrollIntoView();
    }
  }, [visible, page, savedSelection]);

  useEffect(() => {
    onUpdateBlockedChange(pending || dirty);
  }, [pending, dirty, onUpdateBlockedChange]);

  useLayoutEffect(() => {
    pausePlayback.current = engine.pause;
    return () => {
      pausePlayback.current = null;
    };
  }, [engine, pausePlayback]);

  useEffect(() => {
    function restoreSelection() {
      const url = new URL(location.href);
      const id = url.searchParams.get("episode");
      if (id === selected) return;
      if (dirty && !window.confirm("放弃尚未保存的脚本修改？")) {
        if (selected) url.searchParams.set("episode", selected);
        else url.searchParams.delete("episode");
        history.replaceState(history.state, "", url);
        return;
      }
      deepLink.current = id;
      scrolledLink.current = false;
      setSelected(id);
      setDirty(false);
    }
    window.addEventListener("popstate", restoreSelection);
    return () => window.removeEventListener("popstate", restoreSelection);
  }, [dirty, selected]);

  const refreshStorage = useCallback(async () => {
    const storage = navigator.storage;
    const estimate = await storage?.estimate?.().catch(() => undefined);
    const persisted = await storage?.persisted?.().catch(() => false);
    const mb = (bytes: number) => Math.round(bytes / 1_048_576);
    const space = estimate?.quota
      ? `本来源约用 ${mb(estimate.usage ?? 0)} / ${mb(estimate.quota)} MB。`
      : "浏览器未提供可用空间估算。";
    setUsage(
      space +
        (persisted
          ? " 浏览器已授予持久存储。"
          : " 临时存储可能因空间不足被清理。"),
    );
  }, []);
  const refresh = useCallback(async () => {
    const loaded = await listRecords();
    setRecords((prior) => {
      const rows = new Map(prior.map((entry) => [entry.episode.id, entry]));
      const next = loaded.map((entry) => {
        const current = rows.get(entry.episode.id);
        return current?.stamp === entry.stamp ? current : entry;
      });
      return next.length === prior.length &&
        next.every((entry, index) => entry === prior[index])
        ? prior
        : next;
    });
    setLibraryState("ready");
    await refreshStorage();
  }, [refreshStorage]);
  useEffect(() => {
    function pull() {
      void refresh().catch((reason) => {
        setLibraryState((state) => (state === "ready" ? state : "unavailable"));
        setError(errorText(reason));
      });
    }
    pull();
    void loadPrefs()
      .then((loaded) => {
        setPreferences(loaded);
        setConsentFor(null);
      })
      .catch((reason) => setError(errorText(reason)));
    return subscribe(pull);
  }, [refresh]);

  useEffect(() => {
    if (!online || pending) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      let next = 5000;
      const signal = controller.signal;
      let detected = false;
      try {
        const runtime = await studio<Runtime>(
          "/session",
          "GET",
          undefined,
          signal,
        );
        if (signal.aborted) return;
        detected = true;
        setReachable(true);
        setRuntime(runtime);
        if (!runtime.authenticated) {
          setRemote([]);
          setSchedule(null);
          return;
        }
        const [{ episodes }, schedule] = await Promise.all([
          studio<{ episodes: EpisodeSummary[] }>(
            "/episodes",
            "GET",
            undefined,
            signal,
          ),
          runtime.localProduction
            ? studio<Schedule>("/schedule", "GET", undefined, signal)
            : null,
        ]);
        if (signal.aborted) return;
        setRemote(episodes);
        setSchedule(schedule);
        next =
          episodes.some((item) => item.job?.status === "running") ||
          schedule?.running
            ? 1400
            : 5000;
        await syncLibrary(episodes, signal, !!runtime.localProduction);
        if (!controller.signal.aborted) setSyncIssue("");
      } catch (reason) {
        if (!controller.signal.aborted) {
          if (!detected) setReachable(false);
          setSyncIssue(detected ? errorText(reason) : "");
        }
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(poll, next);
      }
    }
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [online, pending]);

  function select(id: string | null, startNew = false) {
    if (selected !== id && dirty && !window.confirm("放弃尚未保存的脚本修改？"))
      return false;
    if (startNew) navigation.go("studio");
    if (selected === id) return true;
    setSelected(id);
    deepLink.current = null;
    setDirty(false);
    const url = new URL(location.href);
    if (id) url.searchParams.set("episode", id);
    else url.searchParams.delete("episode");
    history.replaceState(history.state, "", url);
    return true;
  }

  async function perform(work: () => Promise<void>) {
    if (inFlight.current || updating) return false;
    inFlight.current = true;
    setPending(true);
    setError("");
    setMessage("");
    try {
      await work();
      await refresh();
      return true;
    } catch (reason) {
      setError(errorText(reason));
      return false;
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  function changeIntake(next: IntakeDraft) {
    writeIntakeDraft(next);
    setIntake(next);
    setConsentFor(null);
  }

  function create(event: FormEvent) {
    event.preventDefault();
    if (busy || !consent || !topic.trim()) return;
    if (mode === "browser") {
      if (!browserAvailable) return;
      const id = crypto.randomUUID();
      void perform(async () => {
        if (!select(id)) return;
        setConsentFor(null);
        await browser.run({ id, topic, production: bounds, consent });
        changeIntake({ topic: "", exactHosts });
        setMessage("浏览器制作完成，节目已保存到资料库。");
      });
      return;
    }
    if (!workerReady) return;
    const id = intake.requestId ?? crypto.randomUUID();
    changeIntake({ topic, exactHosts, requestId: id });
    void perform(async () => {
      await studio("/episodes", "POST", {
        topic,
        id,
        consent: true,
        exactHosts,
        preferences: readPreferences(preferences),
      });
      awaitingCreated.current = id;
      select(id);
      changeIntake({ topic: "", exactHosts });
    });
  }

  function resumeInBrowser(id: string) {
    if (!resumable || !browserAvailable || busy || dirty) return;
    void perform(async () => {
      await browser.run({ id, consent: true, retryUnknown: true });
      setMessage("浏览器制作完成，节目已保存到资料库。");
    });
  }

  function start(kind: Kind) {
    if (!row || !canProduce) return;
    void perform(async () => {
      const episode = row.episode;
      const path = episodePath(episode.id);
      if (row.edited || !workerRow) {
        if (kind === "transcript" && workerRow)
          throw new Error("制作检查点已变化，请同步后再转录。");
        const updated =
          kind === "transcript"
            ? await studio<Episode>(
                path + "/transcribe-local",
                "POST",
                await backupRecord(row),
                undefined,
                {
                  "X-Podcast-Consent": "true",
                  "X-Local-Stamp": row.stamp,
                },
              )
            : await studio<Episode>(path + "/resume-local", "POST", {
                snapshot: episode,
                expected: workerRow ? (episode.syncToken ?? null) : null,
                consent: true,
                kind,
                localStamp: row.stamp,
                preferences: readPreferences(preferences),
              });
        await receive(updated, AbortSignal.timeout(30_000), row, true);
      } else {
        await studio(path + "/jobs", "POST", {
          revision: episode.revision,
          syncToken: episode.syncToken,
          asset: kind === "transcript" ? episode.finished?.asset : undefined,
          kind,
          consent: true,
        });
      }
    });
  }

  function edit(revision: number, draft: Edit) {
    return perform(async () => {
      if (!row) return;
      await localEdit(row, revision, draft);
      setMessage("脚本已保存到此浏览器。");
    });
  }

  function backup() {
    if (!row) return;
    void perform(async () => {
      download(await backupRecord(row), `podcast-${row.episode.id}.kps`);
      setMessage("已准备节目备份，包含研究、脚本和已保存的音频。");
    });
  }

  return (
    <FactoryShell
      page={page}
      visible={visible}
      navigation={navigation}
      connection={
        !online ? "离线" : connected ? "制作进程在线" : "浏览器本地模式"
      }
      player={
        <>
          <audio
            ref={audioRef}
            hidden
            preload="metadata"
            aria-label="成品音频播放器"
          />
          <PlaybackBar
            engine={engine}
            activeRevision={activeRevision}
            visible={visible}
          />
        </>
      }
    >
      {updateReady && (
        <div className="notice update">
          <span>{updateError || "新版已就绪。"}</span>
          <button disabled={busy || dirty || updateBlocked} onClick={onUpdate}>
            立即更新
          </button>
        </div>
      )}
      {error && (!workspaceVisible || error !== episode?.job?.message) && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {syncIssue && (
        <p className="error" role="alert">
          节目同步未完成。{syncIssue}
        </p>
      )}
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      {browser.activeId && (
        <section
          className="factory-panel factory-production-progress"
          aria-labelledby="browser-progress-title"
        >
          <h2 id="browser-progress-title">浏览器制作进度</h2>
          <p role="status">
            {browser.cancelling
              ? "正在取消浏览器制作…"
              : browser.progress
                ? `${browser.progress.stage === "transcript" ? "音频转录与核对" : stageNames[browser.progress.stage]}（${browser.progress.index} / ${browser.progress.total}）`
                : "正在读取本地制作进度…"}
          </p>
          {browser.estimate && <BrowserCost estimate={browser.estimate} />}
          <button
            type="button"
            className="outline"
            disabled={browser.cancelling}
            onClick={browser.cancel}
          >
            取消浏览器制作
          </button>
        </section>
      )}
      {connected && runtime && !runtime.authenticated && (
        <section className="factory-panel factory-login">
          <h2>登录制作进程</h2>
          <form
            className="factory-actions"
            onSubmit={(event) => {
              event.preventDefault();
              if (!token.current) return;
              const value = token.current.value;
              token.current.value = "";
              void perform(async () => {
                setRuntime(
                  await studio<Runtime>("/session", "POST", { token: value }),
                );
              });
            }}
          >
            <label className="field">
              工作空间口令
              <input
                ref={token}
                required
                maxLength={128}
                type="password"
                autoComplete="off"
              />
            </label>
            <button className="primary" disabled={busy}>
              登录
            </button>
          </form>
        </section>
      )}
      <div hidden={page !== "settings"} className="factory-page-stack">
        <section className="factory-panel">
          <h2>应用外观</h2>
          <label className="field">
            外观
            <select
              value={theme}
              onChange={(event) =>
                setTheme(event.target.value as Props["theme"])
              }
            >
              <option value="system">跟随系统</option>
              <option value="light">浅色</option>
              <option value="dark">深色</option>
            </select>
          </label>
        </section>
        {visible && page === "settings" && (
          <BrowserCredentials configured={browser.keySet} working={busy} />
        )}
        <ProductionCredentials
          runtime={runtime}
          connected={connected}
          working={busy}
          running={!!running || !!schedule?.running}
          onKey={(key) =>
            void perform(async () =>
              setRuntime(await studio<Runtime>("/key", "PUT", { key })),
            )
          }
        />
        {connected && runtime?.authenticated && runtime.privateMode && (
          <div>
            <button
              className="outline"
              disabled={busy}
              onClick={() =>
                void perform(async () => {
                  setRuntime(await studio<Runtime>("/session", "DELETE"));
                  setRemote([]);
                  setSchedule(null);
                })
              }
            >
              退出制作进程
            </button>
          </div>
        )}
      </div>
      <div hidden={page !== "automation"}>
        <ProductionSettings
          runtime={runtime}
          connected={connected}
          working={busy}
          running={!!running}
          preferences={preferences}
          setPreferences={setPreferences}
          schedule={schedule}
          onSave={(approved) =>
            void perform(async () => {
              const next = readPreferences(preferences);
              await savePrefs(next);
              setPreferences(next);
              setSchedule(
                await studio<Schedule>("/schedule", "PUT", {
                  preferences: next,
                  consent: approved,
                }),
              );
              setMessage("偏好和本机排程已保存。");
            })
          }
          onDiscover={() => {
            if (
              confirm(
                "立即进行一次付费选题检查？选中后会自动研究、配音并转录。",
              )
            )
              void perform(async () =>
                setSchedule(
                  await studio<Schedule>("/discover", "POST", {
                    consent: true,
                  }),
                ),
              );
          }}
          onCancelDiscovery={() =>
            void perform(async () =>
              setSchedule(await studio<Schedule>("/discover", "DELETE")),
            )
          }
        />
      </div>
      <div
        ref={workspace}
        hidden={!workspaceVisible}
        className="factory-layout"
      >
        <LibraryWorkspace
          records={records}
          liveEpisodes={connected ? remote : undefined}
          getAudio={getAudio}
          loadState={libraryState}
          selected={selected}
          hidden={page !== "library"}
          busy={busy}
          onCreate={() => select(null, true)}
          onOpen={(id, target) => {
            if (select(id)) setDetailFocus({ target });
          }}
        >
          {connected &&
            remote.some(
              (item) => !records.some(({ episode }) => episode.id === item.id),
            ) && (
              <small className="muted">
                正在接收本机进程的节目。请保持资料库打开。
              </small>
            )}
          <div className="factory-actions">
            <button
              className="outline"
              disabled={busy}
              onClick={() => importInput.current?.click()}
            >
              恢复节目备份
            </button>
            <input
              hidden
              type="file"
              accept=".kps,application/octet-stream"
              ref={importInput}
              aria-label="节目备份文件"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file)
                  void perform(async () => {
                    const { episode, assets } = await restoreRecord(file);
                    select(await addImported(episode, assets));
                    setMessage("备份已恢复为本地副本。");
                  });
              }}
            />
            <button
              className="text-button"
              disabled={busy || !navigator.storage?.persist}
              onClick={() =>
                void perform(async () => {
                  const granted = await navigator.storage.persist();
                  setMessage(
                    granted
                      ? "浏览器已授予持久存储。"
                      : "浏览器未授予持久存储，请保留节目备份。",
                  );
                })
              }
            >
              请求持久存储
            </button>
          </div>
          <small className="muted">
            {usage} 节目按浏览器配置和网址隔离。跨设备可通过备份文件转移。
          </small>
        </LibraryWorkspace>
        <div
          className="factory-selection"
          id="factory-selection"
          hidden={page === "library" && !selected}
          data-browser-resume={
            resumable && (browser.keySet || !canProduce) ? "" : undefined
          }
        >
          {page === "library" && selected && (
            <button
              className="text-button"
              onClick={() =>
                (
                  document.getElementById("library-search") ??
                  document.getElementById("factory-page-title")
                )?.focus()
              }
            >
              返回节目列表
            </button>
          )}
          {page === "studio" && selected && (
            <button
              className="outline"
              disabled={busy}
              onClick={() => select(null)}
            >
              ＋ 新建
            </button>
          )}
          {workspaceVisible && row && resumable && !browserSelected && (
            <BrowserContinuation
              key={row.stamp}
              estimate={estimateBrowserProduction(row.episode.production)}
              keySet={browser.keySet}
              disabled={!browserAvailable || busy || dirty}
              navigation={navigation}
              onResume={() => resumeInBrowser(row.episode.id)}
            />
          )}
          {browserSelected ? null : row && displayedEpisode ? (
            <EpisodeWorkspace
              key={row.episode.id}
              episode={displayedEpisode}
              assets={row.assets}
              savedAudio={getAudio(row)}
              playback={engine}
              worker={connected ? workerRow : undefined}
              working={busy}
              anotherRunning={
                !!running &&
                (running.id !== row.episode.id ||
                  row.episode.job?.status !== "running")
              }
              unavailable={!canProduce || !!schedule?.running}
              disconnected={!connected}
              onStart={start}
              onCancel={() =>
                void perform(async () => {
                  await studio(episodePath(row.episode.id) + "/cancel", "POST");
                })
              }
              onEdit={edit}
              onDelete={() =>
                void perform(async () => {
                  await localDelete(
                    row,
                    !!workerRow || (!connected && !!row.episode.syncToken),
                  );
                  if (
                    new URL(location.href).searchParams.get("episode") ===
                    row.episode.id
                  )
                    select(null);
                })
              }
              onBackup={backup}
              onDirty={setDirty}
            />
          ) : selected ? (
            <section className="factory-panel">
              <h2>接收节目</h2>
              <p role="status" className="muted">
                {libraryState === "loading"
                  ? "正在读取这一期的本地记录…"
                  : (connected && workerRow) ||
                      awaitingCreated.current === selected
                    ? "等待本机进程同步节目。"
                    : "尚未在此浏览器找到这一期。可恢复备份，或等待本机同步。"}
              </p>
            </section>
          ) : (
            <StudioIntake
              availability={availability}
              navigation={navigation}
              mode={mode}
              chooseMode={chooseMode}
              estimate={
                availability === "ready-browser"
                  ? estimateBrowserProduction(bounds)
                  : undefined
              }
              topic={topic}
              exactHosts={exactHosts}
              consent={consent}
              busy={busy || (mode === "browser" && libraryState !== "ready")}
              onChange={(topic) => changeIntake({ topic, exactHosts })}
              onConsent={(approved) => setConsentFor(approved ? mode : null)}
              onModeChange={(mode) => {
                setTarget(mode);
                setConsentFor(null);
              }}
              onHostsChange={(exactHosts) => changeIntake({ topic, exactHosts })}
              onSubmit={create}
            />
          )}
        </div>
      </div>
      <footer>
        离线可播放、编辑、导出及恢复已保存的节目。联网制作会向 OpenAI
        提交主题、脚本和音频。
      </footer>
    </FactoryShell>
  );
}
