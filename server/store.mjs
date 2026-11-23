import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { PublicError } from "../shared/pipeline/errors.ts";

import { episodeId } from "../shared/factory.ts";
export { episodeId };
const audioFile =
  /^(?:clip-[a-f0-9]{64}\.pcm|episode-[a-f0-9-]{36}\.(?:wav|mp3))$/;

export function writeAtomic(path, data) {
  const temp = path + "." + randomUUID() + ".tmp";
  try {
    writeFileSync(temp, data, { mode: 0o600, flag: "wx", flush: true });
    renameSync(temp, path);
  } finally {
    rmSync(temp, { force: true });
  }
}

export function createStore(dataDir) {
  const root = resolve(dataDir);
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const folder = (id) => {
    if (!episodeId.test(id))
      throw new PublicError("找不到这期节目。", 404, "episode.missing");
    return join(root, id);
  };
  const state = (id) => join(folder(id), "episode.json");
  const receipts = join(root, ".receipts");
  const receiptPath = (id) => {
    if (!episodeId.test(id))
      throw new PublicError("找不到这期节目。", 404, "episode.missing");
    return join(receipts, id + ".json");
  };
  const assetPath = (id, asset) => {
    if (!audioFile.test(asset))
      throw new PublicError("找不到此音频。", 404, "audio.missing");
    return join(folder(id), asset);
  };
  return {
    cleanInterruptedImports() {
      for (const entry of readdirSync(root, { withFileTypes: true })) {
        if (
          entry.isDirectory() &&
          /^\.podcast-import-[a-zA-Z0-9]{6}$/.test(entry.name)
        )
          rmSync(join(root, entry.name), { recursive: true });
      }
    },
    get(id) {
      const file = state(id);
      if (!existsSync(file))
        throw new PublicError("找不到这期节目。", 404, "episode.missing");
      return JSON.parse(readFileSync(file, "utf8"));
    },
    list() {
      return readdirSync(root, { withFileTypes: true })
        .filter(
          (entry) =>
            entry.isDirectory() &&
            episodeId.test(entry.name) &&
            existsSync(state(entry.name)),
        )
        .map((entry) => this.get(entry.name))
        .sort((a, b) => b.updated.localeCompare(a.updated));
    },
    save(episode, importedMedia) {
      episode.updated = new Date().toISOString();
      episode.syncToken = randomUUID();
      if (importedMedia) {
        // Publish metadata and media together so recovery cannot see half an import.
        const staging = mkdtempSync(join(root, ".podcast-import-"));
        try {
          for (const [asset, bytes] of importedMedia) {
            if (!audioFile.test(asset))
              throw new PublicError(
                "音频文件名无效。",
                400,
                "audio.assetNameInvalid",
              );
            writeAtomic(join(staging, asset), bytes);
          }
          writeAtomic(join(staging, "episode.json"), JSON.stringify(episode));
          renameSync(staging, folder(episode.id));
          return episode;
        } finally {
          rmSync(staging, { recursive: true, force: true });
        }
      }
      mkdirSync(folder(episode.id), { recursive: true, mode: 0o700 });
      writeAtomic(state(episode.id), JSON.stringify(episode));
      return episode;
    },
    receipt(id) {
      try {
        return JSON.parse(readFileSync(receiptPath(id), "utf8"));
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    },
    accepted(id, stamp) {
      const receipt = this.receipt(id);
      return (
        receipt?.localStamp === stamp || receipt?.localStamps?.includes(stamp)
      );
    },
    remember(id, stamp) {
      const receipt = this.receipt(id);
      const stamps = new Set(receipt?.localStamps ?? []);
      // Older workers recorded only their last handed-off browser stamp.
      if (receipt?.localStamp) stamps.add(receipt.localStamp);
      if (receipt && (!stamp || stamps.has(stamp))) return;
      if (stamp) stamps.add(stamp);
      mkdirSync(receipts, { recursive: true, mode: 0o700 });
      writeAtomic(
        receiptPath(id),
        JSON.stringify({ localStamps: [...stamps] }),
      );
    },
    release(episode) {
      this.remember(episode.id, episode.localStamp);
      rmSync(folder(episode.id), { recursive: true });
    },
    assetPath,
    readAsset(id, asset) {
      return readFileSync(assetPath(id, asset));
    },
    writeAsset(id, asset, bytes) {
      writeAtomic(assetPath(id, asset), bytes);
    },
    prune(episode) {
      const keep = new Set([
        episode.finished?.asset,
        episode.finished?.mp3,
        ...Object.values(episode.render?.clips ?? {}).map(({ asset }) => asset),
      ]);
      for (const name of readdirSync(folder(episode.id))) {
        if ((audioFile.test(name) && !keep.has(name)) || name.endsWith(".tmp"))
          rmSync(join(folder(episode.id), name), { force: true });
      }
    },
  };
}
