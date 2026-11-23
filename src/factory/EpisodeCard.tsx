import { useI18n } from "../i18n";
import { episodeLanguageTags } from "./Evidence";
import {
  audioClock,
  episodeStatuses,
  episodeTitle,
  languageNameKeys,
  stageNameKeys,
  type LibraryEntry,
} from "./library-model";

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
  const { t, formatters } = useI18n();
  const { episode, status, audioStatus, stage, audio } = entry;
  const title = episodeTitle(episode);
  const lang = episodeLanguageTags[episode.language];
  const metaId = `episode-card-meta-${episode.id}`;
  const statusLabel = t(episodeStatuses[status]);
  return (
    <article className="library-card" data-selected={selected}>
      <div className="library-card-mark" aria-hidden="true">
        {episode.language}
      </div>
      <div className="library-card-content">
        <h2 lang={lang} dir="auto">
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
          <p className="library-card-topic" lang={lang} dir="auto">
            {episode.topic}
          </p>
        )}
        <div id={metaId} className="library-card-meta">
          <div className="library-card-statuses">
            <span className="library-card-status" data-status={status}>
              {stage
                ? t("library.card.stageStatus", {
                    status: statusLabel,
                    stage: t(stageNameKeys[stage]),
                  })
                : statusLabel}
            </span>
            {audioStatus && (
              <span className="library-card-status" data-status={audioStatus}>
                {t(episodeStatuses[audioStatus])}
              </span>
            )}
          </div>
          <div className="library-card-facts">
            <span>{t(languageNameKeys[episode.language])}</span>
            <time dateTime={episode.updated}>
              {t("library.card.updated", {
                date: formatters.dateTime(Date.parse(episode.updated), {
                  dateStyle: "medium",
                }),
              })}
            </time>
            {audio && (
              <span>
                {t("library.card.duration")}{" "}
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
            aria-label={t("library.card.openAudioFor", { title })}
            data-user-content-label=""
            aria-controls="factory-selection"
            disabled={busy}
            onClick={() => onOpen(episode.id, "audio-title")}
          >
            {t("library.card.openAudio")} <span aria-hidden="true">↗</span>
          </button>
        )}
      </div>
    </article>
  );
}
