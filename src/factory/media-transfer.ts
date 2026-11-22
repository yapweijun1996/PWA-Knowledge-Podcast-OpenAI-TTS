import { validateAudio } from "../../shared/audio-record.ts";

export async function downloadCheckpointAudio(
  url: string,
  type: string,
  signal: AbortSignal,
) {
  const idleMs = 60_000;
  const controller = new AbortController();
  const timeout = () =>
    controller.abort(
      new DOMException("音频传输停滞，请重新同步。", "TimeoutError"),
    );
  let timer = setTimeout(timeout, idleMs);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.any([signal, controller.signal]),
    });
    if (!response.ok) throw new Error("音频检查点已变化或无法下载。");
    const size = Number(response.headers.get("Content-Length"));
    const limit = type === "audio/wav" ? 24_000_044 : 8_000_000;
    if (
      !Number.isSafeInteger(size) ||
      size < 44 ||
      size > limit ||
      response.headers.get("Content-Type") !== type ||
      !response.body
    )
      throw new Error("本机进程返回的音频格式或大小无效。");
    const reader = response.body.getReader();
    const chunks: BlobPart[] = [];
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value.byteLength) continue;
      received += value.byteLength;
      if (received > size) throw new Error("音频超过预期大小。");
      chunks.push(value);
      clearTimeout(timer);
      timer = setTimeout(timeout, idleMs);
    }
    if (received !== size) throw new Error("音频接收不完整。");
    const blob = new Blob(chunks, { type });
    await validateAudio(blob, type);
    return blob;
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
