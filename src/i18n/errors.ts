import { redact } from "../factory/browser-key.ts";
import { catalogues, defaultLocale, type MessageKey } from "./catalogues.ts";
import { t } from "./index.ts";

export function safeErrorMessage(value: unknown): string | undefined {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > 1000 ||
    /[\r\n]|^\s*[\[<{]|^\s*(?:\w*Error:|at\s)/u.test(value)
  )
    return;
  const message = redact(value);
  if (message && !/\bsk-[\w-]{12,}/i.test(message)) return message;
}

// Accept only public diagnostics from the worker, shared validators or saved jobs.
export function translateError(error: unknown, translate = t): string {
  const { code, params, message } =
    typeof error === "object" && error !== null
      ? (error as { code?: unknown; params?: unknown; message?: unknown })
      : { message: error };
  const fallback = () =>
    safeErrorMessage(message) ?? translate("library.error.unfinished");
  if (typeof code === "string") {
    // Browser production already has stable catalogue keys in the Studio area.
    const key = (
      code.startsWith("studio.production.") ? code : `errors.${code}`
    ) as MessageKey;
    const source = catalogues[defaultLocale]!;
    const template = Object.hasOwn(source, key) && source[key];
    if (typeof template === "string") {
      const vars: Record<string, string | number> = Object.create(null);
      for (const [, name] of template.matchAll(
        /\{([A-Za-z_][A-Za-z0-9_]*)\}/g,
      )) {
        const value =
          params && typeof params === "object" && Object.hasOwn(params, name)
            ? (params as Record<string, unknown>)[name]
            : undefined;
        const safe =
          typeof value === "number" && Number.isFinite(value)
            ? value
            : safeErrorMessage(value);
        if (safe === undefined) return fallback();
        vars[name] = safe;
      }
      return translate(key, vars);
    }
  }
  return fallback();
}
