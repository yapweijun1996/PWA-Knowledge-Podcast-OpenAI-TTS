type TextMeasurer = {
  measureText(text: string): {
    width: number;
    actualBoundingBoxLeft?: number;
    actualBoundingBoxRight?: number;
  };
};

export type TextLimits = readonly [
  maxLines: number,
  cjkPerLine: number,
  latinPerLine: number,
];

const eastAsian =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\u3000-\u303f\uff01-\uff60]/u;
const opening = /^[\p{Ps}\p{Pi}]/u;
const closing = /^[\p{Pe}\p{Pf},.!?:;%、。，．・：；？！…]/u;
const housingPhrase = /\u7ec4\u5c4b\u91cc/gu;
const clauseEnd = /[.!?。！？；;，,、：:][\p{Pe}\p{Pf}"']*$/u;
const singleHan = /^\p{Script=Han}\p{M}*$/u;
const segmenters = new Map<string, Intl.Segmenter>();

export function normalizeDisplayText(text: string) {
  return text.trim().replace(/\s+/gu, " ");
}

function segments(
  text: string,
  locale: string,
  granularity: "word" | "grapheme",
) {
  if (typeof Intl.Segmenter === "function") {
    const key = `${locale}:${granularity}`;
    let segmenter = segmenters.get(key);
    if (!segmenter) {
      segmenter = new Intl.Segmenter(locale, { granularity });
      segmenters.set(key, segmenter);
    }
    return [...segmenter.segment(text)];
  }
  // Keep code points and combining marks together when Segmenter is missing.
  const pattern =
    granularity === "grapheme"
      ? /\P{M}\p{M}*|\p{M}+/gu
      : /[\p{L}\p{M}\p{N}]+|[^\p{L}\p{M}\p{N}]/gu;
  return [...text.matchAll(pattern)].map((match) => ({
    segment: match[0],
    index: match.index,
  }));
}

export function displayTextCounts(text: string, locale = "en") {
  let cjk = 0;
  let latin = 0;
  for (const { segment } of segments(text, locale, "grapheme")) {
    if (eastAsian.test(segment)) cjk++;
    else latin++;
  }
  return { cjk, latin };
}

export function withinTextLimit(
  text: string,
  cjkLimit: number,
  latinLimit: number,
  locale?: string,
) {
  const { cjk, latin } = displayTextCounts(text, locale);
  return cjk ? cjk + latin / 2 <= cjkLimit : latin <= latinLimit;
}

export function displayWordCount(text: string, locale: string) {
  return segments(text, locale, "word").filter(
    ({ segment }) => /[\p{L}\p{N}]/u.test(segment) && !eastAsian.test(segment),
  ).length;
}

/** Rejoin captions from older plans that contain only pre-wrapped lines. */
export function joinCaptionLines(lines: readonly string[]) {
  return lines.reduce((cue, line) => {
    if (!cue) return line;
    const before = Array.from(cue).at(-1) ?? "";
    const after = String.fromCodePoint(line.codePointAt(0) ?? 32);
    const joinDirectly =
      (eastAsian.test(before) && eastAsian.test(after)) ||
      opening.test(before) ||
      closing.test(after);
    return cue + (joinDirectly ? "" : " ") + line;
  }, "");
}

type WrapOptions = {
  locale?: string;
  limits?: TextLimits;
  keepTogether?: readonly string[];
  total?: { cjk: number; latinWords: number };
};

type Line = { end: number; text: string; slack: number; finalOrphan: boolean };
export type TextPage = { text: string; lines: string[] };

function protectedRanges(text: string, phrases: readonly string[]) {
  const ranges: [number, number][] = [];
  // Titles and abbreviations, proper names, and common number/unit forms.
  const groups =
    /(?:\b(?:[A-Z]\.){2,}|\b(?:e\.g\.|i\.e\.|etc\.))|\b(?:Mr|Ms|Mrs|Dr|Prof|St)\. +\p{Lu}[\p{L}\p{M}'’-]*|(?<![\p{L}])\p{Lu}[\p{Ll}\p{M}'’-]+(?: +\p{Lu}[\p{Ll}\p{M}'’-]+){1,2}|(?:[$£€¥]|(?:S|US)\$)?\d+(?:[.,]\d+)*(?: ?(?:[%°℃元年月日公斤米秒]|(?:km\/h|m\/s|mm|cm|km|kg|mg|ml|kWh|Hz|MHz|GB|MB|USD|SGD|MYR|m|g|s|h)\b))?/gu;
  for (const match of [
    ...text.matchAll(groups),
    ...text.matchAll(housingPhrase),
  ]) {
    ranges.push([match.index, match.index + match[0].length]);
  }
  for (const raw of phrases) {
    const phrase = normalizeDisplayText(raw);
    if (!phrase) continue;
    for (
      let start = text.indexOf(phrase);
      start >= 0;
      start = text.indexOf(phrase, start + phrase.length)
    ) {
      ranges.push([start, start + phrase.length]);
    }
  }
  return ranges;
}

function breakOffsets(
  text: string,
  locale: string,
  phrases: readonly string[],
  useCjkWords: boolean,
) {
  const words = new Set(
    segments(text, locale, "word").map(({ index }) => index),
  );
  const characters = segments(text, locale, "grapheme").filter(
    ({ segment }) => segment !== " ",
  );
  const protectedWords = protectedRanges(text, phrases);
  const preferred = [0];
  const fallback = [0];
  for (let index = 1; index < characters.length; index++) {
    const before = characters[index - 1];
    const after = characters[index];
    if (opening.test(before.segment) || closing.test(after.segment)) continue;
    fallback.push(after.index);
    const space = before.index + before.segment.length < after.index;
    const cjk = eastAsian.test(before.segment) || eastAsian.test(after.segment);
    if (
      (space ||
        (cjk && (!useCjkWords || !Intl.Segmenter || words.has(after.index))) ||
        (words.has(after.index) && /[\p{Pe}\p{Pf}]/u.test(before.segment))) &&
      !protectedWords.some(
        ([start, end]) => start < after.index && after.index < end,
      )
    ) {
      preferred.push(after.index);
    }
  }
  preferred.push(text.length);
  fallback.push(text.length);
  return { preferred, fallback };
}

function textWidth(context: TextMeasurer, line: string) {
  const metrics = context.measureText(line);
  return Math.max(
    metrics.width,
    (metrics.actualBoundingBoxLeft ?? 0) +
      (metrics.actualBoundingBoxRight ?? 0),
  );
}

function isOrphan(line: string) {
  const content = line.replace(/^[\p{P}\s]+|[\p{P}\s]+$/gu, "");
  return !content || singleHan.test(content);
}

/** Balance measured lines at legal breaks. An indivisible word can exceed maxWidth. */
export function wrapText(
  context: TextMeasurer,
  text: string,
  maxWidth: number,
  locale?: string,
  maxLines = Infinity,
): string[] {
  const pages = layout(
    context,
    text,
    maxWidth,
    { locale },
    maxLines,
    false,
    false,
  );
  return pages[0]?.lines ?? [];
}

/** Fit a display role to both its grapheme budget and its measured ink width. */
export function wrapDisplayText(
  context: TextMeasurer,
  text: string,
  maxWidth: number,
  options: WrapOptions & { limits: TextLimits },
  truncate = true,
): string[] {
  return (
    layout(
      context,
      text,
      maxWidth,
      options,
      options.limits[0],
      false,
      !truncate,
    )[0]?.lines ?? []
  );
}

/** Preserve the source across as many bounded two-line cues as needed. */
export function paginateText(
  context: TextMeasurer,
  text: string,
  maxWidth: number,
  options: WrapOptions & { limits: TextLimits },
): TextPage[] {
  return layout(
    context,
    text,
    maxWidth,
    options,
    options.limits[0],
    true,
    false,
  );
}

function layout(
  context: TextMeasurer,
  raw: string,
  maxWidth: number,
  options: WrapOptions,
  maxLines: number,
  paginate: boolean,
  requireFull: boolean,
): TextPage[] {
  const text = normalizeDisplayText(raw);
  if (!text || maxLines < 1) return [];
  const locale = eastAsian.test(text) ? "zh-CN" : (options.locale ?? "en");
  const limits = options.limits;
  function fit(line: string, width: number) {
    return (
      width <= maxWidth &&
      (!limits || withinTextLimit(line, limits[1], limits[2], locale))
    );
  }
  const total = options.total;
  const counts = total && displayTextCounts(text, locale);
  const fitsTotal =
    !total ||
    !counts ||
    (counts.cjk
      ? counts.cjk + counts.latin / 2 <= total.cjk
      : displayWordCount(text, locale) <= total.latinWords);
  if (fitsTotal && fit(text, textWidth(context, text)))
    return [{ text, lines: [text] }];

  const { preferred, fallback } = breakOffsets(
    text,
    locale,
    options.keepTogether ?? [],
    !!limits,
  );
  const at = (start: number, end: number) => text.slice(start, end).trimEnd();
  // An overlong atom needs grapheme breaks for captions. Prefer all word and
  // phrase boundaries that do fit and keep them intact in shorter display roles.
  const extra = new Set<number>();
  if (paginate || limits) {
    for (let index = 1; index < preferred.length; index++) {
      const start = preferred[index - 1];
      const end = preferred[index];
      const atom = at(start, end);
      if (!fit(atom, textWidth(context, atom))) {
        for (const point of fallback) {
          if (start < point && point < end) extra.add(point);
        }
      }
    }
  }
  const points = [...preferred, ...extra].sort((a, b) => a - b);
  const last = points.length - 1;
  const choices: Line[][] = [];
  for (let start = 0; start < last; start++) {
    const lines: Line[] = [];
    for (let end = start + 1; end <= last; end++) {
      const line = at(points[start], points[end]);
      const width = textWidth(context, line);
      if (!fit(line, width)) {
        if (end > start + 1 || (limits && !paginate)) break;
        // Preserve an indivisible grapheme or legacy oversized token.
        lines.push({
          end,
          text: line,
          slack: (maxWidth - width) ** 2,
          finalOrphan: isOrphan(line),
        });
        break;
      }
      if (!opening.test(line) || !/^[\p{P}\s]+$/u.test(line)) {
        lines.push({
          end,
          text: line,
          slack: (maxWidth - width) ** 2,
          finalOrphan: isOrphan(line),
        });
      }
    }
    choices.push(lines);
  }

  const penalty = Math.max(1, maxWidth ** 2);
  const lineCost = (line: Line) =>
    line.slack + (extra.has(points[line.end]) ? penalty : 0);

  if (paginate) {
    type PageSolution = {
      lines: Line[];
      end: number;
      count: number;
      cost: number;
    };
    const best: (PageSolution | undefined)[] = [];
    for (let start = last - 1; start >= 0; start--) {
      function consider(lines: Line[], line: Line, cost: number) {
        const tail = best[line.end];
        if (line.end < last && !tail) return;
        const count = 1 + (tail?.count ?? 0);
        const score =
          cost +
          (tail?.cost ?? 0) +
          (line.finalOrphan ? 2 * penalty : 0) +
          (line.end < last && !clauseEnd.test(line.text) ? 0.12 * penalty : 0);
        const before = best[start];
        if (
          !before ||
          count < before.count ||
          (count === before.count && score < before.cost)
        ) {
          best[start] = { lines, end: line.end, count, cost: score };
        }
      }
      for (const first of choices[start]) {
        consider([first], first, lineCost(first));
        if (maxLines < 2 || first.end >= last) continue;
        for (const second of choices[first.end]) {
          if (!second.finalOrphan)
            consider(
              [first, second],
              second,
              lineCost(first) + lineCost(second),
            );
        }
      }
    }
    const pages: TextPage[] = [];
    for (let start = 0; start < last;) {
      const page = best[start];
      if (!page) break;
      pages.push({
        text: at(points[start], points[page.end]),
        lines: page.lines.map((line) => line.text),
      });
      start = page.end;
    }
    return pages;
  }

  type Solution = {
    line: Line;
    tail?: Solution;
    count: number;
    cost: number;
    orphan: boolean;
  };
  const best: (Solution | undefined)[] = [];
  for (let start = last - 1; start >= 0; start--) {
    for (const line of choices[start]) {
      const tail = best[line.end];
      if (line.end < last && !tail) continue;
      const count = 1 + (tail?.count ?? 0);
      const orphan = tail?.orphan ?? line.finalOrphan;
      const cost = lineCost(line) + (tail?.cost ?? 0);
      const before = best[start];
      if (
        !before ||
        (before.orphan && !orphan) ||
        (before.orphan === orphan &&
          (count < before.count ||
            (count === before.count && cost <= before.cost)))
      ) {
        best[start] = { line, tail, count, cost, orphan };
      }
    }
  }

  const lines: string[] = [];
  let solution = best[0];
  while (solution && lines.length < maxLines) {
    lines.push(solution.line.text);
    solution = solution.tail;
  }
  if (lines.length && !solution && fitsTotal) return [{ text, lines }];
  if (requireFull) return [];
  // Search shorter prefixes at legal boundaries and reserve room for the ellipsis.
  for (let cut = last - 1; cut > 0; cut--) {
    if (extra.has(points[cut])) continue;
    const visible = `${at(0, points[cut]).replace(/[\p{Ps}\p{Pi}]+$/u, "")}…`;
    const fitted = layout(
      context,
      visible,
      maxWidth,
      options,
      maxLines,
      false,
      true,
    );
    if (fitted.length) return fitted;
  }
  return fit("…", textWidth(context, "…")) ? [{ text: "…", lines: ["…"] }] : [];
}
