import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Episode, ProductionBounds } from "../../shared/factory.ts";
import {
  agentFailureKeys,
  defaultAgentSteps,
  runAgent,
  type AgentEvent,
  type AgentResult,
} from "../agent/agent.ts";
import { browserAgentArtifacts } from "../agent/artifacts.ts";
import {
  toolFailureKeys,
  type RequestConsent,
  type ToolResult,
} from "../agent/bridge.ts";
import { redactCredentials } from "../agent/runtime.ts";
import type { MessageKey } from "../i18n/index.ts";
import { get as getBrowserKey } from "./browser-key.ts";
import type * as Library from "./library.ts";

export const agentGoalLimit = 500;

export function agentAvailability(
  online: boolean,
  keySet: boolean,
  blocked: boolean,
) {
  if (!online) return "offline";
  if (!keySet) return "no-key";
  return blocked ? "blocked" : "ready";
}

export function agentGoalIssue(goal: string, key?: string) {
  if (redactCredentials(goal, key) !== goal)
    return "agent.failure.keyInContent";
  if (goal.length > agentGoalLimit) return "agent.panel.goalLength";
  if (!goal.trim()) return "agent.panel.goalRequired";
}

const toolNames = new Map<string, MessageKey>([
  ["agent_run", "agent.panel.tool.run"],
  ["list_episodes", "agent.panel.tool.list"],
  ["get_episode", "agent.panel.tool.get"],
  ["research_topic", "agent.panel.tool.research"],
  ["write_script", "agent.panel.tool.script"],
  ["narrate_episode", "agent.panel.tool.narration"],
  ["draft_storyboard", "agent.panel.tool.storyboard"],
  ["render_video", "agent.panel.tool.video"],
  ["export_publish_package", "agent.panel.tool.export"],
]);

export const agentToolKey = (tool: string): MessageKey =>
  toolNames.get(tool) ?? "agent.panel.tool.unknown";

export function agentToolStatusKey(status: ToolResult["status"]): MessageKey {
  if (status === "ok") return "agent.panel.toolSucceeded";
  if (status === "consent_denied") return "agent.panel.toolDenied";
  return toolFailureKeys[status];
}

type Failure = Exclude<AgentResult, { status: "completed" }>;

export function agentResultKey(result: Failure): MessageKey {
  return result.toolStatus === "consent_denied"
    ? "agent.panel.stoppedAfterDenial"
    : agentFailureKeys[result.status];
}

type ConsentDecision = "asked" | "granted" | "denied";
type LogEvent =
  | AgentEvent
  | { type: "consent"; decision: ConsentDecision; tool: string }
  | { type: "model_step"; step: number }
  | { type: "error"; result: Failure };

type LogMessage = {
  key: MessageKey;
  tool?: MessageKey;
  status?: MessageKey;
  step?: number;
  maximum?: number;
};

export function agentLogMessage(event: LogEvent): LogMessage {
  switch (event.type) {
    case "model_step":
      return {
        key: "agent.panel.log.step",
        step: event.step,
        maximum: defaultAgentSteps,
      };
    case "tool_call":
      return {
        key: "agent.panel.log.toolCall",
        tool: agentToolKey(event.tool),
      };
    case "tool_result":
      return {
        key: "agent.panel.log.toolResult",
        tool: agentToolKey(event.tool),
        status: agentToolStatusKey(event.result.status),
      };
    case "consent": {
      const keys = {
        asked: "agent.panel.log.consentAsked",
        granted: "agent.panel.log.consentGranted",
        denied: "agent.panel.log.consentDenied",
      } as const;
      return { key: keys[event.decision], tool: agentToolKey(event.tool) };
    }
    case "error":
      return {
        key: "agent.panel.log.error",
        status: agentResultKey(event.result),
      };
  }
}

type ConsentRequest = Parameters<RequestConsent>[0];

// A prompt authorizes only the single request it represents.
export function createAgentConsent({
  signal,
  runApproved,
  onPrompt,
  onDecision,
}: {
  signal: AbortSignal;
  runApproved: boolean;
  onPrompt: (request?: ConsentRequest) => void;
  onDecision: (tool: string, decision: ConsentDecision) => void;
}) {
  let initial = true;
  let pending:
    | {
        request: ConsentRequest;
        resolve: (approved: boolean) => void;
      }
    | undefined;

  function decide(request: ConsentRequest, approved: boolean) {
    if (pending?.request !== request) return;
    const { resolve } = pending;
    pending = undefined;
    signal.removeEventListener("abort", deny);
    const granted = approved && !signal.aborted;
    onDecision(request.tool, granted ? "granted" : "denied");
    onPrompt();
    resolve(granted);
  }

  const deny = () => {
    if (pending) decide(pending.request, false);
  };
  const requestConsent: RequestConsent = async (request) => {
    if (signal.aborted) return false;
    if (request.tool === "agent_run") {
      if (!initial) return false;
      initial = false;
      onDecision(request.tool, "asked");
      onDecision(request.tool, runApproved ? "granted" : "denied");
      return runApproved;
    }
    if (initial || !runApproved || pending) return false;
    return new Promise<boolean>((resolve) => {
      pending = { request, resolve };
      signal.addEventListener("abort", deny, { once: true });
      onDecision(request.tool, "asked");
      onPrompt(request);
    });
  };

  return { requestConsent, decide };
}

const savedKeys = {
  episode: "agent.panel.saved.episode",
  researchDraft: "agent.panel.saved.researchDraft",
  research: "agent.panel.saved.research",
  outline: "agent.panel.saved.outline",
  script: "agent.panel.saved.script",
  narration: "agent.panel.saved.narration",
  audio: "agent.panel.saved.audio",
  transcript: "agent.panel.saved.transcript",
  video: "agent.panel.saved.video",
  publish: "agent.panel.saved.publish",
} as const;

function productionSaves(episode: Episode, prior?: Episode): MessageKey[] {
  const saved: MessageKey[] = [];
  if (!prior) saved.push(savedKeys.episode);
  for (const stage of [
    "researchDraft",
    "research",
    "outline",
    "script",
  ] as const) {
    if (episode[stage] && !prior?.[stage]) saved.push(savedKeys[stage]);
  }
  const previousClips = prior?.render?.clips;
  if (
    Object.entries(episode.render?.clips ?? {}).some(
      ([id, clip]) => clip.asset !== previousClips?.[id]?.asset,
    )
  )
    saved.push(savedKeys.narration);
  if (episode.finished && episode.finished.asset !== prior?.finished?.asset)
    saved.push(savedKeys.audio);
  if (episode.finished?.transcript && !prior?.finished?.transcript)
    saved.push(savedKeys.transcript);
  return saved;
}

export function useAgent({
  active,
  library,
  production,
}: {
  active: boolean;
  library: Pick<typeof Library, "listRecords" | "receive">;
  production: ProductionBounds;
}) {
  const current = useRef<AbortController | null>(null);
  const decision = useRef<
    ReturnType<typeof createAgentConsent>["decide"] | null
  >(null);
  const [running, setRunning] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [events, setEvents] = useState<(LogMessage & { seconds: number })[]>(
    [],
  );
  const [saved, setSaved] = useState<MessageKey[]>([]);
  const [prompt, setPrompt] = useState<ConsentRequest>();
  const [result, setResult] = useState<AgentResult>();

  useLayoutEffect(() => {
    if (!active) current.current?.abort();
  }, [active]);

  useEffect(() => {
    const abort = () => current.current?.abort();
    window.addEventListener("pagehide", abort);
    return () => {
      window.removeEventListener("pagehide", abort);
      abort();
    };
  }, []);

  async function start(goal: string, approved: boolean) {
    if (
      current.current ||
      !active ||
      !approved ||
      agentGoalIssue(goal, getBrowserKey())
    )
      return;
    const controller = new AbortController();
    current.current = controller;
    const { signal } = controller;
    const startedAt = performance.now();
    const log = (event: LogEvent) => {
      const entry = {
        ...agentLogMessage(event),
        seconds: Math.floor((performance.now() - startedAt) / 1000),
      };
      setEvents((entries) => [...entries, entry]);
    };
    const recordSaves = (keys: MessageKey[]) => {
      if (current.current === controller && keys.length)
        setSaved((previous) => [...new Set([...previous, ...keys])]);
    };
    const consent = createAgentConsent({
      signal,
      runApproved: approved,
      onPrompt: setPrompt,
      onDecision: (tool, value) =>
        log({ type: "consent", tool, decision: value }),
    });
    decision.current = consent.decide;
    setRunning(true);
    setCancelled(false);
    setEvents([]);
    setSaved([]);
    setResult(undefined);

    let outcome: AgentResult;
    try {
      const fetcher = globalThis.fetch.bind(globalThis);
      const { createPodcastAgentBridge } = await import("../agent/tools.ts");
      signal.throwIfAborted();
      const tools = createPodcastAgentBridge({
        getKey: getBrowserKey,
        fetcher,
        production,
        settleOnAbort: true,
        library: {
          listRecords: library.listRecords,
          async receive(episode, signal, prior, replaceEdit) {
            const committed = await library.receive(
              episode,
              signal,
              prior,
              replaceEdit,
            );
            if (committed)
              recordSaves(productionSaves(episode, prior?.episode));
            return committed;
          },
        },
        artifacts: {
          get: browserAgentArtifacts.get,
          async put(artifact, signal) {
            await browserAgentArtifacts.put(artifact, signal);
            recordSaves([savedKeys[artifact.kind]]);
          },
        },
      });
      outcome = await runAgent({
        goal,
        tools,
        signal,
        fetcher,
        getKey: getBrowserKey,
        requestConsent: consent.requestConsent,
        onModelStep: (step) => log({ type: "model_step", step }),
        onEvent(event) {
          log(event);
          if (
            event.type === "tool_result" &&
            event.tool === "draft_storyboard" &&
            event.result.status === "ok"
          ) recordSaves(["agent.panel.saved.storyboard"]);
        },
      });
    } catch {
      outcome = { status: "tool_error", steps: 0, message: "" };
    }
    setCancelled(signal.aborted || outcome.status === "aborted");
    controller.abort();
    if (outcome.status !== "completed" && outcome.status !== "aborted")
      log({ type: "error", result: outcome });
    setResult(outcome);
    current.current = null;
    decision.current = null;
    setRunning(false);
    setCancelling(false);
  }

  function cancel() {
    if (!current.current) return;
    setCancelling(true);
    current.current.abort();
  }

  return {
    start,
    cancel,
    running,
    cancelling,
    cancelled,
    events,
    saved,
    prompt,
    result,
    decide: (request: ConsentRequest, approved: boolean) =>
      decision.current?.(request, approved),
  };
}
