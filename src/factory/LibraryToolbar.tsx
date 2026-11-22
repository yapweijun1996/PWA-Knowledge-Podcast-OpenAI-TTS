import { languages } from "../../shared/factory";
import { episodeStatuses, type LibraryControls } from "./library-model";

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
  return (
    <div className="library-toolbar" role="search" aria-label="搜索节目资料库">
      <label className="library-field library-search">
        搜索节目
        <input
          id="library-search"
          type="search"
          placeholder="标题、主题或语言"
          value={controls.query}
          onChange={(event) =>
            onChange({ ...controls, query: event.target.value })
          }
        />
      </label>
      <label className="library-field">
        制作状态
        <select
          value={controls.status}
          onChange={(event) =>
            onChange({
              ...controls,
              status: event.target.value as LibraryControls["status"],
            })
          }
        >
          <option value="">所有状态</option>
          {Object.entries(episodeStatuses).map(([value, label]) =>
            value === "checking" ? null : (
              <option key={value} value={value}>
                {label}
              </option>
            ),
          )}
        </select>
      </label>
      <label className="library-field">
        语言
        <select
          value={controls.language}
          onChange={(event) =>
            onChange({
              ...controls,
              language: event.target.value as LibraryControls["language"],
            })
          }
        >
          <option value="">所有语言</option>
          {Object.entries(languages).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="library-field">
        排序
        <select
          value={controls.sort}
          onChange={(event) =>
            onChange({
              ...controls,
              sort: event.target.value as LibraryControls["sort"],
            })
          }
        >
          <option value="newest">最近更新</option>
          <option value="oldest">最早更新</option>
          <option value="title">按标题</option>
        </select>
      </label>
      <div className="library-toolbar-actions">
        {onReset && (
          <button type="button" className="library-reset" onClick={onReset}>
            重置搜索与筛选
          </button>
        )}
        <button
          type="button"
          className="library-primary"
          disabled={busy}
          onClick={onCreate}
        >
          <span aria-hidden="true">＋</span> 新建节目
        </button>
      </div>
    </div>
  );
}
