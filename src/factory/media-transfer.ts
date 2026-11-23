import { validateAudio } from "../../shared/audio-record.ts";
import { t } from "../i18n/index.ts";
import { LibraryError } from "./api.ts";

export async function downloadCheckpointAudio(
  url: string,
  type: string,
  signal: AbortSignal,
) {
  const idleMs = 60_000;
  const controller = new AbortController();
  const timeout = () =>
    controller.abort(
      new DOMException(t("library.transfer.stalled"), "TimeoutError"),
    );
  let timer = setTimeout(timeout, idleMs);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.any([signal, controller.signal]),
    });
    if (!response.ok) throw new LibraryError("library.transfer.unavailable");
    const size = Number(response.headers.get("Content-Length"));
    const limit = type === "audio/wav" ? 24_000_044 : 8_000_000;
    if (
      !Number.isSafeInteger(size) ||
      size < 44 ||
      size > limit ||
      response.headers.get("Content-Type") !== type ||
      !response.body
    )
      throw new LibraryError("library.transfer.invalid");
    const reader = response.body.getReader();
    const chunks: BlobPart[] = [];
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value.byteLength) continue;
      received += value.byteLength;
      if (received > size) throw new LibraryError("library.transfer.oversized");
      chunks.push(value);
      clearTimeout(timer);
      timer = setTimeout(timeout, idleMs);
    }
    if (received !== size) throw new LibraryError("library.transfer.incomplete");
    const blob = new Blob(chunks, { type });
    await validateAudio(blob, type);
    return blob;
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
