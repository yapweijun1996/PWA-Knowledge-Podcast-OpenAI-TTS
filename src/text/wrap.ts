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
const captionPhrases =
  /\u65b0\u52a0\u5761\u7684\u7ec4\u5c4b\u91cc|\u8bb2\u7406\u5ff5|\u5f71\u54cd\u4e70\u5356|\u697c\u680b|\u90bb\u91cc/gu;
const clauseEnd = /[.!?。！？；;，,、：][\p{Pe}\p{Pf}"']*$/u;
const sentenceEnd = /[.!?。！？][\p{Pe}\p{Pf}"']*$/u;
const abbreviation = /\b(?:(?:[A-Z]\.){2,}|e\.g\.|i\.e\.|etc\.)/gu;
const finalAbbreviation =
  /\b(?:(?:[A-Z]\.){2,}|e\.g\.|i\.e\.|(?:etc|Mr|Ms|Mrs|Dr|Prof|St)\.)[\p{Pe}\p{Pf}"']*$/u;
const functionWord =
  /[\u7684\u5730\u5f97\u4e86\u7740\u8fc7\u548c\u4e0e\u5728\u5bf9\u628a\u88ab\u4ece\u5411\u4e3a\u4ee5\u53ca\u6216\u800c]\p{M}*$/u;
// Prefer keeping a restricting adverb with a preceding verb phrase when
// another balanced line break is available.
const dependentAdverb = /^[\u53ea\u4e5f\u90fd\u5c31\u624d\u8fd8\u518d\u53c8]/u;
const shortAdverb =
  /[\u771f\u5f88\u66f4\u6700\u592a\u521a\u53c8\u53ea\u4e5f\u90fd\u5c31\u624d\u8fd8\u518d]/u.source;
const longAdverb =
  /\u7279\u522b|\u975e\u5e38|\u5df2\u7ecf|\u6b63\u5728|\u4e00\u76f4|\u603b\u662f|\u8fd8\u662f|\u9a6c\u4e0a/u.source;
const adverbPrefix =
  /[\u4ee5\u4e4b][\u524d\u540e]|\u7136\u540e|\u4e0d\u662f|\u4e0d/u.source;
const adverbSuffix = /[\u7684\u5730]/u.source;
const captionAdverb = new RegExp(
  `^(?:${adverbPrefix})?(?:${longAdverb}|${shortAdverb})${adverbSuffix}?`,
  "u",
);
const trailingAdverb = new RegExp(`${shortAdverb}$`, "u");
const trailingAdverbPrefix = new RegExp(`(?:${adverbPrefix})$`, "u");
const finalParticle = /^[\u5462\u5417\u5427\u554a\u561b\u5566]/u;
const numberWithUnit =
  /(?:[$£€¥]|(?:S|US)\$)?\p{Nd}+(?:[.,．，]\p{Nd}+)*(?: ?(?:公里|公斤|千克|厘米|毫米|分钟|小时|平方米|平方公里|毫升|°[CF]|[%％°℃℉元年月日米秒克吨]|(?:km\/h|m\/s|mm|cm|km|kg|mg|ml|kWh|Hz|MHz|GB|MB|USD|SGD|MYR|m|g|s|h)\b))?/gu;
const latinWord =
  /[\p{Script=Latin}\p{M}\p{N}]+(?:['’‐‑-][\p{Script=Latin}\p{M}\p{N}]+)*/gu;
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
  preferClauses?: boolean;
  total?: { cjk: number; latinWords: number };
};

type Line = {
  end: number;
  text: string;
  slack: number;
  finalOrphan: boolean;
  overflow?: boolean;
};
export type TextPage = { text: string; lines: string[]; needsReview?: boolean };

function protectedRanges(text: string, phrases: readonly string[]) {
  const ranges: [number, number][] = [];
  // Titles, proper names and other groups that may contain legal word breaks.
  const groups =
    /\b(?:Mr|Ms|Mrs|Dr|Prof|St)\. +\p{Lu}[\p{L}\p{M}'’-]*|(?<![\p{L}])\p{Lu}[\p{Ll}\p{M}'’-]+(?: +\p{Lu}[\p{Ll}\p{M}'’-]+){1,2}/gu;
  for (const match of [
    ...text.matchAll(groups),
    ...text.matchAll(abbreviation),
    ...text.matchAll(numberWithUnit),
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
  captionFit?: (text: string) => boolean,
) {
  const words = new Set(
    segments(text, locale, "word").map(({ index }) => index),
  );
  const characters = segments(text, locale, "grapheme").filter(
    ({ segment }) => segment !== " ",
  );
  let protectedWords = protectedRanges(text, phrases);
  if (captionFit) {
    protectedWords = protectedWords.filter(([start, end]) =>
      captionFit(text.slice(start, end)),
    );
    for (const pattern of [
      abbreviation,
      numberWithUnit,
      latinWord,
      captionPhrases,
    ]) {
      for (const match of text.matchAll(pattern))
        protectedWords.push([match.index, match.index + match[0].length]);
    }
  }
  const preferred = [0];
  const fallback = [0];
  for (let index = 1; index < characters.length; index++) {
    const before = characters[index - 1];
    const after = characters[index];
    if (
      opening.test(before.segment) ||
      closing.test(after.segment) ||
      (captionFit && finalParticle.test(after.segment))
    )
      continue;
    const protectedBreak = protectedWords.some(
      ([start, end]) => start < after.index && after.index < end,
    );
    if (!captionFit || !protectedBreak) fallback.push(after.index);
    const space = before.index + before.segment.length < after.index;
    const cjk = eastAsian.test(before.segment) || eastAsian.test(after.segment);
    if (
      (space ||
        (cjk && (!useCjkWords || !Intl.Segmenter || words.has(after.index))) ||
        (words.has(after.index) && /[\p{Pe}\p{Pf}]/u.test(before.segment))) &&
      !protectedBreak
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

function startsAdverbPhrase(line: string) {
  const adverb = captionAdverb.exec(line)?.[0];
  return !!adverb && /^\p{Script=Han}/u.test(line.slice(adverb.length));
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
  if (!paginate && fitsTotal && fit(text, textWidth(context, text)))
    return [{ text, lines: [text] }];

  const { preferred, fallback } = breakOffsets(
    text,
    locale,
    options.keepTogether ?? [],
    !!limits,
    paginate ? (line) => fit(line, textWidth(context, line)) : undefined,
  );
  const at = (start: number, end: number) => text.slice(start, end).trimEnd();
  // Captions may use any legal CJK break to avoid stranding a function word.
  // Other display roles only need grapheme breaks for overlong atoms.
  const preferredPoints = new Set(preferred);
  const extra = new Set(
    paginate ? fallback.filter((point) => !preferredPoints.has(point)) : [],
  );
  if (!paginate && limits) {
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
  const sentenceStops = new Set<number>();
  if (paginate) {
    // Keep the next sentence on a new cue, including when it is short.
    for (let index = 1; index < last; index++) {
      const prefix = at(0, points[index]);
      if (sentenceEnd.test(prefix) && !finalAbbreviation.test(prefix))
        sentenceStops.add(index);
    }
  }
  const choices: Line[][] = [];
  for (let start = 0; start < last; start++) {
    const lines: Line[] = [];
    for (let end = start + 1; end <= last; end++) {
      const line = at(points[start], points[end]);
      const width = textWidth(context, line);
      if (!fit(line, width)) {
        if (end > start + 1 || (limits && !paginate)) break;
        // Preserve an indivisible grapheme, number with a unit or oversized word.
        lines.push({
          end,
          text: line,
          slack: (maxWidth - width) ** 2,
          finalOrphan: isOrphan(line),
          overflow: true,
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
      if (sentenceStops.has(end)) break;
    }
    choices.push(lines);
  }

  const penalty = Math.max(1, maxWidth ** 2);
  const endsClause = (line: Line) =>
    clauseEnd.test(line.text) && !finalAbbreviation.test(line.text);
  const strandsAdverb = (line: Line) =>
    eastAsian.test(line.text.at(-1) ?? "") &&
    !endsClause(line) &&
    dependentAdverb.test(text.slice(points[line.end]));
  const lineCost = (line: Line) =>
    line.slack + (extra.has(points[line.end]) ? penalty : 0);

  if (paginate) {
    type PageSolution = {
      lines: Line[];
      end: number;
      score: number[];
    };
    const best: (PageSolution | undefined)[] = [];
    const wordBreak = (line: Line) => Number(extra.has(points[line.end]));
    for (let start = last - 1; start >= 0; start--) {
      const lastFit = choices[start].at(-1)?.end ?? start;
      function consider(lines: Line[], line: Line) {
        const tail = best[line.end];
        if (line.end < last && !tail) return;
        const first = lines.length === 2 ? lines[0] : undefined;
        // Only reward a phrase break inside a cue that needs two lines.
        const startsPhrase =
          first &&
          !first.overflow &&
          !line.overflow &&
          line.end > lastFit &&
          preferredPoints.has(points[first.end]) &&
          startsAdverbPhrase(line.text) &&
          !trailingAdverbPrefix.test(first.text) &&
          !(trailingAdverb.test(first.text) &&
            preferredPoints.has(points[start] + first.text.length - 1));
        const score = [
          Number(!!first && functionWord.test(first.text)) +
            Number(
              line.end < last &&
                (functionWord.test(line.text) || strandsAdverb(line)),
            ),
          Number(line.end < last && !endsClause(line)),
          lines.reduce((sum, item) => sum + wordBreak(item), 0),
          1,
          -Number(!!startsPhrase),
          // A dependent adverb can start the second line when needed to fit.
          Number(!!first && !startsPhrase && strandsAdverb(first)),
          lines.reduce((sum, item) => sum + item.slack, 0) +
            (line.finalOrphan ? 2 * penalty : 0),
        ].map((value, index) => value + (tail?.score[index] ?? 0));
        // Compare in priority order before balancing measured line widths.
        const previous = best[start]?.score;
        const difference = previous?.findIndex(
          (value, index) => value !== score[index],
        );
        if (
          !previous ||
          (difference !== undefined &&
            difference >= 0 &&
            score[difference] < previous[difference])
        )
          best[start] = { lines, end: line.end, score };
      }
      for (const first of choices[start]) {
        consider([first], first);
        if (maxLines < 2 || first.end >= last || sentenceStops.has(first.end))
          continue;
        for (const second of choices[first.end]) {
          if (!second.finalOrphan) consider([first, second], second);
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
        ...(page.lines.some((line) => line.overflow)
          ? { needsReview: true }
          : {}),
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
      const awkwardBreak =
        options.preferClauses && line.end < last && eastAsian.test(line.text) &&
        !endsClause(line);
      const cost =
        lineCost(line) + (tail?.cost ?? 0) +
        (awkwardBreak ? penalty / 2 : 0) +
        (options.preferClauses && strandsAdverb(line) ? penalty : 0);
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
