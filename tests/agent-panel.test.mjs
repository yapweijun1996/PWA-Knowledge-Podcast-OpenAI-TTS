import assert from "node:assert/strict";
import test from "node:test";
import { estimateAgentRun, runAgent } from "../src/agent/agent.ts";
import { createAgentBridge, objectSchema } from "../src/agent/bridge.ts";
import {
  agentAvailability,
  agentGoalIssue,
  agentLogMessage,
  createAgentConsent,
} from "../src/factory/useAgent.ts";

const fakeKey = "fixture-agent-key";
const estimate = estimateAgentRun();
const run = { tool: "agent_run", args: {}, estimate };
const research = {
  tool: "research_topic",
  args: { topic: "Gardens" },
  estimate,
};

test("agent availability requires an online browser key and a ready workspace", () => {
  assert.equal(agentAvailability(false, false, false), "offline");
  assert.equal(agentAvailability(false, true, true), "offline");
  assert.equal(agentAvailability(true, false, true), "no-key");
  assert.equal(agentAvailability(true, true, true), "blocked");
  assert.equal(agentAvailability(true, true, false), "ready");
});

test("goals reject blanks, more than 500 characters, and credentials", () => {
  assert.equal(agentGoalIssue(" \t\n "), "agent.panel.goalRequired");
  assert.equal(agentGoalIssue("a".repeat(500)), undefined);
  assert.equal(agentGoalIssue("a".repeat(501)), "agent.panel.goalLength");
  assert.equal(agentGoalIssue("List my episodes"), undefined);
  assert.equal(
    agentGoalIssue("Use " + fakeKey, fakeKey),
    "agent.failure.keyInContent",
  );
  assert.equal(
    agentGoalIssue("Use sk-fixture-example-only"),
    "agent.failure.keyInContent",
  );
});

test("logs map events to catalogue keys and omit provider details", () => {
  assert.deepEqual(agentLogMessage({ type: "model_step", step: 2 }), {
    key: "agent.panel.log.step",
    step: 2,
    maximum: 12,
  });
  assert.deepEqual(agentLogMessage({ type: "tool_call", tool: fakeKey }), {
    key: "agent.panel.log.toolCall",
    tool: "agent.panel.tool.unknown",
  });
  assert.deepEqual(
    agentLogMessage({
      type: "tool_result",
      tool: research.tool,
      step: 1,
      result: { status: "consent_denied", message: fakeKey },
    }),
    {
      key: "agent.panel.log.toolResult",
      tool: "agent.panel.tool.research",
      status: "agent.panel.toolDenied",
    },
  );
  assert.deepEqual(
    agentLogMessage({ type: "consent", tool: run.tool, decision: "granted" }),
    {
      key: "agent.panel.log.consentGranted",
      tool: "agent.panel.tool.run",
    },
  );
  assert.deepEqual(
    agentLogMessage({
      type: "error",
      result: {
        status: "unknown_may_have_been_billed",
        steps: 1,
        message: fakeKey,
      },
    }),
    {
      key: "agent.panel.log.error",
      status: "agent.failure.unknownOutcome",
    },
  );
});

test("run consent is single-use and each tool requires its own decision", async () => {
  const controller = new AbortController();
  const prompts = [];
  const decisions = [];
  const consent = createAgentConsent({
    signal: controller.signal,
    runApproved: true,
    onPrompt: (request) => prompts.push(request),
    onDecision: (tool, decision) => decisions.push([tool, decision]),
  });
  assert.equal(await consent.requestConsent(research), false);
  assert.equal(await consent.requestConsent(run), true);
  assert.equal(await consent.requestConsent(run), false);

  const denied = consent.requestConsent(research);
  assert.equal(prompts.at(-1), research);
  assert.equal(await consent.requestConsent(research), false);
  consent.decide(research, false);
  assert.equal(await denied, false);
  assert.equal(prompts.at(-1), undefined);

  const nextResearch = { ...research };
  const approved = consent.requestConsent(nextResearch);
  consent.decide(research, true);
  assert.equal(prompts.at(-1), nextResearch);
  consent.decide(nextResearch, true);
  assert.equal(await approved, true);
  assert.deepEqual(decisions, [
    ["agent_run", "asked"],
    ["agent_run", "granted"],
    ["research_topic", "asked"],
    ["research_topic", "denied"],
    ["research_topic", "asked"],
    ["research_topic", "granted"],
  ]);
});

test("an unchecked run or abort never approves a pending tool", async () => {
  const controller = new AbortController();
  const prompts = [];
  const options = {
    signal: controller.signal,
    onPrompt: (request) => prompts.push(request),
    onDecision: () => {},
  };
  const unchecked = createAgentConsent({ ...options, runApproved: false });
  assert.equal(await unchecked.requestConsent(run), false);
  assert.equal(await unchecked.requestConsent(research), false);
  assert.deepEqual(prompts, []);
  const checked = createAgentConsent({ ...options, runApproved: true });
  assert.equal(await checked.requestConsent(run), true);
  const pending = checked.requestConsent(research);
  controller.abort();
  checked.decide(research, true);
  assert.equal(await pending, false);
  assert.equal(await checked.requestConsent(research), false);
  assert.deepEqual(prompts, [research, undefined]);
});

test("the displayed model estimate matches the runtime disclosure and step", async () => {
  const calls = [];
  const steps = [];
  const result = await runAgent({
    goal: "List my episodes",
    getKey: () => fakeKey,
    tools: createAgentBridge([]),
    onModelStep: (step) => steps.push(step),
    requestConsent: async (request) => {
      assert.deepEqual(request.estimate, estimate);
      assert.deepEqual(calls, []);
      return true;
    },
    fetcher: async (_url, init) => {
      calls.push(JSON.parse(init.body));
      return Response.json({
        status: "completed",
        output: [
          {
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: "Library reviewed." }],
          },
        ],
      });
    },
  });
  assert.equal(result.status, "completed");
  assert.deepEqual(steps, [1]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, estimate.model);
  assert.equal(
    calls[0].max_output_tokens * estimate.maxRequests,
    estimate.maxOutputTokens,
  );
});

test("the Studio bridge waits for a tool's checkpoint after abort", async () => {
  const controller = new AbortController();
  let notifyStarted;
  let releaseSave;
  const started = new Promise((resolve) => {
    notifyStarted = resolve;
  });
  const saving = new Promise((resolve) => {
    releaseSave = resolve;
  });
  const bridge = createAgentBridge(
    [
      {
        name: "save_fixture",
        description: "Test checkpoint",
        parameters: objectSchema({}),
        paid: false,
        async run(_args, { signal }) {
          notifyStarted();
          await saving;
          assert.equal(signal.aborted, true);
          return null;
        },
      },
    ],
    { settleOnAbort: true },
  );
  try {
    const pending = bridge.callTool(
      "save_fixture",
      {},
      { signal: controller.signal },
    );
    await started;
    controller.abort();
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(bridge.listAudit(), []);
    releaseSave();
    assert.deepEqual(await pending, { status: "ok", data: null });
    assert.equal(bridge.listAudit()[0].status, "ok");
  } finally {
    releaseSave();
  }
});
