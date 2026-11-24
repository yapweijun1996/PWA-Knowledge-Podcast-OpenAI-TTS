import { mebibyte } from "./limits.ts";
import {
  digestHex,
  mp4MimeType,
  Mp4StorageError,
  writeEnd,
  type Mp4Sink,
} from "./mp4-sink.ts";

export const maxOpfsMp4Bytes = 1536 * mebibyte;
export const opfsQuotaReserveBytes = 8 * mebibyte;
// One positioned write may be pending at a time, including during box patches.
export const maxPendingOpfsBytes = mebibyte;
// StreamTarget emits synchronously. Bound the buffers one muxer call can stage.
export const maxStagedOpfsBytes = 32 * mebibyte;
export const opfsHashChunkBytes = mebibyte;

type OpfsStorage = Pick<StorageManager, "getDirectory" | "estimate">;

export function newOpfsMp4Name() {
  return `studio-video-${globalThis.crypto.randomUUID()}.mp4`;
}

function storageError(cause: unknown) {
  if (cause instanceof Mp4StorageError) return cause;
  return new Mp4StorageError(
    cause instanceof DOMException && cause.name === "QuotaExceededError"
      ? "quota"
      : "io",
    cause,
  );
}

async function removeFile(directory: FileSystemDirectoryHandle, name: string) {
  try {
    await directory.removeEntry(name);
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "NotFoundError") return;
    throw storageError(cause);
  }
}

export async function removeOpfsMp4(name: string) {
  try {
    await removeFile(await navigator.storage.getDirectory(), name);
  } catch (cause) {
    throw storageError(cause);
  }
}

export class OpfsSink implements Mp4Sink {
  readonly kind = "opfs";
  readonly fileName: string;
  #directory: FileSystemDirectoryHandle;
  #file: FileSystemFileHandle;
  #writable?: FileSystemWritableFileStream;
  #byteLimit: number;
  #length = 0;
  #finished = false;
  #abort = new AbortController();
  #active?: Promise<unknown>;
  #cleanup?: Promise<void>;

  private constructor(
    directory: FileSystemDirectoryHandle,
    file: FileSystemFileHandle,
    writable: FileSystemWritableFileStream,
    name: string,
    byteLimit: number,
  ) {
    this.#directory = directory;
    this.#file = file;
    this.#writable = writable;
    this.fileName = name;
    this.#byteLimit = byteLimit;
  }

  static async open({
    fileName,
    storage = globalThis.navigator?.storage,
  }: { fileName?: string; storage?: OpfsStorage } = {}) {
    let directory: FileSystemDirectoryHandle | undefined;
    let createdName: string | undefined;
    try {
      const name = fileName ?? newOpfsMp4Name();
      if (!storage) throw new Mp4StorageError("io");
      const estimate = await storage.estimate?.();
      const { quota, usage } = estimate ?? {};
      const byteLimit =
        quota !== undefined &&
        usage !== undefined &&
        Number.isFinite(quota) &&
        Number.isFinite(usage) &&
        quota >= 0 &&
        usage >= 0
          ? Math.min(maxOpfsMp4Bytes, quota - usage - opfsQuotaReserveBytes)
          : maxOpfsMp4Bytes;
      if (byteLimit <= 0) throw new Mp4StorageError("quota");
      directory = await storage.getDirectory();
      const file = await directory.getFileHandle(name, { create: true });
      createdName = name;
      return new OpfsSink(
        directory,
        file,
        await file.createWritable(),
        name,
        byteLimit,
      );
    } catch (cause) {
      if (directory && createdName) await removeFile(directory, createdName);
      throw storageError(cause);
    }
  }

  async write(position: number, bytes: Uint8Array) {
    const writable = this.#writable;
    if (this.#finished || !writable || this.#active)
      throw new Error("MP4 sink requires one operation at a time");
    const end = writeEnd(position, bytes.byteLength);
    if (!bytes.byteLength) return;
    await this.#run(async () => {
      if (end > maxOpfsMp4Bytes) throw new Mp4StorageError("size");
      if (end > this.#byteLimit) throw new Mp4StorageError("quota");
      for (
        let offset = 0;
        offset < bytes.byteLength;
        offset += maxPendingOpfsBytes
      ) {
        this.#abort.signal.throwIfAborted();
        const size = Math.min(maxPendingOpfsBytes, bytes.byteLength - offset);
        const data =
          bytes.buffer instanceof ArrayBuffer
            ? new Uint8Array(bytes.buffer, bytes.byteOffset + offset, size)
            : bytes.slice(offset, offset + size);
        await writable.write({
          type: "write",
          position: position + offset,
          data,
        });
      }
      this.#length = Math.max(this.#length, end);
    });
  }

  async close(signal?: AbortSignal) {
    const writable = this.#writable;
    if (this.#finished || !writable || this.#active)
      throw new Error("MP4 sink requires one operation at a time");
    this.#finished = true;
    const stop = signal
      ? AbortSignal.any([signal, this.#abort.signal])
      : this.#abort.signal;
    return this.#run(async () => {
      stop.throwIfAborted();
      await writable.close();
      this.#writable = undefined;
      stop.throwIfAborted();
      const file = await this.#file.getFile();
      if (file.size !== this.#length)
        throw new Error("Unexpected MP4 file size");
      const sha256 = await hashFile(file, stop);
      return {
        blob: file.slice(0, file.size, mp4MimeType),
        sha256,
        opfsFileName: this.fileName,
      };
    }, stop);
  }

  async #run<T>(operation: () => Promise<T>, signal = this.#abort.signal) {
    const active = operation();
    this.#active = active;
    try {
      const result = await active;
      signal.throwIfAborted();
      return result;
    } catch (cause) {
      const error = signal.aborted ? signal.reason : storageError(cause);
      await this.abort();
      throw error;
    } finally {
      this.#active = undefined;
    }
  }

  abort() {
    if (this.#cleanup) return this.#cleanup;
    this.#finished = true;
    this.#abort.abort();
    return (this.#cleanup = (async () => {
      await this.#active?.catch(() => {});
      try {
        await this.#writable?.abort();
      } catch {
        // A failed write or close can already have closed the stream.
      }
      this.#writable = undefined;
      await removeFile(this.#directory, this.fileName);
    })());
  }
}

// SHA-256 initial state and round constants from FIPS 180-4.
const initialHash = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
  0x1f83d9ab, 0x5be0cd19,
];
const rounds = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
const shaBlockBytes = 64;
const rotate = (word: number, bits: number) =>
  (word >>> bits) | (word << (32 - bits));

function compressSha256(
  state: Uint32Array,
  words: Uint32Array,
  bytes: DataView,
  offset: number,
) {
  for (let index = 0; index < 16; index++)
    words[index] = bytes.getUint32(offset + index * 4);
  for (let index = 16; index < 64; index++) {
    const previous = words[index - 15];
    const recent = words[index - 2];
    const small0 =
      rotate(previous, 7) ^ rotate(previous, 18) ^ (previous >>> 3);
    const small1 = rotate(recent, 17) ^ rotate(recent, 19) ^ (recent >>> 10);
    words[index] = words[index - 16] + small0 + words[index - 7] + small1;
  }
  let a = state[0],
    b = state[1],
    c = state[2],
    d = state[3];
  let e = state[4],
    f = state[5],
    g = state[6],
    h = state[7];
  for (let index = 0; index < 64; index++) {
    const big1 = rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25);
    const choose = (e & f) ^ (~e & g);
    const first = h + big1 + choose + rounds[index] + words[index];
    const big0 = rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22);
    const majority = (a & b) ^ (a & c) ^ (b & c);
    h = g;
    g = f;
    f = e;
    e = (d + first) | 0;
    d = c;
    c = b;
    b = a;
    a = (first + big0 + majority) | 0;
  }
  state[0] += a;
  state[1] += b;
  state[2] += c;
  state[3] += d;
  state[4] += e;
  state[5] += f;
  state[6] += g;
  state[7] += h;
}

async function hashFile(file: File, signal: AbortSignal) {
  const state = new Uint32Array(initialHash);
  const words = new Uint32Array(64);
  let tail = new Uint8Array(0);
  for (let offset = 0; offset < file.size; offset += opfsHashChunkBytes) {
    signal.throwIfAborted();
    const end = Math.min(file.size, offset + opfsHashChunkBytes);
    const chunk = await file.slice(offset, end).arrayBuffer();
    signal.throwIfAborted();
    if (chunk.byteLength !== end - offset)
      throw new Error("Truncated MP4 read");
    const bytes = new DataView(chunk);
    const complete = chunk.byteLength - (chunk.byteLength % shaBlockBytes);
    for (let block = 0; block < complete; block += shaBlockBytes)
      compressSha256(state, words, bytes, block);
    // Each read starts at a block boundary. Only the last read can have a tail.
    if (complete < chunk.byteLength) tail = new Uint8Array(chunk, complete);
  }
  signal.throwIfAborted();
  const padding = new Uint8Array(
    tail.length < 56 ? shaBlockBytes : 2 * shaBlockBytes,
  );
  padding.set(tail);
  padding[tail.length] = 0x80;
  const bits = file.size * 8;
  const final = new DataView(padding.buffer);
  final.setUint32(padding.length - 8, Math.floor(bits / 2 ** 32));
  final.setUint32(padding.length - 4, bits);
  for (let block = 0; block < padding.length; block += shaBlockBytes)
    compressSha256(state, words, final, block);
  const digest = new Uint8Array(32);
  const bytes = new DataView(digest.buffer);
  state.forEach((word, index) => bytes.setUint32(index * 4, word));
  return digestHex(digest);
}
