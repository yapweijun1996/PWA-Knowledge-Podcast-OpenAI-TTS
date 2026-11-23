import { PublicError } from "./pipeline/errors.ts";
import { episodeAssets, readEpisode } from "./episode-record.ts";
import { validateAudio } from "./audio-record.ts";
import type { Episode } from "./factory.ts";

type Archive = { episode: Episode; assets: Record<string, Blob> };

const magic = "KPS-V2";
const manifestLimit = 262_144;
export const backupLimit = 120_000_000;

async function checksum(blob: Blob) {
  const hash = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function backupRecord(row: Archive) {
  const episode = structuredClone(row.episode);
  delete episode.syncToken;
  delete episode.localStamp;
  const entries = episodeAssets(episode);
  const blobs = entries.map(({ asset }) => {
    const blob = row.assets[asset];
    if (!blob)
      throw new PublicError(
        "还有音频未保存到浏览器，请先同步。",
        undefined,
        "backup.audioMissing",
      );
    return blob;
  });
  const lengths = blobs.map((blob) => blob.size);
  const hashes: string[] = [];
  for (const blob of blobs) hashes.push(await checksum(blob));
  const manifest = JSON.stringify({ episode, lengths, hashes });
  const json = new Blob([manifest]);
  if (
    json.size > manifestLimit ||
    lengths.reduce((sum, length) => sum + length, 0) + json.size + 13 >
      backupLimit
  )
    throw new PublicError(
      "节目记录太大，无法导出。",
      undefined,
      "backup.recordTooLarge",
    );
  const header = new TextEncoder().encode(
    magic + String(json.size).padStart(8, "0"),
  );
  return new Blob([header, json, ...blobs], {
    type: "application/octet-stream",
  });
}

export async function restoreRecord(file: Blob) {
  const fail = () =>
    new PublicError(
      "备份无效、音频缺失或超过 120 MB。",
      undefined,
      "backup.invalid",
    );
  const headerSize = magic.length + 8;
  if (file.size > backupLimit || file.size <= headerSize) throw fail();
  const header = await file.slice(0, headerSize).text();
  if (!/^KPS-V2\d{8}$/.test(header)) throw fail();
  const size = Number(header.slice(magic.length));
  if (size < 2 || size > manifestLimit || headerSize + size > file.size)
    throw fail();
  const manifest = JSON.parse(
    await file.slice(headerSize, headerSize + size).text(),
  );
  const episode = readEpisode(manifest.episode);
  delete episode.syncToken;
  delete episode.localStamp;
  const entries = episodeAssets(episode);
  if (
    !Array.isArray(manifest.lengths) ||
    manifest.lengths.length !== entries.length ||
    !Array.isArray(manifest.hashes) ||
    manifest.hashes.length !== entries.length
  )
    throw fail();
  const assets: Archive["assets"] = {};
  let cursor = headerSize + size;
  for (const [index, { asset, type }] of entries.entries()) {
    const length = manifest.lengths[index];
    if (
      !Number.isSafeInteger(length) ||
      length <= 0 ||
      length > file.size - cursor
    )
      throw fail();
    const blob = file.slice(cursor, cursor + length, type);
    await validateAudio(blob, type);
    if ((await checksum(blob)) !== manifest.hashes[index]) throw fail();
    assets[asset] = blob;
    cursor += length;
  }
  if (cursor !== file.size) throw fail();
  return { episode, assets };
}
