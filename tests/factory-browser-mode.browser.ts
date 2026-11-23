import { expect, test, type Page } from "@playwright/test";
import { buffer } from "node:stream/consumers";
import { restoreRecord } from "../shared/episode-backup";
import { fakeOpenAI } from "./fixtures/podcast-provider.mjs";

test.use({ serviceWorkers: "block" });

const key = "fixture-only";
const unknown = "请求结果未知，可能已计费。请确认后手动重试。";

async function enterBrowserKey(page: Page) {
  const settings = page.getByRole("region", { name: "浏览器密钥" });
  const input = settings.getByLabel("浏览器 OpenAI 密钥");
  await expect(input).toHaveAttribute("type", "password");
  await input.fill(key);
  const set = settings.getByRole("button", { name: "设置浏览器密钥" });
  await expect(set).toBeDisabled();
  await settings.getByRole("checkbox", { name: /我了解页面代码/ }).check();
  await set.click();
  await expect(input).toHaveValue("");
  await expect(settings.getByRole("status")).toContainText("已设置浏览器密钥");
}

async function assertKeyAbsent(page: Page) {
  const stored = await page.evaluate(async () => {
    function result<T>(request: IDBRequest<T>) {
      return new Promise<T>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }
    const databases = await indexedDB.databases();
    const indexed = await Promise.all(
      databases.map(async ({ name }) => {
        const db = await result(indexedDB.open(name!));
        try {
          return {
            name,
            stores: await Promise.all(
              Array.from(db.objectStoreNames, async (name) => {
                const store = db.transaction(name).objectStore(name);
                const [keys, values] = await Promise.all([
                  result(store.getAllKeys()),
                  result(store.getAll()),
                ]);
                return { name, keys, values };
              }),
            ),
          };
        } finally {
          db.close();
        }
      }),
    );
    return {
      indexed: JSON.stringify(indexed),
      local: JSON.stringify(localStorage),
      session: JSON.stringify(sessionStorage),
      text: document.body.textContent,
      url: location.href,
    };
  });
  expect(stored.indexed).toContain("knowledge-podcast-library");
  for (const [surface, value] of Object.entries(stored))
    expect(value, surface).not.toContain(key);
}

test("browser Studio saves stages without a worker and resumes only after fresh consent", async ({
  page,
  context,
  baseURL,
}) => {
  const origin = new URL(baseURL!).origin;
  const fixture = fakeOpenAI({ dynamic: true, cast: 2 });
  const providerCalls: string[] = [];
  const unexpected: string[] = [];
  let sessionChecks = 0;

  // Only local static files may reach the fixture server.
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === origin && url.pathname.startsWith("/api/studio/")) {
      if (url.pathname === "/api/studio/session" && request.method() === "GET")
        sessionChecks++;
      else unexpected.push(`worker: ${request.method()} ${url.pathname}`);
      await route.fulfill({ status: 404, body: "Not found" });
    } else if (url.origin === origin) {
      await route.continue();
    } else {
      unexpected.push(`external: ${request.method()} ${url.origin}`);
      await route.abort();
    }
  });

  const progress = page.getByRole("region", { name: "浏览器制作进度" });
  await page.route("https://api.openai.com/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const cors = {
      "access-control-allow-origin": origin,
      "access-control-allow-headers": "Authorization, Content-Type",
      "access-control-allow-methods": "POST, OPTIONS",
    };
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: cors });
      return;
    }
    expect(request.method()).toBe("POST");
    const authorization = await request.headerValue("authorization");
    expect(authorization).toBe(`Bearer ${key}`);
    providerCalls.push(path);
    if (path === "/v1/realtime/calls") {
      await expect(progress.getByRole("status")).toHaveText(
        "节目配音（1 / 4）",
      );
      await expect(
        progress.getByRole("button", { name: "取消浏览器制作" }),
      ).toBeEnabled();
      await route.fulfill({
        status: 503,
        headers: cors,
        json: { error: "Fixture unavailable" },
      });
      return;
    }
    expect(path).toBe("/v1/responses");
    const response = await fixture.fetcher(request.url(), {
      headers: { Authorization: authorization },
      redirect: "error",
      body: request.postData()!,
    });
    const stage = fixture.calls.at(-1);
    if (stage === "research")
      await expect(progress.getByRole("status")).toHaveText(
        "网页研究（1 / 2）",
      );
    if (stage === "script")
      await expect(progress.getByRole("status")).toHaveText(
        "节目脚本（1 / 1）",
      );
    await route.fulfill({
      status: response.status,
      headers: cors,
      json: await response.json(),
    });
  });

  await page.goto("/?view=studio");
  const nav = page.getByRole("navigation", { name: "播客工作区导航" });
  const submit = page.getByRole("button", { name: "制作整集播客" });
  await expect(submit).toBeDisabled();
  await expect(page.getByText(/请在设置中添加浏览器密钥/)).toBeVisible();
  await nav.getByRole("link", { name: "自动化" }).click();
  await expect(page.getByText("自动化仅限本机制作进程。")).toBeVisible();
  await expect(
    page.getByText(/请连接本机制作进程后再设置自动化/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "保存偏好并应用排程" }),
  ).toHaveCount(0);

  await nav.getByRole("link", { name: "设置" }).click();
  await enterBrowserKey(page);
  await assertKeyAbsent(page);
  await nav.getByRole("link", { name: "制作台" }).click();
  await expect(page.getByText("可以在浏览器制作")).toBeVisible();
  await expect(page.getByText("费用预估（按用量）")).toBeVisible();
  await page.getByLabel("播客主题").fill("How a park helps its neighborhood");
  await page.getByLabel("主持人数").selectOption("2");
  await expect(submit).toBeDisabled();
  expect(providerCalls).toEqual([]);
  await page.getByRole("checkbox", { name: /同意本次 OpenAI 研究/ }).check();
  await submit.click();

  const episode = page.getByRole("region", { name: "Fixture episode" });
  await expect(episode.getByRole("alert")).toHaveText(unknown);
  const stages = episode.getByRole("list", { name: "制作阶段" });
  await expect(stages.getByText("已保存", { exact: true })).toHaveCount(3);
  await expect(page.getByText(/Did you notice how this works/)).toBeVisible();
  await nav.getByRole("link", { name: "资料库", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Fixture episode", exact: true }),
  ).toBeVisible();

  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "备份本期节目" }).click();
  const backup = await buffer(await (await downloading).createReadStream());
  expect(backup.includes(key)).toBe(false);
  const { episode: saved } = await restoreRecord(
    new Blob([new Uint8Array(backup)]),
  );
  expect(saved.research?.claims).not.toHaveLength(0);
  expect(saved.outline?.chapters).toHaveLength(2);
  expect(saved.script?.turns).toHaveLength(4);
  await assertKeyAbsent(page);
  expect(fixture.calls).toEqual(["research", "audit", "outline", "script"]);
  const initialCalls = [
    ...Array<string>(4).fill("/v1/responses"),
    "/v1/realtime/calls",
  ];
  expect(providerCalls).toEqual(initialCalls);

  await page.reload();
  const resume = page.getByRole("region", { name: "继续浏览器制作" });
  const continueJob = resume.getByRole("button", { name: "继续浏览器制作" });
  const workerRetry = episode.getByRole("button", { name: "重试节目配音" });
  await expect(episode.getByRole("alert")).toHaveText(unknown);
  await expect(workerRetry).toBeVisible();
  await expect(workerRetry).toBeDisabled();
  await expect(continueJob).toBeDisabled();
  await expect(resume.getByText("未连接本机制作进程。")).toBeVisible();
  await expect(resume.getByText(/请在设置中添加浏览器密钥/)).toBeVisible();
  await resume.getByRole("link", { name: "前往设置" }).click();
  await expect(page.getByText(/尚未设置浏览器密钥/)).toBeVisible();
  await enterBrowserKey(page);
  await nav.getByRole("link", { name: "资料库", exact: true }).click();
  await expect(workerRetry).toBeHidden();
  await expect(continueJob).toBeDisabled();
  await context.setOffline(true);
  await expect(workerRetry).toBeVisible();
  await expect(workerRetry).toBeDisabled();
  await expect(resume.getByText("当前离线，联网后才能继续制作。")).toBeVisible();
  await expect(continueJob).toBeDisabled();
  await context.setOffline(false);
  await expect(workerRetry).toBeHidden();
  expect(providerCalls).toEqual(initialCalls);
  await resume.getByRole("checkbox", { name: /我同意本次继续制作/ }).check();
  const retried = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().endsWith("/v1/realtime/calls"),
  );
  await continueJob.click();
  expect((await retried).status()).toBe(503);
  await expect(episode.getByRole("alert")).toHaveText(unknown);
  await expect(stages.getByText("已保存", { exact: true })).toHaveCount(3);
  expect(providerCalls).toEqual([...initialCalls, "/v1/realtime/calls"]);

  await nav.getByRole("link", { name: "设置" }).click();
  await page.getByRole("button", { name: "清除浏览器密钥" }).click();
  await expect(page.getByText(/尚未设置浏览器密钥/)).toBeVisible();
  await assertKeyAbsent(page);
  expect(sessionChecks).toBeGreaterThan(0);
  expect(unexpected).toEqual([]);
});
