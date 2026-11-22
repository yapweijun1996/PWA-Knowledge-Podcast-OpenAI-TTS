export function LibraryEmptyState({
  filtered,
  busy,
  onAction,
}: {
  filtered: boolean;
  busy: boolean;
  onAction: () => void;
}) {
  return (
    <div className="library-empty">
      <span className="library-empty-mark" aria-hidden="true">
        ▥
      </span>
      <h2>{filtered ? "找不到符合条件的节目" : "此浏览器尚无节目。"}</h2>
      <p>
        {filtered
          ? "试试其他标题、主题或语言，或清除筛选条件。"
          : "从一个主题开始制作，或恢复已有的节目备份。"}
      </p>
      <button
        type="button"
        className={filtered ? "library-reset" : "library-primary"}
        disabled={!filtered && busy}
        onClick={onAction}
      >
        {filtered ? "重置搜索与筛选" : "新建节目"}
      </button>
    </div>
  );
}
