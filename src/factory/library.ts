import { openDB, type DBSchema } from "idb";
import {
  defaultPreferences,
  type Edit,
  type Episode,
  type EpisodeSummary,
  type Preferences,
} from "../../shared/factory";
import { validateAudio } from "../../shared/audio-record";
import { editEpisode } from "../../shared/edit";
import { episodeAssets, readEpisode } from "../../shared/episode-record";
import { media, studio, StudioError } from "./api";

export type Record = {
  episode: Episode;
  assets: { [asset: string]: Blob };
  stamp: string;
  // Local edits take precedence until a paid render is explicitly submitted.
  edited?: boolean;
  deleted?: boolean;
};

interface LibraryDB extends DBSchema {
  episodes: { key: string; value: Record };
  settings: { key: string; value: Preferences };
}

let connection: ReturnType<typeof openDB<LibraryDB>> | undefined;
function db() {
  return (connection ??= openDB<LibraryDB>("knowledge-podcast-library", 1, {
    upgrade(database) {
      database.createObjectStore("episodes", { keyPath: "episode.id" });
      database.createObjectStore("settings");
    },
  }).catch((error) => {
    connection = undefined;
    throw error;
  }));
}

export const episodePath = (id: string) =>
  "/episodes/" + encodeURIComponent(id);
export const listRecords = async () =>
  (await (await db()).getAll("episodes"))
    .filter((row) => !row.deleted)
    .sort((a, b) => b.episode.updated.localeCompare(a.episode.updated));
export const loadPrefs = async () =>
  (await (await db()).get("settings", "preferences")) ?? defaultPreferences;
export const savePrefs = async (prefs: Preferences) =>
  (await db()).put("settings", prefs, "preferences");

const channel =
  typeof BroadcastChannel === "undefined"
    ? undefined
    : new BroadcastChannel("knowledge-podcast-library");
const changes = new EventTarget();

export function subscribe(listener: () => void) {
  changes.addEventListener("change", listener);
  channel?.addEventListener("message", listener);
  window.addEventListener("focus", listener);
  return () => {
    changes.removeEventListener("change", listener);
    channel?.removeEventListener("message", listener);
    window.removeEventListener("focus", listener);
  };
}

async function commit(
  id: string,
  expected: string | undefined,
  row: Record | null,
) {
  const tx = (await db()).transaction("episodes", "readwrite", {
    durability: "strict",
  });
  const write = tx.store.get(id).then(async (current) => {
    if (current?.stamp !== expected) return false;
    if (row) await tx.store.put({ ...row, stamp: crypto.randomUUID() });
    else await tx.store.delete(id);
    return true;
  });
  const [changed] = await Promise.all([write, tx.done]);
  if (changed) {
    changes.dispatchEvent(new Event("change"));
    channel?.postMessage(id);
  }
  return changed;
}

export async function localEdit(row: Record, revision: number, edit: Edit) {
  if (row.episode.syncToken && row.episode.job?.status === "running")
    throw new Error("制作进行中，请先取消。");
  const episode = editEpisode(row.episode, revision, edit);
  episode.updated = new Date().toISOString();
  if (!(await commit(episode.id, row.stamp, { ...row, episode, edited: true })))
    throw new Error("这期节目已在另一标签页更新，请重新打开后再试。");
}

export async function localDelete(row: Record, remotePossible: boolean) {
  // A tombstone prevents an offline deletion from being reimported by another tab.
  const tombstone = { ...row, assets: {}, deleted: true };
  if (
    !(await commit(
      row.episode.id,
      row.stamp,
      remotePossible ? tombstone : null,
    ))
  )
    throw new Error("节目已变化，请重新打开后再试。");
}

export async function addImported(episode: Episode, assets: Record["assets"]) {
  const copy = {
    ...episode,
    id: crypto.randomUUID(),
    updated: new Date().toISOString(),
  };
  delete copy.syncToken;
  delete copy.localStamp;
  if (copy.job?.status === "running")
    copy.job = { stage: copy.job.stage, status: "interrupted" };
  await commit(copy.id, undefined, { episode: copy, assets, stamp: "" });
  return copy.id;
}

async function retrieve(
  id: string,
  item: ReturnType<typeof episodeAssets>[number],
  signal: AbortSignal,
) {
  const response = await fetch(media(id, item.route, item.asset), {
    cache: "no-store",
    signal,
  });
  if (!response.ok)
    throw new StudioError("音频检查点已变化或无法下载。", response.status);
  const bytes = Number(response.headers.get("Content-Length"));
  if (
    !(bytes > 0 && bytes <= 24_000_044) ||
    response.headers.get("Content-Type") !== item.type
  )
    throw new Error("本机进程返回的音频格式或大小无效。");
  const blob = await response.blob();
  await validateAudio(blob, item.type);
  return blob;
}

export async function receive(
  episode: Episode,
  signal: AbortSignal,
  row: Record | undefined,
  replaceEdit = false,
) {
  const id = episode.id;
  if (row?.deleted || (row?.edited && !replaceEdit)) return false;
  const assets: Record["assets"] = {};
  for (const item of episodeAssets(episode))
    assets[item.asset] =
      row?.assets[item.asset] ?? (await retrieve(id, item, signal));
  // A pending render can live on the worker without the previous, already local, WAV.
  if (!episode.finished && row?.episode.finished) {
    episode = { ...episode, finished: row.episode.finished };
    for (const item of episodeAssets(episode))
      assets[item.asset] ??= row.assets[item.asset];
  }
  signal.throwIfAborted();
  return commit(id, row?.stamp, { episode, assets, stamp: "" });
}

export async function syncLibrary(
  remote: EpisodeSummary[],
  signal: AbortSignal,
  canRelease: boolean,
) {
  const hardware = await db();
  const remoteIds = new Set(remote.map(({ id }) => id));
  let issue: unknown;
  for (const row of await hardware.getAll("episodes")) {
    if (!row.deleted) continue;
    signal.throwIfAborted();
    const id = row.episode.id;
    try {
      if (remoteIds.has(id))
        await studio(episodePath(id), "DELETE", undefined, signal);
      await commit(id, row.stamp, null);
    } catch (error) {
      if (!(error instanceof StudioError && [404, 409].includes(error.status)))
        issue ??= error;
    }
  }
  for (const item of remote) {
    signal.throwIfAborted();
    const row = await hardware.get("episodes", item.id);
    if (row?.deleted) continue;
    try {
      let copy = row?.episode;
      let stagedJob = item.job;
      if (
        !copy ||
        !item.syncToken ||
        copy.syncToken !== item.syncToken ||
        episodeAssets(copy).some(({ asset }) => !row?.assets[asset])
      ) {
        const submitted = !!row?.edited && item.localStamp === row.stamp;
        if (row?.edited && !submitted) continue;
        copy = readEpisode(
          await studio(episodePath(item.id), "GET", undefined, signal),
        );
        if (submitted && copy.localStamp !== row?.stamp) continue;
        if (!(await receive(copy, signal, row, submitted))) continue;
        stagedJob = copy.job;
      }
      if (
        canRelease &&
        copy.syncToken &&
        !stagedJob &&
        copy.finished?.transcript
      ) {
        // A local script edit preserves the committed checkpoint's token and media.
        const saved = await hardware.get("episodes", item.id);
        if (
          saved?.episode.syncToken === copy.syncToken &&
          !saved.deleted &&
          episodeAssets(copy).every(({ asset }) => !!saved.assets[asset])
        )
          await studio(
            episodePath(item.id) + "/handoff",
            "POST",
            { syncToken: copy.syncToken },
            signal,
          );
      }
    } catch (error) {
      issue ??= error;
    }
  }
  if (issue !== undefined) throw issue;
}
