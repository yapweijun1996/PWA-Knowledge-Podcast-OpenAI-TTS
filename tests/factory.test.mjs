import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Writable } from "node:stream";
import { setTimeout } from "node:timers/promises";
import test from "node:test";
import { createNarrator, prepareClip, wave } from "../server/audio.mjs";
import { collectEvidence } from "../server/claims.mjs";
import { podcastHTTP } from "../server/http.mjs";
import { createJobs } from "../server/jobs.mjs";
import { createOpenAI, defaults } from "../server/openai.mjs";
import { createCredential, createProduction } from "../server/production.mjs";
import { makeScript } from "../server/script.mjs";
import { createStore } from "../server/store.mjs";
import { validateAudio } from "../shared/audio-record.ts";
import { readEpisode } from "../shared/episode-record.ts";
import {
  defaultPreferences,
  studioAPI,
  studioBase,
} from "../shared/factory.ts";
import { editEpisode } from "../shared/edit.ts";
import { backupRecord, restoreRecord } from "../src/factory/record-backup.ts";
import {
  fakeOpenAI,
  firstText,
  heard,
  intended,
  pcmFixture,
  researchResponse,
  textResponse,
} from "./fixtures/podcast-provider.mjs";

const local = "http://127.0.0.1:8787";
const publicOrigin = "https://podcast.example.test";
const ownerToken = "fixture-owner-token-".repeat(3);

function harness(t, options = {}) {
  const path = mkdtempSync(join(tmpdir(), "podcast-tests-"));
  t.after(() => rmSync(path, { recursive: true, force: true }));
  const store = createStore(path);
  const fixture = fakeOpenAI(options);
  const configured = options.configured ?? true;
  const credential = options.dynamic ? createCredential() : null;
  const openai = createOpenAI("fixture-only", fixture.fetcher);
  const jobs = createJobs({
    store,
    models: defaults,
    configured: credential?.configured ?? configured,
    openai,
    encodeMP3: options.encodeMP3,
    narrator: options.narrator ?? fixture.narrator,
  });
  const production = credential
    ? createProduction({
        root: path,
        jobs,
        store,
        openai,
        model: defaults.research,
        credential,
        mp3: !!options.encodeMP3,
        now: options.now,
      })
    : undefined;
  const server = podcastHTTP({
    dist: "dist-private",
    store,
    models: defaults,
    jobs,
    configured,
    production,
    publicOrigin: options.publicMode ? publicOrigin : undefined,
    ownerToken,
  });

  // Exercise the application request listener without opening a network socket.
  function request(
    path,
    { method = "GET", payload, headers = {}, base = studioAPI } = {},
  ) {
    const origin = options.publicMode ? publicOrigin : local;
    const bytes =
      payload === undefined ? null : Buffer.from(JSON.stringify(payload));
    const req = Readable.from(bytes ? [bytes] : []);
    req.method = method;
    req.url = base + path;
    req.socket = { localPort: 8787 };
    req.headers = {
      host: new URL(origin).host,
      ...(!["GET", "HEAD"].includes(method) ? { origin } : {}),
      ...(bytes
        ? {
            "content-type": "application/json",
            "content-length": String(bytes.length),
          }
        : {}),
      ...headers,
    };
    return new Promise((resolve, reject) => {
      const chunks = [];
      const outgoing = {};
      const res = new Writable({
        write(chunk, _, done) {
          chunks.push(chunk);
          done();
        },
      });
      res.setHeader = (name, value) => {
        outgoing[name.toLowerCase()] = value;
      };
      res.writeHead = (status, headers = {}) => {
        res.statusCode = status;
        for (const [name, value] of Object.entries(headers))
          res.setHeader(name, value);
        res.headersSent = true;
        return res;
      };
      res.on("error", reject);
      res.on("finish", () => {
        const bytes = Buffer.concat(chunks);
        resolve({
          bytes,
          status: res.statusCode,
          headers: outgoing,
          data: outgoing["content-type"]?.startsWith("application/json")
            ? JSON.parse(bytes.toString())
            : undefined,
        });
      });
      server.emit("request", req, res);
    });
  }
  return {
    store,
    jobs,
    request,
    production,
    credential,
    path,
    openai,
    ...fixture,
  };
}

async function settled(store, id) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const episode = store.get(id);
    if (episode.job?.status !== "running") return episode;
    await setTimeout(5);
  }
  assert.fail("The fixture job did not finish");
}

const create = (request, payload) =>
  request("/episodes", { method: "POST", payload });
const action = (request, id, kind, revision = 1) =>
  request(`/episodes/${id}/jobs`, {
    method: "POST",
    payload: { revision, kind, consent: true },
  });

test("studio entry aliases retain the view and episode query in redirects", async (t) => {
  const { request } = harness(t);
  const query = "?studio=factory&view=studio&episode=fixture&source=qa%20check";
  for (const path of ["/", studioBase.slice(0, -1)]) {
    const response = await request(path + query, { base: "" });
    assert.equal(response.status, 302);
    assert.equal(response.headers.location, studioBase + query);
  }
});

test("research retains only annotated claims and rejects unsafe URLs and conflicting dates", () => {
  const part = researchResponse().output[1].content[0];
  const actual = collectEvidence([part], "2026-11-21T00:00:00Z", "model");
  assert.deepEqual(
    actual.sources.map((source) => [source.url, source.published]),
    [["https://example.org/primary-source", "2024-04-02"]],
  );
  assert.deepEqual(
    actual.claims.map(({ text, sourceIds }) => [text, sourceIds]),
    [["The example covers one location", ["S1"]]],
  );
  const alien = {
    ...part,
    text: part.text.replace("2024-04-02", "2024-04-03"),
  };
  assert.equal(
    collectEvidence([part, alien], "2026-11-21", "model").sources[0].published,
    null,
  );
  assert.equal(
    collectEvidence([{ ...part, annotations: [] }], "2026-11-21", "model")
      .claims.length,
    0,
  );
});

test("HTTP flow checkpoints research, retries one clip, serves WAV ranges, and keeps transcript separate", async (t) => {
  const { store, request, calls, narrated } = harness(t, {
    failOutline: true,
    failAudio: true,
  });
  const id = randomUUID();
  const input = { id, topic: "A Singapore topic", language: "sg" };
  assert.equal((await create(request, input)).status, 400);
  assert.deepEqual(calls, []);
  assert.equal(
    (await create(request, { ...input, consent: true })).status,
    202,
  );
  let episode = await settled(store, id);
  assert.equal(episode.job.stage, "outline");
  assert.equal(episode.job.status, "failed");
  assert.doesNotMatch(episode.job.message, /diagnostics/);
  assert.equal(episode.research.claims.length, 1);
  assert.equal(
    (await create(request, { ...input, consent: true })).data.job.status,
    "failed",
  );
  assert.equal((await action(request, id, "draft")).status, 202);
  episode = await settled(store, id);
  assert.equal(episode.script.turns.length, 4);
  assert.deepEqual(calls, ["research", "outline", "outline", "script"]);
  assert.equal((await action(request, id, "audio")).status, 202);
  episode = await settled(store, id);
  assert.deepEqual(Object.keys(episode.render.clips), ["ch1-1"]);
  assert.equal(episode.job.status, "failed");
  const clip = episode.render.clips["ch1-1"];
  assert.equal(
    (
      await request(`/episodes/${id}/clip/ch1-1?asset=${clip.asset}`)
    ).bytes.toString("ascii", 0, 4),
    "RIFF",
  );
  assert.equal((await action(request, id, "audio")).status, 202);
  episode = await settled(store, id);
  assert.equal(episode.finished.intendedText, intended);
  assert.equal(episode.finished.chapters.length, 2);
  assert.equal(narrated.filter(({ text }) => text === firstText).length, 1);
  assert.deepEqual(
    [
      ...new Set(
        narrated.map(({ host, voice, language }) =>
          [host, voice, language].join(":"),
        ),
      ),
    ],
    ["A:marin:sg", "B:cedar:sg"],
  );
  const asset = `/episodes/${id}/audio?asset=${episode.finished.asset}`;
  const range = await request(asset, { headers: { range: "bytes=0-43" } });
  assert.equal(range.status, 206);
  assert.equal(range.bytes.length, 44);
  assert.equal(range.bytes.readUInt32LE(24), 24_000);
  assert.match(range.headers["content-range"], /^bytes 0-43\//);
  assert.equal(range.headers["cache-control"], "no-store");
  assert.match(
    (await request(asset + "&download=1", { method: "HEAD" })).headers[
      "content-disposition"
    ],
    /^attachment/,
  );
  assert.equal(
    (await request(asset, { headers: { range: "bytes=999999999-" } })).status,
    416,
  );
  assert.equal((await action(request, id, "transcript")).status, 202);
  episode = await settled(store, id);
  assert.equal(episode.finished.transcript.text, heard);
  assert.ok(episode.finished.transcript.similarity < 100);
  assert.equal(episode.finished.intendedText, intended);
  const texts = Object.fromEntries(
    episode.script.turns.map((turn) => [turn.id, turn.text]),
  );
  texts["ch1-1"] = "An edited line.";
  const edit = {
    title: episode.script.title,
    texts,
    voices: episode.voices,
    revision: 1,
  };
  assert.equal(
    (await request(`/episodes/${id}`, { method: "PATCH", payload: edit }))
      .status,
    200,
  );
  assert.equal(
    (await request(`/episodes/${id}`, { method: "PATCH", payload: edit }))
      .status,
    409,
  );
  assert.equal((await request(asset)).status, 200);
  assert.equal((await action(request, id, "audio", 2)).status, 202);
  episode = await settled(store, id);
  assert.equal(episode.finished.revision, 2);
  assert.equal(episode.finished.transcript, undefined);
  assert.equal(episode.script.turns[0].edited, true);
  assert.equal(narrated.at(-1).text, "An edited line.");
  assert.equal(narrated.length, 6);
});

test("one-click job checkpoints the script before narration and can be cancelled without losing it", async (t) => {
  const narrator = (_, signal) => setTimeout(5000, null, { signal });
  const { store, request, jobs } = harness(t, { narrator });
  t.after(() => jobs.stop());
  const id = randomUUID();
  const input = {
    id,
    topic: "Automatic episode",
    language: "ms",
    consent: true,
    autoAudio: true,
  };
  assert.equal((await create(request, input)).status, 202);
  for (
    let attempt = 0;
    attempt < 50 && store.get(id).job?.stage !== "audio";
    attempt++
  )
    await setTimeout(5);
  assert.equal(store.get(id).job.stage, "audio");
  assert.equal(store.get(id).script.turns.length, 4);
  assert.equal(
    (await create(request, { ...input, id: randomUUID() })).status,
    409,
  );
  assert.equal(
    (await request(`/episodes/${id}/cancel`, { method: "POST" })).status,
    202,
  );
  const episode = await settled(store, id);
  assert.equal(episode.job.status, "cancelled");
  assert.ok(episode.script);
  assert.equal(episode.finished, undefined);
  episode.job.status = "running";
  store.save(episode);
  jobs.recover();
  assert.equal(store.get(id).job.status, "interrupted");
});

test("a script with a made-up claim fails and preserves the saved outline", async (t) => {
  const { store, request } = harness(t, { invalidScript: true });
  const id = randomUUID();
  await create(request, {
    id,
    topic: "Fixture",
    language: "en",
    consent: true,
  });
  const episode = await settled(store, id);
  assert.equal(episode.job.stage, "script");
  assert.equal(episode.job.status, "failed");
  assert.equal(episode.script, undefined);
  assert.equal(episode.outline.chapters.length, 2);
  const response = await request("/episodes/" + id);
  assert.equal(response.status, 200);
  const { job } = response.data;
  assert.match(job.message, /第 1 章第 2 段引用了本章大纲未分配的主张/);
  assert.doesNotMatch(job.message, /invented/);
});

test("script validation reports the failed rule and relevant limits", async (t) => {
  const rain = { id: "C1", text: "阵雨范围有限", sourceIds: ["S1"] };
  const wind = { id: "C2", text: "风会移动雨云", sourceIds: ["S1"] };
  const radar = { id: "C3", text: "雷达能观察雨区", sourceIds: ["S1"] };
  const unused = { id: "C4", text: "未分配的主张", sourceIds: ["S1"] };
  const episode = {
    language: "zh",
    plan: { targetSeconds: 90 },
    voices: { A: "marin", B: "cedar" },
    outline: {
      chapters: [
        { id: "ch1", claimIds: ["C1", "C3"] },
        { id: "ch2", claimIds: ["C2", "C3"] },
      ],
    },
    research: {
      claims: [rain, wind, radar, unused],
      sources: [{ id: "S1", title: "Example weather source" }],
    },
  };
  const draft = {
    title: "天气",
    chapters: [
      {
        chapterId: "ch1",
        turns: [{ text: "雨".repeat(60), host: "A", claimIds: ["C1"] }],
      },
      {
        chapterId: "ch2",
        turns: [{ text: "风".repeat(60), host: "B", claimIds: ["C2"] }],
      },
    ],
  };
  const validate = (data, input = episode) =>
    makeScript(
      async () => textResponse(JSON.stringify(data)),
      "fixture",
      input,
      AbortSignal.timeout(1000),
    );
  await t.test("writer receives only each chapter's assigned evidence", async () => {
    const script = await makeScript(
      async (_, request) => {
        const input = JSON.parse(request.input);
        assert.deepEqual(input.chapters, [
          { id: "ch1", allowedClaimIds: ["C1", "C3"], claims: [rain, radar] },
          { id: "ch2", allowedClaimIds: ["C2", "C3"], claims: [wind, radar] },
        ]);
        assert.equal(Object.hasOwn(input, "claims"), false);
        assert.deepEqual(input.sources, episode.research.sources);
        return textResponse(JSON.stringify(draft));
      },
      "fixture",
      episode,
      AbortSignal.timeout(1000),
    );
    assert.equal(script.turns.length, 2);
  });

  const cases = [
    ["chapter count", (d) => d.chapters.pop(), /章节数为 1，大纲要求 2 章/],
    [
      "chapter order",
      (d) => d.chapters.reverse(),
      /第 1 章的章节编号或顺序与大纲不符/,
    ],
    [
      "chapter turn limit",
      (d) => {
        const turns = d.chapters[0].turns;
        turns.push(...Array(10).fill(turns[0]));
      },
      /第 1 章有 11 段发言，超过上限 10/,
    ],
    [
      "script turn limit",
      (d) => {
        for (const { turns } of d.chapters)
          turns.push(...Array(5).fill(turns[0]));
      },
      /全稿有 12 段发言，超过上限 10/,
    ],
    [
      "total text length",
      (d) => {
        for (const { turns } of d.chapters) {
          turns[0].text = "雨".repeat(450);
          turns.push(turns[0], turns[0]);
        }
      },
      /全稿发言长度为 2700，超过上限 2610/,
    ],
    [
      "unassigned host",
      (d) => {
        d.chapters[0].turns[0].host = "C";
      },
      /第 1 章第 1 段的主持人不在本集名单内/,
    ],
    [
      "empty speech",
      (d) => {
        d.chapters[0].turns[0].text = " ";
      },
      /第 1 章第 1 段发言不能为空/,
    ],
    [
      "turn length",
      (d) => {
        d.chapters[0].turns[0].text = "雨".repeat(451);
      },
      /第 1 章第 1 段发言长度为 451，超过上限 450/,
    ],
    [
      "chapter citations",
      (d) => {
        d.chapters[0].turns[0].claimIds = [];
      },
      /第 1 章至少需要一段发言引用主张/,
    ],
    [
      "claim assigned only to a different chapter",
      (d) => {
        d.chapters[1].turns[0].claimIds = ["C1"];
      },
      /第 2 章第 1 段引用了本章大纲未分配的主张/,
    ],
    [
      "minimum spoken units",
      (d) => {
        d.chapters[0].turns[0].text = "雨";
      },
      /全稿只有 61 个口播单位，至少需要 112 个/,
    ],
    [
      "missing host",
      (d) => {
        d.chapters[1].turns[0].host = "A";
      },
      /全稿缺少主持人 B 的发言/,
    ],
    [
      "title length",
      (d) => {
        d.title = "雨".repeat(101);
      },
      /节目标题长度为 101，超过上限 100/,
    ],
  ];
  for (const [name, change, message] of cases) {
    await t.test(name, async () => {
      const data = structuredClone(draft);
      change(data);
      await assert.rejects(validate(data), { status: 422, message });
    });
  }
  await assert.rejects(validate(draft, { ...episode, plan: undefined }), {
    status: 422,
    message: /第 1 章缺少主持人 B 的发言/,
  });
});

test("public-origin mode gates projects and audio with an owner cookie and exact same-origin writes", async (t) => {
  const { request } = harness(t, { publicMode: true });
  const localHeaders = { host: "127.0.0.1:8787" };
  assert.equal(
    (await request("/session", { headers: localHeaders })).status,
    403,
  );
  assert.deepEqual((await request("/session")).data, {
    authenticated: false,
    privateMode: true,
  });
  assert.equal((await request("/episodes")).status, 401);
  assert.equal((await request(`/episodes/${randomUUID()}/audio`)).status, 401);
  const payload = { token: ownerToken };
  assert.equal(
    (
      await request("/session", {
        method: "POST",
        payload,
        headers: { origin: "https://other.test" },
      })
    ).status,
    403,
  );
  assert.equal(
    (await request("/session", { method: "POST", payload: { token: "wrong" } }))
      .status,
    401,
  );
  const auth = await request("/session", { method: "POST", payload });
  assert.equal(auth.status, 200);
  const rawCookie = auth.headers["set-cookie"];
  assert.match(
    rawCookie,
    /^__Host-podcast-owner=.+; Path=\/; Secure; HttpOnly; SameSite=Strict; Max-Age=43200$/,
  );
  assert.doesNotMatch(auth.bytes.toString(), /fixture/);
  const headers = { cookie: rawCookie.split(";")[0] };
  assert.equal((await request("/episodes", { headers })).status, 200);
  assert.equal(
    (
      await request("/episodes", {
        headers: { ...headers, "sec-fetch-site": "cross-site" },
      })
    ).status,
    403,
  );
  assert.equal(
    (await request("/session", { method: "DELETE", headers })).status,
    200,
  );
  assert.equal((await request("/episodes", { headers })).status, 401);
});

test("unconfigured loopback runtime does not start paid jobs or accept proxied requests", async (t) => {
  const { request, calls, store } = harness(t, { configured: false });
  assert.equal((await request("/session")).data.configured, false);
  assert.equal(
    (await request("/session", { headers: { "x-forwarded-proto": "https" } }))
      .status,
    403,
  );
  assert.equal(
    (
      await create(request, {
        id: randomUUID(),
        topic: "Fixture",
        language: "zh",
        consent: true,
      })
    ).status,
    503,
  );
  assert.deepEqual(store.list(), []);
  assert.deepEqual(calls, []);
});

test("Realtime adapter waits for voice confirmation and a completed PCM response", async () => {
  const sent = [];
  class Socket extends EventTarget {
    constructor(url, options) {
      super();
      assert.equal(
        url.toString(),
        "wss://api.openai.com/v1/realtime?model=gpt-realtime-2.1-mini",
      );
      assert.equal(options.headers.Authorization, "Bearer fixture-only");
      queueMicrotask(() => this.receive({ type: "session.created" }));
    }
    receive(event) {
      this.dispatchEvent(
        new MessageEvent("message", { data: JSON.stringify(event) }),
      );
    }
    send(data) {
      const message = JSON.parse(data);
      sent.push(message);
      queueMicrotask(() => {
        if (message.type === "session.update") {
          this.receive({ type: "session.updated", session: message.session });
        } else {
          const pcm = pcmFixture();
          this.receive({
            type: "response.output_audio.delta",
            delta: pcm.subarray(0, 5000).toString("base64"),
          });
          this.receive({
            type: "response.output_audio.delta",
            delta: pcm.subarray(5000).toString("base64"),
          });
          this.receive({
            type: "response.done",
            response: { status: "completed" },
          });
        }
      });
    }
    close() {}
  }
  const pcm = await createNarrator("fixture-only", Socket)(
    {
      model: defaults.audio,
      language: "sg",
      host: "B",
      voice: "cedar",
      text: "Okay, 你明白吗？ Betul.",
    },
    new AbortController().signal,
  );
  assert.equal(sent[0].session.audio.output.voice, "cedar");
  assert.equal(
    sent[1].response.input[0].content[0].text,
    "Okay, 你明白吗？ Betul.",
  );
  assert.equal(sent[1].response.max_output_tokens, 2048);
  assert.equal(pcm.length, 24_000);
  assert.equal(pcm.readInt16LE(pcm.length - 2), 0);
  assert.throws(() => prepareClip(Buffer.alloc(24_000)), /静音/);
});

const fixtureKey = "sk-production-fixture-only";
const keyPayload = { method: "PUT", payload: { key: fixtureKey } };

test("adaptive scheduled discovery makes a cited three-host episode, retains retry checkpoints, and requires exact handoff", async (t) => {
  let clock = Date.parse("2026-11-21T00:00:00Z");
  const mp3 = Buffer.concat([Buffer.from("ID3"), Buffer.alloc(97)]);
  const {
    store,
    jobs,
    request,
    production,
    path,
    openai,
    credential,
    calls,
    narrated,
  } = harness(t, {
    dynamic: true,
    failAudit: true,
    failTranscript: true,
    now: () => clock,
    // The HTTP/media flow is under test here. This marker is not an encoded track.
    encodeMP3: async () => mp3,
  });
  assert.equal((await request("/session")).data.configured, false);
  const keyResult = await request("/key", keyPayload);
  assert.equal(keyResult.data.keyMode, "session");
  assert.doesNotMatch(keyResult.bytes.toString(), new RegExp(fixtureKey));
  const preferences = {
    ...defaultPreferences,
    interests: "Public policy in Singapore",
    weeklyLimit: 1,
    enabled: true,
  };
  const save = (consent) =>
    request("/schedule", { method: "PUT", payload: { preferences, consent } });
  assert.equal((await save(false)).status, 400);
  assert.equal((await save(true)).status, 200);
  assert.equal(
    (
      await request("/discover", {
        method: "POST",
        payload: { consent: false },
      })
    ).status,
    400,
  );

  // Simulate the worker timer with no connected browser.
  production.start();
  while (production.busy) await setTimeout(5);
  const id = store.list()[0].id;
  let episode = await settled(store, id);
  assert.equal(episode.job.stage, "research");
  assert.equal(episode.job.status, "failed");
  assert.ok(episode.researchDraft);
  assert.equal(episode.research, undefined);
  assert.equal((await action(request, id, "draft")).status, 202);
  episode = await settled(store, id);
  assert.deepEqual(calls, [
    "discovery",
    "research",
    "audit",
    "audit",
    "outline",
    "script",
    "audio",
    "audio",
    "audio",
    "audio",
    "transcript",
  ]);
  assert.equal(episode.research.claims[0].crossCheck, "independent-domains");
  assert.equal(episode.research.sources.length, 2);
  assert.equal(episode.language, "sg");
  assert.equal(episode.plan.targetSeconds, 60);
  assert.deepEqual(
    [...new Set(narrated.map(({ host, voice }) => host + ":" + voice))],
    ["A:marin", "B:cedar", "C:coral"],
  );
  assert.equal(episode.job.stage, "transcript");
  assert.equal(episode.job.status, "failed");
  assert.equal(episode.finished.qa.status, "review");
  assert.equal(episode.finished.transcript, undefined);
  const handoff = (token) =>
    request(`/episodes/${id}/handoff`, {
      method: "POST",
      payload: { syncToken: token },
    });
  assert.equal((await handoff(episode.syncToken)).status, 409);
  assert.equal((await action(request, id, "transcript")).status, 202);
  const finished = await settled(store, id);
  const checkpoint = await request(`/episodes/${id}`);
  assert.equal(checkpoint.status, 200);
  assert.deepEqual(readEpisode(checkpoint.data), finished);
  assert.equal(finished.finished.transcript.text, heard);
  assert.notEqual(finished.finished.intendedText, heard);
  assert.equal(narrated.length, 4);
  assert.equal((await handoff(episode.syncToken)).status, 409);
  const finalWave = await request(
    `/episodes/${id}/audio?asset=${finished.finished.asset}`,
  );
  assert.equal(finalWave.status, 200);
  assert.equal(finalWave.headers["content-type"], "audio/wav");
  assert.equal(finalWave.headers["content-length"], finalWave.bytes.length);
  await validateAudio(
    new Blob([finalWave.bytes], { type: "audio/wav" }),
    "audio/wav",
  );
  const finalMp3 = await request(
    `/episodes/${id}/mp3?asset=${finished.finished.mp3}&download=1`,
  );
  assert.match(finalMp3.headers["content-disposition"], /\.mp3"$/);
  assert.deepEqual(finalMp3.bytes, mp3);
  assert.equal((await handoff(finished.syncToken)).status, 200);
  assert.equal(store.list().length, 0);
  assert.equal(
    (await create(request, { id, topic: finished.topic, consent: true }))
      .status,
    409,
  );
  assert.equal(narrated.length, 4);

  clock += 86_400_000;
  const restarted = createProduction({
    root: path,
    jobs,
    store,
    openai,
    model: defaults.research,
    credential,
    mp3: true,
    now: () => clock,
  });
  assert.equal(restarted.status().used, 1);
  assert.throws(() => restarted.start(true), /额度/);
  assert.equal(restarted.status().nextCheck, "2026-11-28T00:00:00.000Z");

  const offline = editEpisode(finished, 1, {
    title: "Offline edits",
    voices: finished.voices,
    texts: Object.fromEntries(
      finished.script.turns.map((turn, index) => [
        turn.id,
        index === 0 ? "The edited opener." : turn.text,
      ]),
    ),
  });
  assert.equal(offline.finished.revision, 1);
  assert.equal(offline.revision, 2);
  assert.equal(offline.script.turns[0].edited, true);
  assert.throws(() => editEpisode(offline, 1, {}), /另一个标签页/);
  const payload = {
    kind: "audio",
    snapshot: offline,
    expected: null,
    localStamp: randomUUID(),
    consent: true,
  };
  const localRender = await request(`/episodes/${id}/resume-local`, {
    method: "POST",
    payload,
  });
  assert.equal(localRender.status, 202);
  assert.equal(localRender.data.localStamp, payload.localStamp);
  const rendered = await settled(store, id);
  assert.equal(rendered.finished.revision, 2);
  assert.equal(narrated.at(-4).text, "The edited opener.");
  assert.notEqual(finalWave.bytes.length, 0);
});

test("manual production selects a single Mandarin host and enforces consent and key boundaries", async (t) => {
  const { store, request, narrated, calls } = harness(t, { dynamic: true });
  const id = randomUUID();
  const preferences = {
    ...defaultPreferences,
    language: "zh",
    allowedLanguages: ["zh"],
    maxHosts: 1,
  };
  const payload = { id, topic: "Mandarin fixture", preferences, consent: true };
  assert.equal((await create(request, payload)).status, 503);
  assert.equal(
    (
      await request("/key", {
        ...keyPayload,
        headers: { origin: "https://elsewhere.test" },
      })
    ).status,
    403,
  );
  assert.equal((await request("/key", keyPayload)).status, 200);
  assert.equal(
    (await create(request, { ...payload, consent: false })).status,
    400,
  );
  assert.deepEqual(calls, []);
  assert.equal((await create(request, payload)).status, 202);
  const result = await settled(store, id);
  assert.equal(result.language, "zh");
  assert.equal((await create(request, payload)).status, 202);
  assert.deepEqual(result.voices, { A: "marin" });
  assert.ok(result.finished.transcript);
  assert.ok(
    narrated.every(({ host, language }) => host === "A" && language === "zh"),
  );
});

test("browser backup round-trips a complete WAV with evidence and rejects corrupted audio and unsafe citations", async (t) => {
  const { store, request } = harness(t, { dynamic: true });
  await request("/key", keyPayload);
  const id = randomUUID();
  await create(request, { id, topic: "Backup fixture", consent: true });
  const result = await settled(store, id);
  const entry = { ...result, render: undefined };
  const asset = result.finished.asset;
  const wav = new Blob([wave([pcmFixture()])], { type: "audio/wav" });
  const blob = await backupRecord({
    episode: entry,
    assets: { [asset]: wav },
    stamp: "browser-only",
  });
  const restored = await restoreRecord(blob);
  assert.equal(restored.episode.syncToken, undefined);
  assert.deepEqual(restored.episode.research, result.research);
  assert.deepEqual(
    restored.episode.finished.transcript,
    result.finished.transcript,
  );
  assert.deepEqual(
    await wav.arrayBuffer(),
    await restored.assets[asset].arrayBuffer(),
  );
  const payload = Buffer.from(await blob.arrayBuffer());
  payload[payload.length - 1] ^= 1;
  await assert.rejects(restoreRecord(new Blob([payload])), /备份无效/);
  entry.research.sources[0].url = "javascript:alert(1)";
  const unsafe = await backupRecord({
    episode: entry,
    assets: { [asset]: wav },
    stamp: "browser-only",
  });
  await assert.rejects(restoreRecord(unsafe), /格式无效/);
});

test("adaptive outline keeps a longer target only with sufficient independent evidence", async () => {
  const { makeOutline } = await import("../server/script.mjs");
  const { textResponse } = await import("./fixtures/podcast-provider.mjs");
  const openai = async () =>
    textResponse(
      JSON.stringify({
        language: "ms",
        hostCount: 2,
        targetSeconds: 330,
        rationale: "听众需要完整的对比。",
        chapters: [
          { title: "Latar belakang", angle: "Context", claimIds: ["C1"] },
          { title: "Bukti", angle: "Independent evidence", claimIds: ["C2"] },
        ],
      }),
    );
  const episode = {
    language: "ms",
    topic: "Evidence size",
    production: { ...defaultPreferences, maxSeconds: 360 },
    research: {
      claims: Array.from({ length: 4 }, (_, i) => ({
        id: "C" + (i + 1),
        crossCheck: "independent-domains",
      })),
    },
  };
  await makeOutline(openai, "fixture", episode, new AbortController().signal);
  assert.equal(episode.plan.targetSeconds, 330);
  assert.equal(episode.language, "ms");
  assert.deepEqual(episode.voices, { A: "marin", B: "cedar" });
  episode.research.claims.slice(1).forEach((claim) => {
    claim.crossCheck = "limited";
  });
  await makeOutline(openai, "fixture", episode, new AbortController().signal);
  assert.equal(episode.plan.targetSeconds, 120);
});

test("the duration ceiling stops billable turns and preserves usable speech clips", async (t) => {
  const pcm = Buffer.concat(Array.from({ length: 70 }, pcmFixture));
  const { store, request } = harness(t, {
    dynamic: true,
    narrator: async () => pcm,
  });
  await request("/key", keyPayload);
  const id = randomUUID();
  const preferences = { ...defaultPreferences, maxSeconds: 60 };
  await create(request, {
    id,
    topic: "Strict ceiling fixture",
    preferences,
    consent: true,
  });
  const result = await settled(store, id);
  assert.equal(result.job.stage, "audio");
  assert.equal(result.job.status, "failed");
  assert.match(result.job.message, /时长上限/);
  assert.equal(result.finished, undefined);
  assert.equal(Object.keys(result.render.clips).length, 1);
});
