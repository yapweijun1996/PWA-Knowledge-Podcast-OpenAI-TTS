import type { Episode, Research } from "../../shared/factory";
import { useI18n } from "../i18n";

const claimStateKeys = {
  supported: "episode.evidence.supported",
  qualified: "episode.evidence.qualified",
  disputed: "episode.evidence.disputed",
} as const;

function evidenceDate(
  date: string,
  { locale, formatters }: ReturnType<typeof useI18n>,
) {
  if (locale === "zh-CN" || !/^\d{4}-\d{2}-\d{2}$/u.test(date)) return date;
  const time = Date.parse(date);
  return Number.isFinite(time)
    ? formatters.dateTime(time, { dateStyle: "medium", timeZone: "UTC" })
    : date;
}

export function Claims({
  research,
  ids,
}: {
  research: Research;
  ids: string[];
}) {
  const i18n = useI18n();
  const { t } = i18n;
  return (
    <ul className="factory-claims">
      {ids.map((id) => {
        const claim = research.claims.find((entry) => entry.id === id);
        if (!claim) return null;
        return (
          <li key={id}>
            <span className="factory-tag">
              {t(claimStateKeys[claim.status])}
            </span>
            <p>{claim.text}</p>
            {claim.crossCheck && (
              <small className="factory-evidence-check">
                {t(
                  claim.crossCheck === "independent-domains"
                    ? "episode.evidence.independentDomains"
                    : "episode.evidence.limitedCrossCheck",
                )}
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
                      <small>
                        {source.published == null
                          ? t("episode.evidence.unknownDate")
                          : evidenceDate(source.published, i18n)}
                      </small>
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
  const i18n = useI18n();
  const { t, formatters } = i18n;
  const research = episode.research ?? episode.researchDraft;
  const { outline } = episode;
  if (!research) return null;
  return (
    <>
      <details className="factory-panel" open={!episode.script}>
        <summary>
          {t(
            episode.research
              ? "episode.evidence.research"
              : "episode.evidence.preliminary",
          )}{" "}
          <span>
            {formatters.plural(
              "episode.evidence.summary",
              research.claims.length,
              {
                sources: formatters.plural(
                  "episode.evidence.sources",
                  research.sources.length,
                ),
              },
            )}
          </span>
        </summary>
        <p className="muted">
          {t(
            research.auditModel
              ? "episode.evidence.searchedWithAudit"
              : "episode.evidence.searched",
            {
              date: evidenceDate(research.searchedAt.slice(0, 10), i18n),
            },
          )}
        </p>
        <Claims research={research} ids={research.claims.map(({ id }) => id)} />
      </details>
      {outline && (
        <details className="factory-panel" open={!episode.script}>
          <summary>
            {t("episode.evidence.outline")}{" "}
            <span>
              {formatters.plural(
                "episode.evidence.chapters",
                outline.chapters.length,
              )}
            </span>
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
  const { t } = useI18n();
  const ids = new Set(
    research.claims
      .filter((claim) => claimIds.includes(claim.id))
      .flatMap((claim) => claim.sourceIds),
  );
  return (
    <div
      className="factory-citations"
      aria-label={t("episode.evidence.segmentSources")}
    >
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
