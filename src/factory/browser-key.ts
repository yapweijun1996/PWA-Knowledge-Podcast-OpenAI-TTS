const maxKeyLength = 512;
const listeners = new Set<() => void>();
let currentKey: string | undefined;

function update(key: string | undefined) {
  if (currentKey === key) return;
  currentKey = key;
  for (const listener of listeners) listener();
}

export function set(key: string): void {
  const trimmed = typeof key === "string" ? key.trim() : "";
  if (!trimmed || trimmed.length > maxKeyLength || /\s/.test(trimmed)) {
    throw new Error(
      redact(`请输入不含空白且最多 ${maxKeyLength} 个字符的 API 密钥。`),
    );
  }
  update(trimmed);
}

export function get(): string | undefined {
  return currentKey;
}

export function hasKey(): boolean {
  return currentKey !== undefined;
}

export function clear(): void {
  update(undefined);
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function redact(text: string): string {
  if (!currentKey) return text;
  const redacted = text.replaceAll(currentKey, "[REDACTED]");
  return redacted.includes(currentKey) ? "" : redacted;
}

if (typeof window !== "undefined") window.addEventListener("pagehide", clear);
