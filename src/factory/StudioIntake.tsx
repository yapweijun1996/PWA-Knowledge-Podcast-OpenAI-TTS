import { useState, type FormEvent } from "react";
import { limits } from "../../shared/factory";
import { useI18n, type MessageKey } from "../i18n";
import { WorkspaceLink, type WorkspaceNavigation } from "./navigation";
import type {
  BrowserEstimate,
  StudioAvailability,
  StudioMode,
  WorkerAvailability,
} from "./useBrowserProduction";
import "./studio-intake.css";

const availabilityCopy = {
  offline: ["studio.availability.offline", "studio.availability.offlineHint"],
  "no-worker": [
    "studio.availability.browserKeyMissing",
    "studio.availability.browserKeyMissingHint",
  ],
  locked: [
    "studio.availability.workerLocked",
    "studio.availability.workerLockedHint",
  ],
  "no-key": [
    "studio.availability.keyMissing",
    "studio.availability.keyMissingHint",
  ],
  working: [
    "studio.availability.workerBusy",
    "studio.availability.workerBusyHint",
  ],
  ready: [
    "studio.availability.workerReady",
    "studio.availability.workerReadyHint",
  ],
  "ready-browser": [
    "studio.availability.browserReady",
    "studio.availability.browserReadyHint",
  ],
} as const satisfies Record<
  StudioAvailability,
  readonly [MessageKey, MessageKey]
>;

const continuationStatus = {
  offline: "studio.continuation.offline",
  "no-worker": "studio.continuation.workerUnavailable",
  locked: "studio.continuation.workerLocked",
  "no-key": "studio.continuation.keyMissing",
  working: "studio.continuation.workerBusy",
} as const satisfies Record<Exclude<WorkerAvailability, "ready">, MessageKey>;

export function BrowserCost({
  estimate,
  id,
  wholeEpisode = false,
}: {
  estimate: BrowserEstimate;
  id?: string;
  wholeEpisode?: boolean;
}) {
  const { t, formatters } = useI18n();
  const seconds = Math.ceil(estimate.transcriptionAudioSeconds);

  return (
    <div id={id} className="muted">
      <strong>
        {t(wholeEpisode ? "studio.cost.wholeEpisode" : "studio.cost.usage")}
      </strong>
      <div>
        {t("studio.cost.disclosure", {
          output: formatters.plural(
            "studio.cost.output",
            estimate.maxOutputTokens,
          ),
          searches: formatters.plural(
            "studio.cost.searches",
            estimate.maxWebSearchCalls,
          ),
          transcription: formatters.plural(
            "studio.cost.transcription",
            seconds,
            {
              displayCount: formatters.number(seconds, { useGrouping: false }),
            },
          ),
        })}
      </div>
    </div>
  );
}

export function BrowserContinuation({
  estimate,
  keySet,
  workerAvailability,
  disabled,
  navigation,
  onResume,
}: {
  estimate: BrowserEstimate;
  keySet: boolean;
  workerAvailability: WorkerAvailability;
  disabled: boolean;
  navigation: WorkspaceNavigation;
  onResume: () => void;
}) {
  const { t } = useI18n();
  const [consent, setConsent] = useState(false);
  return (
    <section className="factory-panel" aria-labelledby="browser-resume-title">
      <h2 id="browser-resume-title">{t("studio.continuation.title")}</h2>
      <p id="browser-resume-warning" className="muted">
        {t("studio.continuation.warning")}
      </p>
      {workerAvailability !== "ready" &&
        (workerAvailability === "offline" || !keySet) && (
          <p className="muted">{t(continuationStatus[workerAvailability])}</p>
        )}
      {!keySet && (
        <p>
          {t("studio.continuation.keyHint")}{" "}
          <WorkspaceLink page="settings" navigation={navigation}>
            {t("studio.availability.openSettings")}
          </WorkspaceLink>
        </p>
      )}
      <div className="factory-create">
        <BrowserCost
          estimate={estimate}
          id="browser-resume-estimate"
          wholeEpisode
        />
        <label className="factory-check">
          <input
            type="checkbox"
            aria-describedby="browser-resume-estimate browser-resume-warning"
            checked={consent}
            disabled={disabled}
            onChange={(event) => setConsent(event.target.checked)}
          />
          {t("studio.continuation.consent")}
        </label>
        <button
          className="primary"
          disabled={disabled || !consent}
          onClick={() => {
            setConsent(false);
            onResume();
          }}
        >
          {t("studio.continuation.title")}
        </button>
      </div>
    </section>
  );
}

export function StudioIntake({
  availability,
  navigation,
  mode,
  chooseMode,
  estimate,
  topic,
  exactHosts,
  consent,
  busy,
  onChange,
  onConsent,
  onModeChange,
  onHostsChange,
  onSubmit,
}: {
  availability: StudioAvailability;
  navigation: WorkspaceNavigation;
  mode: StudioMode;
  chooseMode: boolean;
  estimate?: BrowserEstimate;
  topic: string;
  exactHosts?: 2;
  consent: boolean;
  busy: boolean;
  onChange: (topic: string) => void;
  onConsent: (consent: boolean) => void;
  onModeChange: (mode: StudioMode) => void;
  onHostsChange: (count: 2 | undefined) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  const { t, formatters } = useI18n();
  const [status, guidance] = availabilityCopy[availability];
  const ready = availability === "ready" || availability === "ready-browser";

  return (
    <div className="studio-intake">
      <section
        className="factory-panel studio-intake-form"
        aria-labelledby="studio-intake-title"
      >
        <h2 id="studio-intake-title">{t("studio.intake.title")}</h2>
        <form className="factory-create" onSubmit={onSubmit}>
          <div className="field">
            <div className="studio-topic-label">
              <label htmlFor="studio-topic">{t("studio.intake.topic")}</label>
              <small className="muted">
                {formatters.plural("studio.intake.topicCount", topic.length, {
                  limit: limits.topic,
                })}
              </small>
            </div>
            <textarea
              id="studio-topic"
              disabled={busy}
              required
              rows={4}
              maxLength={limits.topic}
              value={topic}
              placeholder={t("studio.intake.topicExample")}
              onChange={(event) => onChange(event.target.value)}
            />
          </div>
          <label className="field">
            {t("studio.intake.hosts")}
            <select
              value={exactHosts ?? "auto"}
              disabled={busy}
              onChange={(event) =>
                onHostsChange(event.target.value === "2" ? 2 : undefined)
              }
            >
              <option value="auto">{t("studio.intake.autoHosts")}</option>
              <option value="2">
                {formatters.plural("studio.intake.twoHosts", 2)}
              </option>
            </select>
          </label>
          {chooseMode && (
            <label className="field">
              {t("studio.intake.location")}
              <select
                value={mode}
                disabled={busy}
                onChange={(event) =>
                  onModeChange(
                    event.target.value === "worker" ? "worker" : "browser",
                  )
                }
              >
                <option value="browser">{t("studio.intake.browser")}</option>
                <option value="worker">{t("studio.intake.worker")}</option>
              </select>
            </label>
          )}
          <div className="studio-availability" id="studio-availability">
            <div role="status">
              <strong>{t(status)}</strong>
              <span>{t(guidance)}</span>
            </div>
            {!ready && availability !== "offline" && (
              <WorkspaceLink
                className="outline"
                page="settings"
                navigation={navigation}
              >
                {t("studio.availability.openSettings")}
              </WorkspaceLink>
            )}
          </div>
          {estimate && (
            <BrowserCost estimate={estimate} id="browser-start-estimate" />
          )}
          <label className="factory-check studio-consent">
            <input
              type="checkbox"
              aria-describedby={estimate ? "browser-start-estimate" : undefined}
              disabled={!ready || busy}
              checked={consent}
              onChange={(event) => onConsent(event.target.checked)}
            />
            {t("studio.intake.consent")}
          </label>
          <button
            className="primary"
            aria-describedby="studio-availability"
            disabled={!ready || busy || !consent || !topic.trim()}
          >
            {t("studio.intake.submit")}
          </button>
        </form>
      </section>
      <aside
        className="factory-panel studio-intake-flow"
        aria-labelledby="studio-flow-title"
      >
        <h2 id="studio-flow-title">{t("studio.workflow.title")}</h2>
        <ol>
          <li>
            <strong>{t("studio.workflow.research")}</strong>
            <span>{t("studio.workflow.researchHint")}</span>
          </li>
          <li>
            <strong>{t("studio.workflow.script")}</strong>
            <span>{t("studio.workflow.scriptHint")}</span>
          </li>
          <li>
            <strong>{t("studio.workflow.narration")}</strong>
            <span>{t("studio.workflow.narrationHint")}</span>
          </li>
        </ol>
      </aside>
    </div>
  );
}
