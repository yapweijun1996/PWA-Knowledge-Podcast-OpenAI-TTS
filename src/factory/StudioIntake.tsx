import { useState, type FormEvent } from "react";
import { limits } from "../../shared/factory";
import { WorkspaceLink, type WorkspaceNavigation } from "./navigation";
import type {
  BrowserEstimate,
  StudioAvailability,
  StudioMode,
  WorkerAvailability,
} from "./useBrowserProduction";
import "./studio-intake.css";

const availabilityCopy = {
  offline: ["当前离线", "可以先填写主题。联网后再提交。"],
  "no-worker": [
    "尚未设置浏览器密钥",
    "请在设置中添加浏览器密钥。也可选择运行本机制作进程。",
  ],
  locked: [
    "需要登录制作进程",
    "请在设置中添加浏览器密钥，或登录本机制作进程。",
  ],
  "no-key": [
    "需要 OpenAI 密钥",
    "请在设置中添加浏览器密钥，或为本机制作进程配置密钥。",
  ],
  working: ["制作进程正忙", "当前任务结束后即可制作新节目。"],
  ready: ["可以开始制作", "制作进程与 OpenAI 密钥已就绪。"],
  "ready-browser": [
    "可以在浏览器制作",
    "此标签页会直接连接 OpenAI 并保存制作进度。",
  ],
} satisfies Record<StudioAvailability, readonly [string, string]>;

export function BrowserCost({
  estimate,
  id,
  wholeEpisode = false,
}: {
  estimate: BrowserEstimate;
  id?: string;
  wholeEpisode?: boolean;
}) {
  return (
    <div id={id} className="muted">
      <strong>费用预估{wholeEpisode ? "（按整集用量）" : "（按用量）"}</strong>
      <div>
        输出约 {estimate.maxOutputTokens.toLocaleString("zh-CN")} 个词元，
        网页搜索最多 {estimate.maxWebSearchCalls} 次，转录约{" "}
        {Math.ceil(estimate.transcriptionAudioSeconds)} 秒。
        输入和工具调用也可能计费，实际费用以 OpenAI 账单为准。
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
  const [consent, setConsent] = useState(false);
  return (
    <section className="factory-panel" aria-labelledby="browser-resume-title">
      <h2 id="browser-resume-title">继续浏览器制作</h2>
      <p id="browser-resume-warning" className="muted">
        将从已保存的进度继续。若上次请求的结果未知，手动继续可能再次计费。
      </p>
      {workerAvailability === "offline" ? (
        <p className="muted">当前离线，联网后才能继续制作。</p>
      ) : !keySet && workerAvailability !== "ready" ? (
        <p className="muted">
          {workerAvailability === "no-worker"
            ? "未连接本机制作进程。"
            : `${availabilityCopy[workerAvailability][0]}。`}
        </p>
      ) : null}
      {!keySet && (
        <p>
          请在设置中添加浏览器密钥，以使用此标签页继续制作。{" "}
          <WorkspaceLink page="settings" navigation={navigation}>
            前往设置
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
          我同意本次继续制作的 OpenAI 请求可能计费。
        </label>
        <button
          className="primary"
          disabled={disabled || !consent}
          onClick={() => {
            setConsent(false);
            onResume();
          }}
        >
          继续浏览器制作
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
  const [status, guidance] = availabilityCopy[availability];
  const ready = availability === "ready" || availability === "ready-browser";

  return (
    <div className="studio-intake">
      <section
        className="factory-panel studio-intake-form"
        aria-labelledby="studio-intake-title"
      >
        <h2 id="studio-intake-title">从主题制作</h2>
        <form className="factory-create" onSubmit={onSubmit}>
          <div className="field">
            <div className="studio-topic-label">
              <label htmlFor="studio-topic">播客主题</label>
              <small className="muted">
                {topic.length} / {limits.topic}
              </small>
            </div>
            <textarea
              id="studio-topic"
              disabled={busy}
              required
              rows={4}
              maxLength={limits.topic}
              value={topic}
              placeholder="例如：新加坡的组屋为何能容纳不同族群？"
              onChange={(event) => onChange(event.target.value)}
            />
          </div>
          <label className="field">
            主持人数
            <select
              value={exactHosts ?? "auto"}
              disabled={busy}
              onChange={(event) =>
                onHostsChange(event.target.value === "2" ? 2 : undefined)
              }
            >
              <option value="auto">自动安排</option>
              <option value="2">恰好两位主持人</option>
            </select>
          </label>
          {chooseMode && (
            <label className="field">
              制作位置
              <select
                value={mode}
                disabled={busy}
                onChange={(event) =>
                  onModeChange(
                    event.target.value === "worker" ? "worker" : "browser",
                  )
                }
              >
                <option value="browser">此浏览器</option>
                <option value="worker">本机制作进程</option>
              </select>
            </label>
          )}
          <div className="studio-availability" id="studio-availability">
            <div role="status">
              <strong>{status}</strong>
              <span>{guidance}</span>
            </div>
            {!ready && availability !== "offline" && (
              <WorkspaceLink
                className="outline"
                page="settings"
                navigation={navigation}
              >
                前往设置
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
            同意本次 OpenAI 研究、写稿、配音和转录请求可能计费。
          </label>
          <button
            className="primary"
            aria-describedby="studio-availability"
            disabled={!ready || busy || !consent || !topic.trim()}
          >
            制作整集播客
          </button>
        </form>
      </section>
      <aside
        className="factory-panel studio-intake-flow"
        aria-labelledby="studio-flow-title"
      >
        <h2 id="studio-flow-title">制作流程</h2>
        <ol>
          <li>
            <strong>研究与核对来源</strong>
            <span>交叉检索，保留主张和出处。</span>
          </li>
          <li>
            <strong>编排大纲与脚本</strong>
            <span>按偏好安排语言、主持与时长。</span>
          </li>
          <li>
            <strong>生成配音与转录</strong>
            <span>在资料库试听，对照原稿核验。</span>
          </li>
        </ol>
      </aside>
    </div>
  );
}
