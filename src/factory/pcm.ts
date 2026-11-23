import { t } from "../i18n/index.ts";

export const AUDIBLE_SAMPLE = 0.001;

/** Encode mono PCM as a 16-bit WAV, retaining padding around audible samples. */
export function pcmToWav(
  chunks: readonly Float32Array[],
  sampleRate: number,
): Blob {
  let first: number | undefined;
  let last = 0;
  let offset = 0;
  for (const chunk of chunks) {
    for (let i = 0; i < chunk.length; i++) {
      if (Math.abs(chunk[i]) > AUDIBLE_SAMPLE) {
        first ??= offset + i;
        last = offset + i;
      }
    }
    offset += chunk.length;
  }
  if (first === undefined) throw new Error(t("studio.narration.noAudio"));

  first = Math.max(0, first - Math.floor(sampleRate * 0.15));
  last = Math.min(offset - 1, last + Math.floor(sampleRate * 0.25));
  const dataBytes = (last - first + 1) * 2;
  const wav = new Uint8Array(44 + dataBytes);
  const view = new DataView(wav.buffer);
  view.setUint32(0, 0x52494646); // RIFF
  view.setUint32(4, 36 + dataBytes, true);
  view.setUint32(8, 0x57415645); // WAVE
  view.setUint32(12, 0x666d7420); // fmt
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  view.setUint32(36, 0x64617461); // data
  view.setUint32(40, dataBytes, true);

  offset = 0;
  for (const chunk of chunks) {
    const from = Math.max(0, first - offset);
    const to = Math.min(chunk.length, last - offset + 1);
    for (let i = from; i < to; i++) {
      const sample = Math.max(-1, Math.min(1, chunk[i]));
      view.setInt16(
        44 + (offset + i - first) * 2,
        sample < 0 ? sample * 32768 : sample * 32767,
        true,
      );
    }
    offset += chunk.length;
  }
  return new Blob([wav], { type: "audio/wav" });
}
