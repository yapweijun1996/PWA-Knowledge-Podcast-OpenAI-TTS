import assert from "node:assert/strict";
import test from "node:test";
import { Playback, readResume, sameAudio } from "../src/factory/playback.ts";

const wav = new Blob(["fixture"], { type: "audio/wav" });
const track = {
  episodeId: "episode-a",
  asset: "a.wav",
  revision: 1,
  title: "Episode A",
  duration: 30,
  bytes: wav.size,
  chapters: [],
};

class Audio extends EventTarget {
  src = "";
  currentTime = 0;
  readyState = 0;
  paused = true;
  ended = false;
  calls = [];
  playResult = Promise.resolve();

  play() {
    this.calls.push("play");
    this.paused = false;
    return this.playResult;
  }

  pause() {
    this.calls.push("pause");
    this.paused = true;
  }

  removeAttribute(name) {
    assert.equal(name, "src");
    this.calls.push("clear");
    this.src = "";
  }

  load() {
    this.calls.push("load");
    this.currentTime = 0;
    this.readyState = 0;
  }

  metadata() {
    this.readyState = 1;
    this.dispatchEvent(new Event("loadedmetadata"));
  }
}

test("paused restore, chapter seeking and rate use one element and the pinned URL", async () => {
  const audio = new Audio();
  const engine = new Playback();
  const unbind = engine.bind(audio);
  try {
    assert.equal(engine.load(track, wav, 12), true);
    const url = audio.src;
    assert.match(url, /^blob:/);
    assert.equal(engine.getSnapshot().loading, true);
    audio.metadata();
    assert.equal(audio.currentTime, 12);
    assert.equal(engine.getSnapshot().playing, false);
    assert.equal(engine.getSnapshot().loading, false);
    assert.deepEqual(audio.calls, []);
    assert.equal((await fetch(url)).status, 200);
    engine.select(track, wav, 22);
    assert.equal(audio.currentTime, 22);
    assert.equal(engine.getSnapshot().playing, true);
    engine.select({ ...track }, wav, 7);
    assert.equal(audio.src, url);
    assert.equal(audio.currentTime, 7);
    assert.deepEqual(audio.calls, ["play"]);
    engine.setRate(1.5);
    engine.setRate(NaN);
    assert.equal(audio.playbackRate, 1.5);
    engine.seek(100);
    assert.equal(audio.currentTime, 30);
    engine.toggle();
    assert.equal(engine.getSnapshot().playing, false);
  } finally {
    unbind();
  }
});

test("replacement, browser media errors and unmount detach before revoking their URLs", async (t) => {
  const audio = new Audio();
  const engine = new Playback();
  const unbind = engine.bind(audio);
  const originalRevoke = URL.revokeObjectURL;
  const revoked = t.mock.method(URL, "revokeObjectURL", (url) => {
    assert.equal(audio.src, "");
    assert.equal(audio.paused, true);
    assert.deepEqual(audio.calls.slice(-3), ["pause", "clear", "load"]);
    originalRevoke(url);
  });
  engine.select(track, wav);
  const previous = audio.src;
  engine.select({ ...track, asset: "replacement.wav" }, wav, 8);
  const replacement = audio.src;
  assert.notEqual(replacement, previous);
  assert.equal(revoked.mock.callCount(), 1);
  await assert.rejects(fetch(previous));
  audio.metadata();
  assert.equal(audio.currentTime, 8);
  audio.error = { code: 4 };
  audio.dispatchEvent(new Event("error"));
  assert.equal(engine.getSnapshot().track, null);
  assert.match(engine.getSnapshot().error, /无法播放/);
  await assert.rejects(fetch(replacement));
  delete audio.error;
  engine.load(track, wav);
  const last = audio.src;
  unbind();
  await assert.rejects(fetch(last));
  assert.equal(revoked.mock.callCount(), 3);
});

test("a rejected play from a superseded source cannot change the new source", async () => {
  const audio = new Audio();
  const engine = new Playback();
  const unbind = engine.bind(audio);
  try {
    const oldPlay = Promise.withResolvers();
    audio.playResult = oldPlay.promise;
    engine.select(track, wav);
    audio.playResult = Promise.resolve();
    engine.select({ ...track, episodeId: "episode-b" }, wav);
    oldPlay.reject(new DOMException("Superseded", "AbortError"));
    await Promise.resolve();
    assert.equal(engine.getSnapshot().track.episodeId, "episode-b");
    assert.equal(engine.getSnapshot().playing, true);
    assert.equal(engine.getSnapshot().error, "");
    engine.invalidate("Local asset removed");
    assert.equal(engine.getSnapshot().track, null);
    assert.equal(audio.src, "");
  } finally {
    unbind();
  }
});

test("browser autoplay denial leaves the validated selection available for a retry", async () => {
  const audio = new Audio();
  const engine = new Playback();
  const unbind = engine.bind(audio);
  try {
    audio.playResult = Promise.reject(
      new DOMException("Gesture", "NotAllowedError"),
    );
    engine.select(track, wav);
    audio.paused = true;
    await Promise.resolve();
    assert.equal(engine.getSnapshot().track, track);
    assert.equal(engine.getSnapshot().playing, false);
    assert.match(engine.getSnapshot().error, /浏览器阻止了播放/);
    const url = audio.src;
    audio.playResult = Promise.resolve();
    engine.toggle();
    assert.equal(engine.getSnapshot().playing, true);
    assert.equal(engine.getSnapshot().error, "");
    assert.equal(audio.src, url);
  } finally {
    unbind();
  }
});

test("resume data is limited to episode, revision, asset and a finite position", () => {
  const identity = { episodeId: "episode-a", revision: 1, asset: "a.wav" };
  const saved = readResume(
    JSON.stringify({
      ...identity,
      position: 12.5,
      url: "blob:old",
      playing: true,
    }),
  );
  assert.deepEqual(saved, { ...identity, position: 12.5 });
  assert.equal(sameAudio(saved, identity), true);
  assert.equal(sameAudio(saved, { ...identity, revision: 2 }), false);
  assert.equal(sameAudio(saved, { ...identity, asset: "new.wav" }), false);
  assert.equal(
    sameAudio(saved, { ...identity, episodeId: "episode-b" }),
    false,
  );
  for (const value of [
    null,
    "{invalid",
    "{}",
    JSON.stringify({ ...identity, position: -1 }),
  ])
    assert.equal(readResume(value), null);
});
