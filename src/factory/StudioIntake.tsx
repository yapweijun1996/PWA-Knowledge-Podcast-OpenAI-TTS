import type { FormEvent } from "react";
import { limits } from "../../shared/factory";
import { WorkspaceLink, type WorkspaceNavigation } from "./navigation";
import "./studio-intake.css";

export type StudioAvailability =
  "offline" | "no-worker" | "locked" | "no-key" | "working" | "ready";

const availabilityCopy = {
  offline: ["当前离线", "可以先填写主题。联网后再提交。"],
  "no-worker": ["未连接制作进程", "请在运行本机制作进程的网址打开制作台。"],
  locked: ["需要登录制作进程", "请在设置中登录后回来提交。"],
  "no-key": ["需要 OpenAI 密钥", "制作进程已连接。请在设置中配置密钥。"],
  working: ["制作进程正忙", "当前任务结束后即可制作新节目。"],
  ready: ["可以开始制作", "制作进程与 OpenAI 密钥已就绪。"],
} satisfies Record<StudioAvailability, readonly [string, string]>;

export function StudioIntake({
  availability,
  navigation,
  topic,
  exactHosts,
  consent,
  busy,
  onChange,
  onConsent,
  onHostsChange,
  onSubmit,
}: {
  availability: StudioAvailability;
  navigation: WorkspaceNavigation;
  topic: string;
  exactHosts?: 2;
  consent: boolean;
  busy: boolean;
  onChange: (topic: string) => void;
  onConsent: (consent: boolean) => void;
  onHostsChange: (count: 2 | undefined) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  const [status, guidance] = availabilityCopy[availability];

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
          <div className="studio-availability" id="studio-availability">
            <div role="status">
              <strong>{status}</strong>
              <span>{guidance}</span>
            </div>
            {(availability === "locked" || availability === "no-key") && (
              <WorkspaceLink
                className="outline"
                page="settings"
                navigation={navigation}
              >
                前往设置
              </WorkspaceLink>
            )}
          </div>
          <label className="factory-check studio-consent">
            <input
              type="checkbox"
              disabled={availability !== "ready" || busy}
              checked={consent}
              onChange={(event) => onConsent(event.target.checked)}
            />
            同意本次 OpenAI 研究、写稿、配音和转录请求可能计费。
          </label>
          <button
            className="primary"
            aria-describedby="studio-availability"
            disabled={
              availability !== "ready" || busy || !consent || !topic.trim()
            }
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
