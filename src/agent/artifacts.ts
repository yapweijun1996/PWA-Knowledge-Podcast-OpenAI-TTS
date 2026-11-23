import { openDB, type DBSchema } from "idb";
import type { Studio3dSettings } from "../video/scenes/studio3d/presets.ts";
import type { SceneNotice } from "../video/scenes/types.ts";

export type AgentArtifact = {
  id: string;
  kind: "video" | "publish";
  episodeId: string;
  revision: number;
  sourceStamp: string;
  blob: Blob;
  metadata?: {
    studioVideo?: {
      sha256: string;
      durationSeconds: number;
      videoCodec: string;
      audioCodec: "aac" | "opus";
      theme: "light" | "dark";
      sceneId?: string;
      studio3d?: Studio3dSettings;
      chapterScenes?: { chapterId: string; sceneId: string }[];
      sceneNotices?: SceneNotice[];
      timeline: {
        estimated: boolean;
        chapters: { title: string; start: number; timestamp: string }[];
      };
      review: {
        title: string;
        summary: string;
        tags: string;
        chapterTitles: string[];
        status: "pending" | "approved" | "rejected";
      };
    };
  };
};

export interface AgentArtifactStore {
  get(id: string): Promise<AgentArtifact | undefined>;
  put(artifact: AgentArtifact, signal: AbortSignal): Promise<void>;
}

interface ArtifactDB extends DBSchema {
  artifacts: { key: string; value: AgentArtifact };
}

let connection: ReturnType<typeof openDB<ArtifactDB>> | undefined;
function db() {
  return (connection ??= openDB<ArtifactDB>("knowledge-podcast-agent", 1, {
    upgrade(database) {
      database.createObjectStore("artifacts", { keyPath: "id" });
    },
  }).catch((error) => {
    connection = undefined;
    throw error;
  }));
}

export const browserAgentArtifacts: AgentArtifactStore = {
  async get(id) {
    return (await db()).get("artifacts", id);
  },
  async put(artifact, signal) {
    const database = await db();
    signal.throwIfAborted();
    const tx = database.transaction("artifacts", "readwrite", {
      durability: "strict",
    });
    const stop = () => {
      try {
        tx.abort();
      } catch {
        // The transaction can finish before the signal arrives.
      }
    };
    signal.addEventListener("abort", stop, { once: true });
    try {
      await Promise.all([tx.store.put(artifact), tx.done]);
    } finally {
      signal.removeEventListener("abort", stop);
    }
  },
};
