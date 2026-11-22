import type { Episode, Research } from "../../shared/factory";

const claimState = {
  supported: "有来源支持",
  qualified: "适用范围有限",
  disputed: "来源有分歧",
};

export function Claims({
  research,
  ids,
}: {
  research: Research;
  ids: string[];
}) {
  return (
    <ul className="factory-claims">
      {ids.map((id) => {
        const claim = research.claims.find((entry) => entry.id === id);
        if (!claim) return null;
        return (
          <li key={id}>
            <span className="factory-tag">{claimState[claim.status]}</span>
            <p>{claim.text}</p>
            {claim.crossCheck && (
              <small className="factory-evidence-check">
                {claim.crossCheck === "independent-domains"
                  ? "交叉检索有不同来源域名"
                  : "交叉检索结果有限"}
              </small>
            )}
            <small>{claim.uncertainty}</small>
            <div className="factory-citations">
              {claim.sourceIds.map((sourceId) => {
                const source = research.sources.find(
                  (entry) => entry.id === sourceId,
                );
                return (
                  source && (
                    <a
                      key={sourceId}
                      href={source.url}
                      rel="noreferrer noopener"
                      target="_blank"
                    >
                      {source.title}{" "}
                      <small>{source.published ?? "日期未知"}</small>
                    </a>
                  )
                );
              })}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function Evidence({ episode }: { episode: Episode }) {
  const research = episode.research ?? episode.researchDraft;
  const { outline } = episode;
  if (!research) return null;
  return (
    <>
      <details className="factory-panel" open={!episode.script}>
        <summary>
          {episode.research ? "研究与来源" : "初步研究 · 等待交叉检索"}{" "}
          <span>
            {research.claims.length} 条主张 · {research.sources.length} 个来源
          </span>
        </summary>
        <p className="muted">
          搜索于 {research.searchedAt.slice(0, 10)}
          。发布日期由模型从页面提取，请查阅原文。
          {research.auditModel &&
            " 已独立发起第二轮检索。不同域名仍可能引用同一底层资料。"}
        </p>
        <Claims research={research} ids={research.claims.map(({ id }) => id)} />
      </details>
      {outline && (
        <details className="factory-panel" open={!episode.script}>
          <summary>
            有据可查的节目大纲 <span>{outline.chapters.length} 章</span>
          </summary>
          <ol className="factory-outline">
            {outline.chapters.map((chapter) => (
              <li key={chapter.id}>
                <strong>{chapter.title}</strong>
                <p>{chapter.angle}</p>
                <Claims research={research} ids={chapter.claimIds} />
              </li>
            ))}
          </ol>
        </details>
      )}
    </>
  );
}

export function InlineSources({
  research,
  claimIds,
}: {
  research: Research;
  claimIds: string[];
}) {
  const ids = new Set(
    research.claims
      .filter((claim) => claimIds.includes(claim.id))
      .flatMap((claim) => claim.sourceIds),
  );
  return (
    <div className="factory-citations" aria-label="此段来源">
      {research.sources
        .filter((source) => ids.has(source.id))
        .map((source) => (
          <a
            key={source.id}
            href={source.url}
            rel="noreferrer noopener"
            target="_blank"
          >
            {source.title}
          </a>
        ))}
    </div>
  );
}
