import type { Claim, Research, Source } from "../factory.ts";
import type { OutputText, URLCitation } from "./openai.ts";

type CitedSource = Pick<Source, "url" | "title"> & {
  dates: Set<string | null>;
};
type PendingClaim = Pick<Claim, "text" | "uncertainty" | "status"> & {
  urls: string[];
};

function safeURL(raw: string) {
  try {
    const url = new URL(raw);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.href.length > 1500
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}

function clean(text: string) {
  return text
    .replace(/\(?\[[^\]\n]*\]\(https?:\/\/[^\s]+?\)\)?/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .trim();
}

function publicationDate(raw: string, searchedAt: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = new Date(raw);
  return Number.isNaN(+date) ||
    date.toISOString().slice(0, 10) !== raw ||
    raw > searchedAt.slice(0, 10)
    ? null
    : raw;
}

export function collectEvidence(
  parts: readonly OutputText[],
  searchedAt: string,
  model: string,
): Research {
  const sources = new Map<string, CitedSource>();
  const pendingClaims: PendingClaim[] = [];
  for (const part of parts) {
    let offset = 0;
    for (const line of part.text.split("\n")) {
      const end = offset + [...line].length;
      const annotations = (part.annotations ?? []).filter(
        (item): item is URLCitation =>
          item.type === "url_citation" &&
          Number.isInteger(item.start_index) &&
          Number.isInteger(item.end_index) &&
          item.start_index >= offset &&
          item.end_index <= end &&
          item.end_index > item.start_index,
      );
      offset = end + 1;
      const dateLine = /^SOURCE\s+(\d{4}-\d{2}-\d{2}|unknown)\s*\|/i.exec(line);
      const claimLine =
        /^CLAIM\s+(supported|qualified|disputed)\s*\|([^|]+)\|(.+)/i.exec(line);
      if ((!dateLine && !claimLine) || !annotations.length) continue;
      const urls = new Set<string>();
      for (const annotation of annotations) {
        const url = safeURL(annotation.url);
        if (!url) continue;
        if (!sources.has(url)) {
          sources.set(url, {
            url,
            title:
              annotation.title?.trim().slice(0, 240) || new URL(url).hostname,
            dates: new Set(),
          });
        }
        urls.add(url);
      }
      if (dateLine && urls.size === 1)
        sources
          .get([...urls][0])!
          .dates.add(publicationDate(dateLine[1], searchedAt));
      if (claimLine && urls.size && pendingClaims.length < 12) {
        const text = clean(claimLine[2]).slice(0, 450);
        const uncertainty = clean(claimLine[3]).slice(0, 400);
        if (text && uncertainty)
          pendingClaims.push({
            text,
            uncertainty,
            status: claimLine[1].toLowerCase() as Claim["status"],
            urls: [...urls].slice(0, 4),
          });
      }
    }
  }
  const used = [...new Set(pendingClaims.flatMap((claim) => claim.urls))];
  const ids = new Map(used.map((url, index) => [url, `S${index + 1}`]));
  return {
    searchedAt,
    model,
    sources: used.map((url) => {
      const source = sources.get(url)!;
      return {
        id: ids.get(url)!,
        url,
        title: source.title,
        published: source.dates.size === 1 ? [...source.dates][0] : null,
      };
    }),
    claims: pendingClaims.map(({ urls, ...claim }, index) => ({
      ...claim,
      id: `C${index + 1}`,
      sourceIds: urls.map((url) => ids.get(url)!),
    })),
  };
}
