import { useMemo, useState, type ReactNode } from "react";
import type { EpisodeSummary } from "../../shared/factory";
import { EpisodeCard } from "./EpisodeCard";
import { LibraryEmptyState } from "./LibraryEmptyState";
import { LibraryToolbar } from "./LibraryToolbar";
import type { Record as LibraryRecord } from "./library";
import {
  defaultLibraryControls,
  episodeState,
  visibleEpisodes,
  type AudioCheck,
} from "./library-model";
import "./library.css";

export function LibraryWorkspace({
  records,
  liveEpisodes,
  getAudio,
  loadState,
  selected,
  hidden,
  busy,
  onCreate,
  onOpen,
  children,
}: {
  records: LibraryRecord[];
  liveEpisodes?: EpisodeSummary[];
  getAudio: (record: LibraryRecord) => AudioCheck;
  loadState: "loading" | "ready" | "unavailable";
  selected: string | null;
  hidden: boolean;
  busy: boolean;
  onCreate: () => void;
  onOpen: (id: string, target: "episode-title" | "audio-title") => void;
  children: ReactNode;
}) {
  const [controls, setControls] = useState(defaultLibraryControls);
  const entries = useMemo(() => {
    const workers = new Map(
      liveEpisodes?.map((episode) => [episode.id, episode]),
    );
    return records.map((record) => {
      const { episode } = record;
      const audio = getAudio(record);
      return {
        episode,
        audio,
        ...episodeState(episode, audio, workers.get(episode.id)),
      };
    });
  }, [records, liveEpisodes, getAudio]);
  const results = useMemo(
    () => visibleEpisodes(entries, controls),
    [entries, controls],
  );
  const resettable =
    controls.query !== "" ||
    !!controls.status ||
    !!controls.language ||
    controls.sort !== "newest";

  function reset() {
    setControls(defaultLibraryControls);
    document.getElementById("library-search")?.focus();
  }

  return (
    <aside
      className="library-workspace"
      aria-label="浏览器节目"
      hidden={hidden}
    >
      {loadState !== "ready" && (
        <p className="library-result-count" role="status">
          {loadState === "loading"
            ? "正在读取本地节目…"
            : "暂时无法读取本地节目。"}
        </p>
      )}
      {loadState === "ready" &&
        (records.length ? (
          <>
            <LibraryToolbar
              controls={controls}
              onChange={setControls}
              onReset={resettable && results.length ? reset : undefined}
              onCreate={onCreate}
              busy={busy}
            />
            <p
              className="library-result-count"
              role="status"
              aria-atomic="true"
            >
              {results.length === records.length
                ? `${records.length} 期节目`
                : `${results.length} 期符合条件，共 ${records.length} 期节目`}
            </p>
            {results.length ? (
              <ul className="library-grid" role="list" aria-label="节目列表">
                {results.map((entry) => (
                  <li key={entry.episode.id}>
                    <EpisodeCard
                      entry={entry}
                      selected={selected === entry.episode.id}
                      busy={busy}
                      onOpen={onOpen}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <LibraryEmptyState filtered busy={busy} onAction={reset} />
            )}
          </>
        ) : (
          <LibraryEmptyState filtered={false} busy={busy} onAction={onCreate} />
        ))}
      <div className="library-storage">{children}</div>
    </aside>
  );
}
