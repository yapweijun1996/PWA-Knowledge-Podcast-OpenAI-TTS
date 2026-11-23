import assert from "node:assert/strict";
import test from "node:test";
import { createPodcastAgentBridge } from "../src/agent/tools.ts";
import { storyboardKey, validateStoryboard } from "../src/video/storyboard.ts";
import { buildTimeline } from "../src/video/timeline.ts";

const id = "e4980f49-ea25-479e-99ae-09028892149d";
const episode = {
  id,
  revision: 2,
  language: "en",
  topic: "Rainwater",
  outline: {
    model: "test",
    chapters: [
      { id: "roof", title: "Roof" },
      { id: "tank", title: "Tank" },
    ],
  },
  script: {
    title: "Rainwater",
    model: "test",
    turns: [
      {
        id: "1",
        chapterId: "roof",
        host: "A",
        text: "A roof leads water, then the filter catches leaves.",
      },
      {
        id: "2",
        chapterId: "tank",
        host: "B",
        text: "A filter catches leaves, and the tank stores water.",
      },
    ],
  },
  render: {
    revision: 2,
    clips: { 1: { duration: 15 }, 2: { duration: 11 } },
  },
};
const storyboard = {
  schemaVersion: 1,
  chapters: [
    {
      chapterId: "roof",
      mood: "warm",
      paletteId: "sunset",
      visualMetaphor: "voice-rails",
      cameraPresetId: "static",
      callouts: [{ afterPercent: 0, text: "Catch the rain" }],
    },
    {
      chapterId: "tank",
      mood: "curious",
      paletteId: "ocean",
      visualMetaphor: "host-orbs",
      cameraPresetId: "orbit",
      callouts: [
        { afterPercent: 0, text: "Tank stores water" },
        { afterPercent: 90, text: "Omit this late note" },
      ],
    },
  ],
};

test("storyboards use every scripted chapter exactly once and accept only closed presets and display text", async () => {
  assert.deepEqual(validateStoryboard(storyboard, episode), storyboard);
  assert.notEqual(
    await storyboardKey({ ...episode, revision: 3 }),
    await storyboardKey(episode),
  );
  const revisedScript = structuredClone(episode);
  revisedScript.script.turns[1].text = "A tank holds water for the garden.";
  assert.notEqual(
    await storyboardKey(revisedScript),
    await storyboardKey(episode),
  );

  for (const edit of [
    (board) => {
      board.extra = 1;
    },
    (board) => {
      board.schemaVersion = 2;
    },
    (board) => {
      board.chapters.reverse();
    },
    (board) => {
      board.chapters[1] = board.chapters[0];
    },
    (board) => {
      board.chapters[1].visualMetaphor = "crucible";
    },
    (board) => {
      board.chapters[0].cameraPresetId = "orbit";
    },
    (board) => {
      board.chapters[0].paletteId = "light";
    },
    (board) => {
      board.chapters[0].shader = "code";
    },
    (board) => {
      board.chapters[0].callouts[0].text = "https://example.com";
    },
    (board) => {
      board.chapters[0].callouts[0].text = "<b>HTML</b>";
    },
    (board) => {
      board.chapters[0].callouts[0].text = "字".repeat(21);
    },
    (board) => {
      board.chapters[0].callouts[0].afterPercent = Infinity;
    },
    (board) => {
      board.chapters[0].callouts[0].afterPercent = 95;
    },
    (board) => {
      board.chapters[1].callouts[1].afterPercent = 0;
    },
  ]) {
    const bad = structuredClone(storyboard);
    edit(bad);
    assert.equal(validateStoryboard(bad, episode), undefined);
  }
});

test("timeline keeps chapter times and schedules only callouts that fit the actual audio", () => {
  const baseline = buildTimeline(episode);
  const plan = buildTimeline(episode, { storyboard, reducedMotion: true });
  assert.deepEqual(plan.storyboard, storyboard);
  assert.deepEqual(plan.chapters, baseline.chapters);
  assert.deepEqual(
    plan.chapterWindows.map(({ sceneId }) => sceneId),
    ["waveform", "studio3d"],
  );
  assert.equal(plan.chapterWindows[1].direction.cameraPresetId, "orbit");
  assert.equal(plan.reducedMotion, true);
  assert.deepEqual(
    plan.callouts.map(({ text }) => text),
    ["Catch the rain", "Tank stores water"],
  );
  assert.ok(plan.callouts[0].start >= 2.6);
  assert.ok(plan.callouts[1].start >= 17.43);
  assert.ok(plan.callouts[1].end <= plan.duration);

  const invalid = { ...storyboard, schemaVersion: 9 };
  assert.deepEqual(buildTimeline(episode, { storyboard: invalid }), baseline);
});

test("draft tool needs consent, uses one private structured request and preserves the applied storyboard", async () => {
  const applied = structuredClone(storyboard);
  applied.chapters[0].paletteId = "mono";
  let latest = { draft: applied, applied, stamp: "original" };
  let writes = 0;
  let requests = 0;
  let mode = "valid";
  let next = structuredClone(storyboard);
  const key = "sk-private-fixture-key-123";
  const expectedKey = await storyboardKey(episode);
  const bridge = createPodcastAgentBridge({
    library: { listRecords: async () => [{ episode }] },
    getKey: () => key,
    storyboards: {
      get: async (name) => {
        assert.equal(name, expectedKey);
        return latest;
      },
      async put(name, value, stamp, signal) {
        assert.equal(name, expectedKey);
        assert.equal(signal.aborted, false);
        if (latest.stamp !== stamp) return;
        writes++;
        latest = { ...value, stamp: "next" };
        return latest;
      },
    },
    async fetcher(url, init) {
      requests++;
      assert.equal(url, "https://api.openai.com/v1/responses");
      assert.equal(init.credentials, "omit");
      assert.equal(init.cache, "no-store");
      assert.equal(init.headers.Authorization, "Bearer " + key);
      assert.equal(init.body.includes(key), false);
      const body = JSON.parse(init.body);
      assert.equal(body.store, false);
      assert.equal(body.text.format.strict, true);
      assert.equal(body.text.format.name, "podcast_storyboard");
      assert.equal(body.text.format.schema.additionalProperties, false);
      assert.equal(
        body.text.format.schema.properties.chapters.items.additionalProperties,
        false,
      );
      assert.equal(body.max_output_tokens, 4096);
      assert.equal(JSON.parse(body.input).chapters[0].lines[0].host, "A");
      if (mode === "concurrent") latest = { ...latest, stamp: "other tab" };
      return Response.json({
        status: "completed",
        output: [
          {
            type: "message",
            content: [{ type: "output_text", text: JSON.stringify(next) }],
          },
        ],
      });
    },
  });
  const call = (requestConsent) =>
    bridge.callTool("draft_storyboard", { episodeId: id }, { requestConsent });
  assert.equal((await call(undefined)).status, "consent_required");
  assert.equal((await call(async () => false)).status, "consent_denied");
  assert.equal(requests, 0);
  const approve = async ({ tool, estimate }) => {
    assert.equal(tool, "draft_storyboard");
    assert.equal(estimate.label, "estimate");
    assert.equal(estimate.maxRequests, 1);
    assert.equal(estimate.maxOutputTokens, 4096);
    return true;
  };
  assert.equal((await call(approve)).status, "ok");
  assert.equal(requests, 1);
  assert.equal(writes, 1);
  assert.deepEqual(latest.applied, applied);
  assert.deepEqual(latest.draft, storyboard);

  next.chapters[0].callouts[0].text = key;
  assert.equal((await call(approve)).status, "key_in_content");
  assert.equal(writes, 1);
  next = structuredClone(storyboard);
  mode = "concurrent";
  assert.equal((await call(approve)).status, "conflict");
  assert.equal(requests, 3);
  assert.equal(writes, 1);
});
