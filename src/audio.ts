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

/** Concatenate the PCM data produced by demoAudio into a valid mono WAV. */
export async function joinDemoWavs(blobs: Blob[]): Promise<Blob> {
  if (!blobs.length) throw new Error("No audio to export");
  const arrays = await Promise.all(
    blobs.map(async (blob) => new Uint8Array(await blob.arrayBuffer())),
  );
  for (const a of arrays) {
    if (
      a.length < 44 ||
      new TextDecoder().decode(a.slice(0, 4)) !== "RIFF" ||
      new TextDecoder().decode(a.slice(8, 12)) !== "WAVE"
    )
      throw new Error("Invalid demo audio");
  }
  const bytes = arrays.reduce((sum, a) => sum + a.length - 44, 0);
  const result = new Uint8Array(44 + bytes);
  result.set(arrays[0].slice(0, 44));
  let offset = 44;
  for (const a of arrays) {
    result.set(a.slice(44), offset);
    offset += a.length - 44;
  }
  const v = new DataView(result.buffer);
  v.setUint32(4, 36 + bytes, true);
  v.setUint32(40, bytes, true);
  return new Blob([result], { type: "audio/wav" });
}
