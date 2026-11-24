import { t } from "../i18n/index.ts";

export const mp4MimeType = "video/mp4";

export type Mp4Output = {
  blob: Blob;
  sha256: string;
  /** The caller owns this staged file after a successful close. */
  opfsFileName?: string;
};

const storageMessages = {
  quota: "video.render.opfsQuota",
  size: "video.render.opfsSizeLimit",
  io: "video.panel.saveFailed",
} as const;

export class Mp4StorageError extends Error {
  readonly kind: keyof typeof storageMessages;
  readonly messageKey: (typeof storageMessages)[Mp4StorageError["kind"]];

  constructor(kind: Mp4StorageError["kind"], cause?: unknown) {
    const messageKey = storageMessages[kind];
    super(t(messageKey), { cause });
    this.name = "Mp4StorageError";
    this.kind = kind;
    this.messageKey = messageKey;
  }
}

/** Forward positioned writes in muxer order. Await each write before reuse and close. */
export interface Mp4Sink {
  readonly kind: "memory" | "opfs";
  write(position: number, bytes: Uint8Array): void | Promise<void>;
  close(signal?: AbortSignal): Promise<Mp4Output>;
  abort(): void | Promise<void>;
}

export function writeEnd(position: number, size: number) {
  const end = position + size;
  if (
    !Number.isSafeInteger(position) ||
    position < 0 ||
    !Number.isSafeInteger(end)
  )
    throw new RangeError("Invalid MP4 write position");
  return end;
}

export function digestHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

type Digest = Pick<SubtleCrypto, "digest">;

export class MemorySink implements Mp4Sink {
  readonly kind = "memory";
  #buffer = new Uint8Array(0);
  #length = 0;
  #finished = false;
  #aborted = false;
  #subtle?: Digest;

  constructor(subtle: Digest | undefined = globalThis.crypto?.subtle) {
    this.#subtle = subtle;
  }

  write(position: number, bytes: Uint8Array) {
    if (this.#finished) throw new Error("MP4 sink is finished");
    const end = writeEnd(position, bytes.byteLength);
    if (!bytes.byteLength) return;
    if (end > this.#buffer.byteLength) {
      const capacity = Math.max(64 * 1024, 2 ** Math.ceil(Math.log2(end)));
      const buffer = new Uint8Array(capacity);
      buffer.set(this.#buffer);
      this.#buffer = buffer;
    }
    this.#buffer.set(bytes, position);
    this.#length = Math.max(this.#length, end);
  }

  async close(signal?: AbortSignal) {
    if (this.#finished) throw new Error("MP4 sink is finished");
    this.#finished = true;
    const bytes = this.#buffer.slice(0, this.#length).buffer;
    this.#buffer = new Uint8Array(0);
    signal?.throwIfAborted();
    if (!this.#subtle) throw new Error(t("video.render.noHash"));
    const hash = await this.#subtle.digest("SHA-256", bytes);
    signal?.throwIfAborted();
    if (this.#aborted) throw new DOMException("Aborted", "AbortError");
    return {
      blob: new Blob([bytes], { type: mp4MimeType }),
      sha256: digestHex(new Uint8Array(hash)),
    };
  }

  abort() {
    this.#finished = true;
    this.#aborted = true;
    this.#buffer = new Uint8Array(0);
  }
}
