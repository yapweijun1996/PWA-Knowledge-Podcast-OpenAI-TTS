import { openDB, type DBSchema } from "idb";
import type { Storyboard } from "./storyboard.ts";

export type StoryboardDraft = {
  draft: Storyboard;
  applied?: Storyboard;
};

export type StoryboardRecord = StoryboardDraft & { stamp: string };
export type StoryboardStore = {
  get(key: string): Promise<StoryboardRecord | undefined>;
  put(
    key: string,
    value: StoryboardDraft,
    expected: string | undefined,
    signal?: AbortSignal,
  ): Promise<StoryboardRecord | undefined>;
};

interface StoryboardDB extends DBSchema {
  storyboards: { key: string; value: StoryboardRecord };
}

let connection: ReturnType<typeof openDB<StoryboardDB>> | undefined;
function db() {
  return (connection ??= openDB<StoryboardDB>(
    "knowledge-podcast-storyboards",
    1,
    {
      upgrade(database) {
        database.createObjectStore("storyboards");
      },
    },
  ).catch((error) => {
    connection = undefined;
    throw error;
  }));
}

const updates = new EventTarget();
let channel: BroadcastChannel | undefined;
function broadcast() {
  if (typeof BroadcastChannel !== "undefined")
    return (channel ??= new BroadcastChannel("knowledge-podcast-storyboards"));
}

export function subscribeStoryboards(notify: () => void) {
  const changes = broadcast();
  updates.addEventListener("change", notify);
  changes?.addEventListener("message", notify);
  return () => {
    updates.removeEventListener("change", notify);
    changes?.removeEventListener("message", notify);
  };
}

export const browserStoryboards: StoryboardStore = {
  async get(key) {
    return (await db()).get("storyboards", key);
  },
  async put(key, value, expected, signal) {
    const database = await db();
    signal?.throwIfAborted();
    const tx = database.transaction("storyboards", "readwrite", {
      durability: "strict",
    });
    const abort = () => {
      try {
        tx.abort();
      } catch {
        // The write may already be committed.
      }
    };
    signal?.addEventListener("abort", abort, { once: true });
    try {
      const write = tx.store.get(key).then(async (before) => {
        if (before?.stamp !== expected) return;
        const record = { ...value, stamp: crypto.randomUUID() };
        await tx.store.put(record, key);
        return record;
      });
      const [record] = await Promise.all([write, tx.done]);
      if (record) {
        updates.dispatchEvent(new Event("change"));
        broadcast()?.postMessage(key);
      }
      return record;
    } finally {
      signal?.removeEventListener("abort", abort);
    }
  },
};
