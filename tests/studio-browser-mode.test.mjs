import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultPreferences } from "../shared/factory.ts";
import { REALTIME_MODEL } from "../src/factory/browser-narrator.ts";
import {
  browserCheckpoint,
  browserProductionBounds,
  canResumeBrowserProduction,
  studioProductionMode,
} from "../src/factory/useBrowserProduction.ts";

test("Studio defaults to browser production and supports an explicit worker choice", () => {
  assert.deepEqual(studioProductionMode(true, "ready", "browser"), {
    mode: "browser",
    chooseMode: true,
    availability: "ready-browser",
  });
  assert.deepEqual(studioProductionMode(true, "ready", "worker"), {
    mode: "worker",
    chooseMode: true,
    availability: "ready",
  });
  assert.equal(
    studioProductionMode(true, "working", "worker").availability,
    "working",
  );
  for (const worker of ["no-worker", "locked", "no-key", "working"])
    assert.equal(
      studioProductionMode(true, worker, "browser").availability,
      "ready-browser",
    );
  assert.deepEqual(studioProductionMode(true, "no-worker", "worker"), {
    mode: "browser",
    chooseMode: false,
    availability: "ready-browser",
  });
  assert.equal(studioProductionMode(false, "ready", "browser").mode, "worker");
  assert.equal(
    studioProductionMode(false, "no-worker", "browser").availability,
    "no-worker",
  );
  assert.equal(
    studioProductionMode(true, "offline", "browser").availability,
    "offline",
  );
});

test("Studio can replace the worker action only when browser continuation is available", () => {
  const ready = { resumable: true, browserAvailable: true, blocked: false };
  assert.equal(canResumeBrowserProduction(ready), true);
  assert.equal(
    canResumeBrowserProduction({ ...ready, browserAvailable: false }),
    false,
  );
  assert.equal(canResumeBrowserProduction({ ...ready, resumable: false }), false);
  assert.equal(canResumeBrowserProduction({ ...ready, blocked: true }), false);
});

test("Studio uses saved browser bounds and an explicit two-host override", () => {
  const prefs = {
    ...defaultPreferences,
    language: "zh",
    allowedLanguages: ["zh"],
    maxHosts: 1,
    maxSeconds: 60,
  };
  const bounds = {
    language: "zh",
    allowedLanguages: ["zh"],
    maxHosts: 1,
    maxSeconds: 60,
  };
  assert.deepEqual(browserProductionBounds(prefs), bounds);
  assert.deepEqual(browserProductionBounds(prefs, 2), {
    ...bounds,
    maxHosts: 2,
    exactHosts: 2,
  });
  assert.equal(prefs.maxHosts, 1);
});

test("Studio offers browser continuation for compatible, unfinished local checkpoints", () => {
  const episode = {
    production: browserProductionBounds(defaultPreferences),
    revision: 1,
    job: { status: "running", stage: "audio" },
  };
  const row = { episode, assets: {}, stamp: "fixture" };
  assert.equal(browserCheckpoint(row), true);
  assert.equal(browserCheckpoint({ ...row, edited: true }), false);
  const checkpointWith = (change) =>
    browserCheckpoint({
      ...row,
      episode: { ...episode, ...change },
    });
  assert.equal(checkpointWith({ production: undefined }), false);
  assert.equal(checkpointWith({ syncToken: "worker-checkpoint" }), false);
  assert.equal(
    checkpointWith({ render: { revision: 1, model: REALTIME_MODEL } }),
    true,
  );
  assert.equal(
    checkpointWith({ render: { revision: 1, model: "worker-model" } }),
    false,
  );
  assert.equal(
    checkpointWith({ render: { revision: 2, model: REALTIME_MODEL } }),
    false,
  );
  assert.equal(checkpointWith({ finished: { revision: 1 } }), true);
  assert.equal(
    checkpointWith({ finished: { revision: 1, transcript: {} } }),
    false,
  );
});
