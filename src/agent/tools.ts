import { validateAudio } from "../../shared/audio-record.ts";
import {
  episodeId,
  limits,
  type Episode,
  type ProductionBounds,
  type Stage,
} from "../../shared/factory.ts";
import { defaults } from "../../shared/pipeline/openai.ts";
import { productionBounds } from "../../shared/preferences.ts";
import { get as getBrowserKey } from "../factory/browser-key.ts";
import {
  BrowserProductionError,
  createBrowserProduction,
  estimateBrowserProduction,
} from "../factory/browser-production.ts";
import { REALTIME_MODEL } from "../factory/browser-narrator.ts";
import type * as Library from "../factory/library.ts";
import { t } from "../i18n/index.ts";
import { buildPublishPackage } from "../publish/package.ts";
import { drawThumbnail, thumbnailSize } from "../publish/thumbnail.ts";
import { renderVideo, type VideoAudio } from "../video/render.ts";
import { buildTimeline } from "../video/timeline.ts";
import { browserAgentArtifacts, type AgentArtifactStore } from "./artifacts.ts";
import {
  createAgentBridge,
  objectSchema,
  ToolFailure,
  type Tool,
} from "./bridge.ts";
import { readKey } from "./runtime.ts";

type ProductionDeps = Parameters<typeof createBrowserProduction>[0];
type PodcastDependencies = {
  library: ProductionDeps["library"];
  getKey: NonNullable<ProductionDeps["getKey"]>;
  fetcher?: ProductionDeps["fetcher"];
  narrate?: ProductionDeps["narrate"];
  production?: ProductionBounds;
  artifacts: AgentArtifactStore;
  render: typeof renderVideo;
  makeThumbnail: (title: string, language: Episode["language"]) => Promise<Blob>;
};

const localLibrary: PodcastDependencies["library"] = {
  listRecords: async () =>
    (await import("../factory/library.ts")).listRecords(),
  receive: async (...args) =>
    (await import("../factory/library.ts")).receive(...args),
};

async function makeThumbnail(
  title: string,
  language: Episode["language"],
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = thumbnailSize.width;
  canvas.height = thumbnailSize.height;
  const context = canvas.getContext("2d");
  if (!context) throw new ToolFailure("error");
  drawThumbnail(context, { title, theme: "dark", language });
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new ToolFailure("error"));
    }, "image/png");
  });
}

async function getEpisode(library: PodcastDependencies["library"], id: string) {
  const row = (await library.listRecords()).find(
    ({ episode, deleted }) => !deleted && episode.id === id,
  );
  if (!row) throw new ToolFailure("not_found");
  return row;
}

function summary({ episode }: Library.Record) {
  return {
    id: episode.id,
    title: episode.script?.title || episode.topic,
    language: episode.language,
    revision: episode.revision,
    hasResearch: Boolean(episode.research),
    hasScript: Boolean(episode.script),
    hasAudio: episode.finished?.revision === episode.revision,
  };
}

type ProductionOperation =
  | { tool: "research"; topic: string }
  | { tool: "script" | "narration"; id: string };

async function produce(
  operation: ProductionOperation,
  deps: PodcastDependencies,
  signal: AbortSignal,
) {
  const { getKey, library, fetcher, narrate, production } = deps;
  if (!readKey(getKey)) throw new ToolFailure("no_key");
  const id = operation.tool === "research" ? crypto.randomUUID() : operation.id;
  const allowed: readonly Stage[] =
    operation.tool === "research"
      ? ["research"]
      : operation.tool === "script"
        ? ["outline", "script"]
        : ["audio", "transcript"];

  if (operation.tool !== "research") {
    const { episode } = await getEpisode(library, id);
    if (
      (operation.tool === "script" && !episode.research) ||
      (operation.tool === "narration" && !episode.script)
    )
      throw new ToolFailure("prerequisite_required");
  }
  signal.throwIfAborted();

  let atBoundary = false;
  const pipeline = createBrowserProduction({
    getKey,
    library,
    fetcher,
    narrate,
    signal,
    onEstimate: () => {},
    onProgress({ stage }) {
      // The previous stage is saved before this hook. Throwing prevents the next dispatch.
      if (!allowed.includes(stage)) {
        atBoundary = true;
        throw new Error();
      }
    },
  });

  try {
    if (operation.tool === "research")
      await pipeline.start({
        id,
        topic: operation.topic,
        production,
        consent: true,
      });
    else await pipeline.resume({ id, consent: true });
  } catch (error) {
    if (!(error instanceof BrowserProductionError)) throw error;
    switch (error.code) {
      case "callback-failed":
        if (atBoundary) break;
        throw new ToolFailure("error");
      case "unknown":
      case "incomplete-take":
        throw new ToolFailure("unknown_may_have_been_billed");
      case "cancelled":
        throw new ToolFailure("aborted");
      case "missing-checkpoint":
        throw new ToolFailure("not_found");
      case "conflict":
        throw new ToolFailure("conflict");
      case "no-key":
        throw new ToolFailure("no_key");
      case "key-in-content":
        throw new ToolFailure("key_in_content");
      case "rejected":
        throw new ToolFailure("provider_rejected");
      case "save-failed":
        throw new ToolFailure("save_failed");
      default:
        throw new ToolFailure("error");
    }
  }

  const row = await getEpisode(library, id);
  const { episode } = row;
  if (
    (operation.tool === "research" && !episode.research) ||
    (operation.tool === "script" && !episode.script) ||
    (operation.tool === "narration" && !episode.finished?.transcript)
  )
    throw new ToolFailure("prerequisite_required");
  return row;
}

function artifactId(
  kind: "video" | "publish",
  { episode, stamp }: Library.Record,
) {
  return `${kind}-${episode.id}-${episode.revision}-${stamp}`;
}

async function savedAudio({
  episode,
  assets,
}: Library.Record): Promise<VideoAudio> {
  const { finished } = episode;
  const blob = finished && assets[finished.asset];
  if (finished?.revision !== episode.revision || blob?.type !== "audio/wav")
    throw new ToolFailure("prerequisite_required");
  await validateAudio(blob, "audio/wav");
  const bytes = new DataView(await blob.slice(44).arrayBuffer());
  const samples = new Float32Array(bytes.byteLength / 2);
  for (let i = 0; i < samples.length; i++)
    samples[i] = bytes.getInt16(i * 2, true) / 32768;
  return { channels: [samples], sampleRate: 24_000 };
}

function ensureSafe(episode: Episode, redact: (text: string) => string) {
  const content = JSON.stringify(episode);
  if (redact(content) !== content) throw new ToolFailure("key_in_content");
}

const byId = objectSchema({
  episodeId: { type: "string", pattern: episodeId.source },
});

const ceiling = estimateBrowserProduction({
  ...productionBounds(),
  maxSeconds: 420,
});
const podcastTools: readonly Tool<PodcastDependencies>[] = [
  {
    name: "list_episodes",
    description: () => t("agent.tool.listEpisodes"),
    parameters: objectSchema({}),
    paid: false,
    async run(_args, { deps }) {
      const records = (await deps.library.listRecords()).filter(
        (row) => !row.deleted,
      );
      return {
        total: records.length,
        episodes: records.slice(0, limits.projects).map(summary),
      };
    },
  },
  {
    name: "get_episode",
    description: () => t("agent.tool.getEpisode"),
    parameters: byId,
    paid: false,
    async run({ episodeId }, { deps }) {
      return summary(await getEpisode(deps.library, String(episodeId)));
    },
  },
  {
    name: "research_topic",
    description: () => t("agent.tool.research"),
    parameters: objectSchema({
      topic: {
        type: "string",
        minLength: 1,
        maxLength: limits.topic,
        pattern: "\\S",
      },
    }),
    paid: true,
    estimate: {
      label: "estimate",
      model: defaults.research,
      description: () => t("agent.estimate.research"),
      maxRequests: 2,
      maxOutputTokens:
        ceiling.outputTokens.research + ceiling.outputTokens.crossCheck,
      maxWebSearchCalls: ceiling.maxWebSearchCalls,
    },
    async run({ topic }, { deps, signal }) {
      if (String(topic).trim().length > limits.topic)
        throw new ToolFailure("invalid_arguments");
      return summary(
        await produce({ tool: "research", topic: String(topic) }, deps, signal),
      );
    },
  },
  {
    name: "write_script",
    description: () => t("agent.tool.writeScript"),
    parameters: byId,
    paid: true,
    estimate: {
      label: "estimate",
      model: defaults.script,
      description: () => t("agent.estimate.script"),
      maxRequests: 2,
      maxOutputTokens: ceiling.outputTokens.outline + 14_000,
    },
    async run({ episodeId }, { deps, signal }) {
      return summary(
        await produce({ tool: "script", id: String(episodeId) }, deps, signal),
      );
    },
  },
  {
    name: "narrate_episode",
    description: () => t("agent.tool.narrate"),
    parameters: byId,
    paid: true,
    estimate: {
      label: "estimate",
      model: REALTIME_MODEL,
      description: () => t("agent.estimate.narration"),
      maxRequests: ceiling.narrationTurns + 1,
      maxOutputTokens: ceiling.outputTokens.narration,
      narrationTurns: ceiling.narrationTurns,
      narrationOutputTokensPerTurn: ceiling.narrationOutputTokensPerTurn,
      transcriptionAudioSeconds: ceiling.transcriptionAudioSeconds,
    },
    async run({ episodeId }, { deps, signal }) {
      return summary(
        await produce(
          { tool: "narration", id: String(episodeId) },
          deps,
          signal,
        ),
      );
    },
  },
  {
    name: "render_video",
    description: () => t("agent.tool.renderVideo"),
    parameters: byId,
    paid: false,
    async run({ episodeId }, { deps, signal, redact }) {
      const row = await getEpisode(deps.library, String(episodeId));
      const { episode } = row;
      ensureSafe(episode, redact);
      const plan = buildTimeline(episode);
      if (!episode.script || plan.estimated)
        throw new ToolFailure("prerequisite_required");
      const audio = await savedAudio(row);
      signal.throwIfAborted();
      const { blob, sha256, durationSeconds } = await deps.render({
        plan,
        audio,
        theme: "dark",
        signal,
      });
      signal.throwIfAborted();
      const id = artifactId("video", row);
      try {
        await deps.artifacts.put(
          {
            id,
            kind: "video",
            episodeId: episode.id,
            revision: episode.revision,
            sourceStamp: row.stamp,
            blob,
          },
          signal,
        );
      } catch {
        signal.throwIfAborted();
        throw new ToolFailure("save_failed");
      }
      return {
        id,
        episodeId: episode.id,
        durationSeconds,
        sha256,
        bytes: blob.size,
      };
    },
  },
  {
    name: "export_publish_package",
    description: () => t("agent.tool.exportPackage"),
    parameters: byId,
    paid: false,
    async run({ episodeId }, { deps, signal, redact }) {
      const row = await getEpisode(deps.library, String(episodeId));
      const { episode } = row;
      ensureSafe(episode, redact);
      const video = await deps.artifacts.get(artifactId("video", row));
      if (!video || video.sourceStamp !== row.stamp)
        throw new ToolFailure("prerequisite_required");
      const thumbnailBlob = await deps.makeThumbnail(
        episode.script?.title || episode.topic,
        episode.language,
      );
      const result = buildPublishPackage({
        episode,
        plan: buildTimeline(episode),
        videoBlob: video.blob,
        thumbnailBlob,
      });
      const blob = await result.zip();
      signal.throwIfAborted();
      const id = artifactId("publish", row);
      try {
        await deps.artifacts.put(
          {
            id,
            kind: "publish",
            episodeId: episode.id,
            revision: episode.revision,
            sourceStamp: row.stamp,
            blob,
          },
          signal,
        );
      } catch {
        signal.throwIfAborted();
        throw new ToolFailure("save_failed");
      }
      return {
        id,
        episodeId: episode.id,
        files: result.files.map(({ name }) => name),
        bytes: blob.size,
      };
    },
  },
];

export function createPodcastAgentBridge({
  library = localLibrary,
  getKey = getBrowserKey,
  fetcher,
  narrate,
  production,
  artifacts = browserAgentArtifacts,
  render = renderVideo,
  makeThumbnail: thumbnail = makeThumbnail,
  timeoutMs,
  settleOnAbort,
}: Partial<PodcastDependencies> & {
  timeoutMs?: number;
  settleOnAbort?: boolean;
} = {}) {
  return createAgentBridge(podcastTools, {
    deps: {
      library,
      getKey,
      fetcher,
      narrate,
      production,
      artifacts,
      render,
      makeThumbnail: thumbnail,
    },
    getKey,
    timeoutMs,
    settleOnAbort,
  });
}
