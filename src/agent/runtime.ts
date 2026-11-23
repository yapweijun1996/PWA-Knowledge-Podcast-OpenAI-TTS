export type Json =
  null | boolean | number | string | Json[] | { [key: string]: Json };

export type Redact = (text: string) => string;

export function readKey(getKey?: () => string | undefined) {
  try {
    const key = getKey?.()?.trim();
    return key && key.length <= 512 && !/\s/u.test(key) ? key : undefined;
  } catch {
    return undefined;
  }
}

export function redactCredentials(text: string, key?: string) {
  const token = "[REDACTED]";
  const masked = (key ? text.replaceAll(key, token) : text).replace(
    /sk-[A-Za-z0-9_-]{12,}/gu,
    token,
  );
  return key && masked.includes(key) ? "" : masked;
}

export function isObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function mapJson(value: unknown, redact: Redact, depth = 0): Json {
  if (depth > 20) throw new Error();
  if (typeof value === "string") return redact(value);
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value))
    return value.map((item) => mapJson(item, redact, depth + 1));
  if (isObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        redact(key),
        mapJson(item, redact, depth + 1),
      ]),
    );
  }
  throw new Error();
}

export async function abortable<T>(
  signal: AbortSignal,
  work: () => T | Promise<T>,
): Promise<T> {
  signal.throwIfAborted();
  let stop!: () => void;
  const aborted = new Promise<never>((_, reject) => {
    stop = () => reject(signal.reason);
    signal.addEventListener("abort", stop, { once: true });
  });
  try {
    return await Promise.race([aborted, (async () => work())()]);
  } finally {
    signal.removeEventListener("abort", stop);
  }
}

export async function withDeadline<T>(
  signal: AbortSignal,
  timeoutMs: number,
  work: (signal: AbortSignal) => Promise<T>,
) {
  const timeout = new AbortController();
  const timer = setTimeout(
    () => timeout.abort(new DOMException("", "TimeoutError")),
    timeoutMs,
  );
  const active = AbortSignal.any([signal, timeout.signal]);
  try {
    return await abortable(active, () => work(active));
  } finally {
    clearTimeout(timer);
  }
}

export const browserRequestOptions = {
  credentials: "omit",
  cache: "no-store",
  referrerPolicy: "no-referrer",
} as const;
