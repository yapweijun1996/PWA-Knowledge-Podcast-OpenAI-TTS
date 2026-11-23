import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  languages,
  type Language,
  type Preferences,
  type Runtime,
  type Schedule,
} from "../../shared/factory";
import { clear, set } from "./browser-key";

export function BrowserCredentials({
  configured,
  working,
}: {
  configured: boolean;
  working: boolean;
}) {
  const key = useRef<HTMLInputElement>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    function clearInput() {
      if (key.current) key.current.value = "";
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
    try {
      set(value);
      setAcknowledged(false);
      setError("");
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "无法设置浏览器密钥。",
      );
    }
  }

  return (
    <section className="factory-panel" aria-labelledby="browser-key-title">
      <h2 id="browser-key-title">浏览器密钥</h2>
      <form className="factory-create" autoComplete="off" onSubmit={save}>
        <label className="field">
          浏览器 OpenAI 密钥
          <input
            ref={key}
            required
            type="password"
            autoComplete="off"
            spellCheck={false}
            maxLength={512}
            disabled={working}
          />
        </label>
        <label className="factory-check">
          <input
            type="checkbox"
            checked={acknowledged}
            disabled={working}
            onChange={(event) => setAcknowledged(event.target.checked)}
          />
          我了解页面代码、浏览器扩展和遭入侵的设备都可能读取密钥。我会使用权限受限的密钥。密钥仅保存在此标签页内存中，离开或重新加载页面时清除。
        </label>
        <div className="factory-actions">
          <button className="outline" disabled={working || !acknowledged}>
            设置浏览器密钥
          </button>
          <button
            type="button"
            className="text-button"
            disabled={working || !configured}
            onClick={() => {
              clear();
              if (key.current) key.current.value = "";
              setAcknowledged(false);
              setError("");
            }}
          >
            清除浏览器密钥
          </button>
        </div>
      </form>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <p className="muted factory-setting-group" role="status">
        {configured
          ? "已设置浏览器密钥。首次请求将验证权限。"
          : "尚未设置浏览器密钥。设置后即可直接在浏览器制作。"}
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
  const key = useRef<HTMLInputElement>(null);
  return (
    <section className="factory-panel">
      <h2>本机制作进程与密钥（可选）</h2>
      {connected && runtime?.localProduction ? (
        <div className="factory-setting-group">
          <p className="muted">
            密钥只交给此工作台连接的受信任进程。通过界面输入的密钥驻留在进程内存，关闭网页不影响它，重启进程后需重新输入。浏览器备份不包含密钥。
          </p>
          <form
            className="factory-actions"
            onSubmit={(event) => {
              event.preventDefault();
              if (!key.current) return;
              const value = key.current.value;
              key.current.value = "";
              onKey(value);
            }}
          >
            <label className="field">
              OpenAI API 密钥
              <input
                ref={key}
                required
                type="password"
                autoComplete="off"
                spellCheck={false}
                maxLength={503}
              />
            </label>
            <button className="outline" disabled={working || running}>
              设置密钥
            </button>
            {runtime.keyMode === "session" && (
              <button
                type="button"
                className="text-button"
                disabled={working || running}
                onClick={() => onKey(null)}
              >
                清除会话密钥
              </button>
            )}
          </form>
          <p className="muted">
            {runtime.configured
              ? runtime.keyMode === "environment"
                ? "已从本机环境载入密钥。首次请求将验证权限。"
                : "已接收密钥。首次请求将验证权限。"
              : "尚无密钥。研究、配音和自动排程需要一个 OpenAI API 密钥。"}{" "}
            {runtime.mp3
              ? "本机可编码 MP3。"
              : "本机提供 WAV，安装带 libmp3lame 的 FFmpeg 可生成 MP3。"}
          </p>
        </div>
      ) : (
        <p className="muted">
          启动受信任的本机制作进程后，可在同一网址设置密钥。
        </p>
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
  const consent = useRef<HTMLInputElement>(null);
  const allowed = preferences.allowedLanguages;
  const productionControls =
    connected && runtime?.localProduction && runtime.authenticated;
  const persisted = schedule?.preferences.enabled;
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
            ? "请先登录本机制作进程，再设置自动化。"
            : "请连接本机制作进程后再设置自动化。可在制作台直接用浏览器密钥手动制作。"}
        </p>
      </section>
    );

  return (
    <section className="factory-panel">
      <h2>制作偏好与排程</h2>
      <form className="factory-setting-group factory-create" onSubmit={save}>
        <label className="field">
          选题兴趣与听众
          <textarea
            value={preferences.interests}
            rows={2}
            maxLength={1000}
            placeholder="例如：面向新加坡通勤者，用生活场景解释城市政策"
            onChange={(event) =>
              setPreferences({ ...preferences, interests: event.target.value })
            }
          />
        </label>
        <div className="factory-settings-grid">
          <label className="field">
            语言首选
            <select
              value={preferences.language}
              onChange={(event) =>
                setPreferences({
                  ...preferences,
                  language: event.target.value as Preferences["language"],
                })
              }
            >
              <option value="auto">AI 按主题选择</option>
              {allowed.map((language) => (
                <option key={language} value={language}>
                  {languages[language]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            主持人数上限
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
                <option key={count}>{count}</option>
              ))}
            </select>
          </label>
          <label className="field">
            音频时长上限（分钟）
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
                  {seconds / 60}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            选题检查频率
            <select
              value={preferences.cadence}
              onChange={(event) =>
                setPreferences({
                  ...preferences,
                  cadence: event.target.value as Preferences["cadence"],
                })
              }
            >
              <option value="adaptive">AI 按选题价值调整</option>
              <option value="daily">每日</option>
              <option value="weekly">每周</option>
            </select>
          </label>
          <label className="field">
            滚动 7 天最多选题检查
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
                <option key={count}>{count}</option>
              ))}
            </select>
          </label>
        </div>
        <fieldset className="factory-settings-languages">
          <legend>节目可用语言</legend>
          {Object.entries(languages).map(([code, label]) => (
            <label className="factory-check" key={code}>
              <input
                type="checkbox"
                checked={allowed.includes(code as Language)}
                disabled={allowed.length === 1 && allowed[0] === code}
                onChange={(event) =>
                  setLanguage(code as Language, event.target.checked)
                }
              />
              {label}
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
          启用无人值守选题、制作和音频核对
        </label>
        <p className="muted">
          需要设备保持唤醒、本机进程保持运行。每日最多一次选题检查，跳过、取消或失败也占额度。停用排程会停止选题，已进入制作的节目可单独取消。
        </p>
        {preferences.enabled && (
          <label className="factory-check">
            <input ref={consent} type="checkbox" required />
            同意按保存的上限向 OpenAI 发出自动请求，费用以平台账单为准。
          </label>
        )}
        <button className="outline" disabled={working}>
          保存偏好并应用排程
        </button>
      </form>
      {schedule && (
        <div className="factory-setting-group">
          <p role="status" className="muted">
            {persisted ? "本机排程已开启。" : "本机排程已停用。"} 已用{" "}
            {schedule.used} / {schedule.preferences.weeklyLimit} 次（滚动 7
            天）。
            {schedule.nextCheck && runtime.configured
              ? " 下次最早检查：" +
                new Date(schedule.nextCheck).toLocaleString() +
                "。"
              : ""}
            {schedule.message}
          </p>
          {schedule.running ? (
            <button
              className="outline"
              disabled={working}
              onClick={onCancelDiscovery}
            >
              取消本轮选题
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
              立即自动选题并制作
            </button>
          )}
        </div>
      )}
    </section>
  );
}
