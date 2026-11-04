import { useEffect, useRef, useState } from "react";
import { allProjects, saveProject, deleteProject } from "./storage";
import {
  current,
  makeProject,
  presets,
  type Project,
  type Segment,
  type Voice,
} from "./model";
import { demoAudio, download, joinDemoWavs } from "./audio";
import { createBackup, readBackup } from "./backup";
import { generateBrowserSpeech } from "./browser-tts";

function Player({ blob }: { blob: Blob }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return <audio controls preload="metadata" src={url} aria-label="播放音频" />;
}
export default function App() {
  const [projects, setProjects] = useState<Project[]>([]),
    [active, setActive] = useState<Project | null>(null),
    [error, setError] = useState(""),
    [status, setStatus] = useState("正在打开本地项目…"),
    [busy, setBusy] = useState(""),
    [online, setOnline] = useState(navigator.onLine),
    [waiting, setWaiting] = useState<ServiceWorker | null>(null),
    [updating, setUpdating] = useState(false),
    [mode, setMode] = useState<"demo" | "openai">("demo"),
    [keyPresent, setKeyPresent] = useState(false),
    [consent, setConsent] = useState(false);
  const keyInput = useRef<HTMLInputElement | null>(null);
  const projectRef = useRef<Project | null>(null),
    abort = useRef<AbortController | null>(null),
    applyingUpdate = useRef(false),
    saveQueue = useRef(Promise.resolve()),
    saveVersion = useRef(0);
  const commit = (p: Project) => {
    projectRef.current = p;
    setActive(p);
    setProjects((old) => [p, ...old.filter((x) => x.id !== p.id)]);
    const version = ++saveVersion.current;
    setStatus("正在保存…");
    saveQueue.current = saveQueue.current
      .then(() => saveProject(p))
      .then(() => {
        if (version === saveVersion.current) setStatus("已保存在此设备");
      })
      .catch(() => {
        setStatus("保存失败");
        setError("保存失败：设备存储可能已满或不可用。请备份文本。");
      });
  };
  useEffect(() => {
    allProjects()
      .then((p) => {
        if (!p.length) {
          const demo = makeProject(true);
          commit(demo);
        } else {
          setProjects(p);
          setActive(p[0]);
          projectRef.current = p[0];
          setStatus("已打开本地项目");
        }
      })
      .catch(() =>
        setError("无法打开本地存储，请检查浏览器的隐私和存储设置。"),
      );
    const net = () => setOnline(navigator.onLine);
    const clearSession = () => {
      abort.current?.abort();
      if (keyInput.current) keyInput.current.value = "";
      setKeyPresent(false);
      setConsent(false);
    };
    window.addEventListener("online", net);
    window.addEventListener("offline", net);
    window.addEventListener("pagehide", clearSession);
    return () => {
      window.removeEventListener("online", net);
      window.removeEventListener("offline", net);
      window.removeEventListener("pagehide", clearSession);
      abort.current?.abort();
      if (keyInput.current) keyInput.current.value = "";
    };
  }, []);
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let reg: ServiceWorkerRegistration;
    let reloading = false;
    const changed = () => {
      if (applyingUpdate.current && !reloading) {
        reloading = true;
        location.reload();
      }
    };
    navigator.serviceWorker.addEventListener("controllerchange", changed);
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { updateViaCache: "none" })
      .then((r) => {
        reg = r;
        if (r.waiting) setWaiting(r.waiting);
        r.addEventListener("updatefound", () => {
          const w = r.installing;
          w?.addEventListener("statechange", () => {
            if (w.state === "installed" && navigator.serviceWorker.controller)
              setWaiting(w);
          });
        });
      })
      .catch(() => setError("离线功能注册失败。"));
    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", changed);
      void reg;
    };
  }, []);
  const change = (patch: Partial<Project>) => {
    if (projectRef.current)
      commit({ ...projectRef.current, ...patch, updated: Date.now() });
  };
  const edit = (id: string, patch: Partial<Segment>) => {
    const p = projectRef.current;
    if (p)
      change({
        segments: p.segments.map((s) => (s.id === id ? { ...s, ...patch } : s)),
      });
  };
  async function generate(id?: string) {
    const p = projectRef.current;
    if (!p || busy) return;
    if (!online) {
      setError("离线时无法开始生成。");
      return;
    }
    const key = keyInput.current?.value.trim() || "";
    if (mode === "openai" && (!key || !consent)) {
      setError("请输入你的 API key，并确认计费及浏览器密钥风险。");
      return;
    }
    const targets = p.segments.filter(
      (s) => (!id || s.id === id) && s.text.trim() && !current(s, p, mode),
    );
    if (!targets.length) {
      setError("没有需要生成的非空片段。");
      return;
    }
    setError("");
    const ctrl = new AbortController();
    abort.current = ctrl;
    try {
      for (let i = 0; i < targets.length; i++) {
        const target = targets[i];
        setBusy(
          `${mode === "openai" ? "正在生成" : "正在模拟"} ${i + 1} / ${targets.length}`,
        );
        const blob =
          mode === "openai"
            ? await generateBrowserSpeech(
                key,
                target.text,
                p.voice,
                p.instructions,
                ctrl.signal,
              )
            : await demoAudio(target.text, ctrl.signal);
        const now = projectRef.current;
        if (now && now.id === p.id) {
          commit({
            ...now,
            updated: Date.now(),
            segments: now.segments.map((s) =>
              s.id === target.id
                ? {
                    ...s,
                    audio: blob,
                    audioKind: mode,
                    audioFor: target.text,
                    voice: p.voice,
                    instructions: p.instructions,
                  }
                : s,
            ),
          });
        }
      }
      setStatus(
        mode === "openai" ? "语音生成完成" : "模拟完成：音频为提示音，非人声",
      );
    } catch (e) {
      if ((e as Error).name === "AbortError")
        setStatus("已取消；已完成的片段已保留");
      else
        setError(
          mode === "openai"
            ? (e as Error).message || "生成失败；可能已经产生费用。"
            : "模拟失败，可重试该片段。",
        );
    } finally {
      abort.current = null;
      setBusy("");
    }
  }
  function open(p: Project) {
    if (busy) return;
    projectRef.current = p;
    setActive(p);
    setError("");
  }
  function create() {
    if (busy) return;
    const p = makeProject();
    commit(p);
  }
  async function remove() {
    if (
      !active ||
      busy ||
      !window.confirm(`删除“${active.title}”？此操作无法撤销。`)
    )
      return;
    try {
      await saveQueue.current;
      await deleteProject(active.id);
      const remaining = projects.filter((p) => p.id !== active.id);
      setProjects(remaining);
      setActive(remaining[0] || null);
      projectRef.current = remaining[0] || null;
      setStatus("项目已删除");
    } catch {
      setError("删除失败。");
    }
  }
  async function restore(file: File | undefined) {
    if (!file) return;
    try {
      const p = await readBackup(file);
      commit(p);
      setStatus("脚本备份已导入；音频需要重新生成");
    } catch {
      setError("无法导入此备份：文件无效或过大。");
    }
  }
  function speak(text: string) {
    if (!("speechSynthesis" in window)) {
      setError("此浏览器不支持本机朗读。");
      return;
    }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = active?.language || "zh-CN";
    window.speechSynthesis.speak(u);
  }
  async function exportDemo() {
    const p = projectRef.current;
    if (!p) return;
    const valid = p.segments.filter((s) => current(s, p, mode));
    if (valid.length !== p.segments.length || !valid.length) {
      setError("请先生成全部非空片段，再导出音频。");
      return;
    }
    try {
      download(
        await joinDemoWavs(valid.map((s) => s.audio!)),
        mode === "openai" ? "podcast.wav" : "demo-tones.wav",
      );
    } catch {
      setError("音频导出失败。");
    }
  }
  function update() {
    if (!waiting) return;
    applyingUpdate.current = true;
    setUpdating(true);
    waiting.postMessage("SKIP_WAITING");
    setTimeout(() => {
      applyingUpdate.current = false;
      setUpdating(false);
      setError("更新未完成，请重新打开应用后重试。");
    }, 10000);
  }
  if (!active)
    return (
      <main className="loading">
        <h1>Knowledge Podcast Studio</h1>
        <p>{error || status}</p>
        <button onClick={create}>新建项目</button>
      </main>
    );
  const stale = active.segments.filter(
    (s) => s.audio && !current(s, active, mode),
  ).length;
  return (
    <>
      <header className="top">
        <a className="brand" href="#top">
          <span className="brand-icon">▥</span>
          <span>
            KNOWLEDGE <b>STUDIO</b>
          </span>
        </a>
        <div className="top-right">
          <span className="badge">
            ● {online ? (mode === "openai" ? "BYOK" : "DEMO MODE") : "离线"}
          </span>
          <span className="saved">{status}</span>
        </div>
      </header>
      <main id="top" className="layout">
        <aside>
          <div className="aside-head">
            <span>你的工作室</span>
            <button onClick={create} disabled={!!busy} aria-label="新建项目">
              ＋
            </button>
          </div>
          <p className="aside-label">本地项目</p>
          <nav aria-label="项目列表">
            {projects.map((p) => (
              <button
                key={p.id}
                className={"project " + (p.id === active.id ? "selected" : "")}
                onClick={() => open(p)}
                disabled={!!busy}
              >
                <span>◫</span>
                <span>{p.title}</span>
              </button>
            ))}
          </nav>
          <div className="privacy">
            ⌁ &nbsp;本地优先
            <br />
            <small>
              脚本和音频保存在这台设备。浏览器清除数据可能导致丢失。
            </small>
          </div>
        </aside>
        <div className="workspace">
          <div className="heading">
            <div>
              <div className="eyebrow">
                YOUR PODCAST WORKSPACE <span> / </span> SCRIPT STUDIO
              </div>
              <h1>把好奇，讲成故事。</h1>
              <p>从一段脚本开始，制作属于你的知识播客。</p>
            </div>
            <button className="outline" onClick={create} disabled={!!busy}>
              ＋ 新建项目
            </button>
          </div>
          <div className="notice">
            <strong>{mode === "demo" ? "演示模式" : "浏览器 BYOK"}</strong>
            <span>
              {mode === "demo"
                ? "无需密钥。生成的是提示音，不是语音或 OpenAI 声音；可使用本机朗读试听脚本。"
                : "浏览器直接连接 OpenAI，不经过本项目服务器。密钥仅保留在本页面内存；扩展程序、恶意脚本或共享设备可能读取它。仅在可信设备使用。"}{" "}
              <a href="#generate">设置浏览器 BYOK</a>
            </span>
          </div>
          {waiting && (
            <div className="notice update">
              <span>新版本已准备好。项目保存在本地。</span>
              <button onClick={update} disabled={updating}>
                {updating ? "正在更新…" : "立即更新"}
              </button>
            </div>
          )}
          {error && (
            <div className="error" role="alert">
              {error}{" "}
              <button onClick={() => setError("")} aria-label="关闭提示">
                ×
              </button>
            </div>
          )}
          <div className="studio">
            <section className="editor card">
              <div className="card-head">
                <div>
                  <div className="eyebrow">01 / SCRIPT</div>
                  <h2>脚本编辑器</h2>
                </div>
                <span className="pill">本地草稿</span>
              </div>
              <label className="field">
                项目标题
                <input
                  value={active.title}
                  onChange={(e) => change({ title: e.target.value })}
                />
              </label>
              <div className="section-title">
                <div>
                  <h3>节目章节</h3>
                  <p>编辑文本后，已有音频会标记为过期。</p>
                </div>
                <button
                  className="outline"
                  onClick={() =>
                    change({
                      segments: [
                        ...active.segments,
                        { id: crypto.randomUUID(), text: "" },
                      ],
                    })
                  }
                >
                  ＋ 添加片段
                </button>
              </div>
              {active.segments.map((s, i) => (
                <article className="segment" key={s.id}>
                  <div className="segment-head">
                    <span className="number">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <b>片段 {i + 1}</b>
                    <span className="segment-status">
                      {s.audio
                        ? current(s, active, mode)
                          ? mode === "openai"
                            ? "已生成"
                            : "已模拟"
                          : "需重新生成"
                        : "未生成"}
                    </span>
                    <button
                      className="text-button"
                      disabled={active.segments.length === 1 || !!busy}
                      onClick={() =>
                        change({
                          segments: active.segments.filter(
                            (x) => x.id !== s.id,
                          ),
                        })
                      }
                    >
                      删除
                    </button>
                  </div>
                  <label className="sr-only" htmlFor={"segment-" + s.id}>
                    片段 {i + 1} 脚本
                  </label>
                  <textarea
                    id={"segment-" + s.id}
                    value={s.text}
                    onChange={(e) => edit(s.id, { text: e.target.value })}
                    placeholder="输入这一段的脚本…"
                  />
                  <div className="segment-actions">
                    <button
                      className="text-button"
                      onClick={() => speak(s.text)}
                      disabled={!s.text.trim()}
                    >
                      ▶ 本机朗读
                    </button>
                    <button
                      className="text-button"
                      onClick={() => generate(s.id)}
                      disabled={!!busy || !s.text.trim() || !online}
                    >
                      ↻ {mode === "openai" ? "生成片段" : "模拟片段"}
                    </button>
                    <span>{s.text.length} 字符</span>
                  </div>
                  {s.audio && current(s, active, mode) && (
                    <div className="audio">
                      <Player blob={s.audio} />
                      <button
                        className="text-button"
                        onClick={() =>
                          download(
                            s.audio!,
                            mode === "openai"
                              ? "segment.wav"
                              : "demo-segment.wav",
                          )
                        }
                      >
                        {mode === "openai"
                          ? "下载 WAV 语音"
                          : "下载 WAV 提示音"}
                      </button>
                    </div>
                  )}
                </article>
              ))}
              <p className="disclosure">
                来源核验：
                <a
                  href="https://www.weather.gov/jetstream/thunderstorm"
                  target="_blank"
                  rel="noreferrer"
                >
                  美国国家气象局：雷暴
                </a>{" "}
                ·{" "}
                <a
                  href="https://api-open.data.gov.sg/v2/real-time/api/rainfall"
                  target="_blank"
                  rel="noreferrer"
                >
                  Data.gov.sg 雨量数据
                </a>
                <br />
                若使用 AI
                人声，须告知听众并根据来源核实事实。此示例没有实测五公里雨量比较。
              </p>
            </section>
            <div className="right">
              <section className="card voice">
                <div className="eyebrow">02 / VOICE</div>
                <h2>声音与风格</h2>
                <p className="muted">
                  选择目标声音；模拟模式不会生成这些声音。
                </p>
                <label className="field">
                  目标声音
                  <select
                    value={active.voice}
                    onChange={(e) => change({ voice: e.target.value as Voice })}
                  >
                    <option value="marin">Marin</option>
                    <option value="cedar">Cedar</option>
                    <option value="coral">Coral</option>
                  </select>
                </label>
                <label className="field">
                  朗读风格
                  <select
                    defaultValue="Documentary"
                    onChange={(e) =>
                      change({
                        instructions:
                          presets[e.target.value as keyof typeof presets],
                      })
                    }
                  >
                    {Object.keys(presets).map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Narrator instructions
                  <textarea
                    rows={4}
                    value={active.instructions}
                    onChange={(e) => change({ instructions: e.target.value })}
                  />
                </label>
                <label className="field">
                  声音比较笔记
                  <textarea
                    rows={3}
                    value={active.notes}
                    onChange={(e) => change({ notes: e.target.value })}
                    placeholder="记录实际试听后的感受…"
                  />
                </label>
                <p className="hint">
                  Marin、Cedar 和 Coral 是否可用取决于 OpenAI 模型和账户权限。
                </p>
              </section>
              <section id="generate" className="card generate">
                <div className="eyebrow">03 / GENERATE</div>
                <h2>准备试听</h2>
                <label className="field">
                  生成模式
                  <select
                    value={mode}
                    disabled={!!busy}
                    onChange={(e) => {
                      if (keyInput.current) keyInput.current.value = "";
                      setKeyPresent(false);
                      setConsent(false);
                      setMode(e.target.value as "demo" | "openai");
                      setError("");
                    }}
                  >
                    <option value="demo">演示提示音（免费）</option>
                    <option value="openai">OpenAI · 浏览器 BYOK</option>
                  </select>
                </label>
                {mode === "openai" && (
                  <div className="byok">
                    <label className="field">
                      OpenAI API key
                      <input
                        ref={keyInput}
                        disabled={!!busy}
                        type="password"
                        autoComplete="off"
                        spellCheck={false}
                        placeholder="输入你自己的 key"
                        onChange={(e) =>
                          setKeyPresent(!!e.currentTarget.value.trim())
                        }
                      />
                    </label>
                    <p className="hint">
                      仅存当前页面内存；刷新、关闭或切换模式会清除。你的 key
                      会由浏览器直接发送给
                      OpenAI。请勿在不可信设备或扩展程序环境中使用。
                      此连接为实验性功能，真实生成尚未验证。
                    </p>
                    <label className="consent">
                      <input
                        type="checkbox"
                        disabled={!!busy}
                        checked={consent}
                        onChange={(e) => setConsent(e.currentTarget.checked)}
                      />
                      我了解浏览器密钥风险，并同意点击生成时使用我的 OpenAI
                      账户、可能产生费用。
                    </label>
                    <button
                      className="text-button"
                      onClick={() => {
                        abort.current?.abort();
                        if (keyInput.current) keyInput.current.value = "";
                        setKeyPresent(false);
                        setConsent(false);
                      }}
                    >
                      清除 key
                    </button>
                  </div>
                )}
                <p>
                  {" "}
                  {active.segments.length} 个片段 ·{" "}
                  {active.segments.reduce((n, s) => n + s.text.length, 0)} 字符
                  {stale ? ` · ${stale} 个已过期` : ""}
                </p>
                <button
                  className="primary"
                  onClick={() => generate()}
                  disabled={
                    !!busy ||
                    !online ||
                    (mode === "openai" && (!keyPresent || !consent))
                  }
                >
                  {busy ||
                    (mode === "openai" ? "生成 OpenAI 语音" : "生成模拟提示音")}
                </button>
                {busy && (
                  <button
                    className="outline full"
                    onClick={() => abort.current?.abort()}
                  >
                    取消
                  </button>
                )}
                <button
                  className="outline full"
                  onClick={() =>
                    speak(active.segments.map((s) => s.text).join("。"))
                  }
                >
                  ▶ 本机朗读全文
                </button>
                <button className="outline full" onClick={exportDemo}>
                  {mode === "openai"
                    ? "下载完整 WAV 语音"
                    : "下载完整 WAV 提示音"}
                </button>
                <button
                  className="outline full"
                  onClick={() =>
                    download(
                      new Blob(
                        [active.segments.map((s) => s.text).join("\n\n")],
                        { type: "text/plain;charset=utf-8" },
                      ),
                      "transcript.txt",
                    )
                  }
                >
                  下载脚本 TXT
                </button>
                <button
                  className="outline full"
                  onClick={() =>
                    download(createBackup(active), "podcast-project.json")
                  }
                >
                  备份脚本与设置
                </button>
                <label className="outline full import">
                  导入脚本备份
                  <input
                    type="file"
                    accept="application/json,.json"
                    onChange={(e) => {
                      void restore(e.target.files?.[0]);
                      e.currentTarget.value = "";
                    }}
                  />
                </label>
                <p className="hint">
                  备份包含脚本和设置，不包含音频。本机朗读由浏览器提供，声音因设备而异，不能导出。OpenAI
                  语音生成使用你的账户；目前不支持 MP3。
                </p>
              </section>
              <button className="danger" onClick={remove} disabled={!!busy}>
                删除此项目
              </button>
            </div>
          </div>
          <footer>
            Knowledge Podcast Studio · 本地项目 · AI 语音须向听众披露
          </footer>
        </div>
      </main>
    </>
  );
}
