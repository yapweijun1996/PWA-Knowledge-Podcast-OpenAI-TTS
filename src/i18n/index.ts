import {
  createContext,
  createElement,
  useContext,
  useLayoutEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  catalogues,
  defaultLocale,
  locales,
  type Catalogues,
  type Locale,
  type MessageKey,
} from "./catalogues.ts";

export { defaultLocale, locales };
export type { Locale, MessageKey };

type Variables = Readonly<Record<string, string | number | bigint>>;
type Translate = (key: MessageKey, vars?: Variables) => string;

export function createTranslator(
  locale: Locale,
  messages: Catalogues = catalogues,
): Translate {
  return (key, vars) => {
    function lookup(language: Locale) {
      const catalogue = messages[language];
      if (!catalogue || !Object.hasOwn(catalogue, key)) return;
      const message = catalogue[key];
      let text: string;
      if (typeof message === "string") {
        text = message;
      } else {
        const count = vars?.count;
        if (typeof count !== "number" || !Number.isFinite(count)) return;
        const rule = new Intl.PluralRules(language).select(count);
        text = message[rule] ?? message.other;
      }
      if (!text) return;
      return text.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (token, name) => {
        if (!vars || !Object.hasOwn(vars, name)) return token;
        const value = vars[name];
        return typeof value === "string"
          ? value
          : new Intl.NumberFormat(language).format(value);
      });
    }

    return lookup(locale) ?? lookup(defaultLocale) ?? `⟦${key}⟧`;
  };
}

export function createFormatters(
  locale: Locale,
  translate = createTranslator(locale),
) {
  return {
    plural(key: MessageKey, count: number, vars?: Variables) {
      return translate(key, { ...vars, count });
    },
    dateTime(
      value: Date | number,
      options: Intl.DateTimeFormatOptions = {
        dateStyle: "medium",
        timeStyle: "short",
      },
    ) {
      return new Intl.DateTimeFormat(locale, options).format(value);
    },
    number(value: number | bigint, options?: Intl.NumberFormatOptions) {
      return new Intl.NumberFormat(locale, options).format(value);
    },
    relativeTime(
      value: number,
      unit: Intl.RelativeTimeFormatUnit,
      options?: Intl.RelativeTimeFormatOptions,
    ) {
      return new Intl.RelativeTimeFormat(locale, options).format(value, unit);
    },
    list(values: Iterable<string>, options?: Intl.ListFormatOptions) {
      return new Intl.ListFormat(locale, options).format(values);
    },
  };
}

const preferenceKey = "podcast-ui-locale";

export function isLocale(value: unknown): value is Locale {
  return locales.some((locale) => locale === value);
}

export function resolveLocale(storage?: Pick<Storage, "getItem">): Locale {
  try {
    const saved = (storage ?? globalThis.localStorage)?.getItem(preferenceKey);
    if (isLocale(saved)) return saved;
  } catch {
    // Storage can be unavailable in private or restricted browsing contexts.
  }
  return defaultLocale;
}

let currentLocale: Locale | undefined;
const listeners = new Set<() => void>();

function getLocale() {
  return (currentLocale ??= resolveLocale());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setLocale(locale: Locale) {
  if (!isLocale(locale) || locale === getLocale()) return;
  currentLocale = locale;
  try {
    globalThis.localStorage?.setItem(preferenceKey, locale);
  } catch {
    // The choice still applies to the current page.
  }
  for (const listener of listeners) listener();
}

export const t: Translate = (key, vars) =>
  createTranslator(getLocale())(key, vars);

type I18n = {
  locale: Locale;
  setLocale: typeof setLocale;
  t: Translate;
  formatters: ReturnType<typeof createFormatters>;
};
const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const locale = useSyncExternalStore(subscribe, getLocale, getLocale);
  const value = useMemo(() => {
    const t = createTranslator(locale);
    return { locale, setLocale, t, formatters: createFormatters(locale, t) };
  }, [locale]);

  useLayoutEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return createElement(I18nContext.Provider, { value }, children);
}

export function useI18n(): I18n {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n requires an I18nProvider");
  return value;
}
