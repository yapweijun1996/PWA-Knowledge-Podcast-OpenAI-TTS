import { useRef, useState, useSyncExternalStore } from "react";
import type { Preferences } from "../../shared/factory.ts";
import { productionBounds } from "../../shared/preferences.ts";
import { hasKey, subscribe } from "./browser-key.ts";
import { generateNarration, REALTIME_MODEL } from "./browser-narrator.ts";
import {
  createBrowserProduction,
  estimateBrowserProduction,
} from "./browser-production.ts";
import type * as Library from "./library.ts";

type Runner = ReturnType<typeof createBrowserProduction>;
type Start = Omit<Parameters<Runner["start"]>[0], "signal"> & { id: string };
type Resume = Omit<Parameters<Runner["resume"]>[0], "signal">;
export type BrowserEstimate = ReturnType<typeof estimateBrowserProduction>;
type Progress = Parameters<
  NonNullable<Parameters<typeof createBrowserProduction>[0]["onProgress"]>
>[0];

export type WorkerAvailability =
  "offline" | "no-worker" | "locked" | "no-key" | "working" | "ready";
export type StudioAvailability = WorkerAvailability | "ready-browser";
export type StudioMode = "browser" | "worker";

export function studioProductionMode(
  keySet: boolean,
  worker: WorkerAvailability,
  target: StudioMode,
) {
  const chooseMode = keySet && (worker === "ready" || worker === "working");
  const mode: StudioMode =
    keySet && (!chooseMode || target === "browser") ? "browser" : "worker";
  const availability: StudioAvailability =
    worker !== "offline" && mode === "browser" ? "ready-browser" : worker;
  return { mode, chooseMode, availability };
}

export function canResumeBrowserProduction({
  resumable,
  browserAvailable,
  blocked,
}: {
  resumable: boolean;
  browserAvailable: boolean;
  blocked: boolean;
}) {
  return resumable && browserAvailable && !blocked;
}

export function browserProductionBounds(prefs: Preferences, exactHosts?: 2) {
  const bounds = productionBounds(prefs);
  return exactHosts ? { ...bounds, exactHosts, maxHosts: exactHosts } : bounds;
}

export function browserCheckpoint(row: Library.Record) {
  const { episode } = row;
  if (row.edited || episode.syncToken || !episode.production) return false;
  if (episode.finished?.revision === episode.revision)
    return !episode.finished.transcript;
  return (
    !episode.render ||
    (episode.render.model === REALTIME_MODEL &&
      episode.render.revision === episode.revision)
  );
}

export function useBrowserProduction(
  library: Pick<typeof Library, "listRecords" | "receive">,
) {
  const keySet = useSyncExternalStore(subscribe, hasKey);
  const controller = useRef<AbortController | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<BrowserEstimate>();
  const [progress, setProgress] = useState<Progress>();
  const [cancelling, setCancelling] = useState(false);
  const [runner] = useState(() =>
    createBrowserProduction({
      fetcher: globalThis.fetch.bind(globalThis),
      narrate: generateNarration,
      library,
      onEstimate: setEstimate,
      onProgress: setProgress,
    }),
  );

  async function run(options: Start | Resume) {
    const abort = new AbortController();
    controller.current = abort;
    setActiveId(options.id);
    try {
      const request = { ...options, signal: abort.signal };
      return await ("topic" in request
        ? runner.start(request)
        : runner.resume(request));
    } finally {
      controller.current = null;
      setActiveId(null);
      setProgress(undefined);
      setEstimate(undefined);
      setCancelling(false);
    }
  }

  function cancel() {
    if (!controller.current) return;
    controller.current.abort();
    setCancelling(true);
  }

  return { keySet, run, cancel, activeId, estimate, progress, cancelling };
}
