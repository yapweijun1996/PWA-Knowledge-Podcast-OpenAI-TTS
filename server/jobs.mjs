import { createHash, randomUUID } from "node:crypto";
import { languages, limits } from "../shared/factory.ts";
import { assembly, duration, wave } from "./audio.mjs";
import { editEpisode } from "../shared/edit.ts";
import { readEpisode } from "../shared/episode-record.ts";
import { assessAudio } from "./qa.mjs";
import { crossCheckResearch } from "./research-audit.mjs";
import { PublicError } from "./errors.mjs";
import { researchTopic } from "./research.mjs";
import { makeOutline, makeScript } from "./script.mjs";
import { episodeId } from "./store.mjs";
import { transcribe } from "./transcript.mjs";

const clipName = (episode, model, turn) => {
  const input = [
    1,
    model,
    episode.language,
    turn.host,
    episode.voices[turn.host],
    turn.text,
  ];
  return (
    "clip-" +
    createHash("sha256").update(JSON.stringify(input)).digest("hex") +
    ".pcm"
  );
};

export function createJobs({
  store,
  openai,
  narrator,
  models,
  configured,
  encodeMP3,
}) {
  let active;

  function requireIdle(episode) {
    if (active?.id === episode.id)
      throw new PublicError("请等待任务完成或取消后再修改。", 409);
  }

  function requireRevision(episode, revision) {
    if (episode.revision !== revision)
      throw new PublicError("另一个标签页已更新脚本。请刷新后再试。", 409);
  }

  function start(episode, kind, consent, autoAudio = false) {
    if (!["draft", "audio", "transcript"].includes(kind))
      throw new PublicError("未知的制作任务。", 400);
    const stage = {
      draft: episode.research
        ? episode.outline
          ? "script"
          : "outline"
        : "research",
      audio: "audio",
      transcript: "transcript",
    }[kind];
    if (!(typeof configured === "function" ? configured() : configured))
      throw new PublicError("请先在服务器配置 OPENAI_API_KEY。", 503);
    if (consent !== true)
      throw new PublicError("请先确认本次 OpenAI 使用可能产生费用。", 400);
    if (active)
      throw new PublicError("已有一期正在制作。请等待或取消该任务。", 409);
    const current = episode.finished?.revision === episode.revision;
    if (
      (kind === "draft" && episode.script) ||
      (kind === "audio" && (!episode.script || current)) ||
      (kind === "transcript" && (!current || episode.finished.transcript))
    )
      throw new PublicError("此阶段已完成，或尚未准备好。", 409);
    episode.job = {
      stage,
      status: "running",
      ...(kind === "draft" && autoAudio === true ? { autoAudio: true } : {}),
    };
    store.save(episode);
    const controller = new AbortController();
    const task = Promise.resolve()
      .then(() => run(episode, kind, controller.signal))
      .catch(() => console.error("Podcast job state could not be saved."));
    active = { id: episode.id, controller, task };
    return store.get(episode.id);
  }

  async function run(episode, kind, signal) {
    try {
      signal.throwIfAborted();
      if (kind === "draft") {
        if (!episode.research) {
          const draft =
            episode.researchDraft ??
            (await researchTopic(
              openai,
              models.research,
              episode.topic,
              signal,
              !!episode.production,
            ));
          signal.throwIfAborted();
          if (episode.production && !episode.researchDraft) {
            episode.researchDraft = draft;
            store.save(episode);
          }
          episode.research = episode.production
            ? await crossCheckResearch(
                openai,
                models.research,
                episode.topic,
                draft,
                signal,
              )
            : draft;
          delete episode.researchDraft;
          signal.throwIfAborted();
          episode.job.stage = "outline";
          store.save(episode);
        }
        if (!episode.outline) {
          episode.outline = await makeOutline(
            openai,
            models.script,
            episode,
            signal,
          );
          signal.throwIfAborted();
          episode.job.stage = "script";
          store.save(episode);
        }
        episode.script = await makeScript(
          openai,
          models.script,
          episode,
          signal,
        );
      }
      const renderAudio = kind === "audio" || episode.job.autoAudio;
      if (renderAudio) {
        signal.throwIfAborted();
        episode.job = { stage: "audio", status: "running" };
        store.save(episode);
        await render(episode, signal);
        if (episode.production) {
          episode.job.stage = "transcript";
          store.save(episode);
        }
      }
      if (kind === "transcript" || (renderAudio && episode.production)) {
        const finished = episode.finished;
        const result = await transcribe(
          openai,
          models.transcript,
          store.readAsset(episode.id, finished.asset),
          finished.intendedText,
          signal,
        );
        signal.throwIfAborted();
        finished.transcript = result;
        finished.qa = assessAudio(episode);
      }
      signal.throwIfAborted();
      delete episode.job;
      store.save(episode);
      if (renderAudio || kind === "transcript") store.prune(episode);
    } catch (error) {
      const saved = store.get(episode.id);
      if (saved.job) {
        saved.job.status = signal.aborted ? "cancelled" : "failed";
        saved.job.message = signal.aborted
          ? "已停止。先前保存的阶段仍可继续使用。"
          : error instanceof PublicError
            ? error.message
            : "任务未能完成。请检查服务器网络与存储后重试。";
        store.save(saved);
      }
    } finally {
      active = undefined;
    }
  }

  async function render(episode, signal) {
    const previousClips = episode.render?.clips ?? {};
    const render = {
      revision: episode.revision,
      model: models.audio,
      clips: {},
    };
    for (const turn of episode.script.turns) {
      const previous = previousClips[turn.id];
      if (previous?.asset === clipName(episode, render.model, turn))
        render.clips[turn.id] = previous;
    }
    episode.render = render;
    const maxSeconds = episode.production?.maxSeconds ?? 500;
    let total =
      (episode.script.turns.length - 1) * 0.23 +
      Object.values(render.clips).reduce((sum, clip) => sum + clip.duration, 0);
    const checkDuration = () => {
      if (total > maxSeconds)
        throw new PublicError(
          "配音超出时长上限。已保存可用片段，请缩短部分脚本后重试。",
        );
    };
    checkDuration();
    store.save(episode);
    store.prune(episode);
    for (const turn of episode.script.turns) {
      signal.throwIfAborted();
      if (render.clips[turn.id]) continue;
      const pcm = await narrator(
        {
          model: render.model,
          language: episode.language,
          host: turn.host,
          voice: episode.voices[turn.host],
          text: turn.text,
        },
        signal,
      );
      signal.throwIfAborted();
      total += duration(pcm);
      checkDuration();
      const asset = clipName(episode, render.model, turn);
      store.writeAsset(episode.id, asset, pcm);
      render.clips[turn.id] = { asset, duration: duration(pcm) };
      store.save(episode);
    }
    const result = assembly(
      episode.script.turns,
      episode.outline.chapters,
      (turnId) => store.readAsset(episode.id, render.clips[turnId].asset),
    );
    const asset = `episode-${randomUUID()}.wav`;
    store.writeAsset(episode.id, asset, result.audio);
    let mp3;
    if (encodeMP3) {
      const encoded = await encodeMP3(result.audio, signal).catch(() => null);
      signal.throwIfAborted();
      if (encoded) {
        mp3 = `episode-${randomUUID()}.mp3`;
        store.writeAsset(episode.id, mp3, encoded);
      }
    }
    episode.finished = {
      asset,
      ...(mp3 ? { mp3 } : {}),
      revision: render.revision,
      model: render.model,
      duration: result.duration,
      chapters: result.chapters,
      intendedText: episode.script.turns.map(({ text }) => text).join("\n"),
    };
    episode.finished.qa = assessAudio(episode);
  }

  return {
    recover() {
      for (const episode of store.list()) {
        if (episode.job?.status === "running") {
          episode.job.status = "interrupted";
          episode.job.message = "服务器曾中断，已保存的阶段可继续使用。";
          store.save(episode);
        }
        if (!episode.syncToken) store.save(episode);
        store.prune(episode);
      }
    },
    get busy() {
      return !!active;
    },
    create({ id, topic, language, consent, autoAudio }, production) {
      if (
        typeof id !== "string" ||
        !episodeId.test(id) ||
        typeof topic !== "string" ||
        !topic.trim() ||
        topic.trim().length > limits.topic ||
        !Object.hasOwn(languages, language)
      )
        throw new PublicError("请输入有效主题并选择语言。", 400);
      const existing = store.list();
      const retry = existing.find((episode) => episode.id === id);
      if (retry) {
        const sameSettings =
          production || retry.production
            ? JSON.stringify(retry.production) === JSON.stringify(production)
            : retry.language === language;
        if (retry.topic === topic.trim() && sameSettings) return retry;
        throw new PublicError("这个项目编号已使用。", 409);
      }
      if (store.receipt(id))
        throw new PublicError("这期节目已交接，请在浏览器资料库查看。", 409);
      if (existing.length >= limits.projects)
        throw new PublicError(
          `已有 ${limits.projects} 期节目。请先下载并删除不再需要的节目。`,
          409,
        );
      return start(
        {
          id,
          topic: topic.trim(),
          language,
          revision: 1,
          voices: { A: "marin", B: "cedar" },
          ...(production ? { production } : {}),
        },
        "draft",
        consent,
        autoAudio,
      );
    },
    start(id, { revision, kind, consent, autoAudio }) {
      const episode = store.get(id);
      requireRevision(episode, revision);
      return start(
        episode,
        kind,
        consent,
        episode.production ? true : autoAudio,
      );
    },
    cancel(id) {
      if (active?.id === id) active.controller.abort();
      return store.get(id);
    },
    edit(id, { revision, ...edit }) {
      const episode = store.get(id);
      requireIdle(episode);
      requireRevision(episode, revision);
      let updated;
      try {
        updated = editEpisode(episode, revision, edit);
      } catch (error) {
        throw new PublicError(error.message, 400);
      }
      return store.save(updated);
    },
    resumeLocal(
      id,
      { snapshot, expected, consent, localStamp, kind },
      production,
    ) {
      let source;
      try {
        source = readEpisode(snapshot);
      } catch {
        throw new PublicError("本地脚本记录无效。", 400);
      }
      if (
        source.id !== id ||
        !episodeId.test(localStamp ?? "") ||
        !["audio", "draft"].includes(kind) ||
        (kind === "audio" ? !source.script : !!source.script) ||
        !Number.isInteger(production.maxSeconds)
      )
        throw new PublicError("本地脚本尚未准备好。", 400);
      const existing = store.list().find((episode) => episode.id === id);
      if (!existing && store.receipt(id)?.localStamp === localStamp)
        throw new PublicError(
          "这一制作请求已完成交接，请查看浏览器资料库。",
          409,
        );
      if ((existing?.syncToken ?? null) !== expected)
        throw new PublicError("制作检查点已变化。请同步后重新提交。", 409);
      if (!existing && store.list().length >= limits.projects)
        throw new PublicError("本机暂存已满。请先同步节目。", 409);
      const {
        topic,
        language,
        voices,
        revision,
        plan,
        researchDraft,
        research,
        outline,
        script,
      } = source;
      if (source.production?.exactHosts === 2)
        production = { ...production, maxHosts: 2, exactHosts: 2 };
      return start(
        {
          id,
          topic,
          language,
          voices,
          revision,
          plan,
          researchDraft,
          research,
          outline,
          script,
          production,
          localStamp,
          render: existing?.render,
        },
        kind,
        consent,
        true,
      );
    },
    handoff(id, token) {
      const episode = store.get(id);
      requireIdle(episode);
      if (
        episode.syncToken !== token ||
        episode.job ||
        !episode.finished?.transcript
      )
        throw new PublicError("节目检查点已经变化，或尚未转录完成。", 409);
      store.release(episode);
    },
    delete(id) {
      const episode = store.get(id);
      requireIdle(episode);
      store.delete(id);
    },
    clip(episode, id, asset) {
      const clip = episode.render?.clips[id];
      if (!clip || clip.asset !== asset)
        throw new PublicError("找不到此配音片段。", 404);
      return wave([store.readAsset(episode.id, clip.asset)]);
    },
    stop() {
      active?.controller.abort();
      return active?.task;
    },
  };
}
