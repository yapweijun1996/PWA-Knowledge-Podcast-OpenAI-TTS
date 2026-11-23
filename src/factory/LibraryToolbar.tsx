import { useI18n } from "../i18n";
import {
  episodeStatuses,
  languageNameKeys,
  type LibraryControls,
} from "./library-model";

export function LibraryToolbar({
  controls,
  onChange,
  onReset,
  onCreate,
  busy,
}: {
  controls: LibraryControls;
  onChange: (controls: LibraryControls) => void;
  onReset?: () => void;
  onCreate: () => void;
  busy: boolean;
}) {
  const { t } = useI18n();
  return (
    <div
      className="library-toolbar"
      role="search"
      aria-label={t("library.toolbar.label")}
    >
      <label className="library-field library-search">
        {t("library.toolbar.search")}
        <input
          id="library-search"
          type="search"
          placeholder={t("library.toolbar.searchPlaceholder")}
          value={controls.query}
          onChange={(event) =>
            onChange({ ...controls, query: event.target.value })
          }
        />
      </label>
      <label className="library-field">
        {t("library.toolbar.status")}
        <select
          value={controls.status}
          onChange={(event) =>
            onChange({
              ...controls,
              status: event.target.value as LibraryControls["status"],
            })
          }
        >
          <option value="">{t("library.toolbar.allStatuses")}</option>
          {Object.entries(episodeStatuses).map(([value, label]) =>
            value === "checking" ? null : (
              <option key={value} value={value}>
                {t(label)}
              </option>
            ),
          )}
        </select>
      </label>
      <label className="library-field">
        {t("library.toolbar.language")}
        <select
          value={controls.language}
          onChange={(event) =>
            onChange({
              ...controls,
              language: event.target.value as LibraryControls["language"],
            })
          }
        >
          <option value="">{t("library.toolbar.allLanguages")}</option>
          {Object.entries(languageNameKeys).map(([value, label]) => (
            <option key={value} value={value}>
              {t(label)}
            </option>
          ))}
        </select>
      </label>
      <label className="library-field">
        {t("library.toolbar.sort")}
        <select
          value={controls.sort}
          onChange={(event) =>
            onChange({
              ...controls,
              sort: event.target.value as LibraryControls["sort"],
            })
          }
        >
          <option value="newest">{t("library.toolbar.newest")}</option>
          <option value="oldest">{t("library.toolbar.oldest")}</option>
          <option value="title">{t("library.toolbar.byTitle")}</option>
        </select>
      </label>
      <div className="library-toolbar-actions">
        {onReset && (
          <button type="button" className="library-reset" onClick={onReset}>
            {t("library.toolbar.reset")}
          </button>
        )}
        <button
          type="button"
          className="library-primary"
          disabled={busy}
          onClick={onCreate}
        >
          <span aria-hidden="true">＋</span>{" "}
          {t("library.toolbar.create")}
        </button>
      </div>
    </div>
  );
}
