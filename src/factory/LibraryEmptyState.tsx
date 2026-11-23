import { useI18n } from "../i18n";

export function LibraryEmptyState({
  filtered,
  busy,
  onAction,
}: {
  filtered: boolean;
  busy: boolean;
  onAction: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="library-empty">
      <span className="library-empty-mark" aria-hidden="true">
        ▥
      </span>
      <h2>
        {t(filtered ? "library.empty.noMatches" : "library.empty.noEpisodes")}
      </h2>
      <p>
        {t(
          filtered ? "library.empty.changeFilters" : "library.empty.getStarted",
        )}
      </p>
      <button
        type="button"
        className={filtered ? "library-reset" : "library-primary"}
        disabled={!filtered && busy}
        onClick={onAction}
      >
        {t(filtered ? "library.toolbar.reset" : "library.toolbar.create")}
      </button>
    </div>
  );
}
