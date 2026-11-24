import type { PcmAudio } from "./pcm.ts";

export type PcmWindow = readonly Float32Array[];

export interface PcmSource {
  readonly sampleRate: number;
  readonly channels: number;
  readonly length: number;
  /** One plane per channel. Treat the views as read-only. Missing samples are zero. */
  readWindow(
    startSample: number,
    count: number,
  ): PcmWindow | Promise<PcmWindow>;
}

export function mapPcmWindow<T>(
  window: ReturnType<PcmSource["readWindow"]>,
  read: (planes: PcmWindow) => T,
) {
  return window instanceof Promise ? window.then(read) : read(window);
}

function checkWindow(
  start: number,
  count: number,
  max = Number.MAX_SAFE_INTEGER,
) {
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(count) ||
    !Number.isSafeInteger(start + count) ||
    count < 0 ||
    count > max
  ) {
    throw new RangeError("Invalid PCM window");
  }
}

export function memoryPcmSource({ sampleRate, channels }: PcmAudio): PcmSource {
  return {
    sampleRate,
    channels: channels.length,
    length: channels[0]?.length ?? 0,
    readWindow(start, count) {
      checkWindow(start, count);
      return channels.map((channel) => {
        const end = start + count;
        if (
          channel instanceof Float32Array &&
          start >= 0 &&
          end <= channel.length
        )
          return channel.subarray(start, end);
        const result = new Float32Array(count);
        const first = Math.max(0, start);
        const last = Math.min(end, channel.length);
        if (last <= first) return result;
        if (channel instanceof Float32Array) {
          result.set(channel.subarray(first, last), first - start);
        } else {
          for (let sample = first; sample < last; sample++) {
            result[sample - start] = channel[sample] / 32768;
          }
        }
        return result;
      });
    },
  };
}

const wavHeaderBytes = 44;
const wavSampleRate = 24_000;
const wavSampleBytes = Int16Array.BYTES_PER_ELEMENT;
const maxWavBytes =
  wavHeaderBytes + 2 * 60 * 60 * wavSampleRate * wavSampleBytes;
const pageSamples = 65_536;

/** Open a canonical Studio WAV with at most two decoded pages resident. */
export async function openWavPcmSource(blob: Blob): Promise<PcmSource> {
  if (blob.size < wavHeaderBytes || blob.size > maxWavBytes)
    throw new Error("Invalid Studio WAV size");
  const header = new DataView(
    await blob.slice(0, wavHeaderBytes).arrayBuffer(),
  );
  const payloadBytes = blob.size - wavHeaderBytes;
  // Match the finished-WAV header checks. Only the size ceiling differs.
  if (
    header.byteLength !== wavHeaderBytes ||
    header.getUint32(0) !== 0x52494646 ||
    header.getUint32(8) !== 0x57415645 ||
    header.getUint32(4, true) + 8 !== blob.size ||
    header.getUint32(12) !== 0x666d7420 ||
    header.getUint32(16, true) !== 16 ||
    header.getUint16(20, true) !== 1 ||
    header.getUint32(36) !== 0x64617461 ||
    payloadBytes % wavSampleBytes !== 0 ||
    header.getUint32(40, true) !== payloadBytes ||
    header.getUint16(22, true) !== 1 ||
    header.getUint16(34, true) !== 16 ||
    header.getUint32(24, true) !== wavSampleRate
  ) {
    throw new Error("Invalid Studio WAV header");
  }

  const length = payloadBytes / wavSampleBytes;
  const pages = new Map<number, Float32Array>();
  let pending: Promise<void> | undefined;

  async function loadPage(start: number) {
    if (pages.has(start)) return;
    const count = Math.min(pageSamples, length - start);
    const byteStart = wavHeaderBytes + start * wavSampleBytes;
    const bytes = count * wavSampleBytes;
    const input = new DataView(
      await blob.slice(byteStart, byteStart + bytes).arrayBuffer(),
    );
    if (input.byteLength !== bytes)
      throw new Error("Truncated Studio WAV data");
    if (pages.size === 2) pages.delete(pages.keys().next().value!);
    const page = new Float32Array(count);
    for (let index = 0; index < count; index++) {
      page[index] = input.getInt16(index * wavSampleBytes, true) / 32768;
    }
    pages.set(start, page);
  }

  function readWindow(
    start: number,
    count: number,
  ): PcmWindow | Promise<PcmWindow> {
    checkWindow(start, count, pageSamples);
    const end = start + count;
    const first = Math.max(0, start);
    const last = Math.min(length, end);
    if (last <= first) return [new Float32Array(count)];
    const firstPage = Math.floor(first / pageSamples) * pageSamples;
    const lastPage = Math.floor((last - 1) / pageSamples) * pageSamples;

    if (pending) return pending.then(() => readWindow(start, count));
    const left = pages.get(firstPage);
    const right = pages.get(lastPage);
    if (!left || !right) {
      // On a reverse seek, load the missing page after refreshing the resident
      // page's position so eviction cannot remove part of this window.
      const resident = left ?? right;
      if (resident) {
        const position = left ? firstPage : lastPage;
        pages.delete(position);
        pages.set(position, resident);
      }
      const load = async () => {
        await loadPage(firstPage);
        if (lastPage !== firstPage) await loadPage(lastPage);
      };
      // Clear the pending I/O before replaying the read from the loaded pages.
      pending = load().finally(() => {
        pending = undefined;
      });
      return pending.then(() => readWindow(start, count));
    }

    const view = left.subarray(first - firstPage, last - firstPage);
    if (firstPage === lastPage && first === start && last === end)
      return [view];
    const result = new Float32Array(count);
    result.set(view, first - start);
    if (lastPage !== firstPage) {
      result.set(right.subarray(0, last - lastPage), lastPage - start);
    }
    return [result];
  }

  return { sampleRate: wavSampleRate, channels: 1, length, readWindow };
}
