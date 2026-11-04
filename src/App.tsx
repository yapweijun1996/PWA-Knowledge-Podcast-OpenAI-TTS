import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  allProjects,
  saveProject,
  deleteProject,
  projectVersion,
  ProjectConflict,
} from "./storage";
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
import { createAudioBackup, readAudioBackup } from "./audio-backup";
import {
  composeInstructions,
  generateBrowserSpeech,
  generateBrowserSpeechSequence,
  REALTIME_MODEL,
} from "./browser-tts";
import { MAX_INSTRUCTIONS_LENGTH, MAX_SEGMENT_LENGTH } from "./limits.ts";
import { continuityFixture, continuityPlan } from "./continuity-plan";
import packageInfo from "../package.json";

type Theme = "light" | "dark" | "system";
const navItems = [
  { id: "overview", label: "工作台", icon: "grid" },
  { id: "script", label: "脚本编辑", icon: "script" },
  { id: "voice", label: "声音与风格", icon: "voice" },
  { id: "generate", label: "生成音频", icon: "spark" },
  { id: "assets", label: "导出与备份", icon: "export" },
  { id: "settings", label: "设置", icon: "settings" },
] as const;
function Icon({ name }: { name: string }) {
  const common = {
    width: 19,
    height: 19,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };
  if (name === "grid")
    return (
      <svg {...common}>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    );
  if (name === "script")
    return (
      <svg {...common}>
        <path d="M6 3h9l4 4v14H6z" />
        <path d="M14 3v5h5M9 12h7M9 16h7" />
      </svg>
    );
  if (name === "voice")
    return (
      <svg {...common}>
        <rect x="9" y="2" width="6" height="13" rx="3" />
        <path d="M5 11a7 7 0 0 0 14 0M12 18v4M9 22h6" />
      </svg>
    );
  if (name === "spark")
    return (
      <svg {...common}>
        <path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2zM19 17v4M17 19h4" />
      </svg>
    );
  if (name === "export")
    return (
      <svg {...common}>
        <path d="M12 3v12m-4-4 4 4 4-4M5 17v4h14v-4" />
      </svg>
    );
  if (name === "settings")
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="3" />
        <path d="M19 12a7 7 0 0 0-.2-1.6l1.7-1.3-1.7-3-2 .8a7 7 0 0 0-2.7-1.6L13.8 3h-3.5l-.4 2.3A7 7 0 0 0 7.2 7l-2-.8-1.7 3 1.7 1.3a7 7 0 0 0 0 3.2L3.5 15l1.7 3 2-.8a7 7 0 0 0 2.7 1.6l.4 2.2h3.5l.3-2.2a7 7 0 0 0 2.7-1.6l2 .8 1.7-3-1.7-1.4A7 7 0 0 0 19 12z" />
      </svg>
    );
  return (
    <svg {...common}>
      <path d="M4 12h16M12 4v16" />
    </svg>
  );
}
function readPreference(key: string, fallback: string) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}
function savePreference(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Storage may be unavailable in private browsing. */
  }
}

function Player({ blob, label = "播放音频" }: { blob: Blob; label?: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return <audio controls preload="metadata" src={url} aria-label={label} />;
}
export default function App() {
  const [projects, setProjects] = useState<Project[]>([]),
    [active, setActive] = useState<Project | null>(null),
    [error, setError] = useState(""),
    [status, setStatus] = useState("正在打开本地项目…"),
    [busy, setBusy] = useState(""),
    [online, setOnline] = useState(navigator.onLine),
    [waiting, setWaiting] = useState<ServiceWorker | null>(null),
    [tabGuard, setTabGuard] = useState<"waiting" | "held" | "unsupported">(
      "waiting",
    ),
    [updating, setUpdating] = useState(false),
    [deleting, setDeleting] = useState(false),
    [mode, setMode] = useState<"demo" | "openai">("demo"),
    [keyPresent, setKeyPresent] = useState(false),
    [consent, setConsent] = useState(false),
    [labConsent, setLabConsent] = useState(false),
    [labRunning, setLabRunning] = useState(false),
    [runSnapshot, setRunSnapshot] = useState<{
      projectId: string;
      mode: "demo" | "openai";
      voice: Voice;
      instructions: string;
      targets: Array<{ index: number; text: string }>;
    } | null>(null),
    [pauseMs, setPauseMs] = useState(0),
    [previewStart, setPreviewStart] = useState(""),
    [preview, setPreview] = useState<{
      projectId: string;
      mode: "demo" | "openai";
      startId: string;
      pauseMs: number;
      segments: Array<{ id: string; audio: Blob }>;
      audio: Blob;
    } | null>(null),
    [recovery, setRecovery] = useState<{
      projectId: string;
      segmentId: string;
      audio: Blob;
    } | null>(null),
    [collapsed, setCollapsed] = useState(
      () => readPreference("podcast-sidebar", "expanded") === "collapsed",
    ),
    [mobile, setMobile] = useState(
      () => window.matchMedia("(max-width: 760px)").matches,
    ),
    [drawerOpen, setDrawerOpen] = useState(false),
    [section, setSection] = useState("overview"),
    [theme, setTheme] = useState<Theme>(() => {
      const value = readPreference("podcast-theme", "system");
      return value === "light" || value === "dark" ? value : "system";
    }),
    [updateMessage, setUpdateMessage] = useState(""),
    [hint, setHint] = useState<{
      id: string;
      text: string;
      target: HTMLElement;
      left: number;
      top: number;
    } | null>(null);
  const keyInput = useRef<HTMLInputElement | null>(null);
  const menuButton = useRef<HTMLButtonElement | null>(null);
  const drawerRef = useRef<HTMLElement | null>(null);
  const releaseTab = useRef<(() => void) | null>(null);
  const acquireTab = useRef<(() => void) | null>(null);
  useEffect(() => {
    let disposed = false;
    if (!navigator.locks) {
      setTabGuard("unsupported");
      return;
    }
    const acquire = () => {
      if (disposed) return;
      setTabGuard("waiting");
      void navigator.locks
        .request("podcast-studio-update", { mode: "shared" }, async () => {
          if (disposed) return;
          await new Promise<void>((resolve) => {
            releaseTab.current = resolve;
            setTabGuard("held");
          });
          releaseTab.current = null;
        })
        .catch(() => {
          if (!disposed) setTabGuard("unsupported");
        });
    };
    acquireTab.current = acquire;
    acquire();
    return () => {
      disposed = true;
      acquireTab.current = null;
      releaseTab.current?.();
    };
  }, []);
  const showHint = (target: HTMLElement, id: string, text: string) => {
    if (!collapsed || mobile) return;
    const rect = target.getBoundingClientRect();
    setHint({
      id,
      text,
      target,
      left: Math.min(rect.right + 10, window.innerWidth - 180),
      top: Math.max(
        28,
        Math.min(window.innerHeight - 28, rect.top + rect.height / 2),
      ),
    });
  };
  useEffect(() => {
    if (!hint) return;
    const reposition = () => {
      if (!hint.target.isConnected) {
        setHint(null);
        return;
      }
      const rect = hint.target.getBoundingClientRect();
      setHint((prev) =>
        prev && prev.target === hint.target
          ? {
              ...prev,
              left: Math.min(rect.right + 10, window.innerWidth - 180),
              top: Math.max(
                28,
                Math.min(window.innerHeight - 28, rect.top + rect.height / 2),
              ),
            }
          : prev,
      );
    };
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [hint?.target]);
  useEffect(() => {
    if (!collapsed || mobile) setHint(null);
  }, [collapsed, mobile]);
  const closeDrawer = () => {
    setDrawerOpen(false);
    requestAnimationFrame(() =>
      menuButton.current?.focus({ preventScroll: true }),
    );
  };
  useEffect(() => {
    const syncSection = () => {
      const id = window.location.hash.slice(1);
      setSection(navItems.some((item) => item.id === id) ? id : "overview");
    };
    syncSection();
    window.addEventListener("hashchange", syncSection);
    return () => window.removeEventListener("hashchange", syncSection);
  }, []);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 760px)");
    const changed = () => {
      setMobile(query.matches);
      if (!query.matches) setDrawerOpen(false);
    };
    query.addEventListener("change", changed);
    return () => query.removeEventListener("change", changed);
  }, []);
  useEffect(() => {
    savePreference("podcast-sidebar", collapsed ? "collapsed" : "expanded");
  }, [collapsed]);
  useEffect(() => {
    savePreference("podcast-theme", theme);
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const isDark = theme === "dark" || (theme === "system" && query.matches);
      document.documentElement.dataset.theme = isDark ? "dark" : "light";
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute("content", isDark ? "#101e1a" : "#f4f6f3");
    };
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, [theme]);
  useEffect(() => {
    if (!drawerOpen || !mobile) return;
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusDrawer = () => {
      if (drawerRef.current?.contains(document.activeElement)) return;
      Array.from(
        drawerRef.current?.querySelectorAll<HTMLButtonElement>(
          "button:not(:disabled)",
        ) ?? [],
      )
        .find((button) => button.getClientRects().length > 0)
        ?.focus();
    };
    const frame = requestAnimationFrame(focusDrawer);
    const afterTransition = setTimeout(focusDrawer, 220);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(afterTransition);
      document.body.style.overflow = old;
    };
  }, [drawerOpen, mobile]);
  const drawerKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (!mobile || !drawerOpen) return;
    if (e.key === "Escape") {
      e.preventDefault();
      closeDrawer();
      return;
    }
    if (e.key !== "Tab") return;
    const controls = Array.from(
      drawerRef.current?.querySelectorAll<HTMLElement>(
        "a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled)",
      ) ?? [],
    ).filter((el) => el.getClientRects().length > 0);
    if (!controls.length) return;
    if (e.shiftKey && document.activeElement === controls[0]) {
      e.preventDefault();
      controls[controls.length - 1].focus();
    } else if (
      !e.shiftKey &&
      document.activeElement === controls[controls.length - 1]
    ) {
      e.preventDefault();
      controls[0].focus();
    }
  };
  const checkUpdate = async () => {
    if (!navigator.onLine) {
      setUpdateMessage("当前离线，无法检查更新。");
      return;
    }
    if (!("serviceWorker" in navigator)) {
      setUpdateMessage("此浏览器不支持更新检查。");
      return;
    }
    setUpdateMessage("正在检查更新…");
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) {
        setUpdateMessage("应用尚未注册离线服务。");
        return;
      }
      await reg.update();
      if (reg.waiting) {
        setWaiting(reg.waiting);
        setUpdateMessage("新版本已准备好。");
      } else if (reg.installing)
        setUpdateMessage("新版本正在准备，完成后会显示更新提示。");
      else setUpdateMessage("目前没有发现新版本。");
    } catch {
      setUpdateMessage("检查失败，请稍后重试。");
    }
  };
  const projectRef = useRef<Project | null>(null),
    abort = useRef<AbortController | null>(null),
    applyingUpdate = useRef(false),
    updateLock = useRef(false),
    deleteLock = useRef(false),
    saveQueue = useRef(Promise.resolve()),
    saveVersion = useRef(0),
    operationEpoch = useRef(0),
    failedProjects = useRef(new Set<string>()),
    conflictedProjects = useRef(new Set<string>()),
    projectVersions = useRef(new Map<string, string | null>());
  useEffect(() => {
    if (!recovery && !failedProjects.current.size && status !== "正在保存…")
      return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [recovery, status]);
  const commit = (input: Project) => {
    const p = { ...input, revision: crypto.randomUUID() };
    operationEpoch.current++;
    projectRef.current = p;
    setActive(p);
    setProjects((old) => [p, ...old.filter((x) => x.id !== p.id)]);
    const version = ++saveVersion.current;
    setStatus("正在保存…");
    const saved = saveQueue.current
      .then(() => saveProject(p, projectVersions.current.get(p.id) ?? null))
      .then(() => {
        projectVersions.current.set(p.id, p.revision);
        failedProjects.current.delete(p.id);
        conflictedProjects.current.delete(p.id);
        if (version === saveVersion.current) {
          setStatus(
            failedProjects.current.size ? "部分项目保存失败" : "已保存在此设备",
          );
        }
        return true;
      })
      .catch((reason: unknown) => {
        failedProjects.current.add(p.id);
        if (reason instanceof ProjectConflict) {
          conflictedProjects.current.add(p.id);
          setError(
            "其他标签页已修改此项目。当前更改仍在内存中，请另存为新项目，避免覆盖。",
          );
        } else {
          setError("保存失败：设备存储可能已满或不可用。请备份文本。");
        }
        setStatus("保存失败");
        return false;
      });
    saveQueue.current = saved.then(() => undefined);
    return saved;
  };
  useEffect(() => {
    allProjects()
      .then((p) => {
        p.forEach((project) =>
          projectVersions.current.set(project.id, projectVersion(project)),
        );
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
      setLabConsent(false);
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
    if (import.meta.env.DEV || !("serviceWorker" in navigator)) return;
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
    if (projectRef.current && !deleteLock.current && !updateLock.current)
      commit({ ...projectRef.current, ...patch, updated: Date.now() });
  };
  const edit = (id: string, patch: Partial<Segment>) => {
    const p = projectRef.current;
    if (p)
      change({
        segments: p.segments.map((s) => (s.id === id ? { ...s, ...patch } : s)),
      });
  };
  const moveSegment = (id: string, direction: -1 | 1) => {
    const p = projectRef.current;
    if (!p || busy || abort.current || deleteLock.current || updateLock.current)
      return;
    const index = p.segments.findIndex((segment) => segment.id === id);
    const next = index + direction;
    if (index < 0 || next < 0 || next >= p.segments.length) return;
    const segments = [...p.segments];
    [segments[index], segments[next]] = [segments[next], segments[index]];
    change({ segments });
    const focusDirection =
      next === 0
        ? "down"
        : next === segments.length - 1
          ? "up"
          : direction < 0
            ? "up"
            : "down";
    requestAnimationFrame(() =>
      document.getElementById(`move-${focusDirection}-${id}`)?.focus(),
    );
  };
  async function generate(id?: string) {
    const p = projectRef.current;
    if (!p || busy || abort.current || deleteLock.current || updateLock.current)
      return;
    if (recovery || failedProjects.current.has(p.id)) {
      setError("项目有未保存的内容，请先恢复保存或下载音频。");
      return;
    }
    if (!online && mode === "openai") {
      setError("离线时无法使用 OpenAI 生成。");
      return;
    }
    const key = keyInput.current?.value.trim() || "";
    if (mode === "openai" && (!key || !consent)) {
      setError("请输入你的 API key，并确认计费及浏览器密钥风险。");
      return;
    }
    const targets = p.segments
      .filter(
        (s) =>
          (!id || s.id === id) &&
          s.text.trim() &&
          (!!id || !current(s, p, mode)),
      )
      .map((segment) => ({ ...segment }));
    if (!targets.length) {
      setError("没有需要生成的非空片段。");
      return;
    }
    if (targets.some((segment) => segment.alternative)) {
      setError("请先处理已有的备选录音，再重新生成。");
      return;
    }
    const rerecord = !!id && current(targets[0], p, mode);
    if (mode === "openai") {
      const tooLong = targets
        .map((segment) => ({
          segment,
          index: p.segments.findIndex((item) => item.id === segment.id) + 1,
        }))
        .filter(({ segment }) => segment.text.length > MAX_SEGMENT_LENGTH);
      const problems: string[] = [];
      if (tooLong.length) {
        const names = tooLong
          .slice(0, 10)
          .map(({ index }) => `片段 ${index}`)
          .join("、");
        problems.push(
          `${names}${tooLong.length > 10 ? ` 等 ${tooLong.length} 个片段` : ""}超过 ${MAX_SEGMENT_LENGTH} 字符`,
        );
      }
      if (p.instructions.length > MAX_INSTRUCTIONS_LENGTH)
        problems.push(`旁白指令超过 ${MAX_INSTRUCTIONS_LENGTH} 字符`);
      if (problems.length) {
        setError(`${problems.join("；")}。请修改后再生成，本次未发送请求。`);
        return;
      }
    }
    setError("");
    setRunSnapshot({
      projectId: p.id,
      mode,
      voice: p.voice,
      instructions: p.instructions,
      targets: targets.map((segment) => ({
        index: p.segments.findIndex((item) => item.id === segment.id) + 1,
        text: segment.text,
      })),
    });
    const ctrl = new AbortController();
    operationEpoch.current++;
    abort.current = ctrl;
    try {
      setBusy("正在检查本地保存…");
      await saveQueue.current;
      if (failedProjects.current.has(p.id)) {
        setError("项目尚未保存，已停止生成。请先解决本地保存问题。");
        return;
      }
      for (let i = 0; i < targets.length; i++) {
        if (ctrl.signal.aborted || projectRef.current?.id !== p.id)
          throw new DOMException("Cancelled", "AbortError");
        const target = targets[i];
        setBusy(
          `${mode === "openai" ? "正在生成" : "正在模拟"} ${i + 1} / ${targets.length}`,
        );
        const result =
          mode === "openai"
            ? await generateBrowserSpeech(
                key,
                target.text,
                p.voice,
                p.instructions,
                ctrl.signal,
              )
            : {
                audio: await demoAudio(target.text, ctrl.signal),
                provenance: undefined,
              };
        const { audio: blob, provenance } = result;
        const now = projectRef.current;
        if (now && now.id === p.id) {
          const saved = await commit({
            ...now,
            updated: Date.now(),
            segments: now.segments.map((s) =>
              s.id === target.id
                ? rerecord
                  ? {
                      ...s,
                      alternative: {
                        audio: blob,
                        audioKind: mode,
                        audioFor: target.text,
                        voice: p.voice,
                        instructions: p.instructions,
                        audioVerified: false,
                        provenance,
                      },
                    }
                  : {
                      ...s,
                      audio: blob,
                      audioKind: mode,
                      audioFor: target.text,
                      voice: p.voice,
                      instructions: p.instructions,
                      audioVerified: false,
                      provenance,
                    }
                : s,
            ),
          });
          if (!saved) {
            setRecovery({
              projectId: now.id,
              segmentId: target.id,
              audio: blob,
            });
            setStatus("保存失败，已停止生成");
            setError(
              "音频保存失败，已停止生成。请下载未保存音频或重试保存；已生成的语音可能已产生费用。",
            );
            return;
          }
        }
      }
      await saveQueue.current;
      setStatus(
        failedProjects.current.size
          ? "部分项目保存失败"
          : rerecord
            ? "备选录音已保存在此设备，请试听比较"
            : mode === "openai"
              ? "已保存在此设备 · 语音待试听核验"
              : "已保存在此设备 · 模拟完成：音频为提示音，非人声",
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
  async function runContinuityComparison() {
    const source = projectRef.current;
    const key = keyInput.current?.value.trim() || "";
    if (
      !source ||
      mode !== "openai" ||
      !online ||
      !key ||
      !consent ||
      !labConsent ||
      busy ||
      abort.current ||
      deleteLock.current ||
      updateLock.current ||
      recovery ||
      failedProjects.current.size
    )
      return;
    const plan = continuityPlan(source.instructions);
    if (
      plan.some(
        (session) =>
          session.instructions.length > MAX_INSTRUCTIONS_LENGTH ||
          session.texts.some((text) => text.length > MAX_SEGMENT_LENGTH),
      )
    ) {
      setError("对照试验的指令或脚本超过长度限制，本次未发送请求。");
      return;
    }
    if (
      !window.confirm(
        "本次对照最多产生 7 次语音响应，可能收费；每次最多 1024 个输出 token。token 上限不是金额上限，请先核对你的预算和用量。确认开始吗？",
      )
    )
      return;
    const ctrl = new AbortController();
    abort.current = ctrl;
    updateLock.current = true;
    setLabRunning(true);
    setLabConsent(false);
    setError("");
    let completed = 0;
    let project: Project | undefined;
    let cIndex = 0;
    try {
      await saveQueue.current;
      if (failedProjects.current.size)
        throw new Error("有项目尚未保存，本次未发送请求。");
      for (const session of plan) {
        if (ctrl.signal.aborted)
          throw new DOMException("Cancelled", "AbortError");
        if (
          !project ||
          !project.title.startsWith(`旁白对照 ${session.project} ·`)
        ) {
          project = {
            ...makeProject(),
            title: `旁白对照 ${session.project} · ${session.project === "A" ? "单次响应" : session.project === "B" ? "同一会话" : "相邻文本参考"}`,
            voice: source.voice,
            instructions: source.instructions,
            notes: "请对照脚本完整试听，并记录情绪、节奏和片段衔接感受。",
            segments: (session.project === "A"
              ? [continuityFixture.join("\n")]
              : [...continuityFixture]
            ).map((text) => ({ id: crypto.randomUUID(), text })),
          };
          setBusy(`正在保存对照项目 ${session.project}…`);
          if (!(await commit(project)))
            throw new Error("对照项目保存失败，已停止；尚未继续发送请求。");
        }
        const projectId = project.id;
        const first = session.project === "C" ? cIndex : 0;
        setRunSnapshot({
          projectId,
          mode: "openai",
          voice: source.voice,
          instructions: session.instructions,
          targets: session.texts.map((text, index) => ({
            index: first + index + 1,
            text,
          })),
        });
        setBusy(`正在生成对照 ${session.project} · ${completed} / 7`);
        await generateBrowserSpeechSequence(
          key,
          session.texts,
          source.voice,
          session.instructions,
          ctrl.signal,
          async (take, index) => {
            const now = projectRef.current;
            const targetIndex = first + index;
            if (!now || now.id !== projectId || !now.segments[targetIndex])
              throw new Error("项目状态发生变化，已停止对照。");
            const target = now.segments[targetIndex];
            const saved = await commit({
              ...now,
              updated: Date.now(),
              segments: now.segments.map((segment, i) =>
                i === targetIndex
                  ? {
                      ...segment,
                      audio: take.audio,
                      audioKind: "openai",
                      audioFor: session.texts[index],
                      voice: source.voice,
                      instructions: source.instructions,
                      audioVerified: false,
                      provenance: take.provenance,
                    }
                  : segment,
              ),
            });
            if (!saved) {
              setRecovery({
                projectId,
                segmentId: target.id,
                audio: take.audio,
              });
              throw new Error(
                "对照音频保存失败，已停止；请下载未保存音频或重试保存。可能已经产生费用。",
              );
            }
            completed++;
            setBusy(`正在生成对照 ${session.project} · ${completed} / 7`);
            if (!take.complete)
              throw new Error(
                "对照音频不完整，已保存待试听片段并停止；可能已经产生费用。",
              );
          },
          1024,
          true,
        );
        if (session.project === "C") cIndex++;
      }
      setStatus("对照音频已保存；请逐段试听核验并记录评分");
    } catch (error) {
      if ((error as Error).name === "AbortError")
        setStatus("对照已取消；已保存音频保留，可能已经产生费用");
      else
        setError((error as Error).message || "对照已停止；可能已经产生费用。");
    } finally {
      abort.current = null;
      updateLock.current = false;
      setLabRunning(false);
      setBusy("");
    }
  }
  async function retryRecovery() {
    const p = projectRef.current;
    if (
      !recovery ||
      !p ||
      busy ||
      abort.current ||
      deleteLock.current ||
      updateLock.current
    )
      return;
    if (
      p.id !== recovery.projectId ||
      !p.segments.some(
        (s) =>
          s.id === recovery.segmentId &&
          (s.audio === recovery.audio ||
            s.alternative?.audio === recovery.audio),
      )
    ) {
      setError("请打开对应项目；如片段已改变，请先下载未保存音频。");
      return;
    }
    setBusy("正在重试保存…");
    try {
      if (await commit({ ...p, updated: Date.now() })) {
        setRecovery(null);
        setError("");
      }
    } finally {
      setBusy("");
    }
  }
  function open(p: Project) {
    if (
      busy ||
      updating ||
      abort.current ||
      deleteLock.current ||
      updateLock.current
    )
      return;
    operationEpoch.current++;
    projectRef.current = p;
    setActive(p);
    setError("");
  }
  function create() {
    if (
      busy ||
      updating ||
      abort.current ||
      deleteLock.current ||
      updateLock.current
    )
      return;
    const p = makeProject();
    commit(p);
    if (mobile && drawerOpen) closeDrawer();
    window.location.hash = "script";
    requestAnimationFrame(() =>
      document.getElementById("script")?.scrollIntoView(),
    );
  }
  async function remove() {
    if (
      !active ||
      busy ||
      updating ||
      abort.current ||
      deleteLock.current ||
      updateLock.current ||
      !window.confirm(`删除“${active.title}”？此操作无法撤销。`)
    )
      return;
    deleteLock.current = true;
    setDeleting(true);
    operationEpoch.current++;
    try {
      await saveQueue.current;
      await deleteProject(
        active.id,
        projectVersions.current.get(active.id) ?? null,
      );
      projectVersions.current.delete(active.id);
      failedProjects.current.delete(active.id);
      conflictedProjects.current.delete(active.id);
      const remaining = projects.filter((p) => p.id !== active.id);
      setProjects(remaining);
      setActive(remaining[0] || null);
      projectRef.current = remaining[0] || null;
      setStatus(
        failedProjects.current.size ? "部分项目保存失败" : "项目已删除",
      );
    } catch (reason) {
      setError(
        reason instanceof ProjectConflict
          ? "其他标签页已修改或删除此项目，请重新打开后再处理。"
          : "删除失败。",
      );
    } finally {
      deleteLock.current = false;
      setDeleting(false);
    }
  }
  async function restore(file: File | undefined, withAudio = false) {
    if (
      !file ||
      busy ||
      abort.current ||
      updating ||
      deleteLock.current ||
      updateLock.current
    )
      return;
    const epoch = operationEpoch.current;
    try {
      const p = withAudio
        ? await readAudioBackup(file)
        : await readBackup(file);
      if (
        epoch !== operationEpoch.current ||
        abort.current ||
        deleteLock.current ||
        updateLock.current
      ) {
        setError("导入期间项目状态已变化，请重新导入备份。");
        return;
      }
      if (await commit(p)) {
        setError("");
        setStatus(
          withAudio
            ? "音频备份已导入并保存"
            : "脚本备份已导入；音频需要重新生成",
        );
      } else {
        setError(
          "导入内容尚未保存，请释放空间并重试保存；原备份文件仍可使用。",
        );
      }
    } catch {
      setError("无法导入此备份：文件无效、损坏或过大。");
    }
  }
  async function saveConflictedCopy() {
    const p = projectRef.current;
    if (
      !p ||
      !conflictedProjects.current.has(p.id) ||
      busy ||
      abort.current ||
      deleteLock.current ||
      updateLock.current
    )
      return;
    const originalId = p.id;
    const copy = {
      ...p,
      id: crypto.randomUUID(),
      title: `${p.title.slice(0, 180)}（冲突副本）`,
      updated: Date.now(),
      revision: crypto.randomUUID(),
    };
    updateLock.current = true;
    setBusy("正在保存副本…");
    try {
      await saveQueue.current;
      await saveProject(copy, null);
      projectVersions.current.set(copy.id, copy.revision);
      failedProjects.current.delete(originalId);
      conflictedProjects.current.delete(originalId);
      if (recovery?.projectId === originalId) setRecovery(null);
      projectRef.current = copy;
      setActive(copy);
      setProjects((projects) => [
        copy,
        ...projects.filter((project) => project.id !== copy.id),
      ]);
      setError("");
      setStatus("冲突副本已保存在此设备");
      try {
        const latest = (await allProjects()).find(
          (project) => project.id === originalId,
        );
        if (latest)
          projectVersions.current.set(latest.id, projectVersion(latest));
        else projectVersions.current.delete(originalId);
        setProjects((projects) =>
          projects.flatMap((project) =>
            project.id === originalId ? (latest ? [latest] : []) : [project],
          ),
        );
      } catch {
        setError("副本已保存，但无法刷新原项目列表。请重新打开应用。");
      }
    } catch {
      setError("副本尚未保存。请释放空间后重试，或先下载未保存音频。");
    } finally {
      updateLock.current = false;
      setBusy("");
    }
  }
  async function retryProjectSave() {
    const p = projectRef.current;
    if (!p || busy || abort.current || deleteLock.current || updateLock.current)
      return;
    setBusy("正在重试保存…");
    try {
      if (await commit({ ...p, updated: Date.now() })) setError("");
    } finally {
      setBusy("");
    }
  }
  async function exportAudioBackup() {
    const p = projectRef.current;
    if (!p || busy || abort.current || deleteLock.current || updateLock.current)
      return;
    if (
      !window.confirm(
        "此备份包含脚本和录音，请妥善保管。导出时音频总大小上限为 16 MiB。继续吗？",
      )
    )
      return;
    setBusy("正在准备音频备份…");
    try {
      const blob = await createAudioBackup(p);
      download(blob, "podcast-audio-backup.json");
      setError("");
    } catch {
      setError("无法导出音频备份：音频过大、格式无效或缺少必要信息。");
    } finally {
      setBusy("");
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
    const nonempty = p.segments.filter((s) => s.text.trim());
    const valid = nonempty.filter((s) => current(s, p, mode));
    if (valid.length !== nonempty.length || !valid.length) {
      setError("请先生成全部非空片段，再导出音频。");
      return;
    }
    if (
      mode === "openai" &&
      valid.some(
        (segment) =>
          !segment.audioVerified ||
          segment.provenance?.responseStatus === "incomplete",
      )
    ) {
      setError("请先试听并核验所有片段的完整性，再导出完整音频。");
      return;
    }
    try {
      download(
        await joinDemoWavs(
          valid.map((s) => s.audio!),
          pauseMs,
        ),
        mode === "openai" ? "podcast.wav" : "demo-tones.wav",
      );
    } catch {
      setError("音频导出失败。");
    }
  }
  async function preparePreview(startId: string) {
    const p = projectRef.current;
    if (!p || busy || abort.current || deleteLock.current || updateLock.current)
      return;
    const index = p.segments.findIndex((segment) => segment.id === startId);
    const segments = p.segments
      .slice(index)
      .filter((segment) => segment.text.trim());
    if (
      index < 0 ||
      !segments.length ||
      segments.some((segment) => !current(segment, p, mode))
    ) {
      setPreview(null);
      setError("所选范围有片段需要重新生成，无法连续试听。");
      return;
    }
    const epoch = operationEpoch.current;
    setBusy("正在准备试听…");
    try {
      const audio = await joinDemoWavs(
        segments.map((segment) => segment.audio!),
        pauseMs,
      );
      if (operationEpoch.current !== epoch || projectRef.current?.id !== p.id) {
        setError("项目在准备试听时发生变化，请重新准备。");
        return;
      }
      setError("");
      setPreview({
        projectId: p.id,
        mode,
        startId,
        pauseMs,
        segments: segments.map((segment) => ({
          id: segment.id,
          audio: segment.audio!,
        })),
        audio,
      });
    } catch {
      setError("无法准备连续试听，请检查片段音频格式。");
    } finally {
      setBusy("");
    }
  }
  async function update() {
    if (
      !waiting ||
      busy ||
      updating ||
      abort.current ||
      deleteLock.current ||
      updateLock.current ||
      recovery
    )
      return;
    if (!navigator.locks || tabGuard !== "held") {
      setError("此浏览器无法安全协调更新。请关闭所有应用页面，再重新打开。 ");
      return;
    }
    updateLock.current = true;
    operationEpoch.current++;
    setUpdating(true);
    await saveQueue.current;
    if (failedProjects.current.size) {
      updateLock.current = false;
      setUpdating(false);
      setError("项目尚未保存，请先备份或解决存储问题，再更新应用。");
      return;
    }
    releaseTab.current?.();
    try {
      await navigator.locks.request(
        "podcast-studio-update",
        { mode: "exclusive", ifAvailable: true },
        async (lock) => {
          if (!lock) {
            setError("其他标签页仍在使用应用。请保存并关闭其他页面后再更新。");
            return false;
          }
          applyingUpdate.current = true;
          const approved = await new Promise<boolean>((resolve) => {
            const channel = new MessageChannel();
            const timer = setTimeout(() => {
              channel.port1.close();
              resolve(false);
            }, 5000);
            channel.port1.onmessage = (
              event: MessageEvent<{ ok?: boolean }>,
            ) => {
              clearTimeout(timer);
              channel.port1.close();
              resolve(event.data?.ok === true);
            };
            waiting.postMessage("SKIP_WAITING_IF_SINGLE", [channel.port2]);
          });
          if (!approved) {
            setError(
              "其他页面可能仍在使用应用，或更新未响应。请关闭其他页面后重试。",
            );
            return false;
          }
          await new Promise<void>((resolve) => setTimeout(resolve, 10000));
          applyingUpdate.current = false;
          setError("更新未完成，请重新打开应用后重试。");
          return false;
        },
      );
    } catch {
      setError("无法安全协调更新，请关闭其他页面后重试。");
    } finally {
      applyingUpdate.current = false;
      updateLock.current = false;
      setUpdating(false);
      acquireTab.current?.();
    }
  }
  if (!active || tabGuard === "waiting")
    return (
      <main className="loading">
        <h1>Knowledge Podcast Studio</h1>
        <p>
          {tabGuard === "waiting" ? "正在等待安全更新完成…" : error || status}
        </p>
        {tabGuard !== "waiting" && <button onClick={create}>新建项目</button>}
      </main>
    );
  const readyCount = active.segments.filter(
    (s) =>
      current(s, active, mode) &&
      (mode !== "openai" ||
        (s.audioVerified && s.provenance?.responseStatus !== "incomplete")),
  ).length;
  const totalChars = active.segments.reduce((n, s) => n + s.text.length, 0);
  const selectedPreset =
    Object.entries(presets).find(
      ([, instructions]) => instructions === active.instructions,
    )?.[0] ?? "Custom";
  const stale = active.segments.filter(
    (s) => s.audio && !current(s, active, mode),
  ).length;
  const unverified =
    mode === "openai"
      ? active.segments.filter(
          (s) =>
            current(s, active, mode) &&
            (!s.audioVerified || s.provenance?.responseStatus === "incomplete"),
        ).length
      : 0;
  const previewOptions = active.segments.filter((segment) =>
    segment.text.trim(),
  );
  const previewStartId = previewOptions.some(
    (segment) => segment.id === previewStart,
  )
    ? previewStart
    : (previewOptions[0]?.id ?? "");
  const previewIndex = active.segments.findIndex(
    (segment) => segment.id === previewStartId,
  );
  const previewSegments =
    previewIndex < 0
      ? []
      : active.segments
          .slice(previewIndex)
          .filter((segment) => segment.text.trim());
  const visiblePreview =
    preview &&
    preview.projectId === active.id &&
    preview.mode === mode &&
    preview.startId === previewStartId &&
    preview.pauseMs === pauseMs &&
    preview.segments.length === previewSegments.length &&
    previewSegments.every(
      (segment, index) =>
        current(segment, active, mode) &&
        segment.id === preview.segments[index].id &&
        segment.audio === preview.segments[index].audio,
    );
  return (
    <>
      <header className="top">
        <div className="top-left">
          <button
            ref={menuButton}
            className="icon-button mobile-menu"
            aria-label="打开导航"
            aria-expanded={drawerOpen}
            aria-controls="app-navigation"
            onClick={() => setDrawerOpen(true)}
          >
            ☰
          </button>
          <a className="brand" href="#overview" aria-label="Knowledge Studio">
            <span className="brand-icon">▥</span>
            <span>
              KNOWLEDGE <b>STUDIO</b>
            </span>
          </a>
          <span className="top-divider" aria-hidden="true" />
          <div className="top-context">
            <span>工作空间</span>
            <strong title={active.title}>{active.title}</strong>
          </div>
        </div>
        <div className="top-right">
          <span className="badge">
            ● {online ? (mode === "openai" ? "BYOK" : "演示模式") : "离线"}
          </span>
          <span className="saved" role="status" aria-live="polite">
            {busy || (deleting ? "正在删除…" : status)}
          </span>
        </div>
      </header>
      <main
        id="top"
        className={"layout " + (collapsed ? "sidebar-collapsed" : "")}
      >
        {mobile && drawerOpen && (
          <button
            className="drawer-backdrop"
            aria-label="关闭导航"
            onClick={closeDrawer}
          />
        )}
        <aside
          id="app-navigation"
          ref={drawerRef}
          className={drawerOpen ? "drawer-open" : ""}
          role={mobile && drawerOpen ? "dialog" : undefined}
          aria-modal={mobile && drawerOpen ? true : undefined}
          aria-label="应用导航"
          inert={mobile && !drawerOpen ? true : undefined}
          onKeyDown={drawerKeyDown}
        >
          <div className="sidebar-head">
            <span className="sidebar-heading">工作空间</span>
            <button
              className="icon-button sidebar-toggle desktop-only"
              aria-label={collapsed ? "展开侧边栏" : "收起侧边栏"}
              aria-expanded={!collapsed}
              onClick={() => setCollapsed(!collapsed)}
            >
              {collapsed ? "›" : "‹"}
            </button>
            <button
              className="icon-button mobile-only"
              aria-label="关闭导航"
              onClick={closeDrawer}
            >
              ×
            </button>
          </div>
          <nav className="main-nav" aria-label="工作区导航">
            {navItems.map((item) => (
              <a
                key={item.id}
                className={"nav-item " + (section === item.id ? "active" : "")}
                href={"#" + item.id}
                title={collapsed && !mobile ? undefined : item.label}
                aria-label={item.label}
                aria-describedby={
                  hint?.id === item.id ? "sidebar-hint" : undefined
                }
                onMouseEnter={(e) =>
                  showHint(e.currentTarget, item.id, item.label)
                }
                onMouseLeave={(e) => {
                  if (document.activeElement !== e.currentTarget) setHint(null);
                }}
                onFocus={(e) => showHint(e.currentTarget, item.id, item.label)}
                onBlur={() => setHint(null)}
                aria-current={section === item.id ? "location" : undefined}
                onClick={() => {
                  setSection(item.id);
                  if (mobile) closeDrawer();
                }}
              >
                <Icon name={item.icon} />
                <span className="nav-label">{item.label}</span>
              </a>
            ))}
          </nav>
          <div className="project-head">
            <span className="sidebar-heading">本地项目</span>
            <button
              className="icon-button"
              onClick={create}
              disabled={!!busy || updating || deleting}
              aria-label="新建项目"
              title="新建项目"
            >
              ＋
            </button>
          </div>
          <nav className="project-list" aria-label="项目列表">
            {projects.map((p) => (
              <button
                key={p.id}
                className={"project " + (p.id === active.id ? "selected" : "")}
                onClick={() => {
                  open(p);
                  if (mobile) closeDrawer();
                }}
                disabled={!!busy || updating || deleting}
                aria-label={p.title}
                aria-current={p.id === active.id ? "true" : undefined}
                title={collapsed && !mobile ? undefined : p.title}
                aria-describedby={
                  hint?.id === p.id ? "sidebar-hint" : undefined
                }
                onMouseEnter={(e) => showHint(e.currentTarget, p.id, p.title)}
                onMouseLeave={(e) => {
                  if (document.activeElement !== e.currentTarget) setHint(null);
                }}
                onFocus={(e) => showHint(e.currentTarget, p.id, p.title)}
                onBlur={() => setHint(null)}
              >
                <span className="project-icon">◫</span>
                <span className="nav-label">{p.title}</span>
              </button>
            ))}
          </nav>
          <div className="privacy">
            <span className="privacy-icon">●</span>
            <div className="nav-label">
              <strong>本地工作空间</strong>
              <small>项目保存在此设备</small>
            </div>
          </div>
        </aside>
        <div className="workspace">
          <div id="overview" className="heading">
            <div>
              <div className="eyebrow">
                工作空间 <span> / </span> 工作台
              </div>
              <h1>把好奇，讲成故事。</h1>
              <p>从一段脚本开始，制作属于你的知识播客。</p>
            </div>
            <button
              className="outline"
              onClick={create}
              disabled={!!busy || updating || deleting}
            >
              ＋ 新建项目
            </button>
          </div>
          <div className="summary-grid" aria-label="项目概况">
            <div className="summary-card">
              <span>当前项目</span>
              <strong title={active.title}>{active.title}</strong>
              <small>本地草稿</small>
            </div>
            <div className="summary-card">
              <span>脚本片段</span>
              <strong>{active.segments.length}</strong>
              <small>{totalChars} 字符</small>
            </div>
            <div className="summary-card">
              <span>音频进度</span>
              <strong>
                {readyCount} <i>/ {active.segments.length}</i>
              </strong>
              <small>
                {unverified
                  ? `${unverified} 个片段待试听核验`
                  : stale
                    ? `${stale} 个片段需要更新`
                    : "按当前设置统计"}
              </small>
            </div>
            <div className="summary-card">
              <span>生成模式</span>
              <strong className="summary-mode">
                {mode === "openai" ? "浏览器 BYOK" : "演示模式"}
              </strong>
              <small>
                {online
                  ? "可以开始创作"
                  : mode === "demo"
                    ? "离线演示可用"
                    : "当前离线"}
              </small>
            </div>
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
              <span>
                {failedProjects.current.size || recovery
                  ? "有项目尚未保存，请先解决保存问题。"
                  : "新版本已准备好。项目保存在本地。"}
              </span>
              <button
                onClick={update}
                disabled={
                  updating ||
                  deleting ||
                  !!busy ||
                  status === "正在保存…" ||
                  failedProjects.current.size > 0 ||
                  !!recovery
                }
              >
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
          {conflictedProjects.current.has(active.id) && (
            <div className="notice" aria-label="项目冲突恢复">
              <span>
                其他标签页已修改此项目。请将本页内容另存为新项目，再继续编辑。
              </span>
              <button
                disabled={!!busy}
                onClick={() => void saveConflictedCopy()}
              >
                另存为新项目
              </button>
            </div>
          )}
          {failedProjects.current.has(active.id) &&
            !recovery &&
            !conflictedProjects.current.has(active.id) && (
              <div className="notice" aria-label="未保存项目恢复">
                <span>当前项目仍在页面内存中，请释放空间并重试保存。</span>
                <button
                  disabled={!!busy}
                  onClick={() => void retryProjectSave()}
                >
                  重试保存项目
                </button>
              </div>
            )}
          {recovery && (
            <div className="notice" aria-label="未保存音频恢复">
              <span>
                音频仍在本页面内存中。关闭页面前请下载或重试保存；不会自动重新生成。
              </span>
              <button
                onClick={() => download(recovery.audio, "unsaved-segment.wav")}
              >
                下载未保存音频
              </button>
              <button
                onClick={() => void retryRecovery()}
                disabled={!!busy || deleting || updating}
              >
                重试保存音频
              </button>
            </div>
          )}
          <fieldset
            className="workspace-content"
            disabled={updating || deleting}
          >
            <div className="studio">
              <section id="script" className="editor card" inert={labRunning}>
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
                              ? s.provenance?.responseStatus === "incomplete"
                                ? "服务端报告不完整"
                                : s.audioVerified
                                  ? "已核验"
                                  : "待试听核验"
                              : "已模拟"
                            : "需重新生成"
                          : "未生成"}
                      </span>
                      <button
                        className="text-button"
                        aria-label={`删除片段 ${i + 1}`}
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
                    <div className="segment-actions">
                      <button
                        id={`move-up-${s.id}`}
                        className="text-button"
                        aria-label={`上移片段 ${i + 1}`}
                        disabled={!!busy || i === 0}
                        onClick={() => moveSegment(s.id, -1)}
                      >
                        ↑ 上移
                      </button>
                      <button
                        id={`move-down-${s.id}`}
                        className="text-button"
                        aria-label={`下移片段 ${i + 1}`}
                        disabled={!!busy || i === active.segments.length - 1}
                        onClick={() => moveSegment(s.id, 1)}
                      >
                        ↓ 下移
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
                        aria-label={`本机朗读片段 ${i + 1}`}
                        onClick={() => speak(s.text)}
                        disabled={!s.text.trim()}
                      >
                        ▶ 本机朗读
                      </button>
                      <button
                        className="text-button"
                        aria-label={`${current(s, active, mode) ? "重录片段" : mode === "openai" ? "生成片段" : "模拟片段"} ${i + 1}`}
                        onClick={() => {
                          if (
                            current(s, active, mode) &&
                            mode === "openai" &&
                            !window.confirm(
                              "重新生成可能产生费用。保留当前录音并生成一个备选录音吗？",
                            )
                          )
                            return;
                          void generate(s.id);
                        }}
                        disabled={
                          !!busy ||
                          !!s.alternative ||
                          !s.text.trim() ||
                          (!online && mode === "openai")
                        }
                      >
                        ↻{" "}
                        {current(s, active, mode)
                          ? "重录片段"
                          : mode === "openai"
                            ? "生成片段"
                            : "模拟片段"}
                      </button>
                      <span>{s.text.length} 字符</span>
                    </div>
                    {s.audio && current(s, active, mode) && (
                      <>
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
                        {mode === "openai" && (
                          <>
                            <p className="hint">
                              音频可能缺失或截断，请完整试听并对照脚本。
                            </p>
                            {s.provenance?.responseStatus === "incomplete" && (
                              <p className="hint">
                                服务端报告此响应不完整，已保留供下载；请重录后再核验和导出。
                              </p>
                            )}
                            <label className="consent">
                              <input
                                type="checkbox"
                                aria-label={`确认片段 ${i + 1} 音频完整`}
                                disabled={
                                  s.provenance?.responseStatus === "incomplete"
                                }
                                checked={
                                  !!s.audioVerified &&
                                  s.provenance?.responseStatus !== "incomplete"
                                }
                                onChange={(event) =>
                                  edit(s.id, {
                                    audioVerified: event.target.checked,
                                  })
                                }
                              />
                              我已试听并确认此片段内容完整。
                            </label>
                          </>
                        )}
                      </>
                    )}
                    {s.audio &&
                      s.audioKind === "openai" &&
                      ((s.provenance?.effectiveModel &&
                        s.provenance.effectiveModel !==
                          s.provenance.requestedModel) ||
                        (s.provenance?.effectiveVoice &&
                          s.provenance.effectiveVoice !== s.voice)) && (
                        <p className="hint">
                          服务端会话报告与请求不同；请核实录音，不能仅凭此判断原因。
                        </p>
                      )}
                    {s.audio && s.audioKind === "openai" && (
                      <details className="run-details">
                        <summary>录音来源与生成输入</summary>
                        <p>
                          请求模型：
                          {s.provenance?.requestedModel ?? "未知（旧录音）"}
                        </p>
                        <p>
                          服务端会话报告的模型：
                          {s.provenance?.effectiveModel ?? "未知"}
                        </p>
                        <p>
                          请求声音：{s.voice ?? "未知"}；服务端会话报告的声音：
                          {s.provenance?.effectiveVoice ?? "未知"}
                        </p>
                        <p>
                          服务端响应状态：
                          {s.provenance?.responseStatus ?? "未知"}
                        </p>
                        <p>
                          请求的完整指令：
                          {s.provenance?.requestedInstructions ??
                            "未知（旧录音）"}
                        </p>
                        <p>生成时脚本：{s.audioFor ?? "未知"}</p>
                      </details>
                    )}
                    {s.alternative && (
                      <div className="notice">
                        <strong>备选录音</strong>
                        <span>
                          {current({ ...s, ...s.alternative }, active, mode)
                            ? "可试听后选择保留的录音。"
                            : "此录音基于其他脚本或设置，切回对应设置后可采用。"}
                        </span>
                        <Player blob={s.alternative.audio} />
                        <button
                          aria-label={`采用备选录音 ${i + 1}`}
                          disabled={
                            !!busy ||
                            !!recovery ||
                            !current({ ...s, ...s.alternative }, active, mode)
                          }
                          onClick={() => {
                            if (
                              !s.alternative ||
                              !s.audio ||
                              !s.audioFor ||
                              !s.voice ||
                              s.instructions === undefined
                            )
                              return;
                            edit(s.id, {
                              ...s.alternative,
                              alternative: {
                                audio: s.audio,
                                audioKind: s.audioKind ?? "demo",
                                audioFor: s.audioFor,
                                voice: s.voice,
                                instructions: s.instructions,
                                audioVerified: s.audioVerified,
                                provenance: s.provenance,
                              },
                            });
                          }}
                        >
                          采用备选录音
                        </button>
                        <button
                          aria-label={`移除备选录音 ${i + 1}`}
                          disabled={!!busy || !!recovery}
                          onClick={() => {
                            if (
                              window.confirm(
                                "移除备选录音后无法恢复，确定继续吗？",
                              )
                            )
                              edit(s.id, { alternative: undefined });
                          }}
                        >
                          移除备选录音
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
                <section id="voice" className="card voice" inert={labRunning}>
                  <div className="eyebrow">02 / VOICE</div>
                  <h2>声音与风格</h2>
                  <p className="muted">
                    选择目标声音；模拟模式不会生成这些声音。
                  </p>
                  <label className="field">
                    目标声音
                    <select
                      value={active.voice}
                      onChange={(e) =>
                        change({ voice: e.target.value as Voice })
                      }
                    >
                      <option value="marin">Marin</option>
                      <option value="cedar">Cedar</option>
                      <option value="coral">Coral</option>
                    </select>
                  </label>
                  <label className="field">
                    朗读风格
                    <select
                      value={selectedPreset}
                      onChange={(e) =>
                        change({
                          instructions:
                            presets[e.target.value as keyof typeof presets],
                        })
                      }
                    >
                      <option value="Custom" disabled>
                        自定义
                      </option>
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
                        setLabConsent(false);
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
                      <form
                        autoComplete="off"
                        onSubmit={(event) => event.preventDefault()}
                      >
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
                      </form>
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
                          setLabConsent(false);
                        }}
                      >
                        清除 key
                      </button>
                    </div>
                  )}
                  {mode === "openai" && (
                    <details className="run-details">
                      <summary>旁白连续性对照（实验）</summary>
                      <p className="hint">
                        使用固定短样本依次对比单次响应、同一会话三次响应和相邻文本参考。一次最多
                        5 个会话、7 次语音响应；每次输出上限为 1024
                        token。可能产生费用，token
                        上限不是金额上限，请先检查用量并遵守预算。失败或取消后不会自动重试；每段保存后才继续。
                      </p>
                      <p>
                        请求声音：{active.voice}；请求模型：{REALTIME_MODEL}
                      </p>
                      <p>
                        <a
                          href="https://github.com/yapweijun1996/PWA-Knowledge-Podcast-OpenAI-TTS/blob/main/docs/NARRATION-EVALUATION.md"
                          target="_blank"
                          rel="noreferrer"
                        >
                          查看样本和试听评分标准
                        </a>{" "}
                        ·{" "}
                        <a
                          href="https://developers.openai.com/api/docs/models/gpt-realtime-2.1-mini"
                          target="_blank"
                          rel="noreferrer"
                        >
                          查看模型价格
                        </a>
                      </p>
                      {continuityPlan(active.instructions).map(
                        (session, index) => (
                          <details key={index} className="run-details">
                            <summary>
                              会话 {index + 1} · 方案 {session.project}
                            </summary>
                            <p>
                              完整指令：
                              {composeInstructions(session.instructions)}
                            </p>
                            {session.texts.map((text, i) => (
                              <p key={i}>
                                朗读文本 {i + 1}：{text}
                              </p>
                            ))}
                          </details>
                        ),
                      )}
                      <label className="consent">
                        <input
                          type="checkbox"
                          checked={labConsent}
                          disabled={!!busy}
                          onChange={(event) =>
                            setLabConsent(event.currentTarget.checked)
                          }
                        />
                        我已阅读对照样本和费用说明，同意启动一次对照。
                      </label>
                      <button
                        disabled={
                          !!busy ||
                          !online ||
                          !keyPresent ||
                          !consent ||
                          !labConsent
                        }
                        onClick={() => void runContinuityComparison()}
                      >
                        开始一次旁白对照
                      </button>
                    </details>
                  )}
                  {runSnapshot?.projectId === active.id && (
                    <details className="run-details" open>
                      <summary>本次生成输入快照</summary>
                      <p>
                        生成模式：
                        {runSnapshot.mode === "openai" ? "OpenAI" : "演示"}
                        ；请求声音：{runSnapshot.voice}
                      </p>
                      {runSnapshot.mode === "openai" && (
                        <p>请求模型：{REALTIME_MODEL}</p>
                      )}
                      <p>
                        请求的完整指令：
                        {runSnapshot.mode === "openai"
                          ? composeInstructions(runSnapshot.instructions)
                          : runSnapshot.instructions}
                      </p>
                      {runSnapshot.targets.map((target) => (
                        <p key={target.index}>
                          片段 {target.index}：{target.text}
                        </p>
                      ))}
                      <p className="hint">
                        生成期间编辑不会改变本次输入；结果与当前内容不一致时会标记为过期。
                      </p>
                    </details>
                  )}
                  <p>
                    {" "}
                    {active.segments.length} 个片段 ·{" "}
                    {active.segments.reduce((n, s) => n + s.text.length, 0)}{" "}
                    字符
                    {stale ? ` · ${stale} 个已过期` : ""}
                  </p>
                  <button
                    className="primary"
                    onClick={() => generate()}
                    disabled={
                      !!busy ||
                      (!online && mode === "openai") ||
                      (mode === "openai" && (!keyPresent || !consent))
                    }
                  >
                    {busy ||
                      (mode === "openai"
                        ? "生成 OpenAI 语音"
                        : "生成模拟提示音")}
                  </button>
                  {busy && (
                    <button
                      className="outline full"
                      onClick={() => abort.current?.abort()}
                    >
                      取消
                    </button>
                  )}
                  <div id="assets" className="asset-actions">
                    <h3>播放与导出</h3>
                    <label className="field">
                      片段间停顿
                      <select
                        value={pauseMs}
                        onChange={(event) =>
                          setPauseMs(Number(event.target.value))
                        }
                      >
                        <option value={0}>无额外停顿（原始拼接）</option>
                        <option value={200}>增加 0.2 秒</option>
                        <option value={500}>增加 0.5 秒</option>
                      </select>
                    </label>
                    <p className="hint">
                      仅在片段之间添加静音，不修改原录音；重新准备试听可对比，完整
                      WAV 使用当前设置。
                    </p>
                    <label className="field">
                      从片段开始试听
                      <select
                        value={previewStartId}
                        onChange={(event) =>
                          setPreviewStart(event.target.value)
                        }
                      >
                        {active.segments.map(
                          (segment, index) =>
                            segment.text.trim() && (
                              <option key={segment.id} value={segment.id}>
                                片段 {index + 1}
                              </option>
                            ),
                        )}
                      </select>
                    </label>
                    <button
                      className="outline full"
                      disabled={!!busy || !previewStartId}
                      onClick={() => void preparePreview(previewStartId)}
                    >
                      准备连续试听
                    </button>
                    {visiblePreview && preview && (
                      <>
                        <div className="audio">
                          <Player blob={preview.audio} label="连续试听播放器" />
                        </div>
                        <button
                          className="outline full"
                          onClick={() => setPreview(null)}
                        >
                          关闭连续试听
                        </button>
                      </>
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
                    <button
                      className="outline full"
                      onClick={() => void exportAudioBackup()}
                      disabled={!!busy}
                    >
                      备份脚本与音频
                    </button>
                    <label className="outline full import">
                      导入音频备份
                      <input
                        type="file"
                        disabled={!!busy || updating || deleting}
                        accept="application/json,.json"
                        onChange={(e) => {
                          void restore(e.target.files?.[0], true);
                          e.currentTarget.value = "";
                        }}
                      />
                    </label>
                    <label className="outline full import">
                      导入脚本备份
                      <input
                        type="file"
                        disabled={!!busy || updating || deleting}
                        accept="application/json,.json"
                        onChange={(e) => {
                          void restore(e.target.files?.[0]);
                          e.currentTarget.value = "";
                        }}
                      />
                    </label>
                  </div>
                  <p className="hint">
                    脚本备份不包含音频；音频备份包含录音和来源信息（最多 16
                    MiB），不包含 API
                    key。本机朗读由浏览器提供，声音因设备而异，不能导出。OpenAI
                    语音生成使用你的账户；目前不支持 MP3。
                  </p>
                </section>
                <button className="danger" onClick={remove} disabled={!!busy}>
                  删除此项目
                </button>
              </div>
            </div>
            <section
              id="settings"
              className="settings-card card"
              aria-labelledby="settings-heading"
            >
              <div>
                <div className="eyebrow">PREFERENCES</div>
                <h2 id="settings-heading">设置</h2>
                <p className="muted">外观、更新与本地存储</p>
              </div>
              <div className="settings-grid">
                <label className="field">
                  外观
                  <select
                    value={theme}
                    onChange={(e) => setTheme(e.target.value as Theme)}
                  >
                    <option value="system">跟随系统</option>
                    <option value="light">浅色</option>
                    <option value="dark">深色</option>
                  </select>
                </label>
                <div className="settings-item">
                  <strong>应用版本</strong>
                  <span>v{packageInfo.version}</span>
                  <button className="outline" onClick={checkUpdate}>
                    检查更新
                  </button>
                  <span role="status">{updateMessage}</span>
                </div>
                <div className="settings-item">
                  <strong>本地存储</strong>
                  <span>
                    项目与音频保存在此设备。清除浏览器数据会删除它们。
                  </span>
                </div>
              </div>
            </section>
          </fieldset>
          <footer>
            Knowledge Podcast Studio · 本地项目 · AI 语音须向听众披露
          </footer>
        </div>
      </main>
      {hint &&
        createPortal(
          <div
            id="sidebar-hint"
            role="tooltip"
            className="sidebar-hint"
            style={{ left: hint.left, top: hint.top }}
          >
            {hint.text}
          </div>,
          document.body,
        )}
    </>
  );
}
