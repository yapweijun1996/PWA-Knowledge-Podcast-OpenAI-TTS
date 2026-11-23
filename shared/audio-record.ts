import { PublicError } from "./pipeline/errors.ts";

export async function validateAudio(blob: Blob, type: string) {
  if (
    blob.size < 44 ||
    blob.size > (type === "audio/wav" ? 24_000_044 : 8_000_000)
  )
    throw new PublicError(
      "音频大小不符合制作记录，请重新同步或检查备份。",
      undefined,
      "record.audioSize",
    );
  const header = new DataView(await blob.slice(0, 44).arrayBuffer());
  if (type === "audio/wav") {
    if (
      header.getUint32(0) !== 0x52494646 ||
      header.getUint32(8) !== 0x57415645 ||
      header.getUint32(4, true) + 8 !== blob.size ||
      header.getUint32(12) !== 0x666d7420 ||
      header.getUint32(16, true) !== 16 ||
      header.getUint16(20, true) !== 1 ||
      header.getUint32(36) !== 0x64617461 ||
      (blob.size - 44) % 2 !== 0 ||
      header.getUint32(40, true) + 44 !== blob.size ||
      header.getUint16(22, true) !== 1 ||
      header.getUint16(34, true) !== 16 ||
      header.getUint32(24, true) !== 24000
    )
      throw new PublicError(
        "无法识别节目 WAV。",
        undefined,
        "record.wavInvalid",
      );
  } else if (
    header.getUint32(0) >>> 8 !== 0x494433 &&
    (header.getUint16(0) & 0xffe0) !== 0xffe0
  ) {
    throw new PublicError("无法识别节目 MP3。", undefined, "record.mp3Invalid");
  }
}
