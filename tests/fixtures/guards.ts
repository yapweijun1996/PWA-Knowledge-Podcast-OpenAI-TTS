import {
  expect,
  test as base,
  type Download,
  type Page,
  type Route,
} from "@playwright/test";
import { inspect } from "node:util";

// Deliberately omit continue, fallback and fetch from external mocks.
type MockRoute = Pick<Route, "request" | "fulfill" | "abort">;
export type ProviderMock = (route: MockRoute) => Promise<void>;
type Evidence = {
  console: Promise<unknown[]>[];
  downloads: Download[];
  history: Set<string>;
};
const evidence = new WeakMap<Page, Evidence>();

function observe(page: Page) {
  const recorded: Evidence = {
    console: [],
    downloads: [],
    history: new Set([page.url()]),
  };
  evidence.set(page, recorded);
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) recorded.history.add(frame.url());
  });
  page.on("console", (message) => {
    recorded.console.push(
      Promise.all([
        message.text(),
        message.location().url,
        ...message.args().map((arg) => arg.jsonValue().catch(() => undefined)),
      ]),
    );
  });
  page.on("download", (download) => recorded.downloads.push(download));
}

async function downloadContains(download: Download, key: string) {
  if (download.suggestedFilename().includes(key)) return true;
  const needle = Buffer.from(key);
  let tail = Buffer.alloc(0);
  // KPS payloads and the publish ZIP entries are stored without compression.
  for await (const chunk of await download.createReadStream()) {
    const bytes = Buffer.concat([tail, chunk]);
    if (bytes.includes(needle)) return true;
    tail = bytes.subarray(Math.max(0, bytes.length - needle.length + 1));
  }
  return false;
}

/** Run after submitting the key, so a key left in an input counts as a leak. */
export async function scanForKey(page: Page, key: string): Promise<string[]> {
  const recorded = evidence.get(page);
  if (!recorded || !key)
    throw new Error("A guarded page and test key are required");

  const browserLeaks = await page.evaluate(async (key) => {
    const leaks = new Set<string>();
    const decoder = new TextDecoder();
    const encodedKey = encodeURIComponent(key);
    const checkText = (surface: string, text: string) => {
      if (text.includes(key) || text.includes(encodedKey)) leaks.add(surface);
    };
    async function check(
      surface: string,
      value: unknown,
      seen = new WeakSet(),
    ) {
      if (typeof value === "string") {
        checkText(surface, value);
      } else if (value && typeof value === "object" && !seen.has(value)) {
        seen.add(value);
        if (value instanceof Blob) {
          if (value instanceof File) checkText(surface, value.name);
          checkText(surface, value.type);
          checkText(surface, await value.text());
        } else if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
          checkText(surface, decoder.decode(value));
        } else if (value instanceof Map || value instanceof Set) {
          for (const entry of value) await check(surface, entry, seen);
        } else {
          for (const [field, item] of Object.entries(value)) {
            checkText(surface, field);
            await check(surface, item, seen);
          }
        }
      }
    }

    for (const [surface, storage] of [
      ["localStorage", localStorage],
      ["sessionStorage", sessionStorage],
    ] as const) {
      for (let index = 0; index < storage.length; index++) {
        const name = storage.key(index)!;
        checkText(surface, name);
        checkText(surface, storage.getItem(name)!);
      }
    }
    checkText("document.cookie", document.cookie);
    checkText("current URL", location.href);
    await check("history", history.state);
    const navigation = (
      window as Window & {
        navigation?: {
          entries(): { url: string | null; getState(): unknown }[];
        };
      }
    ).navigation;
    for (const entry of navigation?.entries() ?? []) {
      checkText("history", entry.url ?? "");
      await check("history", entry.getState());
    }

    function result<T>(request: IDBRequest<T>) {
      return new Promise<T>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }
    for (const { name } of await indexedDB.databases()) {
      if (name === undefined) continue;
      checkText("IndexedDB", name);
      const db = await result(indexedDB.open(name));
      try {
        for (const name of db.objectStoreNames) {
          checkText("IndexedDB", name);
          const store = db.transaction(name).objectStore(name);
          const data = await Promise.all([
            result(store.getAllKeys()),
            result(store.getAll()),
          ]);
          await check("IndexedDB", data);
        }
      } finally {
        db.close();
      }
    }

    for (const name of await caches.keys()) {
      checkText("Cache Storage", name);
      const cache = await caches.open(name);
      for (const request of await cache.keys()) {
        checkText("Cache Storage", request.url);
        const response = await cache.match(request, { ignoreVary: true });
        if (!response)
          throw new Error("A cache entry disappeared during the scan");
        checkText("Cache Storage", response.url);
        const type = response.headers.get("content-type") ?? "";
        if (
          !type ||
          /^(text\/)|json|xml|javascript|form-urlencoded/i.test(type)
        ) {
          checkText("Cache Storage", await response.text());
        }
      }
    }

    function checkDOM(root: Document | ShadowRoot) {
      const content = root instanceof Document ? root.body : root;
      checkText("DOM text", content.textContent ?? "");
      if (content instanceof HTMLElement)
        checkText("DOM text", content.innerText);
      for (const element of root.querySelectorAll("*")) {
        for (const { name, value } of element.attributes) {
          checkText("DOM attributes", name);
          checkText("DOM attributes", value);
        }
        if (
          element instanceof HTMLInputElement ||
          element instanceof HTMLTextAreaElement
        ) {
          checkText("DOM form values", element.value);
        }
        if (element.shadowRoot) checkDOM(element.shadowRoot);
      }
    }
    checkDOM(document);
    return [...leaks];
  }, key);

  const leaks = new Set(browserLeaks);
  if (
    [...recorded.history].some(
      (url) => url.includes(key) || url.includes(encodeURIComponent(key)),
    )
  )
    leaks.add("history");
  const consoleMessages = await Promise.all(recorded.console);
  if (
    consoleMessages.some((message) =>
      inspect(message, {
        depth: null,
        maxArrayLength: null,
        maxStringLength: null,
        customInspect: false,
      }).includes(key),
    )
  )
    leaks.add("console");
  if (
    (
      await Promise.all(
        recorded.downloads.map((download) => downloadContains(download, key)),
      )
    ).some(Boolean)
  )
    leaks.add("downloads");
  return [...leaks].sort();
}

export const test = base.extend<{
  guard: { mockProvider: (mock: ProviderMock) => void };
  scanForKey: typeof scanForKey;
}>({
  // A service worker can handle a request before Playwright routing sees it.
  serviceWorkers: "block",
  guard: [
    async ({ context, baseURL }, use) => {
      const fixture = new URL(baseURL!);
      if (fixture.protocol !== "http:" || fixture.hostname !== "127.0.0.1")
        throw new Error(
          "The Factory guard requires the loopback fixture server",
        );
      const violations: string[] = [];
      let providerMock: ProviderMock | undefined;
      context.on("page", observe);
      for (const page of context.pages()) observe(page);

      await context.route("**/*", async (route) => {
        const request = route.request();
        const { origin, hostname } = new URL(request.url());
        // The fixture server only redirects within this origin.
        if (origin === fixture.origin) return route.continue();
        if (origin === "https://api.openai.com" && providerMock) {
          let handled = false;
          try {
            await providerMock({
              request: () => request,
              fulfill: async (response) => {
                const status = response?.status ?? 200;
                if (response?.response || (status >= 300 && status < 400))
                  throw new Error(
                    "External mocks must supply a local response without redirects",
                  );
                await route.fulfill(response);
                handled = true;
              },
              abort: async (reason) => {
                await route.abort(reason);
                handled = true;
              },
            });
          } catch (error) {
            violations.push(
              `Provider mock failed for ${request.method()} ${hostname}`,
            );
            if (!handled) await route.abort();
            throw error;
          }
          if (handled) return;
        }
        // Identify the origin without reporting request URLs, headers or bodies.
        violations.push(`Unmocked ${request.method()} to ${hostname}`);
        await route.abort();
      });
      await context.routeWebSocket(/^wss?:\/\//, async (socket) => {
        const url = new URL(socket.url());
        if (url.host === fixture.host && url.protocol === "ws:") {
          socket.connectToServer();
        } else {
          violations.push(`Unmocked WebSocket to ${url.hostname}`);
          await socket.close();
        }
      });

      try {
        await use({
          mockProvider: (mock) => {
            providerMock = mock;
          },
        });
      } finally {
        expect(
          violations,
          "All external requests must use an explicit mock",
        ).toEqual([]);
      }
    },
    { auto: true },
  ],
  scanForKey: async ({ guard }, use) => {
    await use(scanForKey);
  },
});
