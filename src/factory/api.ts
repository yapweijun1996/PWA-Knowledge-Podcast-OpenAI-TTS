import { studioAPI } from "../../shared/factory";

export class StudioError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function studio<T>(
  path: string,
  method = "GET",
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(studioAPI + path, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    credentials: "same-origin",
    cache: "no-store",
    signal: signal ?? AbortSignal.timeout(15_000),
  }).catch(() => {
    signal?.throwIfAborted();
    throw new StudioError("无法连接本机制作进程。浏览器节目仍可使用。", 0);
  });
  if (!response.headers.get("Content-Type")?.includes("application/json"))
    throw new StudioError(
      "此网址没有连接制作进程。可继续使用浏览器资料库和本地编辑器。",
      response.status,
    );
  const payload = await response.json();
  if (!response.ok)
    throw new StudioError(payload.error || "制作请求未完成。", response.status);
  return payload as T;
}

export const media = (id: string, path: string, asset: string) =>
  `${studioAPI}/episodes/${id}/${path}?asset=${encodeURIComponent(asset)}`;
