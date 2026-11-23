import assert from "node:assert/strict";
import test from "node:test";
import { wave } from "../server/audio.mjs";
import { validateAudio } from "../shared/audio-record.ts";
import { backupRecord, restoreRecord } from "../shared/episode-backup.ts";
import { episodeAssets, readEpisode } from "../shared/episode-record.ts";
import { limits } from "../shared/factory.ts";
import {
  createBrowserProduction,
  estimateBrowserProduction,
} from "../src/factory/browser-production.ts";
import {
  episodeState,
  verifyFinishedWav,
} from "../src/factory/library-model.ts";
import { fakeOpenAI, textResponse } from "./fixtures/podcast-provider.mjs";

const id = "c28c28c2-0000-0000-0000-000000000028";
const key = "fixture-only";
const production = {
  language: "en",
  allowedLanguages: ["en"],
  maxSeconds: 60,
  maxHosts: 2,
  exactHosts: 2,
};
const request = {
  id,
  topic: "A practical example",
  production,
  consent: true,
};
const wav = new Blob([wave([Buffer.alloc(48_000 * 14.5, 1)])], {
  type: "audio/wav",
});

function fixture() {
  const provider = fakeOpenAI({ dynamic: true, cast: 2 });
  const calls = [];
  const estimates = [];
  const progress = [];
  const writes = [];
  const hooks = {};
  let record;

  const library = {
    async listRecords() {
      return record ? [structuredClone(record)] : [];
    },
    async receive(episode, signal, previous) {
      assert.equal(signal.aborted, false);
      if (previous?.stamp !== record?.stamp) return false;
      await hooks.beforeSave?.(episode);
      const assets = Object.fromEntries(
        episodeAssets(episode).map(({ asset, type }) => {
          const audio = previous?.assets[asset];
          assert.ok(audio instanceof Blob, "must receive all blobs locally");
          assert.equal(audio.type, type);
          return [asset, audio];
        }),
      );
      record = structuredClone({
        episode: readEpisode(episode),
        assets,
        stamp: String(writes.length + 1),
      });
      writes.push(record);
      hooks.afterSave?.(record);
      return true;
    },
  };

  async function fetcher(url, options) {
    const stage = url.endsWith("/audio/transcriptions")
      ? "transcript"
      : (() => {
          const body = JSON.parse(options.body);
          if (body.tools)
            return body.max_tool_calls === 5 ? "research" : "audit";
          return body.text.format.name === "podcast_outline"
            ? "outline"
            : "script";
        })();
    assert.equal(
      url,
      "https://api.openai.com/v1/" +
        (stage === "transcript" ? "audio/transcriptions" : "responses"),
    );
    assert.equal(options.headers.Authorization, "Bearer " + key);
    assert.equal(options.credentials, "omit");
    assert.equal(options.cache, "no-store");
    assert.equal(options.referrerPolicy, "no-referrer");
    assert.equal(options.redirect, "error");
    assert.equal(options.signal.aborted, false);
    assert.equal(estimates.at(-1).label, "estimate");
    assert.equal(record.episode.job.status, "running");
    if (stage === "audit") assert.ok(record.episode.researchDraft);
    if (stage === "outline") assert.ok(record.episode.research.auditModel);
    if (stage === "script") {
      assert.ok(record.episode.outline);
      assert.equal(record.episode.plan.targetSeconds, 60);
    }
    calls.push(stage);
    const override = await hooks.fetch?.(stage, options);
    if (override) return override;
    if (stage === "transcript") {
      const { finished } = record.episode;
      const file = options.body.get("file");
      assert.equal(options.body.get("model"), "gpt-transcribe");
      await validateAudio(file, "audio/wav");
      assert.equal(file.size, record.assets[finished.asset].size);
      return Response.json({ text: finished.intendedText });
    }
    const body = JSON.parse(options.body);
    const estimateField = stage === "audit" ? "crossCheck" : stage;
    assert.ok(
      body.max_output_tokens <= estimates.at(-1).outputTokens[estimateField],
    );
    return provider.fetcher(url, options);
  }

  async function narrate(options) {
    assert.equal(options.key, key);
    assert.equal(options.signal.aborted, false);
    assert.equal(options.maxOutputTokens, 1024);
    assert.equal(options.consentGranted, true);
    assert.equal(options.preserveIncomplete, true);
    assert.equal(estimates.at(-1).label, "estimate");
    const saved = record.episode;
    assert.equal(saved.job.stage, "audio");
    const index = Object.keys(saved.render.clips).length;
    const turn = saved.script.turns[index];
    assert.equal(options.text, turn.text);
    assert.equal(options.voice, saved.voices[turn.host]);
    calls.push("audio:" + turn.id);
    const take = (await hooks.narrate?.(options, index)) ?? {
      audio: wav,
      complete: true,
    };
    options.onTake(take, 0);
    return [take];
  }

  return {
    calls,
    estimates,
    progress,
    writes,
    hooks,
    get saved() {
      return record;
    },
    runner(overrides = {}) {
      return createBrowserProduction({
        getKey: () => key,
        fetcher,
        narrate,
        library,
        now: () => Date.UTC(2026, 10, 23),
        onEstimate(value, episodeId) {
          assert.equal(episodeId, id);
          estimates.push(value);
          return hooks.estimate?.(value);
        },
        onProgress(event) {
          progress.push(event);
          return hooks.progress?.(event);
        },
        ...overrides,
      });
    },
  };
}

const completeCalls = [
  "research",
  "audit",
  "outline",
  "script",
  "audio:ch1-1",
  "audio:ch1-2",
  "audio:ch2-1",
  "audio:ch2-2",
  "transcript",
];

test("runs and checkpoints the worker stages, producing a playable Library record", async () => {
  const f = fixture();
  const runner = f.runner();
  const result = await runner.start(request);
  const episode = readEpisode(result.episode);
  assert.deepEqual(f.calls, completeCalls);
  assert.deepEqual(f.estimates, [estimateBrowserProduction(production)]);
  assert.deepEqual(f.estimates[0], {
    label: "estimate",
    outputTokens: {
      research: 6500,
      crossCheck: 6500,
      outline: 3600,
      script: 4500,
      narration: 8192,
    },
    maxOutputTokens: 29292,
    narrationOutputTokensPerTurn: 1024,
    narrationTurns: 8,
    maxWebSearchCalls: 11,
    transcriptionAudioSeconds: 60,
  });
  assert.deepEqual(
    f.progress.map(({ stage, index, total }) => [stage, index, total]),
    [
      ["research", 1, 2],
      ["research", 2, 2],
      ["outline", 1, 1],
      ["script", 1, 1],
      ["audio", 1, 4],
      ["audio", 2, 4],
      ["audio", 3, 4],
      ["audio", 4, 4],
      ["transcript", 1, 1],
    ],
  );
  assert.ok(f.progress.every(({ episodeId }) => episodeId === id));
  assert.equal(episode.updated, "2026-11-23T00:00:00.000Z");
  assert.equal(episode.syncToken, undefined);
  assert.equal(episode.job, undefined);
  assert.equal(episode.researchDraft, undefined);
  assert.deepEqual(episode.voices, { A: "marin", B: "cedar" });
  assert.equal(episode.finished.transcript.similarity, 100);
  assert.equal(episode.finished.qa.status, "matched");
  assert.deepEqual(
    episode.finished.chapters.map(({ start }) => start),
    [0, 29.46],
  );
  assert.equal(episode.finished.duration, 58.69);
  assert.equal(result.assets[episode.finished.asset].size, 44 + 48_000 * 58.69);
  for (const { asset, type } of episodeAssets(episode))
    await validateAudio(result.assets[asset], type);
  const backup = await backupRecord(result);
  const restored = await restoreRecord(backup);
  const playable = await verifyFinishedWav(
    restored.assets[episode.finished.asset],
  );
  assert.equal(episodeState(restored.episode, playable).status, "ready");
  assert.deepEqual(await runner.resume({ id, consent: true }), result);
  assert.deepEqual(f.calls, completeCalls);
});

test("reloads from saved research, individual narration, and pre-transcription checkpoints", async (t) => {
  for (const [label, checkpoint, expectedCalls] of [
    ["research draft", ({ researchDraft }) => Boolean(researchDraft), 1],
    [
      "first turn",
      ({ render }) => Object.keys(render?.clips ?? {}).length === 1,
      5,
    ],
    ["assembled audio", ({ finished }) => Boolean(finished), 8],
  ]) {
    await t.test(label, async () => {
      const f = fixture();
      const controller = new AbortController();
      f.hooks.afterSave = ({ episode }) => {
        if (checkpoint(episode)) controller.abort(new Error(key));
      };
      await assert.rejects(
        f.runner({ signal: controller.signal }).start(request),
        { name: "AbortError", code: "cancelled" },
      );
      assert.deepEqual(f.calls, completeCalls.slice(0, expectedCalls));
      assert.equal(f.saved.episode.job.status, "cancelled");
      assert.ok(checkpoint(f.saved.episode));
      delete f.hooks.afterSave;
      const result = await f.runner().resume({ id, consent: true });
      assert.equal(result.episode.finished.qa.status, "matched");
      assert.deepEqual(f.calls, completeCalls);
      assert.equal(f.estimates.length, 2);
      assert.equal(f.estimates[1].outputTokens.research, 0);
    });
  }
});

test("cancellation during narration preserves saved work and blocks replay of the uncertain take", async () => {
  const f = fixture();
  const controller = new AbortController();
  f.hooks.narrate = (options, index) => {
    if (index !== 1) return;
    controller.abort(new Error(key));
    options.signal.throwIfAborted();
  };
  await assert.rejects(
    f.runner().start({ ...request, signal: controller.signal }),
    {
      name: "AbortError",
      code: "unknown",
      message: /结果未知.*可能已计费.*手动重试/,
    },
  );
  assert.deepEqual(f.calls, completeCalls.slice(0, 6));
  assert.equal(f.saved.episode.job.status, "cancelled");
  assert.deepEqual(Object.keys(f.saved.episode.render.clips), ["ch1-1"]);
  await assert.rejects(f.runner().resume({ id, consent: true }), {
    code: "unknown",
  });
  assert.deepEqual(f.calls, completeCalls.slice(0, 6));
  delete f.hooks.narrate;
  await f.runner().resume({ id, consent: true, retryUnknown: true });
  assert.deepEqual(f.calls, [
    ...completeCalls.slice(0, 6),
    ...completeCalls.slice(5),
  ]);
});

test("a save failure stops the batch and the in-page retry saves the received result first", async () => {
  const f = fixture();
  const runner = f.runner();
  f.hooks.beforeSave = (episode) => {
    if (episode.researchDraft) throw new Error(key);
  };
  await assert.rejects(runner.start(request), { code: "save-failed" });
  assert.deepEqual(f.calls, ["research"]);
  assert.equal(f.saved.episode.researchDraft, undefined);
  assert.match(f.saved.episode.job.message, /结果未知/);
  delete f.hooks.beforeSave;
  await assert.rejects(f.runner().resume({ id, consent: true }), {
    code: "unknown",
  });
  assert.deepEqual(f.calls, ["research"]);
  await runner.resume({ id, consent: true });
  assert.deepEqual(f.calls, completeCalls);
});

test("an ambiguous fetch is never retried automatically and requires explicit acknowledgement", async () => {
  const f = fixture();
  const runner = f.runner();
  f.hooks.fetch = (stage) => {
    if (stage === "audit") throw new Error(key, { cause: { key } });
  };
  await assert.rejects(runner.start(request), {
    code: "unknown",
    message: /结果未知.*可能已计费.*手动重试/,
  });
  assert.deepEqual(f.calls, ["research", "audit"]);
  assert.equal(f.saved.episode.job.status, "failed");
  assert.ok(f.saved.episode.researchDraft);
  await assert.rejects(f.runner().resume({ id, consent: true }), {
    code: "unknown",
  });
  assert.deepEqual(f.calls, ["research", "audit"]);
  delete f.hooks.fetch;
  await f.runner().resume({ id, consent: true, retryUnknown: true });
  assert.deepEqual(f.calls, ["research", "audit", ...completeCalls.slice(1)]);
});

test("another runner cannot take over an active episode", async () => {
  const f = fixture();
  f.hooks.fetch = async (stage) => {
    if (stage === "research") {
      await assert.rejects(
        f.runner().resume({ id, consent: true, retryUnknown: true }),
        { code: "conflict" },
      );
    }
  };
  await f.runner().start(request);
  assert.deepEqual(f.calls, completeCalls);
});

test("missing key, consent, or cost disclosure prevents any paid request", async () => {
  const f = fixture();
  await assert.rejects(f.runner({ getKey: () => undefined }).start(request), {
    code: "no-key",
  });
  await assert.rejects(f.runner().start({ ...request, consent: false }), {
    code: "no-consent",
  });
  f.hooks.estimate = () => {
    throw new Error(key);
  };
  await assert.rejects(f.runner().start(request), { code: "callback-failed" });
  assert.deepEqual(f.calls, []);
  assert.deepEqual(f.writes, []);
});

test("rejects bad input and does not save over-limit or incomplete takes", async () => {
  const f = fixture();
  const runner = f.runner();
  for (const invalid of [
    { topic: "x".repeat(limits.topic + 1) },
    { production: { ...production, maxSeconds: 421 } },
    { production: { ...production, exactHosts: undefined, maxHosts: 4 } },
  ]) {
    await assert.rejects(runner.start({ ...request, ...invalid }), {
      code: "invalid-input",
    });
  }
  assert.deepEqual(f.calls, []);
  f.hooks.narrate = () => ({ audio: wav, complete: false });
  await assert.rejects(runner.start(request), { code: "incomplete-take" });
  assert.deepEqual(f.calls, completeCalls.slice(0, 5));
  assert.deepEqual(f.saved.episode.render.clips, {});
  f.hooks.narrate = () => ({
    audio: new Blob([wave([Buffer.alloc(48_000 * 60, 1)])], {
      type: "audio/wav",
    }),
    complete: true,
  });
  await assert.rejects(f.runner().resume({ id, consent: true }), {
    code: "audio-too-long",
  });
  assert.deepEqual(f.calls, [...completeCalls.slice(0, 5), "audio:ch1-1"]);
  assert.deepEqual(f.saved.episode.render.clips, {});
});

test("the key cannot leak through input, provider responses, errors, or Library checkpoints", async () => {
  const f = fixture();
  const runner = f.runner();
  await assert.rejects(runner.start({ ...request, topic: key }), {
    code: "key-in-content",
  });
  assert.deepEqual(f.calls, []);
  const assertSafe = (code) => (error) => {
    assert.equal(error.code, code);
    assert.equal(error.cause, undefined);
    assert.ok(!error.stack.includes(key));
    assert.ok(!JSON.stringify(error).includes(key));
    return true;
  };
  f.hooks.fetch = (stage) => {
    if (stage !== "outline") return;
    return Response.json(
      textResponse(
        JSON.stringify({
          language: "en",
          hostCount: 2,
          targetSeconds: 60,
          rationale: key,
          chapters: [
            { title: "A", angle: "Evidence", claimIds: ["C1"] },
            { title: "B", angle: "Limitations", claimIds: ["C1"] },
          ],
        }),
      ),
    );
  };
  await assert.rejects(runner.start(request), assertSafe("key-in-content"));
  assert.equal(f.saved.episode.outline, undefined);
  delete f.hooks.fetch;
  f.hooks.narrate = () => {
    throw new Error(key, { cause: { key } });
  };
  await assert.rejects(
    runner.resume({ id, consent: true }),
    assertSafe("unknown"),
  );
  delete f.hooks.narrate;
  const result = await runner.resume({ id, consent: true, retryUnknown: true });
  assert.ok(!JSON.stringify(f.writes).includes(key));
  assert.ok(!(await (await backupRecord(result)).text()).includes(key));
});
