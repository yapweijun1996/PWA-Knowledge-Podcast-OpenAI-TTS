import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { waitForOfflineShell } from "./fixtures/offline-shell.ts";
import { loadedCaptionCues } from "./fixtures/video-preview.ts";

const scope = "https://studio.test/app/";

function worker(state) {
  return Object.assign(new EventTarget(), { state });
}

function browser({
  controller = null,
  ready = Promise.resolve({ scope }),
  shell = { ok: true },
} = {}) {
  const workers = Object.assign(new EventTarget(), { controller, ready });
  const matches = [];
  // Playwright evaluates the helper as a standalone function in the page.
  const wait = runInNewContext(`(${waitForOfflineShell})`, {
    AbortController,
    navigator: { serviceWorker: workers },
    window: { setTimeout, clearTimeout },
    location: { pathname: "/app/" },
    caches: {
      async match(url) {
        matches.push(url);
        return shell;
      },
    },
  });
  return { workers, matches, wait };
}

test("offline readiness accepts an existing controller and checks the exact navigation cache key", async () => {
  const { wait, matches } = browser({ controller: worker("activated") });
  await wait(1000);
  assert.deepEqual(matches, [scope]);
});

test("offline readiness waits for controllerchange and then activation", async () => {
  const { workers, wait, matches } = browser();
  const waiting = wait(1000);
  await new Promise(setImmediate);
  const controller = worker("activating");
  workers.controller = controller;
  workers.dispatchEvent(new Event("controllerchange"));
  await new Promise(setImmediate);
  assert.deepEqual(matches, []);

  controller.state = "activated";
  controller.dispatchEvent(new Event("statechange"));
  await waiting;
  assert.deepEqual(matches, [scope]);
});

test("an activated controller without a cached shell fails readiness", async () => {
  const { wait } = browser({ controller: worker("activated"), shell: null });
  await assert.rejects(wait(1000), /Missing offline navigation shell/);
});

test("offline readiness identifies the phase that times out", async () => {
  const { wait } = browser({ ready: new Promise(() => {}) });
  await assert.rejects(
    wait(10),
    /Timed out waiting for an active registration/,
  );
  await assert.rejects(
    browser().wait(10),
    /Timed out waiting for an activated controller/,
  );
});

test("caption readiness distinguishes an unavailable cue list from an empty loaded list", () => {
  const track = { LOADED: 2, ERROR: 3, readyState: 2 };
  const textTrack = { cues: null };
  const video = { querySelector: () => track, textTracks: [textTrack] };

  assert.equal(loadedCaptionCues(video), null);
  textTrack.cues = [];
  assert.deepEqual(loadedCaptionCues(video), []);
});
