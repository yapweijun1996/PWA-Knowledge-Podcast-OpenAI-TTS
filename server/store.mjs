import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { PublicError } from "./errors.mjs";

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
    if (!episodeId.test(id)) throw new PublicError("找不到这期节目。", 404);
    return join(root, id);
  };
  const state = (id) => join(folder(id), "episode.json");
  const receipts = join(root, ".receipts");
  const receiptPath = (id) => {
    if (!episodeId.test(id)) throw new PublicError("找不到这期节目。", 404);
    return join(receipts, id + ".json");
  };
  const assetPath = (id, asset) => {
    if (!audioFile.test(asset)) throw new PublicError("找不到此音频。", 404);
    return join(folder(id), asset);
  };
  return {
    get(id) {
      const file = state(id);
      if (!existsSync(file)) throw new PublicError("找不到这期节目。", 404);
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
    save(episode) {
      episode.updated = new Date().toISOString();
      episode.syncToken = randomUUID();
      mkdirSync(folder(episode.id), { recursive: true, mode: 0o700 });
      writeAtomic(state(episode.id), JSON.stringify(episode));
      return episode;
    },
    delete(id) {
      rmSync(folder(id), { recursive: true });
    },
    receipt(id) {
      try {
        return JSON.parse(readFileSync(receiptPath(id), "utf8"));
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    },
    release(episode) {
      mkdirSync(receipts, { recursive: true, mode: 0o700 });
      // Keep a small receipt so delayed create requests cannot charge again.
      writeAtomic(
        receiptPath(episode.id),
        JSON.stringify({ localStamp: episode.localStamp }),
      );
      this.delete(episode.id);
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
