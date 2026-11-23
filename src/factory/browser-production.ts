import { validateAudio } from "../../shared/audio-record.ts";
import { episodeAssets, readEpisode } from "../../shared/episode-record.ts";
import {
  defaultPreferences,
  episodeId,
  limits,
  type Episode,
  type Job,
  type ProductionBounds,
  type Stage,
  type Turn,
} from "../../shared/factory.ts";
import { plans } from "../../shared/pipeline/languages.ts";
import {
  createOpenAI,
  defaults,
  type OpenAI,
} from "../../shared/pipeline/openai.ts";
import { assessAudio } from "../../shared/pipeline/qa.ts";
import { crossCheckResearch } from "../../shared/pipeline/research-audit.ts";
import { researchTopic } from "../../shared/pipeline/research.ts";
import { makeOutline, makeScript } from "../../shared/pipeline/script.ts";
import { transcribe } from "../../shared/pipeline/transcript.ts";
import { productionBounds, readPreferences } from "../../shared/preferences.ts";
import { get as getBrowserKey } from "./browser-key.ts";
import {
  generateNarration,
  REALTIME_MODEL,
  type NarrationOptions,
  type NarrationTake,
} from "./browser-narrator.ts";
import type * as Library from "./library.ts";

const narrationOutputTokens = 1024;
const bytesPerSecond = 48_000;
const wavHeaderBytes = 44;
const pauseBytes = Math.round(bytesPerSecond * 0.23);
const active = new Set<string>();
const localSaveSignal = new AbortController().signal;

const messages = {
  "no-key": "请先在此页面设置 OpenAI API 密钥。",
  "no-consent": "请先确认本次 OpenAI 使用的预估费用并同意继续。",
  "invalid-input": "请输入有效主题并检查语言、主持人数和制作时长上限。",
  "invalid-checkpoint": "本地制作记录或音频无效，请检查资料库。",
  "missing-checkpoint": "资料库中没有此制作记录。",
  conflict: "此节目正在制作或已在另一标签页更新，请重新打开后再试。",
  "save-failed": "无法保存本次制作进度。请检查浏览器存储后手动继续。",
  "load-failed": "无法读取本地制作进度，请检查浏览器存储。",
  cancelled: "已取消制作。先前保存的进度仍可继续使用。",
  unknown: "请求结果未知，可能已计费。请确认后手动重试。",
  rejected: "OpenAI 拒绝了请求，请检查密钥、模型权限或用量后手动重试。",
  "invalid-result":
    "OpenAI 返回的结果未通过检查。可使用先前保存的进度手动重试。",
  "incomplete-take": "配音片段未完成，可能已计费。请手动重试此片段。",
  "audio-too-long": "配音超出时长上限。已保存先前的片段。",
  "key-in-content": "内容包含当前 API 密钥，已停止制作。请移除密钥后再试。",
  "callback-failed": "无法显示制作预估或进度，已停止制作。",
} as const;

export class BrowserProductionError extends Error {
  declare code: keyof typeof messages;

  constructor(code: keyof typeof messages, cancelled = false) {
    super(messages[code]);
    this.name =
      cancelled || code === "cancelled"
        ? "AbortError"
        : "BrowserProductionError";
    this.code = code;
  }
}

type Estimate = ReturnType<typeof estimate>;
type Progress = {
  episodeId: string;
  stage: Stage;
  index: number;
  total: number;
};
type Take = Pick<NarrationTake, "audio" | "complete">;
type Dependencies = {
  getKey?: () => string | undefined;
  fetcher?: typeof fetch;
  narrate?: (options: NarrationOptions) => Promise<readonly Take[]>;
  library: Pick<typeof Library, "listRecords" | "receive">;
  now?: () => number;
  signal?: AbortSignal;
  onEstimate: (estimate: Estimate, episodeId: string) => void | Promise<void>;
  onProgress?: (event: Progress) => void | Promise<void>;
};
type RunOptions = { consent: boolean; signal?: AbortSignal };
type StartOptions = RunOptions & {
  id?: string;
  topic: string;
  production?: ProductionBounds;
};
type ResumeOptions = RunOptions & { id: string; retryUnknown?: boolean };
type PendingSave = { row: Library.Record; expected: Library.Record };

function readBounds(bounds: ProductionBounds): ProductionBounds {
  try {
    const { maxSeconds, maxHosts, language, allowedLanguages, exactHosts } =
      bounds;
    if (exactHosts !== undefined && (exactHosts !== 2 || maxHosts !== 2))
      throw new Error();
    const validated = productionBounds(
      readPreferences({
        ...defaultPreferences,
        maxSeconds,
        maxHosts,
        language,
        allowedLanguages,
      }),
    );
    return exactHosts ? { ...validated, exactHosts } : validated;
  } catch {
    throw new BrowserProductionError("invalid-input");
  }
}

function estimate(bounds: ProductionBounds, episode?: Episode) {
  const seconds = episode?.plan?.targetSeconds ?? bounds.maxSeconds;
  const research = episode?.research || episode?.researchDraft ? 0 : 6500;
  const crossCheck = episode?.research ? 0 : 6500;
  const outline = episode?.outline ? 0 : 3600;
  const script = episode?.script
    ? 0
    : Math.min(14_000, Math.max(4_500, seconds * 32));
  const finished =
    episode?.finished?.revision === episode?.revision
      ? episode?.finished
      : undefined;
  const narrationTurns = finished
    ? 0
    : episode?.script
      ? episode.script.turns.filter(({ id }) => !episode.render?.clips[id])
          .length
      : Math.min(limits.turns, Math.max(8, Math.ceil(seconds / 9)));
  const narration = narrationTurns * narrationOutputTokens;
  return {
    label: "estimate" as const,
    outputTokens: { research, crossCheck, outline, script, narration },
    maxOutputTokens: research + crossCheck + outline + script + narration,
    narrationOutputTokensPerTurn: narrationOutputTokens,
    narrationTurns,
    maxWebSearchCalls: (research ? limits.webCalls : 0) + (crossCheck ? 6 : 0),
    transcriptionAudioSeconds: finished?.transcript
      ? 0
      : (finished?.duration ?? bounds.maxSeconds),
  };
}

/** Previews the request ceilings before asking for consent. Input tokens and tool usage are separate. */
export function estimateBrowserProduction(
  bounds = productionBounds(),
): Estimate {
  return estimate(readBounds(bounds));
}

function checkCancelled(signal: AbortSignal) {
  if (signal.aborted) throw new BrowserProductionError("cancelled");
}

function checkRecord(row: Library.Record, key: string) {
  try {
    readEpisode(row.episode);
    if (
      episodeAssets(row.episode).some(
        ({ asset }) => !(row.assets[asset] instanceof Blob),
      )
    )
      throw new Error();
  } catch {
    throw new BrowserProductionError("invalid-checkpoint");
  }
  // Scan persisted content, including provider-generated text and URLs, before any write.
  JSON.stringify(row.episode, (field, value: unknown) => {
    if (
      field.includes(key) ||
      (typeof value === "string" && value.includes(key))
    )
      throw new BrowserProductionError("key-in-content");
    return value;
  });
}

async function checkedWav(audio: Blob) {
  if (
    !(audio instanceof Blob) ||
    audio.type !== "audio/wav" ||
    audio.size <= wavHeaderBytes
  )
    throw new BrowserProductionError("invalid-result");
  await validateAudio(audio, "audio/wav");
}

async function clipAsset(episode: Episode, turn: Turn) {
  // Include the turn ID so identical lines can keep distinct takes.
  const input = [
    1,
    REALTIME_MODEL,
    episode.language,
    turn.host,
    episode.voices[turn.host],
    turn.id,
    turn.text,
  ];
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(input)),
  );
  const hex = Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `clip-${hex}.pcm`;
}

async function assemble(episode: Episode, assets: Library.Record["assets"]) {
  const { script, outline, render } = episode;
  if (!script || !outline || !render)
    throw new BrowserProductionError("invalid-checkpoint");

  const chunks: BlobPart[] = [];
  const chapters: NonNullable<Episode["finished"]>["chapters"] = [];
  let previousChapter: string | undefined;
  let bytes = 0;
  const pause = new Uint8Array(pauseBytes);
  for (const turn of script.turns) {
    if (chunks.length) {
      chunks.push(pause);
      bytes += pauseBytes;
    }
    if (turn.chapterId !== previousChapter) {
      const chapter = outline.chapters.find(({ id }) => id === turn.chapterId)!;
      chapters.push({ title: chapter.title, start: bytes / bytesPerSecond });
      previousChapter = chapter.id;
    }
    const pcm = assets[render.clips[turn.id].asset].slice(wavHeaderBytes);
    chunks.push(pcm);
    bytes += pcm.size;
  }
  const first = assets[render.clips[script.turns[0].id].asset];
  const header = await first.slice(0, wavHeaderBytes).arrayBuffer();
  const view = new DataView(header);
  view.setUint32(4, bytes + 36, true);
  view.setUint32(40, bytes, true);
  const audio = new Blob([header, ...chunks], { type: "audio/wav" });
  return {
    audio,
    duration: bytes / bytesPerSecond,
    chapters,
    intendedText: script.turns.map(({ text }) => text).join("\n"),
  };
}

export function createBrowserProduction({
  getKey = getBrowserKey,
  fetcher = fetch,
  narrate = generateNarration,
  library,
  now = Date.now,
  signal: productionSignal,
  onEstimate,
  onProgress,
}: Dependencies) {
  const pending = new Map<string, PendingSave>();

  async function load(id: string) {
    try {
      return (await library.listRecords()).find(
        (record) => record.episode.id === id,
      );
    } catch {
      throw new BrowserProductionError("load-failed");
    }
  }

  async function write(next: Library.Record, expected?: Library.Record) {
    const id = next.episode.id;
    let saved: boolean;
    try {
      // receive only downloads missing assets. Always supply every referenced local blob.
      saved = await library.receive(
        next.episode,
        localSaveSignal,
        expected && { ...expected, assets: next.assets },
      );
    } catch {
      throw new BrowserProductionError("save-failed");
    }
    if (!saved) throw new BrowserProductionError("conflict");
    const result = await load(id);
    if (
      !result ||
      result.edited ||
      JSON.stringify(result.episode) !== JSON.stringify(next.episode)
    )
      throw new BrowserProductionError("conflict");
    return result;
  }

  async function run(
    options: StartOptions | ResumeOptions,
    id: string,
    signal: AbortSignal,
  ) {
    const starting = "topic" in options;
    const key = (() => {
      try {
        return getKey()?.trim() || "";
      } catch {
        return "";
      }
    })();
    if (!key) throw new BrowserProductionError("no-key");

    let saved = await load(id);
    checkCancelled(signal);
    if (starting && saved) throw new BrowserProductionError("conflict");
    if (!starting && !saved)
      throw new BrowserProductionError("missing-checkpoint");
    if (
      saved &&
      (saved.edited || saved.episode.syncToken || !saved.episode.production)
    )
      throw new BrowserProductionError("invalid-checkpoint");

    const bounds = readBounds(
      starting
        ? (options.production ?? productionBounds())
        : saved!.episode.production!,
    );
    const topic = starting
      ? typeof options.topic === "string"
        ? options.topic.trim()
        : ""
      : saved!.episode.topic;
    if (!topic || topic.length > limits.topic)
      throw new BrowserProductionError("invalid-input");

    const deferred = pending.get(id);
    if (deferred && saved) {
      checkRecord(deferred.row, key);
      if (saved.stamp === deferred.expected.stamp) {
        saved = await write(deferred.row, saved);
      } else if (
        JSON.stringify(saved.episode) !== JSON.stringify(deferred.row.episode)
      ) {
        pending.delete(id);
        throw new BrowserProductionError("conflict");
      }
      pending.delete(id);
    }

    let episode: Episode = structuredClone(
      saved?.episode ?? {
        id,
        topic,
        language:
          bounds.language === "auto"
            ? bounds.allowedLanguages[0]
            : bounds.language,
        voices: { A: "marin", B: "cedar" },
        production: bounds,
        updated: new Date(now()).toISOString(),
        revision: 1,
      },
    );
    let assets = { ...saved?.assets };
    checkRecord({ episode, assets, stamp: "" }, key);
    if (
      episode.job?.message === messages.unknown &&
      (starting || options.retryUnknown !== true)
    )
      throw new BrowserProductionError("unknown");
    if (
      episode.finished?.revision === episode.revision &&
      episode.finished.transcript
    )
      return saved!;

    const notify = async (callback: () => void | Promise<void>) => {
      try {
        await callback();
      } catch {
        throw new BrowserProductionError("callback-failed");
      }
      checkCancelled(signal);
    };
    const openai: OpenAI = async (...args) => {
      checkCancelled(signal);
      let status: number | undefined;
      const request = createOpenAI(key, async (input, init) => {
        const response = await fetcher(input, {
          ...init,
          credentials: "omit",
          cache: "no-store",
          referrerPolicy: "no-referrer",
        });
        status = response.status;
        return response;
      });
      try {
        return await request(...args);
      } catch {
        if (status !== undefined && [400, 401, 403, 404, 429].includes(status))
          throw new BrowserProductionError("rejected");
        throw new BrowserProductionError("unknown", signal.aborted);
      }
    };

    async function save(job?: Job, received = false) {
      if (job) episode.job = job;
      else delete episode.job;
      episode.updated = new Date(now()).toISOString();
      const next = {
        episode: structuredClone(episode),
        assets: { ...assets },
        stamp: "",
      };
      checkRecord(next, key);
      const previous = saved;
      if (received && previous)
        pending.set(id, { row: next, expected: previous });
      saved = await write(next, previous);
      if (received) pending.delete(id);
    }

    async function step(
      stage: Stage,
      index: number,
      total: number,
      next: Stage | undefined,
      work: () => Promise<void>,
    ) {
      checkCancelled(signal);
      await notify(() => onProgress?.({ episodeId: id, stage, index, total }));
      // A reload after dispatch cannot tell whether the provider completed the request.
      await save({ stage, status: "running", message: messages.unknown });
      try {
        checkCancelled(signal);
        await work();
        checkRecord({ episode, assets, stamp: "" }, key);
      } catch (error) {
        const failure =
          error instanceof BrowserProductionError
            ? error
            : new BrowserProductionError("invalid-result", signal.aborted);
        episode = structuredClone(saved!.episode);
        assets = { ...saved!.assets };
        await save({
          stage,
          status: signal.aborted ? "cancelled" : "failed",
          message: failure.message,
        });
        throw failure;
      }
      // Once a result arrives, preserve it even if cancellation races its save.
      await save(next && { stage: next, status: "running" }, true);
    }

    async function produce() {
      await notify(() => onEstimate(estimate(bounds, episode), id));
      if (!episode.research) {
        if (!episode.researchDraft)
          await step("research", 1, 2, "research", async () => {
            episode.researchDraft = await researchTopic(
              openai,
              defaults.research,
              topic,
              signal,
              true,
            );
          });
        await step("research", 2, 2, "outline", async () => {
          episode.research = await crossCheckResearch(
            openai,
            defaults.research,
            topic,
            episode.researchDraft!,
            signal,
          );
          delete episode.researchDraft;
        });
      }
      if (!episode.outline)
        await step("outline", 1, 1, "script", async () => {
          const planning = { ...episode, research: episode.research! };
          const outline = await makeOutline(
            openai,
            defaults.script,
            planning,
            signal,
          );
          episode = { ...planning, outline };
        });

      if (!episode.script)
        await step("script", 1, 1, "audio", async () => {
          episode.script = await makeScript(
            openai,
            defaults.script,
            {
              ...episode,
              research: episode.research!,
              outline: episode.outline!,
            },
            signal,
          );
        });

      if (episode.finished?.revision !== episode.revision) {
        const { turns } = episode.script!;
        const render = episode.render ?? {
          revision: episode.revision,
          model: REALTIME_MODEL,
          clips: {},
        };
        if (
          render.revision !== episode.revision ||
          render.model !== REALTIME_MODEL
        )
          throw new BrowserProductionError("invalid-checkpoint");
        episode.render = render;
        let bytes = (turns.length - 1) * pauseBytes;
        for (const [turnId, clip] of Object.entries(render.clips)) {
          const audio = assets[clip.asset];
          try {
            if (!turns.some((turn) => turn.id === turnId)) throw new Error();
            await checkedWav(audio);
            if (
              (audio.size - wavHeaderBytes) / bytesPerSecond !==
              clip.duration
            )
              throw new Error();
          } catch {
            throw new BrowserProductionError("invalid-checkpoint");
          }
          bytes += audio.size - wavHeaderBytes;
        }
        const maxBytes = bounds.maxSeconds * bytesPerSecond;
        if (bytes > maxBytes)
          throw new BrowserProductionError("audio-too-long");
        for (const [index, turn] of turns.entries()) {
          if (render.clips[turn.id]) continue;
          const asset = await clipAsset(episode, turn);
          await step("audio", index + 1, turns.length, "audio", async () => {
            let take: Take | undefined;
            try {
              const takes = await narrate({
                key,
                text: turn.text,
                voice: episode.voices[turn.host]!,
                instructions: plans[episode.language].audio,
                signal,
                consentGranted: true,
                maxOutputTokens: narrationOutputTokens,
                preserveIncomplete: true,
                onTake: (result) => {
                  take = result;
                },
              });
              take ??= takes[0];
            } catch {
              if (!take)
                throw new BrowserProductionError("unknown", signal.aborted);
            }
            if (!take?.complete)
              throw new BrowserProductionError("incomplete-take");
            await checkedWav(take.audio);
            const pcmBytes = take.audio.size - wavHeaderBytes;
            bytes += pcmBytes;
            if (bytes > maxBytes)
              throw new BrowserProductionError("audio-too-long");
            assets[asset] = take.audio;
            render.clips[turn.id] = {
              asset,
              duration: pcmBytes / bytesPerSecond,
            };
          });
        }

        checkCancelled(signal);
        const { audio, ...result } = await assemble(episode, assets);
        const asset = `episode-${crypto.randomUUID()}.wav`;
        assets[asset] = audio;
        const finished = {
          ...result,
          asset,
          revision: episode.revision,
          model: render.model,
        };
        episode.finished = {
          ...finished,
          qa: assessAudio({ ...episode, finished }),
        };
        await save({ stage: "transcript", status: "running" }, true);
      }

      const finished = episode.finished!;
      if (!finished.transcript)
        await step("transcript", 1, 1, undefined, async () => {
          await checkedWav(assets[finished.asset]);
          finished.transcript = await transcribe(
            openai,
            defaults.transcript,
            assets[finished.asset],
            finished.intendedText,
            signal,
          );
          finished.qa = assessAudio({ ...episode, finished });
        });

      return saved!;
    }

    try {
      return await produce();
    } catch (error) {
      const job = saved?.episode.job;
      if (
        error instanceof BrowserProductionError &&
        error.code === "cancelled" &&
        job?.status === "running" &&
        job.message !== messages.unknown
      ) {
        episode = structuredClone(saved!.episode);
        assets = { ...saved!.assets };
        await save({
          stage: job.stage,
          status: "cancelled",
          message: error.message,
        });
      }
      throw error;
    }
  }

  async function startRun(options: StartOptions | ResumeOptions, id: string) {
    if (options.consent !== true)
      throw new BrowserProductionError("no-consent");
    if (!episodeId.test(id)) throw new BrowserProductionError("invalid-input");
    const page = new AbortController();
    const signal = AbortSignal.any([
      page.signal,
      ...[productionSignal, options.signal].filter(
        (value) => value !== undefined,
      ),
    ]);
    checkCancelled(signal);
    if (active.has(id)) throw new BrowserProductionError("conflict");
    const stop = () => page.abort();
    active.add(id);
    globalThis.window?.addEventListener("pagehide", stop, { once: true });
    try {
      const locks = globalThis.navigator?.locks;
      if (!locks) return await run(options, id, signal);
      return await locks.request(
        `podcast-browser-production-${id}`,
        { ifAvailable: true },
        (lock) => {
          if (!lock) throw new BrowserProductionError("conflict");
          return run(options, id, signal);
        },
      );
    } catch (error) {
      if (error instanceof BrowserProductionError) throw error;
      throw new BrowserProductionError(
        signal.aborted ? "cancelled" : "invalid-checkpoint",
      );
    } finally {
      active.delete(id);
      globalThis.window?.removeEventListener("pagehide", stop);
    }
  }

  return {
    start: (options: StartOptions) =>
      startRun(options, options.id ?? crypto.randomUUID()),
    resume: (options: ResumeOptions) => startRun(options, options.id),
  };
}
