import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type FormEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  languages,
  type Language,
  type Preferences,
  type Runtime,
  type Schedule,
} from "../../shared/factory";
import {
  createTranslator,
  defaultLocale,
  isLocale,
  locales,
  useI18n,
  type Locale,
  type MessageKey,
} from "../i18n";
import { clear, set } from "./browser-key";

const languageNames = {
  "zh-CN": "settings.language.zh-CN",
  en: "settings.language.en",
  ms: "settings.language.ms",
} as const satisfies Record<Locale, MessageKey>;

const contentLanguageNames = {
  en: "settings.contentLanguage.english",
  zh: "settings.contentLanguage.mandarin",
  ms: "settings.contentLanguage.malay",
  sg: "settings.contentLanguage.singaporeMixed",
} as const satisfies Record<Language, MessageKey>;

const scheduleMessageKeys = [
  "settings.schedule.checkReserved",
  "settings.schedule.noNewTopic",
  "settings.schedule.productionStarted",
  "settings.schedule.checkCancelled",
  "settings.schedule.checkFailed",
  "settings.schedule.searchIncomplete",
  "settings.schedule.invalidTopic",
  "settings.schedule.connectionFailed",
] as const satisfies readonly MessageKey[];
const sourceText = createTranslator(defaultLocale);
const workerScheduleMessages = new Map(
  scheduleMessageKeys.map((key) => [sourceText(key), key] as const),
);

type SelectProps = ComponentPropsWithoutRef<"select">;
type ContainerProps = { className?: string; children?: ReactNode };

function AppearanceSettings({
  themeSelect,
}: {
  themeSelect: ReactElement<SelectProps>;
}) {
  const { locale, setLocale, t } = useI18n();

  return (
    <section className="factory-panel">
      <h2>{t("settings.appearance.title")}</h2>
      <label className="field">
        {t("settings.appearance.theme")}
        {cloneElement(
          themeSelect,
          undefined,
          <option value="system">{t("settings.appearance.system")}</option>,
          <option value="light">{t("settings.appearance.light")}</option>,
          <option value="dark">{t("settings.appearance.dark")}</option>,
        )}
      </label>
      <label className="field">
        {t("settings.appearance.language")}
        <select
          value={locale}
          onChange={(event) => {
            const value = event.currentTarget.value;
            if (isLocale(value)) setLocale(value);
          }}
        >
          {locales.map((code) => (
            <option key={code} value={code} lang={code}>
              {t(languageNames[code])}
            </option>
          ))}
        </select>
      </label>
    </section>
  );
}

// Factory owns the theme select. Replace its appearance panel at the shell
// boundary and keep the select's controlled value and change callback.
export function withAppearanceSettings(child: ReactNode) {
  if (
    !isValidElement<ContainerProps>(child) ||
    child.type !== "div" ||
    child.props.className !== "factory-page-stack"
  )
    return child;

  const panels = Children.map(child.props.children, (panel, index) => {
    if (index !== 0 || !isValidElement<ContainerProps>(panel)) return panel;
    if (panel.type !== "section" || panel.props.className !== "factory-panel")
      return panel;
    const [, field] = Children.toArray(panel.props.children);
    if (!isValidElement<ContainerProps>(field) || field.type !== "label")
      return panel;
    const themeSelect = Children.toArray(field.props.children).find(
      (item): item is ReactElement<SelectProps> =>
        isValidElement<SelectProps>(item) && item.type === "select",
    );
    return themeSelect ? (
      <AppearanceSettings themeSelect={themeSelect} />
    ) : (
      panel
    );
  });

  return cloneElement(child, undefined, panels);
}

export function BrowserCredentials({
  configured,
  working,
}: {
  configured: boolean;
  working: boolean;
}) {
  const { t } = useI18n();
  const key = useRef<HTMLInputElement>(null);
  const [shown, setShown] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    function clearInput() {
      if (key.current) key.current.value = "";
      setShown(false);
      setAcknowledged(false);
      setError("");
    }
    window.addEventListener("pagehide", clearInput);
    return () => window.removeEventListener("pagehide", clearInput);
  }, []);

  function save(event: FormEvent) {
    event.preventDefault();
    if (working || !acknowledged || !key.current) return;
    const value = key.current.value;
    key.current.value = "";
    setShown(false);
    try {
      set(value);
      setAcknowledged(false);
      setError("");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : t("settings.browserKey.saveFailed"),
      );
    }
  }

  return (
    <section className="factory-panel" aria-labelledby="browser-key-title">
      <h2 id="browser-key-title">{t("settings.browserKey.title")}</h2>
      <form className="factory-create" autoComplete="off" onSubmit={save}>
        <label className="field">
          {t("settings.browserKey.label")}
          <input
            ref={key}
            required
            id="browser-api-key"
            type={shown ? "text" : "password"}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={512}
            disabled={working}
          />
        </label>
        <button
          type="button"
          className="text-button"
          aria-controls="browser-api-key"
          onClick={() => setShown(!shown)}
        >
          {t(shown ? "settings.key.hide" : "settings.key.show")}
        </button>
        <label className="factory-check">
          <input
            type="checkbox"
            checked={acknowledged}
            disabled={working}
            onChange={(event) => setAcknowledged(event.target.checked)}
          />
          {t("settings.browserKey.risk")}
        </label>
        {(working || !acknowledged) && (
          <p className="muted" id="browser-key-blocked">
            {t(
              working
                ? "settings.action.working"
                : "settings.browserKey.acknowledge",
            )}
          </p>
        )}
        <div className="factory-actions">
          <button
            className="outline"
            disabled={working || !acknowledged}
            aria-describedby={
              working || !acknowledged ? "browser-key-blocked" : undefined
            }
          >
            {t("settings.browserKey.set")}
          </button>
          <button
            type="button"
            className="text-button"
            disabled={working || !configured}
            onClick={() => {
              clear();
              if (key.current) key.current.value = "";
              setShown(false);
              setAcknowledged(false);
              setError("");
            }}
          >
            {t("settings.browserKey.clear")}
          </button>
        </div>
      </form>
      <p className="error factory-empty-alert" role="alert">
        {error}
      </p>
      <p className="muted factory-setting-group" role="status">
        {configured
          ? t("settings.browserKey.configured")
          : t("settings.browserKey.unconfigured")}
      </p>
    </section>
  );
}

export function ProductionCredentials({
  runtime,
  connected,
  working,
  running,
  onKey,
}: {
  runtime: Runtime | null;
  connected: boolean;
  working: boolean;
  running: boolean;
  onKey: (key: string | null) => void;
}) {
  const { t } = useI18n();
  const key = useRef<HTMLInputElement>(null);
  const [shown, setShown] = useState(false);
  return (
    <section className="factory-panel">
      <h2>{t("settings.workerKey.title")}</h2>
      {connected && runtime?.localProduction ? (
        <div className="factory-setting-group">
          <p className="muted">{t("settings.workerKey.risk")}</p>
          <form
            className="factory-actions"
            onSubmit={(event) => {
              event.preventDefault();
              if (!key.current) return;
              const value = key.current.value;
              key.current.value = "";
              setShown(false);
              onKey(value);
            }}
          >
            <label className="field">
              {t("settings.workerKey.label")}
              <input
                ref={key}
                required
                id="worker-api-key"
                type={shown ? "text" : "password"}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={503}
              />
            </label>
            <button
              type="button"
              className="text-button"
              aria-controls="worker-api-key"
              onClick={() => setShown(!shown)}
            >
              {t(shown ? "settings.key.hide" : "settings.key.show")}
            </button>
            {(working || running) && (
              <p className="muted" id="worker-key-blocked">
                {t(
                  running
                    ? "studio.availability.workerBusy"
                    : "settings.action.working",
                )}
              </p>
            )}
            <button
              className="outline"
              disabled={working || running}
              aria-describedby={
                working || running ? "worker-key-blocked" : undefined
              }
            >
              {t("settings.workerKey.set")}
            </button>
            {runtime.keyMode === "session" && (
              <button
                type="button"
                className="text-button"
                disabled={working || running}
                onClick={() => onKey(null)}
              >
                {t("settings.workerKey.clear")}
              </button>
            )}
          </form>
          <p className="muted">
            {t("settings.workerKey.status", {
              keyStatus: t(
                runtime.configured
                  ? runtime.keyMode === "environment"
                    ? "settings.workerKey.environment"
                    : "settings.workerKey.configured"
                  : "settings.workerKey.unconfigured",
              ),
              audioStatus: t(
                runtime.mp3
                  ? "settings.workerKey.mp3"
                  : "settings.workerKey.wav",
              ),
            })}
          </p>
        </div>
      ) : (
        <p className="muted">{t("settings.workerKey.unavailable")}</p>
      )}
    </section>
  );
}

export function ProductionSettings({
  runtime,
  connected,
  working,
  running,
  preferences,
  schedule,
  setPreferences,
  onSave,
  onDiscover,
  onCancelDiscovery,
}: {
  runtime: Runtime | null;
  connected: boolean;
  working: boolean;
  running: boolean;
  preferences: Preferences;
  schedule: Schedule | null;
  setPreferences: (value: Preferences) => void;
  onSave: (consent: boolean) => void;
  onDiscover: () => void;
  onCancelDiscovery: () => void;
}) {
  const { locale, t, formatters } = useI18n();
  const consent = useRef<HTMLInputElement>(null);
  const allowed = preferences.allowedLanguages;
  const productionControls =
    connected && runtime?.localProduction && runtime.authenticated;
  const persisted = schedule?.preferences.enabled;
  const scheduleMessageKey =
    schedule && workerScheduleMessages.get(schedule.message);
  const scheduleMessage = scheduleMessageKey
    ? t(scheduleMessageKey)
    : schedule?.message &&
      (locale === defaultLocale
        ? schedule.message
        : t("settings.schedule.checkFailed"));
  function setLanguage(language: Language, checked: boolean) {
    const next = checked
      ? [...allowed, language]
      : allowed.filter((value) => value !== language);
    if (!next.length) return;
    setPreferences({
      ...preferences,
      allowedLanguages: next,
      language: next.includes(preferences.language as Language)
        ? preferences.language
        : "auto",
    });
  }

  function save(event: FormEvent) {
    event.preventDefault();
    onSave(consent.current?.checked === true);
    if (consent.current) consent.current.checked = false;
  }

  if (!productionControls)
    return (
      <section className="factory-panel">
        <p className="muted">
          {connected && runtime?.localProduction
            ? t("settings.schedule.signIn")
            : t("settings.schedule.connect")}
        </p>
      </section>
    );

  return (
    <section className="factory-panel">
      <h2>{t("settings.schedule.title")}</h2>
      <form className="factory-setting-group factory-create" onSubmit={save}>
        <label className="field">
          {t("settings.schedule.interests")}
          <textarea
            value={preferences.interests}
            rows={2}
            maxLength={1000}
            placeholder={t("settings.schedule.interestsExample")}
            onChange={(event) =>
              setPreferences({ ...preferences, interests: event.target.value })
            }
          />
        </label>
        <div className="factory-settings-grid">
          <label className="field">
            {t("settings.schedule.language")}
            <select
              value={preferences.language}
              onChange={(event) =>
                setPreferences({
                  ...preferences,
                  language: event.target.value as Preferences["language"],
                })
              }
            >
              <option value="auto">
                {t("settings.schedule.autoLanguage")}
              </option>
              {allowed.map((language) => (
                <option key={language} value={language}>
                  {t(contentLanguageNames[language])}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            {t("settings.schedule.maxHosts")}
            <select
              value={preferences.maxHosts}
              onChange={(event) =>
                setPreferences({
                  ...preferences,
                  maxHosts: Number(event.target.value),
                })
              }
            >
              {[1, 2, 3].map((count) => (
                <option key={count} value={count}>
                  {formatters.number(count)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            {t("settings.schedule.maxMinutes")}
            <select
              value={preferences.maxSeconds}
              onChange={(event) =>
                setPreferences({
                  ...preferences,
                  maxSeconds: Number(event.target.value),
                })
              }
            >
              {[60, 120, 180, 240, 300, 360, 420].map((seconds) => (
                <option key={seconds} value={seconds}>
                  {formatters.number(seconds / 60)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            {t("settings.schedule.cadence")}
            <select
              value={preferences.cadence}
              onChange={(event) =>
                setPreferences({
                  ...preferences,
                  cadence: event.target.value as Preferences["cadence"],
                })
              }
            >
              <option value="adaptive">
                {t("settings.schedule.adaptive")}
              </option>
              <option value="daily">{t("settings.schedule.daily")}</option>
              <option value="weekly">{t("settings.schedule.weekly")}</option>
            </select>
          </label>
          <label className="field">
            {t("settings.schedule.weeklyLimit")}
            <select
              value={preferences.weeklyLimit}
              onChange={(event) =>
                setPreferences({
                  ...preferences,
                  weeklyLimit: Number(event.target.value),
                })
              }
            >
              {[1, 2, 3, 4, 5, 6, 7].map((count) => (
                <option key={count} value={count}>
                  {formatters.number(count)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <fieldset className="factory-settings-languages">
          <legend>{t("settings.schedule.allowedLanguages")}</legend>
          {(Object.keys(languages) as Language[]).map((code) => (
            <label className="factory-check" key={code}>
              <input
                type="checkbox"
                checked={allowed.includes(code)}
                disabled={allowed.length === 1 && allowed[0] === code}
                onChange={(event) => setLanguage(code, event.target.checked)}
              />
              {t(contentLanguageNames[code])}
            </label>
          ))}
        </fieldset>
        <label className="factory-check">
          <input
            type="checkbox"
            checked={preferences.enabled}
            onChange={(event) =>
              setPreferences({ ...preferences, enabled: event.target.checked })
            }
          />
          {t("settings.schedule.enable")}
        </label>
        <p className="muted">{t("settings.schedule.limits")}</p>
        {preferences.enabled && (
          <label className="factory-check">
            <input ref={consent} type="checkbox" required />
            {t("settings.schedule.consent")}
          </label>
        )}
        {working && (
          <p className="muted" id="schedule-save-blocked">
            {t("settings.action.working")}
          </p>
        )}
        <button
          className="outline"
          disabled={working}
          aria-describedby={working ? "schedule-save-blocked" : undefined}
        >
          {t("settings.schedule.save")}
        </button>
      </form>
      {schedule && (
        <div className="factory-setting-group">
          <p role="status" className="muted">
            {formatters.plural("settings.schedule.usage", schedule.used, {
              state: t(
                persisted
                  ? "settings.schedule.enabled"
                  : "settings.schedule.disabled",
              ),
              limit: schedule.preferences.weeklyLimit,
            })}
            {schedule.nextCheck && runtime.configured
              ? t("settings.schedule.nextCheck", {
                  date:
                    locale === defaultLocale
                      ? new Date(schedule.nextCheck).toLocaleString()
                      : formatters.dateTime(new Date(schedule.nextCheck)),
                })
              : null}
            {scheduleMessage &&
              t("settings.schedule.detail", { message: scheduleMessage })}
          </p>
          {schedule.running ? (
            <button
              className="outline"
              disabled={working}
              onClick={onCancelDiscovery}
            >
              {t("settings.schedule.cancel")}
            </button>
          ) : (
            <button
              className="outline"
              disabled={
                working ||
                running ||
                !runtime.configured ||
                !schedule.preferences.interests
              }
              onClick={onDiscover}
            >
              {t("settings.schedule.runNow")}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
