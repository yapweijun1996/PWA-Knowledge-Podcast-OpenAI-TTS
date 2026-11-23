import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Factory } from "./factory/Factory";
import { useWorkspaceNavigation } from "./factory/navigation";
import { I18nProvider, useI18n, type MessageKey } from "./i18n";

type Theme = "light" | "dark" | "system";

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

export default function App() {
  return (
    <I18nProvider>
      <AppContent />
    </I18nProvider>
  );
}

function AppContent() {
  const { t } = useI18n();
  const navigation = useWorkspaceNavigation();
  const { page } = navigation;
  const pauseFactoryPlayback = useRef<(() => void) | null>(null);
  const [factoryUpdateBlocked, setFactoryUpdateBlocked] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [tabGuard, setTabGuard] = useState<"waiting" | "held" | "unsupported">(
    "waiting",
  );
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<MessageKey>();
  const [theme, setTheme] = useState<Theme>(() => {
    const value = readPreference("podcast-theme", "system");
    return value === "light" || value === "dark" ? value : "system";
  });
  const releaseTab = useRef<(() => void) | null>(null);
  const tabLockTask = useRef<Promise<void> | null>(null);
  const acquireTab = useRef<(() => void) | null>(null);
  const applyingUpdate = useRef(false);
  const updateLock = useRef(false);

  const previousPage = useRef(page);
  useLayoutEffect(() => {
    if (previousPage.current === page) return;
    previousPage.current = page;
    document
      .getElementById("factory-page-title")
      ?.focus({ preventScroll: true });
    const id = location.hash.slice(1);
    const target = id && document.getElementById(id);
    if (target && !target.closest("[hidden]")) target.scrollIntoView();
    else window.scrollTo(0, 0);
  }, [page]);
  useEffect(() => {
    savePreference("podcast-theme", theme);
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const isDark = theme === "dark" || (theme === "system" && query.matches);
      document.documentElement.dataset.theme = isDark ? "dark" : "light";
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute("content", isDark ? "#171324" : "#f8f7fc");
    };
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, [theme]);

  useEffect(() => {
    let disposed = false;
    if (!navigator.locks) {
      setTabGuard("unsupported");
      return;
    }
    const acquire = () => {
      if (disposed) return;
      setTabGuard("waiting");
      tabLockTask.current = navigator.locks
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

  useEffect(() => {
    const net = () => setOnline(navigator.onLine);
    window.addEventListener("online", net);
    window.addEventListener("offline", net);
    return () => {
      window.removeEventListener("online", net);
      window.removeEventListener("offline", net);
    };
  }, []);

  useEffect(() => {
    if (import.meta.env.DEV || !("serviceWorker" in navigator)) return;
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
        if (r.waiting) setWaiting(r.waiting);
        r.addEventListener("updatefound", () => {
          const w = r.installing;
          w?.addEventListener("statechange", () => {
            if (w.state === "installed" && navigator.serviceWorker.controller)
              setWaiting(w);
          });
        });
      })
      .catch(() => setError("shell.update.offlineFailed"));
    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", changed);
    };
  }, []);

  async function update() {
    if (!waiting || factoryUpdateBlocked || updating || updateLock.current)
      return;
    if (!navigator.locks || tabGuard !== "held") {
      setError("shell.update.coordinationUnsupported");
      return;
    }
    updateLock.current = true;
    setUpdating(true);
    releaseTab.current?.();
    try {
      await tabLockTask.current;
      await navigator.locks.request(
        "podcast-studio-update",
        { mode: "exclusive", ifAvailable: true },
        async (lock) => {
          if (!lock) {
            setError("shell.update.otherTabsActive");
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
            setError("shell.update.approvalFailed");
            return false;
          }
          await new Promise<void>((resolve) => setTimeout(resolve, 10000));
          applyingUpdate.current = false;
          setError("shell.update.incomplete");
          return false;
        },
      );
    } catch {
      setError("shell.update.coordinationFailed");
    } finally {
      applyingUpdate.current = false;
      updateLock.current = false;
      setUpdating(false);
      acquireTab.current?.();
    }
  }

  if (tabGuard === "waiting")
    return (
      <main className="loading">
        <h1>{t("common.productName")}</h1>
        <p>{t("shell.update.waiting")}</p>
      </main>
    );
  return (
    <Factory
      page={page}
      visible
      navigation={navigation}
      theme={theme}
      setTheme={setTheme}
      online={online}
      updateReady={!!waiting}
      updating={updating}
      updateBlocked={factoryUpdateBlocked}
      updateError={error ? t(error) : ""}
      onUpdate={() => void update()}
      onUpdateBlockedChange={setFactoryUpdateBlocked}
      pausePlayback={pauseFactoryPlayback}
    />
  );
}
