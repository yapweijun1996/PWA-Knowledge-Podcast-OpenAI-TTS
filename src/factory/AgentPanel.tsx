import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { estimateAgentRun } from "../agent/agent";
import type { Estimate } from "../agent/bridge";
import { useI18n, type MessageKey } from "../i18n";
import { get as getBrowserKey } from "./browser-key";
import { WorkspaceLink, type WorkspaceNavigation } from "./navigation";
import {
  agentAvailability,
  agentGoalIssue,
  agentGoalLimit,
  agentResultKey,
  agentToolKey,
  useAgent,
} from "./useAgent";
import "./agent-panel.css";

type Agent = ReturnType<typeof useAgent>;

function CostEstimate({
  estimate,
  id,
  run = false,
}: {
  estimate: Readonly<Estimate>;
  id?: string;
  run?: boolean;
}) {
  const { t, formatters } = useI18n();
  const limits: [MessageKey, number | undefined][] = [
    ["agent.panel.estimate.requests", estimate.maxRequests],
    ["agent.panel.estimate.tokens", estimate.maxOutputTokens],
    ["agent.panel.estimate.searches", estimate.maxWebSearchCalls],
    ["agent.panel.estimate.narration", estimate.narrationTurns],
    [
      "agent.panel.estimate.tokensPerTurn",
      estimate.narrationOutputTokensPerTurn,
    ],
    ["agent.panel.estimate.transcription", estimate.transcriptionAudioSeconds],
  ];
  return (
    <div id={id} className="agent-cost">
      <strong>{t("agent.panel.estimate.title")}</strong>
      {!run && estimate.model && (
        <p>{t("agent.panel.model", { model: estimate.model })}</p>
      )}
      <ul>
        {limits.map(([key, count]) =>
          count === undefined ? null : (
            <li key={key}>{formatters.plural(key, count)}</li>
          ),
        )}
      </ul>
      <p>{estimate.description}</p>
      <p>{t("agent.panel.estimate.ceiling")}</p>
    </div>
  );
}

function ToolConsent({
  prompt,
  decide,
  panel,
  summary,
}: {
  prompt: Agent["prompt"];
  decide: Agent["decide"];
  panel: RefObject<HTMLDetailsElement | null>;
  summary: RefObject<HTMLElement | null>;
}) {
  const { t } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const deny = useRef<HTMLButtonElement>(null);
  const approve = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    const modal = dialog.current;
    if (!prompt || !modal || !panel.current) return;
    const previous = document.activeElement;
    panel.current.open = true;
    modal.showModal();
    title.current?.focus();
    return () => {
      modal.close();
      if (panel.current?.closest("[hidden]")) return;
      if (
        previous instanceof HTMLElement &&
        previous !== document.body &&
        previous.isConnected &&
        !previous.closest("[hidden]") &&
        !previous.matches(":disabled")
      ) {
        previous.focus();
      } else {
        summary.current?.focus();
      }
    };
  }, [prompt, panel, summary]);

  return (
    <dialog
      ref={dialog}
      className="agent-dialog"
      aria-labelledby="agent-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        if (prompt) decide(prompt, false);
      }}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const target = event.shiftKey ? deny.current : approve.current;
        if (
          document.activeElement !== target &&
          document.activeElement !== title.current
        )
          return;
        event.preventDefault();
        (event.shiftKey ? approve.current : deny.current)?.focus();
      }}
    >
      {prompt && (
        <>
          <h2 ref={title} tabIndex={-1} id="agent-dialog-title">
            {t("agent.panel.dialog.title", {
              tool: t(agentToolKey(prompt.tool)),
            })}
          </h2>
          <dl className="agent-arguments">
            {typeof prompt.args.topic === "string" && (
              <>
                <dt>{t("agent.panel.dialog.topic")}</dt>
                <dd dir="auto" data-user-content>
                  {prompt.args.topic}
                </dd>
              </>
            )}
            {typeof prompt.args.episodeId === "string" && (
              <>
                <dt>{t("agent.panel.dialog.episode")}</dt>
                <dd dir="auto" data-user-content>
                  {prompt.args.episodeId}
                </dd>
              </>
            )}
          </dl>
          <CostEstimate estimate={prompt.estimate} />
          <div className="agent-actions">
            <button
              ref={deny}
              type="button"
              className="outline"
              onClick={() => decide(prompt, false)}
            >
              {t("agent.panel.dialog.deny")}
            </button>
            <button
              ref={approve}
              type="button"
              className="primary"
              onClick={() => decide(prompt, true)}
            >
              {t("agent.panel.dialog.approve")}
            </button>
          </div>
        </>
      )}
    </dialog>
  );
}

export function AgentPanel({
  visible,
  online,
  keySet,
  blocked,
  library,
  production,
  navigation,
  perform,
}: Omit<Parameters<typeof useAgent>[0], "active"> & {
  visible: boolean;
  online: boolean;
  keySet: boolean;
  blocked: boolean;
  navigation: WorkspaceNavigation;
  perform: (work: () => Promise<void>) => Promise<boolean>;
}) {
  const { t, formatters } = useI18n();
  const availability = agentAvailability(online, keySet, blocked);
  const active = visible && online && keySet;
  const agent = useAgent({ active, library, production });
  const [goal, setGoal] = useState("");
  const [credentialBlocked, setCredentialBlocked] = useState(false);
  const [consented, setConsented] = useState(false);
  const panel = useRef<HTMLDetailsElement>(null);
  const summary = useRef<HTMLElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const wasRunning = useRef(false);
  const estimate = estimateAgentRun();
  const issue = credentialBlocked
    ? "agent.failure.keyInContent"
    : agentGoalIssue(goal);

  useLayoutEffect(() => {
    if (!visible || availability !== "ready") setConsented(false);
  }, [visible, availability]);

  useLayoutEffect(() => {
    if (agent.running) cancel.current?.focus();
    else if (
      wasRunning.current &&
      panel.current?.open &&
      !panel.current.closest("[hidden]") &&
      (document.activeElement === cancel.current ||
        document.activeElement === document.body)
    )
      summary.current?.focus();
    wasRunning.current = agent.running;
  }, [agent.running]);

  const changeGoal = (value: string) => {
    const containsKey =
      agentGoalIssue(value, getBrowserKey()) === "agent.failure.keyInContent";
    setGoal(containsKey ? "" : value);
    setCredentialBlocked(containsKey);
    setConsented(false);
  };

  const reason =
    availability === "offline"
      ? "agent.panel.offline"
      : availability === "no-key"
        ? "agent.failure.noKey"
        : availability === "blocked" || agent.running
          ? "studio.intake.wait"
          : (issue ??
            (!consented ? "agent.failure.consentRequired" : undefined));
  const reasonId =
    availability === "no-key" ? "agent-key-hint" : "agent-start-hint";
  const inputDisabled = availability !== "ready" || agent.running;
  const inputHint = inputDisabled ? reasonId : undefined;
  const result = agent.result;

  return (
    <details
      ref={panel}
      className="factory-panel agent-panel"
      hidden={!visible}
    >
      <summary ref={summary}>{t("agent.panel.title")}</summary>
      <div className="agent-content">
        <form
          className="agent-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (reason) return;
            if (
              agentGoalIssue(goal, getBrowserKey()) ===
              "agent.failure.keyInContent"
            ) {
              changeGoal(goal);
              return;
            }
            setConsented(false);
            void perform(() => agent.start(goal.trim(), consented));
          }}
        >
          <div className="field">
            <div className="studio-topic-label">
              <label htmlFor="agent-goal">{t("agent.panel.goal")}</label>
              <small className="muted" id="agent-goal-count">
                {t("agent.panel.goalCount", {
                  count: goal.length,
                  limit: agentGoalLimit,
                })}
              </small>
            </div>
            <textarea
              id="agent-goal"
              aria-describedby={[
                "agent-goal-count",
                inputHint,
                credentialBlocked && !inputDisabled && reasonId,
              ]
                .filter(Boolean)
                .join(" ")}
              aria-invalid={credentialBlocked || undefined}
              rows={4}
              required
              maxLength={agentGoalLimit}
              autoComplete="off"
              disabled={inputDisabled}
              value={goal}
              onChange={(event) => changeGoal(event.target.value)}
            />
          </div>
          <div className="agent-actions">
            {(
              [
                "agent.panel.example.produce",
                "agent.panel.example.list",
              ] as const
            ).map((key) => (
              <button
                key={key}
                type="button"
                className="outline"
                aria-describedby={inputHint}
                disabled={inputDisabled}
                onClick={() => changeGoal(t(key))}
              >
                {t(key)}
              </button>
            ))}
          </div>
          <div className="agent-model">
            <span>{t("agent.panel.model", { model: estimate.model })}</span>
            <span>
              {t("agent.panel.steps", { count: estimate.maxRequests })}
            </span>
          </div>
          <CostEstimate estimate={estimate} id="agent-run-estimate" run />
          <label className="factory-check agent-consent">
            <input
              type="checkbox"
              disabled={inputDisabled}
              checked={consented}
              aria-describedby={["agent-run-estimate", inputHint]
                .filter(Boolean)
                .join(" ")}
              onChange={(event) => setConsented(event.target.checked)}
            />
            {t("agent.panel.runConsent")}
          </label>
          {!keySet && (
            <div className="agent-key">
              <p id="agent-key-hint">{t("agent.failure.noKey")}</p>
              <WorkspaceLink
                className="outline"
                page="settings"
                navigation={navigation}
              >
                {t("studio.availability.openSettings")}
              </WorkspaceLink>
            </div>
          )}
          {reason && availability !== "no-key" && (
            <p className="muted" id="agent-start-hint">
              {t(reason)}
            </p>
          )}
          <div className="agent-actions">
            <button
              type="submit"
              className="primary"
              disabled={!!reason}
              aria-describedby={reason ? reasonId : undefined}
            >
              {t("agent.panel.start")}
            </button>
            <button
              ref={cancel}
              type="button"
              hidden={!agent.running}
              className="outline"
              aria-disabled={agent.cancelling || undefined}
              onClick={agent.cancel}
            >
              {t(
                agent.cancelling
                  ? "agent.panel.cancelling"
                  : "agent.panel.cancel",
              )}
            </button>
          </div>
        </form>
        <div
          className="agent-log"
          role="log"
          aria-live="polite"
          aria-label={t("agent.panel.log.title")}
        >
          {agent.events.length > 0 && (
            <ol>
              {agent.events.map(
                ({ key, seconds, tool, status, step, maximum }, index) => (
                  <li key={index}>
                    <span className="agent-time">
                      {t("agent.panel.log.time", { seconds })}
                    </span>
                    <span>
                      {t(key, {
                        ...(tool && { tool: t(tool) }),
                        ...(status && { status: t(status) }),
                        ...(step !== undefined && { step, maximum: maximum! }),
                      })}
                    </span>
                  </li>
                ),
              )}
            </ol>
          )}
        </div>
        <div role="status">
          {result && (
            <div className="agent-result">
              <h2>{t("agent.panel.result")}</h2>
              {agent.cancelled && <p>{t("agent.run.aborted")}</p>}
              {result.status === "completed" ? (
                <p dir="auto" data-user-content className="agent-answer">
                  {result.text}
                </p>
              ) : (
                result.status !== "aborted" && (
                  <p>{t(agentResultKey(result))}</p>
                )
              )}
              <p>
                {agent.saved.length
                  ? t("agent.panel.savedSummary", {
                      items: formatters.list(agent.saved.map((key) => t(key))),
                    })
                  : t("agent.panel.savedNone")}
              </p>
            </div>
          )}
        </div>
      </div>
      <ToolConsent
        prompt={active ? agent.prompt : undefined}
        decide={agent.decide}
        panel={panel}
        summary={summary}
      />
    </details>
  );
}
