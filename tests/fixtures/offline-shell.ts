export async function waitForOfflineShell(timeoutMs: number) {
  const workers = navigator.serviceWorker;
  if (!workers) throw new Error("Service workers are unavailable");

  const listeners = new AbortController();
  let phase = "an active registration (precache must finish first)";
  let timer: number | undefined;
  try {
    await Promise.race([
      (async () => {
        const { scope } = await workers.ready;
        listeners.signal.throwIfAborted();
        phase = "an activated controller for this tab";
        await new Promise<void>((resolve) => {
          let observed: ServiceWorker | null = null;
          function checkController() {
            const controller = workers.controller;
            if (observed !== controller) {
              observed?.removeEventListener("statechange", checkController);
              observed = controller;
              observed?.addEventListener("statechange", checkController, {
                signal: listeners.signal,
              });
            }
            if (controller?.state === "activated") resolve();
          }
          workers.addEventListener("controllerchange", checkController, {
            signal: listeners.signal,
          });
          checkController();
        });

        // The worker maps deep-link navigations to its scope URL in Cache Storage.
        phase = `the cached navigation shell at ${scope}`;
        const shell = await caches.match(scope, { ignoreVary: true });
        if (!shell?.ok)
          throw new Error(`Missing offline navigation shell at ${scope}`);
      })(),
      new Promise<never>((_, reject) => {
        timer = window.setTimeout(() => {
          reject(
            new Error(`Timed out waiting for ${phase} on ${location.pathname}`),
          );
        }, timeoutMs);
      }),
    ]);
  } finally {
    window.clearTimeout(timer);
    listeners.abort();
  }
}
