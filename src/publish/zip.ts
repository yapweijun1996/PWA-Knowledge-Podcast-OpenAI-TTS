import { t } from "../i18n/index.ts";

type ZipEntry = { name: string; blob: Blob };

const fieldLimit = 0xffffffff;
const version = 20;
const utf8 = 0x0800;
const dosDate = 0x0021; // January 1, 1980, for deterministic archives.
const encoder = new TextEncoder();
const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit++) {
    crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return crc;
});

async function crc32(blob: Blob) {
  let crc = 0xffffffff;
  const reader = blob.stream().getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const byte of value) {
        crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff];
      }
    }
  } finally {
    reader.releaseLock();
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export async function createStoredZip(
  entries: readonly ZipEntry[],
): Promise<Blob> {
  if (entries.length >= 0xffff) {
    throw new RangeError(t("publish.zip.tooManyFiles"));
  }
  const localParts: BlobPart[] = [];
  const centralParts: BlobPart[] = [];
  let offset = 0;
  let centralSize = 0;
  for (const { name, blob } of entries) {
    const filename = encoder.encode(name);
    if (!filename.length || filename.length > 0xffff) {
      throw new RangeError(t("publish.zip.invalidFilename"));
    }
    // Zero-filled headers store files without compression or extra fields.
    const local = new Uint8Array(30);
    const central = new Uint8Array(46);
    const nextOffset = offset + local.length + filename.length + blob.size;
    centralSize += central.length + filename.length;
    if (nextOffset + centralSize + 22 >= fieldLimit) {
      throw new RangeError(t("publish.zip.tooLarge"));
    }
    const crc = await crc32(blob);

    const localHeader = new DataView(local.buffer);
    localHeader.setUint32(0, 0x04034b50, true);
    localHeader.setUint16(4, version, true);
    localHeader.setUint16(6, utf8, true);
    localHeader.setUint16(12, dosDate, true);
    localHeader.setUint32(14, crc, true);
    localHeader.setUint32(18, blob.size, true);
    localHeader.setUint32(22, blob.size, true);
    localHeader.setUint16(26, filename.length, true);
    localParts.push(local, filename, blob);

    const centralHeader = new DataView(central.buffer);
    centralHeader.setUint32(0, 0x02014b50, true);
    centralHeader.setUint16(4, version, true);
    centralHeader.setUint16(6, version, true);
    centralHeader.setUint16(8, utf8, true);
    centralHeader.setUint16(14, dosDate, true);
    centralHeader.setUint32(16, crc, true);
    centralHeader.setUint32(20, blob.size, true);
    centralHeader.setUint32(24, blob.size, true);
    centralHeader.setUint16(28, filename.length, true);
    centralHeader.setUint32(42, offset, true);
    centralParts.push(central, filename);

    offset = nextOffset;
  }

  const end = new Uint8Array(22);
  const endRecord = new DataView(end.buffer);
  endRecord.setUint32(0, 0x06054b50, true);
  endRecord.setUint16(8, entries.length, true);
  endRecord.setUint16(10, entries.length, true);
  endRecord.setUint32(12, centralSize, true);
  endRecord.setUint32(16, offset, true);
  return new Blob([...localParts, ...centralParts, end], {
    type: "application/zip",
  });
}
