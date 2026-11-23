type TextMeasurer = { measureText(text: string): { width: number } };

const eastAsian =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\u3000-\u303f\uff01-\uff0f\uff1a-\uff20\uff3b-\uff40\uff5b-\uff60]/u;
const opening = /^[\p{Ps}\p{Pi}]/u;
const closing = /^[\p{Pe}\p{Pf},.!?:;%、。，．・：；？！…]/u;
const shortLastLine =
  /^(?:[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]\p{M}*|(?:\p{Script=Latin}\p{M}*){1,2})$/u;
const segmenters = new Map<string | undefined, Intl.Segmenter>();

function graphemes(text: string, locale: string | undefined) {
  if (typeof Intl.Segmenter === "function") {
    let segmenter = segmenters.get(locale);
    if (!segmenter) {
      segmenter = new Intl.Segmenter(locale, { granularity: "grapheme" });
      segmenters.set(locale, segmenter);
    }
    return [...segmenter.segment(text)];
  }
  // Keep code points and combining marks together when Segmenter is missing.
  return Array.from(text.matchAll(/\P{M}\p{M}*|\p{M}+/gu), (match) => ({
    segment: match[0],
    index: match.index,
  }));
}

/** Rejoin pre-wrapped lines for measurement in the output font. */
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

type Layout = {
  line: string;
  end: number;
  count: number;
  orphan: boolean;
  slack: number;
};

/** Balance measured lines at legal breaks. An indivisible word can exceed maxWidth. */
export function wrapText(
  context: TextMeasurer,
  text: string,
  maxWidth: number,
  locale?: string,
  maxLines = Infinity,
): string[] {
  text = text.trim().replace(/\s+/gu, " ");
  if (!text) return [];
  if (context.measureText(text).width <= maxWidth) return [text];

  const characters = graphemes(
    text,
    locale ?? (eastAsian.test(text) ? "zh-CN" : undefined),
  ).filter(({ segment }) => segment !== " ");
  const breaks = [0];
  for (let index = 1; index < characters.length; index++) {
    const before = characters[index - 1];
    const after = characters[index];
    if (
      !opening.test(before.segment) &&
      !closing.test(after.segment) &&
      (before.index + before.segment.length < after.index ||
        eastAsian.test(before.segment) ||
        eastAsian.test(after.segment))
    ) {
      breaks.push(after.index);
    }
  }
  breaks.push(text.length);

  const last = breaks.length - 1;
  // Compare complete layouts so the final line participates in balancing.
  const layouts: Layout[] = [];
  layouts[last] = { line: "", end: last, count: 0, orphan: false, slack: 0 };
  for (let start = last - 1; start >= 0; start--) {
    let best: Layout | undefined;
    for (let end = start + 1; end <= last; end++) {
      const line = text.slice(breaks[start], breaks[end]).trimEnd();
      const unused = maxWidth - context.measureText(line).width;
      if (unused < 0 && end > start + 1) break;
      const rest = layouts[end];
      const count = 1 + rest.count;
      const orphan =
        end === last
          ? shortLastLine.test(line.replace(/^[\p{P}\s]+|[\p{P}\s]+$/gu, ""))
          : rest.orphan;
      const slack = unused ** 2 + rest.slack;
      if (
        !best ||
        count < best.count ||
        (count === best.count &&
          ((best.orphan && !orphan) ||
            (best.orphan === orphan && slack <= best.slack)))
      ) {
        best = { line, end, count, orphan, slack };
      }
      if (unused < 0) break;
    }
    layouts[start] = best!;
  }

  const lines: string[] = [];
  for (let start = 0; start < last; start = layouts[start].end) {
    const { line, end } = layouts[start];
    if (lines.length === maxLines - 1 && end < last) {
      // Trim at legal breaks to make room for the ellipsis, then rebalance the visible title.
      let cut = end;
      while (
        cut > start + 1 &&
        context.measureText(
          `${text.slice(breaks[start], breaks[cut]).trimEnd()}…`,
        ).width > maxWidth
      ) {
        cut--;
      }
      return wrapText(
        context,
        `${text.slice(0, breaks[cut]).trimEnd()}…`,
        maxWidth,
        locale,
      );
    }
    lines.push(line);
  }
  return lines;
}
