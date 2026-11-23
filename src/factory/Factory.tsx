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
import { useI18n, type MessageKey } from "../i18n";
import { LibraryError, localizePublicError, StudioError, studio } from "./api";
import {
  BrowserProductionError,
  estimateBrowserProduction,
} from "./browser-production";
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
  missingWorkerMessage,
  missingWorkerMessageKey,
  receive,
  savePrefs,
  subscribe,
  syncLibrary,
  type Record as LibraryRecord,
} from "./library";
import { stageNameKeys } from "./library-model";
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
  canResumeBrowserProduction,
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

function errorText(reason: unknown, { locale, t }: ReturnType<typeof useI18n>) {
  if (reason instanceof StudioError) return reason.localized(t, locale);
  if (reason instanceof LibraryError) return t(reason.key);
  if (reason instanceof BrowserProductionError) return reason.message;
  if (reason instanceof DOMException) {
    if (reason.name === "QuotaExceededError")
      return t("library.error.storageQuota");
    if (
      [
        "AbortError",
        "TimeoutError",
        "UnknownError",
        "InvalidStateError",
      ].includes(reason.name)
    )
      return t("library.error.storageInterrupted");
  }
  return (
    (reason instanceof Error
      ? localizePublicError(reason.message, t)
      : undefined) ?? t("library.error.unfinished")
  );
}

type Failure = { reason: unknown };

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
  const i18n = useI18n();
  const { t, formatters } = i18n;
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
  const [message, setMessage] = useState<MessageKey>();
  const [failure, setFailure] = useState<Failure>();
  const [syncFailure, setSyncFailure] = useState<Failure>();
  const [intake, setIntake] = useState(readIntakeDraft);
  const { topic, exactHosts } = intake;
  const [consentFor, setConsentFor] = useState<StudioMode | null>(null);
  const [target, setTarget] = useState<StudioMode>("browser");
  const [dirty, setDirty] = useState(false);
  const [preferences, setPreferences] = useState(defaultPreferences);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [storageStatus, setStorageStatus] = useState<{
    estimate?: StorageEstimate;
    persisted?: boolean;
  }>();
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
  const resumable = !!row && !workerRow && browserCheckpoint(row);
  const browserSelected = !!selected && selected === browser.activeId;
  const browserAvailable = online && browser.keySet && libraryState === "ready";
  const canResumeInBrowser = canResumeBrowserProduction({
    resumable,
    browserAvailable,
    blocked: busy || dirty,
  });
  const episode = row?.episode;
  const job = episode?.job;
  const isBrowserCheckpoint = resumable && job?.status === "running";
  const isMissingWorkerJob = job?.message === missingWorkerMessage;
  const displayedEpisode =
    episode && job && (isBrowserCheckpoint || isMissingWorkerJob)
      ? {
          ...episode,
          job: {
            ...job,
            status: isBrowserCheckpoint ? ("interrupted" as const) : job.status,
            message: isMissingWorkerJob ? t(missingWorkerMessageKey) : job.message,
          },
        }
      : episode;
  const error = failure ? errorText(failure.reason, i18n) : "";
  const syncIssue = syncFailure ? errorText(syncFailure.reason, i18n) : "";
  const estimate = storageStatus?.estimate;
  const megabytes = (bytes: number) =>
    formatters.number(Math.round(bytes / 1_048_576), { useGrouping: false });
  const usage = storageStatus
    ? t("library.storage.usage", {
        space: estimate?.quota
          ? t("library.storage.estimate", {
              used: megabytes(estimate.usage ?? 0),
              quota: megabytes(estimate.quota),
            })
          : t("library.storage.noEstimate"),
        persistence: t(
          storageStatus.persisted
            ? "library.storage.granted"
            : "library.storage.temporary",
        ),
      })
    : "";

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
      if (dirty && !window.confirm(t("library.selection.discardChanges"))) {
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
  }, [dirty, selected, t]);

  const refreshStorage = useCallback(async () => {
    const storage = navigator.storage;
    const estimate = await storage?.estimate?.().catch(() => undefined);
    const persisted = await storage?.persisted?.().catch(() => false);
    setStorageStatus({ estimate, persisted });
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
        setFailure({ reason });
      });
    }
    pull();
    void loadPrefs()
      .then((loaded) => {
        setPreferences(loaded);
        setConsentFor(null);
      })
      .catch((reason) => setFailure({ reason }));
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
        if (!controller.signal.aborted) setSyncFailure(undefined);
      } catch (reason) {
        if (!controller.signal.aborted) {
          if (!detected) setReachable(false);
          setSyncFailure(detected ? { reason } : undefined);
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
    if (
      selected !== id &&
      dirty &&
      !window.confirm(t("library.selection.discardChanges"))
    )
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
    setFailure(undefined);
    setMessage(undefined);
    try {
      await work();
      await refresh();
      return true;
    } catch (reason) {
      setFailure({ reason });
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
        setMessage("library.production.complete");
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
    if (!canResumeInBrowser) return;
    void perform(async () => {
      await browser.run({ id, consent: true, retryUnknown: true });
      setMessage("library.production.complete");
    });
  }

  function start(kind: Kind) {
    if (!row || !canProduce) return;
    void perform(async () => {
      const episode = row.episode;
      const path = episodePath(episode.id);
      if (row.edited || !workerRow) {
        if (kind === "transcript" && workerRow)
          throw new LibraryError(
            "library.production.transcriptionCheckpointChanged",
          );
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
      setMessage("library.edit.saved");
    });
  }

  function backup() {
    if (!row) return;
    void perform(async () => {
      download(
        await backupRecord(row),
        t("library.backup.filename", { id: row.episode.id }),
      );
      setMessage("library.backup.prepared");
    });
  }

  return (
    <FactoryShell
      page={page}
      visible={visible}
      navigation={navigation}
      connection={
        !online
          ? "shell.status.offline"
          : connected
            ? "shell.status.workerOnline"
            : "shell.status.browserLocal"
      }
      player={
        <>
          <audio
            ref={audioRef}
            hidden
            preload="metadata"
            aria-label={t("library.player.label")}
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
          <span>{updateError || t("library.update.ready")}</span>
          <button disabled={busy || dirty || updateBlocked} onClick={onUpdate}>
            {t("library.update.now")}
          </button>
        </div>
      )}
      {error &&
        (!workspaceVisible || error !== displayedEpisode?.job?.message) && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      {syncIssue && (
        <p className="error" role="alert">
          {t("library.sync.failed", { detail: syncIssue })}
        </p>
      )}
      {message && (
        <p className="notice" role="status">
          {t(message)}
        </p>
      )}
      {browser.activeId && (
        <section
          className="factory-panel factory-production-progress"
          aria-labelledby="browser-progress-title"
        >
          <h2 id="browser-progress-title">{t("library.production.progressTitle")}</h2>
          <p role="status">
            {browser.cancelling
              ? t("library.production.cancelling")
              : browser.progress
                ? formatters.plural(
                    "library.production.stageProgress",
                    browser.progress.total,
                    {
                      stage: t(
                        browser.progress.stage === "transcript"
                          ? "library.production.transcriptionAndReview"
                          : stageNameKeys[browser.progress.stage],
                      ),
                      index: browser.progress.index,
                    },
                  )
                : t("library.production.loadingProgress")}
          </p>
          {browser.estimate && <BrowserCost estimate={browser.estimate} />}
          <button
            type="button"
            className="outline"
            disabled={browser.cancelling}
            onClick={browser.cancel}
          >
            {t("library.production.cancel")}
          </button>
        </section>
      )}
      {connected && runtime && !runtime.authenticated && (
        <section className="factory-panel factory-login">
          <h2>{t("library.login.title")}</h2>
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
              {t("library.login.token")}
              <input
                ref={token}
                required
                maxLength={128}
                type="password"
                autoComplete="off"
              />
            </label>
            <button className="primary" disabled={busy}>
              {t("library.login.submit")}
            </button>
          </form>
        </section>
      )}
      <div hidden={page !== "settings"} className="factory-page-stack">
        <section className="factory-panel">
          <h2>{t("settings.appearance.title")}</h2>
          <label className="field">
            {t("settings.appearance.theme")}
            <select
              value={theme}
              onChange={(event) =>
                setTheme(event.target.value as Props["theme"])
              }
            >
              <option value="system">{t("settings.appearance.system")}</option>
              <option value="light">{t("settings.appearance.light")}</option>
              <option value="dark">{t("settings.appearance.dark")}</option>
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
              {t("library.login.signOut")}
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
              setMessage("library.automation.saved");
            })
          }
          onDiscover={() => {
            if (confirm(t("library.automation.confirmDiscovery")))
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
                {t("library.sync.receiving")}
              </small>
            )}
          <div className="factory-actions">
            <button
              className="outline"
              disabled={busy}
              onClick={() => importInput.current?.click()}
            >
              {t("library.backup.restore")}
            </button>
            <input
              hidden
              type="file"
              accept=".kps,application/octet-stream"
              ref={importInput}
              aria-label={t("library.backup.fileLabel")}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file)
                  void perform(async () => {
                    const { episode, assets } = await restoreRecord(file);
                    select(await addImported(episode, assets));
                    setMessage("library.backup.restored");
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
                      ? "library.storage.granted"
                      : "library.storage.denied",
                  );
                })
              }
            >
              {t("library.storage.request")}
            </button>
          </div>
          <small className="muted">
            {t("library.storage.info", { usage })}
          </small>
        </LibraryWorkspace>
        <div
          className="factory-selection"
          id="factory-selection"
          hidden={page === "library" && !selected}
          data-browser-resume={canResumeInBrowser ? "" : undefined}
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
              {t("library.selection.backToList")}
            </button>
          )}
          {page === "studio" && selected && (
            <button
              className="outline"
              disabled={busy}
              onClick={() => select(null)}
            >
              {t("library.selection.create")}
            </button>
          )}
          {workspaceVisible && row && resumable && !browserSelected && (
            <BrowserContinuation
              key={row.stamp}
              estimate={estimateBrowserProduction(row.episode.production)}
              keySet={browser.keySet}
              workerAvailability={workerAvailability}
              disabled={!canResumeInBrowser}
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
              <h2>{t("library.selection.receiving")}</h2>
              <p role="status" className="muted">
                {libraryState === "loading"
                  ? t("library.selection.loading")
                  : (connected && workerRow) ||
                      awaitingCreated.current === selected
                    ? t("library.selection.waiting")
                    : t("library.selection.notFound")}
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
        {t("library.workspace.footer")}
      </footer>
    </FactoryShell>
  );
}
