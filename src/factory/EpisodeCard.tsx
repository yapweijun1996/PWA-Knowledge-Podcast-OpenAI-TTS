import { languages } from "../../shared/factory";
import {
  audioClock,
  episodeStatuses,
  episodeTitle,
  stageNames,
  type LibraryEntry,
} from "./library-model";

const dates = new Intl.DateTimeFormat("zh", { dateStyle: "medium" });

export function EpisodeCard({
  entry,
  selected,
  busy,
  onOpen,
}: {
  entry: LibraryEntry;
  selected: boolean;
  busy: boolean;
  onOpen: (id: string, target: "episode-title" | "audio-title") => void;
}) {
  const { episode, status, audioStatus, stage, audio } = entry;
  const title = episodeTitle(episode);
  const metaId = `episode-card-meta-${episode.id}`;
  return (
    <article className="library-card" data-selected={selected}>
      <div className="library-card-mark" aria-hidden="true">
        {episode.language}
      </div>
      <div className="library-card-content">
        <h2
          lang={episode.language === "sg" ? undefined : episode.language}
          dir="auto"
        >
          <button
            type="button"
            className="library-card-open"
            disabled={busy}
            aria-current={selected ? "true" : undefined}
            aria-controls="factory-selection"
            aria-describedby={metaId}
            onClick={() => onOpen(episode.id, "episode-title")}
          >
            {title}
          </button>
        </h2>
        {episode.topic !== title && (
          <p className="library-card-topic" dir="auto">
            {episode.topic}
          </p>
        )}
        <div id={metaId} className="library-card-meta">
          <div className="library-card-statuses">
            <span className="library-card-status" data-status={status}>
              {episodeStatuses[status]}
              {stage && ` · ${stageNames[stage]}`}
            </span>
            {audioStatus && (
              <span className="library-card-status" data-status={audioStatus}>
                {episodeStatuses[audioStatus]}
              </span>
            )}
          </div>
          <div className="library-card-facts">
            <span>{languages[episode.language]}</span>
            <time dateTime={episode.updated}>
              更新于 {dates.format(Date.parse(episode.updated))}
            </time>
            {audio && (
              <span>
                时长{" "}
                <time dateTime={`PT${audio.duration}S`}>
                  {audioClock(audio.duration)}
                </time>
              </span>
            )}
          </div>
        </div>
        {audio && (
          <button
            type="button"
            className="library-card-audio"
            aria-label={`前往音频 · ${title}`}
            aria-controls="factory-selection"
            disabled={busy}
            onClick={() => onOpen(episode.id, "audio-title")}
          >
            前往音频 <span aria-hidden="true">↗</span>
          </button>
        )}
      </div>
    </article>
  );
}
