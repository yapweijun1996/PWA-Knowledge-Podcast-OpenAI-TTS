import type { Language } from "../../shared/factory.ts";
import { createTranslator, type Locale } from "../i18n/index.ts";

export const publishLocales = {
  en: "en",
  zh: "zh-CN",
  ms: "ms",
  sg: "en", // Singapore mixed-language episodes use English as their base.
} as const satisfies Record<Language, Locale>;

/** The short cover copy, stored independently of the upload title. */
export type ThumbnailHeadline = string;

export const thumbnailHeadlineLimits = {
  cjk: [6, 12],
  latinWords: [2, 5],
  latinGraphemes: 30,
  malayGraphemes: 34,
} as const;

export const thumbnailHeadlineErrors = {
  empty: "publish.thumbnail.emptyHeadline",
  invalid: "publish.thumbnail.invalidHeadline",
  cjkTooShort: "publish.thumbnail.cjkHeadlineTooShort",
  cjkTooLong: "publish.thumbnail.cjkHeadlineTooLong",
  latinTooShort: "publish.thumbnail.latinHeadlineTooShort",
  latinTooLong: "publish.thumbnail.latinHeadlineTooLong",
  needsShorterHeadline: "publish.thumbnail.needsShorterHeadline",
} as const;

export type ThumbnailHeadlineError =
  (typeof thumbnailHeadlineErrors)[keyof typeof thumbnailHeadlineErrors];

const cjk =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const controls = /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u;
const markup = /[<>]|&(?:#[0-9]+|#x[\da-f]+|[a-z][a-z\d]*);/iu;
const edgePunctuation = /^[\p{P}\s]+|[\p{P}\s]+$/gu;
const clausePunctuation =
  /[,:;\u3001\uff0c\uff1a\uff1b\u2013\u2014]|\s-\s/u;
const housingSampleTitle =
  /^\u7ec4\u5c4b\u91cc\u7684\u6df7\u5c45[\uff0c,]\s*\u662f\u600e\u4e48\u88ab\u8bbe\u8ba1\u51fa\u6765\u7684[\uff1f?]?$/u;
// Recognize common assertion verbs and question words in Han headlines.
const hanAssertion =
  /\u662f|\u8ba9|\u80fd|\u4f1a|\u6539\u53d8|\u51b3\u5b9a|\u5f71\u54cd|\u6e90\u4e8e|\u5851\u9020|\u4fc3\u8fdb|\u5e26\u6765|\u5e76\u975e|\u9760/u;
const hanQuestion =
  /\u5982\u4f55|\u600e\u4e48|\u600e\u6837|\u4e3a\u4ec0\u4e48|\u4ec0\u4e48|\u80fd\u5426|\u662f\u5426/u;
const latinAssertion =
  /\b(?:is|are|can|must|(?:allow|bring|build|change|connect|create|cut|drive|help|improve|keep|make|matter|need|protect|reduce|save|shape|support|work)s?)\b/iu;
const malayAssertion =
  /\b(?:ialah|adalah|boleh|mesti|perlu|bukan|membina|membentuk|mengubah|menjimatkan|mengukuhkan|mengurangkan|meningkatkan|memerlukan)\b/iu;
const latinQuestion =
  /^(?:(?:and|or|dan|atau)\s+)?(?:how|why|what|when|where|which|who|whose|bagaimana|mengapa|kenapa|apakah|apa|siapa|bila|berapa|adakah)\b/iu;
const squashSpaces = (text: string) => text.trim().replace(/\s+/gu, " ");

export const isCjkHeadline = (text: string) => cjk.test(text);

export function headlineGraphemes(text: string, locale: Locale) {
  if (typeof Intl.Segmenter === "function") {
    return Array.from(
      new Intl.Segmenter(locale, { granularity: "grapheme" }).segment(text),
      ({ segment }) => segment,
    );
  }
  return text.match(/\P{M}\p{M}*|\p{M}+/gu) ?? [];
}

export function cjkHeadlineLength(text: string, locale: Locale) {
  return headlineGraphemes(text.replace(/\s/gu, ""), locale).length;
}

function wordEnds(text: string, locale: Locale) {
  if (typeof Intl.Segmenter === "function") {
    return Array.from(
      new Intl.Segmenter(locale, { granularity: "word" }).segment(text),
    ).flatMap(({ isWordLike, index, segment }) =>
      isWordLike ? [index + segment.length] : [],
    );
  }
  return Array.from(
    text.matchAll(/[\p{L}\p{M}\p{N}]+/gu),
    (match) => match.index + match[0].length,
  );
}

export function validateThumbnailHeadline(
  headline: ThumbnailHeadline,
  locale: Locale,
):
  | { value: ThumbnailHeadline; error?: never }
  | { value?: never; error: ThumbnailHeadlineError } {
  if (
    markup.test(headline) ||
    controls.test(headline.replace(/[\u200c\u200d]/gu, ""))
  ) {
    return { error: thumbnailHeadlineErrors.invalid };
  }

  const value = squashSpaces(headline);
  if (!/[\p{L}\p{N}]/u.test(value)) {
    return { error: thumbnailHeadlineErrors.empty };
  }
  if (isCjkHeadline(value)) {
    const count = cjkHeadlineLength(value, locale);
    const [min, max] = thumbnailHeadlineLimits.cjk;
    if (count < min) return { error: thumbnailHeadlineErrors.cjkTooShort };
    if (count > max) return { error: thumbnailHeadlineErrors.cjkTooLong };
  } else {
    const words = wordEnds(value, locale).length;
    const [min, max] = thumbnailHeadlineLimits.latinWords;
    const graphemeLimit =
      locale === "ms"
        ? thumbnailHeadlineLimits.malayGraphemes
        : thumbnailHeadlineLimits.latinGraphemes;
    if (
      words > max ||
      headlineGraphemes(value, locale).length > graphemeLimit
    ) {
      return { error: thumbnailHeadlineErrors.latinTooLong };
    }
    if (words < min) return { error: thumbnailHeadlineErrors.latinTooShort };
  }
  return { value };
}

function isClaimLike(clause: string, source: string, locale: Locale) {
  if (/[?\uff1f]/u.test(source)) return false;
  if (isCjkHeadline(clause))
    return hanAssertion.test(clause) && !hanQuestion.test(clause);
  const assertion = locale === "ms" ? malayAssertion : latinAssertion;
  return assertion.test(clause) && !latinQuestion.test(clause);
}

/** Prefer a complete claim from the title, then fall back to whole-word prefixes. */
export function deriveThumbnailHeadline(
  title: string,
  locale: Locale,
  preferClaim = true,
): ThumbnailHeadline | null {
  const clean = squashSpaces(
    title
      .replace(/<[^<>]*>|&(?:#[0-9]+|#x[\da-f]+|[a-z][a-z\d]*);/giu, " ")
      .replace(/[<>\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/gu, " "),
  );
  if (!clean)
    return createTranslator(locale)("publish.thumbnail.untitledHeadline");

  // The housing sample has dedicated copy for the topic and claim layouts.
  if (locale === "zh-CN" && housingSampleTitle.test(clean)) {
    return createTranslator(locale)(
      preferClaim
        ? "publish.thumbnail.housingClaim"
        : "publish.thumbnail.housingHeadline",
    );
  }

  const full = validateThumbnailHeadline(clean, locale);
  if (full.value && !preferClaim) return full.value;

  const sentences =
    typeof Intl.Segmenter === "function"
      ? Array.from(
          new Intl.Segmenter(locale, { granularity: "sentence" }).segment(
            clean,
          ),
          ({ segment }) => segment,
        )
      : clean.split(/(?<=[.!?])\s+|(?<=[\u3002\uff01\uff1f])\s*/u);
  const clauses = sentences
    .flatMap((sentence) => sentence.split(clausePunctuation))
    .map((source) => ({ source, clause: source.replace(edgePunctuation, "") }))
    .filter(({ clause }) => clause);

  if (preferClaim && clauses.length > 1) {
    for (const { source, clause } of clauses) {
      if (!isClaimLike(clause, source, locale)) continue;
      const { value } = validateThumbnailHeadline(clause, locale);
      if (value) return value;
    }
  }
  if (full.value) return full.value;

  for (const { clause } of clauses) {
    const { value } = validateThumbnailHeadline(clause, locale);
    if (value) return value;
  }
  for (const { clause } of clauses) {
    for (const end of wordEnds(clause, locale).reverse()) {
      const { value } = validateThumbnailHeadline(clause.slice(0, end), locale);
      if (value) return value;
    }
  }
  return null;
}
