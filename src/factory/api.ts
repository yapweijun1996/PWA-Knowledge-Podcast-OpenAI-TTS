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
  requestHeaders?: Record<string, string>,
): Promise<T> {
  const upload = body instanceof Blob;
  const timeout = AbortSignal.timeout(
    upload ? 600_000 : signal ? 60_000 : 15_000,
  );
  const response = await fetch(studioAPI + path, {
    method,
    body: upload ? body : JSON.stringify(body),
    headers: {
      ...(body === undefined
        ? {}
        : { "Content-Type": upload ? body.type : "application/json" }),
      ...requestHeaders,
    },
    credentials: "same-origin",
    cache: "no-store",
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  }).catch(() => {
    signal?.throwIfAborted();
    throw new StudioError("无法连接本机制作进程。浏览器节目仍可使用。", 0);
  });
  if (!response.headers.get("Content-Type")?.includes("application/json"))
    throw new StudioError(
      "此网址没有连接制作进程。可继续使用浏览器资料库和本地编辑器。",
      0,
    );
  const payload = await response.json();
  if (!response.ok)
    throw new StudioError(payload.error || "制作请求未完成。", response.status);
  return payload as T;
}

export const media = (id: string, path: string, asset: string) =>
  `${studioAPI}/episodes/${id}/${path}?asset=${encodeURIComponent(asset)}`;
