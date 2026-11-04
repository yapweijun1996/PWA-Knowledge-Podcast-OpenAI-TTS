// Demo audio is an audible signal, not synthesized narration or an OpenAI sample.
export async function demoAudio(
  text: string,
  signal: AbortSignal,
): Promise<Blob> {
  if (!text.trim()) throw new Error("请先输入脚本");
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, 500);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new DOMException("Cancelled", "AbortError"));
      },
      { once: true },
    );
  });
  const rate = 16000,
    length = rate,
    buffer = new ArrayBuffer(44 + length * 2),
    view = new DataView(buffer);
  const str = (offset: number, s: string) =>
    [...s].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  str(0, "RIFF");
  view.setUint32(4, 36 + length * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  str(36, "data");
  view.setUint32(40, length * 2, true);
  for (let i = 0; i < length; i++) {
    const env = Math.min(i / 1000, (length - i) / 1000, 1);
    view.setInt16(
      44 + i * 2,
      Math.sin((i * 2 * Math.PI * 440) / rate) * 4000 * env,
      true,
    );
  }
  return new Blob([buffer], { type: "audio/wav" });
}
export function download(blob: Blob, name: string) {
  const u = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = u;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}

/** Concatenate compatible PCM mono WAV segments without changing their format. */
export async function joinDemoWavs(blobs: Blob[], pauseMs = 0): Promise<Blob> {
  if (!blobs.length) throw new Error("No audio to export");
  if (blobs.reduce((sum, blob) => sum + blob.size, 0) > 256 * 1024 * 1024)
    throw new Error("Joined audio too large");
  if (!Number.isInteger(pauseMs) || pauseMs < 0 || pauseMs > 1000)
    throw new Error("Invalid pause duration");
  const arrays = await Promise.all(
    blobs.map(async (blob) => new Uint8Array(await blob.arrayBuffer())),
  );
  let sampleRate: number | undefined;
  for (const a of arrays) {
    const view = new DataView(a.buffer, a.byteOffset, a.byteLength);
    if (
      a.length < 44 ||
      new TextDecoder().decode(a.slice(0, 4)) !== "RIFF" ||
      new TextDecoder().decode(a.slice(8, 12)) !== "WAVE" ||
      new TextDecoder().decode(a.slice(12, 16)) !== "fmt " ||
      new TextDecoder().decode(a.slice(36, 40)) !== "data" ||
      view.getUint32(16, true) !== 16 ||
      view.getUint32(24, true) < 8000 ||
      view.getUint32(24, true) > 192000 ||
      view.getUint16(20, true) !== 1 ||
      view.getUint16(22, true) !== 1 ||
      view.getUint16(34, true) !== 16 ||
      view.getUint32(40, true) !== a.length - 44 ||
      (a.length - 44) % 2 !== 0 ||
      (sampleRate !== undefined && sampleRate !== view.getUint32(24, true))
    )
      throw new Error("Invalid or incompatible WAV audio");
    sampleRate = view.getUint32(24, true);
  }
  const pauseBytes = Math.round((sampleRate! * pauseMs) / 1000) * 2;
  const bytes =
    arrays.reduce((sum, a) => sum + a.length - 44, 0) +
    pauseBytes * (arrays.length - 1);
  if (bytes > 256 * 1024 * 1024) throw new Error("Joined audio too large");
  const result = new Uint8Array(44 + bytes);
  result.set(arrays[0].slice(0, 44));
  let offset = 44;
  for (const [index, a] of arrays.entries()) {
    if (index) offset += pauseBytes;
    result.set(a.slice(44), offset);
    offset += a.length - 44;
  }
  const v = new DataView(result.buffer);
  v.setUint32(4, 36 + bytes, true);
  v.setUint32(40, bytes, true);
  return new Blob([result], { type: "audio/wav" });
}
