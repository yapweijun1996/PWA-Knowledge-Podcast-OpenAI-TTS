import assert from "node:assert/strict";
import test from "node:test";
import { wave } from "../server/audio.mjs";
import { episodeAssets, readEpisode } from "../shared/episode-record.ts";
import { runAgent } from "../src/agent/agent.ts";
import { createAgentBridge, objectSchema } from "../src/agent/bridge.ts";
import { createPodcastAgentBridge } from "../src/agent/tools.ts";
import { fakeOpenAI } from "./fixtures/podcast-provider.mjs";

const key = "fixture-only";
const rotatedKey = "fixture-rotated-only";
const tokenLike = "sk-fixture-example-not-a-key";
const estimate = {
  label: "estimate",
  description: "Fixture estimate",
  maxRequests: 1,
};
const parameters = objectSchema({ topic: { type: "string", minLength: 1 } });
const approve = async () => true;
const neverFetch = async () => assert.fail("Unexpected provider request");

function fixtureBridge(run = ({ topic }) => ({ topic }), options = {}) {
  return createAgentBridge(
    [
      {
        name: "lookup",
        description: "Look up a topic.",
        parameters,
        paid: false,
        run,
      },
      {
        name: "produce",
        description: "Produce an episode.",
        parameters,
        paid: true,
        estimate,
        run,
      },
    ],
    { getKey: () => key, ...options },
  );
}

function turn(...output) {
  return Response.json({ status: "completed", output });
}

function call(name, args = '{"topic":"penguins"}', id = "call_fixture") {
  return {
    type: "function_call",
    id: "fc_fixture",
    call_id: id,
    name,
    arguments: args,
    status: "completed",
  };
}

function answer(text) {
  return {
    type: "message",
    role: "assistant",
    content: [{ type: "output_text", text }],
  };
}

function agent(options = {}) {
  return runAgent({
    goal: "Make an episode",
    tools: fixtureBridge(),
    fetcher: neverFetch,
    getKey: () => key,
    model: "fixture-model",
    ...options,
  });
}

test("registry validates strict arguments before consent, rejects unknown tools and supplies dependencies", async () => {
  let calls = 0;
  const deps = { label: "injected" };
  const onConsent = async () =>
    assert.fail("Invalid or free calls must not ask");
  const bridge = fixtureBridge(
    (args, ctx) => {
      calls++;
      assert.equal(ctx.deps, deps);
      assert.ok(ctx.signal instanceof AbortSignal);
      assert.equal(typeof ctx.appendAudit, "function");
      return { topic: args.topic };
    },
    { deps },
  );
  const ctx = { requestConsent: onConsent };
  for (const invalid of [
    null,
    [],
    {},
    { topic: 1 },
    { topic: "" },
    { topic: "ok", extra: true },
  ])
    assert.equal(
      (await bridge.callTool("produce", invalid, ctx)).status,
      "invalid_arguments",
    );
  assert.equal(
    (await bridge.callTool("missing", {}, ctx)).status,
    "unknown_tool",
  );
  const definitions = bridge.listTools();
  assert.deepEqual(definitions[0].parameters, {
    type: "object",
    properties: { topic: { type: "string", minLength: 1 } },
    required: ["topic"],
    additionalProperties: false,
  });
  definitions[0].parameters.required.length = 0;
  assert.deepEqual(await bridge.callTool("lookup", { topic: "earth" }), {
    status: "ok",
    data: { topic: "earth" },
  });
  assert.equal(calls, 1);
});

test("paid tools require explicit consent and disclose an estimate each time", async () => {
  let calls = 0;
  const bridge = fixtureBridge(() => ({ number: ++calls }));
  const args = { topic: "trees" };
  assert.equal(
    (await bridge.callTool("produce", args)).status,
    "consent_required",
  );
  assert.equal(
    (
      await bridge.callTool("produce", args, {
        requestConsent: async (request) => {
          assert.deepEqual(request, { tool: "produce", args, estimate });
          return false;
        },
      })
    ).status,
    "consent_denied",
  );
  assert.equal(calls, 0);
  assert.deepEqual(
    await bridge.callTool("produce", args, {
      requestConsent: async (request) => {
        assert.deepEqual(request.estimate, estimate);
        request.args.topic = "consent UI mutation";
        return true;
      },
    }),
    { status: "ok", data: { number: 1 } },
  );
  assert.equal(
    (await bridge.callTool("produce", args)).status,
    "consent_required",
  );
  assert.equal(calls, 1);
});

test("audit entries are append-only and results and audit redact credentials", async () => {
  const bridge = fixtureBridge(() => ({
    [key]: tokenLike,
    nested: { status: key },
  }));
  const recorded = [];
  const status = await bridge.callTool(
    "produce",
    { topic: "copied " + key },
    {
      appendAudit: (entry) => recorded.push(entry),
      requestConsent: async () =>
        assert.fail("Credential-bearing input must not be dispatched"),
    },
  );
  assert.equal(status.status, "key_in_content");
  const result = await bridge.callTool("lookup", { topic: "safe" });
  assert.deepEqual(result.data, {
    "[REDACTED]": "[REDACTED]",
    nested: { status: "[REDACTED]" },
  });
  const audit = bridge.listAudit();
  assert.deepEqual(audit[0], recorded[0]);
  assert.equal(audit[0].tool, "produce");
  assert.equal(audit[0].status, "key_in_content");
  assert.match(audit[0].argsSummary, /\[REDACTED\]/u);
  assert.equal(audit[1].argsSummary, '{"topic":"safe"}');
  assert.ok(Date.parse(audit[0].startedAt) <= Date.parse(audit[0].finishedAt));
  assert.ok(Object.isFrozen(audit[0]));
  audit.pop();
  assert.equal(bridge.listAudit().length, 2);
  assert.ok(!JSON.stringify([result, audit]).includes(key));
});

test("tool timeouts stop free work and cannot authorize a pending paid tool", async () => {
  let calls = 0;
  let activeSignal;
  const bridge = fixtureBridge(
    (_args, ctx) => {
      calls++;
      activeSignal = ctx.signal;
      return new Promise(() => {});
    },
    { timeoutMs: 15 },
  );
  let finishConsent;
  assert.equal(
    (
      await bridge.callTool(
        "produce",
        { topic: "safe" },
        {
          requestConsent: () =>
            new Promise((resolve) => {
              finishConsent = resolve;
            }),
        },
      )
    ).status,
    "timeout",
  );
  finishConsent(true);
  assert.equal(
    (await bridge.callTool("lookup", { topic: "safe" })).status,
    "timeout",
  );
  assert.equal(activeSignal.aborted, true);
  assert.equal(calls, 1);
  assert.equal(
    (
      await bridge.callTool(
        "produce",
        { topic: "safe" },
        {
          requestConsent: approve,
        },
      )
    ).status,
    "unknown_may_have_been_billed",
  );
  assert.equal(calls, 2);
});

test("a Responses run requires its own consent and discloses the run ceiling", async () => {
  assert.equal((await agent()).status, "consent_required");
  assert.equal(
    (
      await agent({
        requestConsent: async ({ tool, args, estimate: disclosure }) => {
          assert.equal(tool, "agent_run");
          assert.deepEqual(args, { goal: "Make an episode" });
          assert.equal(disclosure.label, "estimate");
          assert.equal(disclosure.model, "fixture-model");
          assert.equal(disclosure.maxRequests, 12);
          assert.ok(disclosure.maxOutputTokens > 0);
          return false;
        },
      })
    ).status,
    "consent_denied",
  );
  assert.equal(
    (await agent({ maxSteps: 0, requestConsent: approve })).status,
    "max_steps",
  );
});

test("Responses turns are stateless, serial, observable and use a fresh page key", async () => {
  const bridge = fixtureBridge();
  const consents = [];
  const events = [];
  const requests = [];
  const reasoning = {
    type: "reasoning",
    id: "rs_fixture",
    summary: [],
    encrypted_content: "opaque-fixture",
  };
  const firstCall = call("lookup");
  const secondCall = {
    ...call("produce", '{"topic":"earth"}', "call_second"),
    id: "fc_second",
  };
  const initialKey = "sk-fixture-previous-example";
  let currentKey = initialKey;
  const result = await agent({
    tools: bridge,
    getKey: () => currentKey,
    onEvent: (event) => events.push(event),
    requestConsent: async (request) => {
      consents.push(request);
      return true;
    },
    fetcher: async (url, init) => {
      assert.equal(url, "https://api.openai.com/v1/responses");
      assert.equal(
        init.headers.Authorization,
        "Bearer " + (requests.length ? rotatedKey : initialKey),
      );
      assert.equal(init.cache, "no-store");
      assert.equal(init.credentials, "omit");
      const body = JSON.parse(init.body);
      requests.push(body);
      assert.equal(body.store, false);
      assert.equal(body.parallel_tool_calls, false);
      assert.ok(body.max_output_tokens > 0 && body.max_output_tokens <= 4096);
      assert.deepEqual(body.include, ["reasoning.encrypted_content"]);
      assert.ok(!("previous_response_id" in body));
      assert.equal(body.tools.length, 2);
      assert.ok(
        body.tools.every((tool) => tool.strict && tool.type === "function"),
      );
      assert.ok(
        !init.body.includes(initialKey) && !init.body.includes(rotatedKey),
      );
      if (requests.length === 1) {
        currentKey = rotatedKey;
        return turn(reasoning, firstCall);
      }
      if (requests.length === 2) {
        assert.deepEqual(body.input.slice(1), [
          reasoning,
          firstCall,
          {
            type: "function_call_output",
            call_id: firstCall.call_id,
            output: '{"topic":"penguins"}',
          },
        ]);
        return turn(secondCall);
      }
      assert.deepEqual(body.input.at(-1), {
        type: "function_call_output",
        call_id: secondCall.call_id,
        output: '{"topic":"earth"}',
      });
      return turn(answer(`Example ${initialKey} ${rotatedKey} ${tokenLike}`));
    },
  });
  assert.equal(result.status, "completed");
  assert.equal(result.steps, 3);
  assert.equal(result.text, "Example [REDACTED] [REDACTED] [REDACTED]");
  assert.deepEqual(
    consents.map(({ tool }) => tool),
    ["agent_run", "produce"],
  );
  assert.deepEqual(
    events.map(({ type, tool }) => [type, tool]),
    [
      ["tool_call", "lookup"],
      ["tool_result", "lookup"],
      ["tool_call", "produce"],
      ["tool_result", "produce"],
    ],
  );
  assert.equal(bridge.listAudit().length, 2);
});

test("model step limits default to 12 and are capped at 20", async () => {
  for (const [maxSteps, expected] of [
    [2, 2],
    [undefined, 12],
    [99, 20],
  ]) {
    let calls = 0;
    const result = await agent({
      maxSteps,
      requestConsent: async ({ estimate }) => {
        assert.equal(estimate.maxRequests, expected);
        return true;
      },
      fetcher: async () => turn(call("lookup", undefined, "call_" + ++calls)),
    });
    assert.equal(result.status, "max_steps");
    assert.equal(result.steps, expected);
    assert.equal(calls, expected);
  }
});

test("abort before dispatch, while waiting for consent, and during a paid fetch", async () => {
  const stopped = new AbortController();
  stopped.abort(new Error(key));
  assert.equal(
    (await agent({ signal: stopped.signal, requestConsent: approve })).status,
    "aborted",
  );

  const consent = new AbortController();
  assert.equal(
    (
      await agent({
        signal: consent.signal,
        requestConsent: () => {
          consent.abort(new Error(key));
          return new Promise(() => {});
        },
      })
    ).status,
    "aborted",
  );

  const inFlight = new AbortController();
  let fetches = 0;
  const result = await agent({
    signal: inFlight.signal,
    requestConsent: approve,
    fetcher: async (_url, { signal }) => {
      fetches++;
      inFlight.abort(new Error(key));
      assert.equal(signal.aborted, true);
      return new Promise(() => {});
    },
  });
  assert.equal(result.status, "unknown_may_have_been_billed");
  assert.equal(fetches, 1);
  assert.ok(!JSON.stringify(result).includes(key));
});

test("ambiguous model and paid-tool failures never trigger another paid request", async () => {
  let modelCalls = 0;
  const failure = await agent({
    requestConsent: approve,
    fetcher: async () => {
      modelCalls++;
      throw new Error(key);
    },
  });
  assert.equal(failure.status, "unknown_may_have_been_billed");
  assert.equal(modelCalls, 1);

  let toolCalls = 0;
  const bridge = fixtureBridge(() => {
    toolCalls++;
    throw new Error(key);
  });
  const events = [];
  const result = await agent({
    tools: bridge,
    requestConsent: approve,
    onEvent: (event) => events.push(event),
    fetcher: async () => {
      modelCalls++;
      return turn(call("produce"));
    },
  });
  assert.equal(result.status, "unknown_may_have_been_billed");
  assert.equal(toolCalls, 1);
  assert.equal(modelCalls, 2);
  assert.equal(bridge.listAudit()[0].status, result.status);
  assert.ok(
    !JSON.stringify([result, bridge.listAudit(), events]).includes(key),
  );
});

test("malformed model arguments, unknown tools and denied tool consent stop the loop", async () => {
  for (const [item, expected] of [
    [call("produce", "{bad " + key), "invalid_arguments"],
    [call("unknown_fixture"), "unknown_tool"],
    [call("produce"), "consent_denied"],
  ]) {
    let fetches = 0;
    const events = [];
    const tools = fixtureBridge(() =>
      assert.fail("Invalid or denied calls must not run"),
    );
    const result = await agent({
      tools,
      requestConsent: async ({ tool }) => tool === "agent_run",
      onEvent: (event) => events.push(event),
      fetcher: async () => {
        fetches++;
        return turn(item);
      },
    });
    assert.equal(result.status, "tool_error");
    assert.equal(result.toolStatus, expected);
    assert.equal(fetches, 1);
    assert.deepEqual(
      events.map(({ type }) => type),
      ["tool_call", "tool_result"],
    );
    assert.equal(tools.listAudit()[0].status, expected);
    assert.ok(
      !JSON.stringify([result, events, tools.listAudit()]).includes(key),
    );
  }
});

test("credential-bearing model arguments are rejected before a tool or its consent runs", async () => {
  let fetches = 0;
  const events = [];
  const tools = fixtureBridge(() =>
    assert.fail("Credential-bearing input must not run"),
  );
  const result = await agent({
    tools,
    onEvent: (event) => events.push(event),
    requestConsent: async ({ tool }) => {
      assert.equal(tool, "agent_run");
      return true;
    },
    fetcher: async () => {
      fetches++;
      return turn(call("produce", JSON.stringify({ topic: key })));
    },
  });
  assert.equal(result.toolStatus, "key_in_content");
  assert.equal(fetches, 1);
  assert.ok(!JSON.stringify([events, tools.listAudit()]).includes(key));
  assert.equal(
    (
      await agent({
        goal: "Copied " + key,
        requestConsent: async () =>
          assert.fail("The prompt must not receive the key"),
      })
    ).status,
    "key_in_content",
  );
});

function podcastFixture() {
  const provider = fakeOpenAI({ dynamic: true, cast: 2 });
  let latest;
  let rejectNextSave = false;
  const trace = [];
  const artifacts = new Map();
  const library = {
    async listRecords() {
      return latest ? [structuredClone(latest)] : [];
    },
    async receive(episode, signal, previous) {
      assert.equal(signal.aborted, false);
      if (previous?.stamp !== latest?.stamp) return false;
      if (rejectNextSave && episode.researchDraft)
        throw new Error("Fixture disk full");
      const assets = Object.fromEntries(
        episodeAssets(episode).map(({ asset }) => {
          const blob = previous?.assets[asset];
          assert.ok(blob instanceof Blob);
          return [asset, blob];
        }),
      );
      latest = structuredClone({
        episode: readEpisode(episode),
        assets,
        stamp: crypto.randomUUID(),
      });
      trace.push({ saved: latest.episode });
      return true;
    },
  };
  const bridge = createPodcastAgentBridge({
    library,
    getKey: () => key,
    production: {
      language: "en",
      allowedLanguages: ["en"],
      maxHosts: 2,
      maxSeconds: 60,
    },
    fetcher: async (url, options) => {
      assert.equal(latest.episode.job.status, "running");
      if (url.endsWith("transcriptions")) {
        assert.ok(latest.episode.finished);
        trace.push({ request: "transcript" });
        return Response.json({ text: latest.episode.finished.intendedText });
      }
      const body = JSON.parse(options.body);
      const stage = body.tools
        ? body.max_tool_calls === 5
          ? "research"
          : "audit"
        : body.text.format.name === "podcast_outline"
          ? "outline"
          : "script";
      if (stage === "audit") assert.ok(latest.episode.researchDraft);
      if (stage === "outline") assert.ok(latest.episode.research.auditModel);
      if (stage === "script") assert.ok(latest.episode.outline);
      trace.push({ request: stage });
      return provider.fetcher(url, options);
    },
    narrate: async (options) => {
      assert.equal(options.key, key);
      assert.equal(options.maxOutputTokens, 1024);
      assert.equal(options.consentGranted, true);
      assert.ok(latest.episode.script);
      assert.equal(
        Object.keys(latest.episode.render.clips).length,
        trace.filter((entry) => entry.request === "take").length,
      );
      trace.push({ request: "take" });
      const take = {
        audio: new Blob([wave([Buffer.alloc(48_000, 1)])], {
          type: "audio/wav",
        }),
        complete: true,
      };
      await options.onTake(take, 0);
      return [take];
    },
    artifacts: {
      get: async (id) => artifacts.get(id),
      put: async (item, signal) => {
        assert.equal(signal.aborted, false);
        artifacts.set(item.id, item);
      },
    },
    render: async ({ plan, audio }) => {
      assert.equal(plan.estimated, false);
      assert.equal(audio.sampleRate, 24_000);
      assert.ok(audio.channels[0].some((sample) => sample > 0));
      return {
        blob: new Blob(["fixture MP4"], { type: "video/mp4" }),
        sha256: "fixture-hash",
        durationSeconds: plan.duration,
      };
    },
    makeThumbnail: async () =>
      new Blob(["fixture thumbnail"], { type: "image/png" }),
  });
  return {
    bridge,
    artifacts,
    trace,
    failNextResearchSave: () => {
      rejectNextSave = true;
    },
  };
}

test("concrete tools isolate paid stages, save each result and export a revision-bound package", async () => {
  const { bridge, artifacts, trace } = podcastFixture();
  const consents = [];
  const ctx = {
    requestConsent: async (request) => {
      assert.equal(request.estimate.label, "estimate");
      consents.push(request);
      return true;
    },
  };
  assert.deepEqual(await bridge.callTool("list_episodes", {}), {
    status: "ok",
    data: { total: 0, episodes: [] },
  });
  assert.equal(
    (await bridge.callTool("research_topic", { topic: "   " }, ctx)).status,
    "invalid_arguments",
  );
  const researched = await bridge.callTool(
    "research_topic",
    { topic: "Fixture topic" },
    ctx,
  );
  assert.equal(researched.status, "ok");
  assert.equal(researched.data.hasResearch, true);
  assert.equal(researched.data.hasScript, false);
  assert.deepEqual(
    trace.flatMap(({ request }) => request ?? []),
    ["research", "audit"],
  );
  const byId = { episodeId: researched.data.id };
  assert.equal(
    (await bridge.callTool("get_episode", byId)).data.id,
    byId.episodeId,
  );
  assert.equal(
    (await bridge.callTool("narrate_episode", byId, ctx)).status,
    "prerequisite_required",
  );
  assert.equal(
    (await bridge.callTool("export_publish_package", byId)).status,
    "prerequisite_required",
  );
  assert.equal(
    (await bridge.callTool("write_script", byId, ctx)).data.hasScript,
    true,
  );
  assert.deepEqual(
    trace.flatMap(({ request }) => request ?? []),
    ["research", "audit", "outline", "script"],
  );
  assert.equal(
    (await bridge.callTool("narrate_episode", byId, ctx)).data.hasAudio,
    true,
  );
  assert.equal(consents.at(-1).estimate.narrationOutputTokensPerTurn, 1024);
  assert.ok(trace.some(({ request }) => request === "take"));
  assert.equal(
    trace.filter(({ request }) => request).at(-1).request,
    "transcript",
  );

  const video = await bridge.callTool("render_video", byId);
  assert.equal(video.status, "ok");
  assert.equal(artifacts.get(video.data.id).blob.type, "video/mp4");
  const exported = await bridge.callTool("export_publish_package", byId);
  assert.equal(exported.status, "ok");
  const zip = artifacts.get(exported.data.id).blob;
  assert.equal(zip.type, "application/zip");
  assert.ok(
    exported.data.files.includes("video.mp4") &&
      exported.data.files.includes("thumbnail.png"),
  );
  assert.match(await zip.text(), /fixture MP4/u);
  artifacts.get(video.data.id).sourceStamp = "older";
  assert.equal(
    (await bridge.callTool("export_publish_package", byId)).status,
    "prerequisite_required",
  );
  assert.deepEqual(
    consents.map(({ tool }) => tool),
    ["research_topic", "narrate_episode", "write_script", "narrate_episode"],
  );
});

test("a failed checkpoint write stops production before its next paid request", async () => {
  const { bridge, trace, failNextResearchSave } = podcastFixture();
  failNextResearchSave();
  const result = await bridge.callTool(
    "research_topic",
    { topic: "Fixture topic" },
    { requestConsent: approve },
  );
  assert.equal(result.status, "save_failed");
  assert.deepEqual(
    trace.flatMap(({ request }) => request ?? []),
    ["research"],
  );
});
