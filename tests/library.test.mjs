import assert from "node:assert/strict";
import test from "node:test";
import { wave } from "../server/audio.mjs";
import {
  defaultLibraryControls,
  episodeState,
  finishedWav,
  verifyFinishedWav,
  visibleEpisodes,
} from "../src/factory/library-model.ts";

const base = {
  id: "a",
  topic: "Cities and public parks",
  language: "en",
  voices: { A: "marin" },
  updated: "2026-11-20T00:00:00Z",
  revision: 2,
};
const script = { title: "Park Stories", turns: [], model: "fixture" };
const finished = {
  revision: 2,
  asset: "saved.wav",
  duration: 120,
  model: "fixture",
  chapters: [],
  intendedText: "Park Stories",
  qa: { status: "matched", reasons: [] },
  transcript: { text: "Park Stories", model: "fixture", similarity: 100 },
};

test("readiness and duration depend on validated finished WAV bytes and current review", async () => {
  const wav = new Blob([wave([Buffer.alloc(48_000 * 3)])], {
    type: "audio/wav",
  });
  const corrupt = new Blob([Buffer.alloc(wav.size)], { type: "audio/wav" });
  const empty = new Blob([wave([])], { type: "audio/wav" });
  const episode = { ...base, script, finished };
  assert.equal(finishedWav(episode, { "another.wav": wav }), undefined);
  assert.equal(finishedWav(episode, { "saved.wav": empty }), undefined);
  assert.equal(
    finishedWav(episode, { "saved.wav": { size: wav.size } }),
    undefined,
  );
  assert.equal(
    finishedWav(episode, { "saved.wav": new Blob([wav]) }),
    undefined,
  );
  assert.equal(finishedWav(episode, { "saved.wav": wav }), wav);
  assert.equal(await verifyFinishedWav(corrupt), null);
  assert.equal(await verifyFinishedWav(empty), null);
  assert.equal(await verifyFinishedWav(new Blob([wav])), null);
  assert.equal(await verifyFinishedWav(wav.slice(0, -2, wav.type)), null);
  const playable = await verifyFinishedWav(wav);
  assert.deepEqual(playable, { blob: wav, duration: 3 });
  assert.equal(episodeState(episode, undefined).status, "checking");
  assert.equal(episodeState(episode, null).status, "missing");
  assert.equal(episodeState(episode, playable).status, "ready");
  assert.equal(
    episodeState({ ...episode, revision: 3 }, playable).status,
    "stale",
  );
  for (const incomplete of [
    { ...finished, qa: { status: "review", reasons: ["Check pronunciation"] } },
    { ...finished, qa: undefined },
    { ...finished, transcript: undefined },
  ]) {
    assert.equal(
      episodeState({ ...episode, finished: incomplete }, playable).status,
      "review",
    );
  }
  assert.equal(episodeState({ ...base, script }, null).status, "script");
  assert.equal(episodeState(base, null).status, "draft");
});

test("saved job states take priority and running needs a matching live worker checkpoint", async () => {
  const episode = { ...base, script, finished, syncToken: "local" };
  const audio = await verifyFinishedWav(
    new Blob([wave([Buffer.alloc(48_000)])], { type: "audio/wav" }),
  );
  for (const status of ["failed", "cancelled", "interrupted"]) {
    const stopped = { ...episode, job: { stage: "transcript", status } };
    assert.deepEqual(episodeState(stopped, audio), {
      status,
      stage: "transcript",
      audioStatus: undefined,
    });
    assert.equal(episodeState(stopped, null).audioStatus, "missing");
  }
  const running = { ...episode, job: { stage: "audio", status: "running" } };
  assert.equal(episodeState(running, audio).status, "checkpoint");
  assert.equal(
    episodeState(running, audio, { ...running, syncToken: "other" }).status,
    "checkpoint",
  );
  assert.equal(
    episodeState(running, audio, {
      ...running,
      job: { stage: "transcript", status: "running" },
    }).status,
    "checkpoint",
  );
  assert.equal(episodeState(running, audio, running).status, "running");
  assert.deepEqual(episodeState({ ...running, revision: 3 }, audio, running), {
    status: "running",
    stage: "audio",
    audioStatus: "stale",
  });
});

test("local Unicode search, language and status intersect and sorting keeps deterministic ties", () => {
  const rows = [
    { ...base, script },
    {
      ...base,
      id: "b",
      language: "zh",
      topic: "城市公园的历史",
      updated: "2026-11-19T00:00:00Z",
    },
    {
      ...base,
      id: "c",
      language: "ms",
      script: { ...script, title: "Alam 10" },
      topic: "Kisah hutan",
      updated: "2026-11-20T02:00:00+08:00",
    },
    {
      ...base,
      id: "d",
      language: "ms",
      script: { ...script, title: "Alam 2" },
      topic: "Sungai",
      updated: "2026-11-18T00:00:00Z",
    },
  ].map((episode) => ({
    episode,
    audio: null,
    ...episodeState(episode, null),
  }));
  const ids = (controls = {}) =>
    visibleEpisodes(rows, { ...defaultLibraryControls, ...controls }).map(
      ({ episode }) => episode.id,
    );
  assert.deepEqual(ids(), ["a", "c", "b", "d"]);
  assert.deepEqual(ids({ sort: "oldest" }), ["d", "b", "c", "a"]);
  assert.deepEqual(ids({ sort: "title", language: "ms" }), ["d", "c"]);
  assert.deepEqual(ids({ query: " ＰＡＲＫ   ENGLISH " }), ["a"]);
  assert.deepEqual(ids({ query: "城市 中文" }), ["b"]);
  assert.deepEqual(
    ids({ query: "KISAH  mELAYU", status: "script", language: "ms" }),
    ["c"],
  );
  assert.deepEqual(
    ids({ query: "KISAH  mELAYU", status: "draft", language: "ms" }),
    [],
  );
  assert.deepEqual(
    ids({ query: "KISAH  mELAYU", status: "script", language: "en" }),
    [],
  );
  assert.deepEqual(ids({ query: "  " }), ids());
  assert.deepEqual(
    rows.map(({ episode }) => episode.id),
    ["a", "b", "c", "d"],
  );
  assert.deepEqual(
    visibleEpisodes(
      [{ ...rows[0], episode: { ...rows[0].episode, id: "z" } }, rows[0]],
      { ...defaultLibraryControls, sort: "title" },
    ).map(({ episode }) => episode.id),
    ["a", "z"],
  );
  assert.deepEqual(
    visibleEpisodes(
      [{ ...rows[0], status: "interrupted", audioStatus: "missing" }],
      { ...defaultLibraryControls, status: "missing" },
    ),
    [{ ...rows[0], status: "interrupted", audioStatus: "missing" }],
  );
});
