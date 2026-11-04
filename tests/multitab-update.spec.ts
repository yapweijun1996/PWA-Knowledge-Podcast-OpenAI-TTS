import { expect, test } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";

test("blocks update while another tab generates and preserves pending saves offline", async ({
  context,
  page,
}) => {
  test.setTimeout(45_000);
  const original = await readFile("dist/sw.js", "utf8");
  const other = await context.newPage();
  let calls = 0;
  let releaseRequest!: () => void;
  const gate = new Promise<void>((resolve) => {
    releaseRequest = resolve;
  });
  await page.route("https://api.openai.com/**", async (route) => {
    calls++;
    await gate;
    await route.abort().catch(() => {});
  });
  try {
    await page.goto("./");
    await page.getByLabel("片段 1 脚本").fill("第一个标签页的脚本。");
    await expect(page.getByText("已保存在此设备")).toBeVisible();
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await other.goto("./");
    await other.evaluate(async () => {
      const name = (await caches.keys()).find((key) =>
        key.startsWith("podcast-"),
      );
      if (!name) throw new Error("Missing app cache");
      await (
        await caches.open(name)
      ).put("old-only-test.js", new Response("old-asset"));
    });
    await other.getByRole("button", { name: "新建项目" }).first().click();
    await other.getByLabel("项目标题").fill("第二个项目");
    await other.getByLabel("片段 1 脚本").fill("第二个标签页的草稿。");
    await expect(other.getByText("已保存在此设备")).toBeVisible();
    await page.getByLabel("生成模式").selectOption("openai");
    await page.getByLabel("OpenAI API key").fill("sk-test-only");
    await page.getByRole("checkbox", { name: /我了解/ }).check();
    await page.getByRole("button", { name: "生成片段 1" }).click();
    await expect.poll(() => calls).toBe(1);
    await page.evaluate(async () => {
      const win = window as unknown as { releaseIdb: boolean };
      win.releaseIdb = false;
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("knowledge-podcast-studio");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve) => {
        const tx = db.transaction("projects", "readwrite");
        const store = tx.objectStore("projects");
        const loop = () => {
          if (win.releaseIdb) return;
          const request = store.get("__test_lock__");
          request.onsuccess = loop;
        };
        loop();
        resolve();
      });
    });
    await other.getByLabel("片段 1 脚本").fill("等待保存的草稿。");
    await expect(other.getByRole("status").first()).toContainText("正在保存");
    await writeFile(
      "dist/sw.js",
      original.replace(/podcast-([a-f0-9]+)/, "podcast-$1-multitab"),
    );
    await other.evaluate(async () =>
      (await navigator.serviceWorker.getRegistration())?.update(),
    );
    await expect(
      other.getByText("新版本已准备好。", { exact: false }),
    ).toBeVisible({ timeout: 15000 });
    await expect(
      other.getByRole("button", { name: "立即更新" }),
    ).toBeDisabled();
    await page.evaluate(() => {
      (window as unknown as { releaseIdb: boolean }).releaseIdb = true;
    });
    await expect(other.getByText("已保存在此设备")).toBeVisible();
    await other.getByRole("button", { name: "立即更新" }).click();
    await expect(other.getByRole("alert")).toContainText("其他标签页");
    await expect(
      page.getByRole("button", { name: "取消", exact: true }),
    ).toBeVisible();
    expect(calls).toBe(1);
    expect(
      await other.evaluate(async () => {
        const projects = await new Promise<unknown>((resolve, reject) => {
          const request = indexedDB.open("knowledge-podcast-studio");
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const get = request.result
              .transaction("projects")
              .objectStore("projects")
              .getAll();
            get.onsuccess = () => resolve(get.result);
            get.onerror = () => reject(get.error);
          };
        });
        return JSON.stringify({
          local: localStorage,
          session: sessionStorage,
          projects,
        });
      }),
    ).not.toContain("sk-test-only");
    await page.getByRole("button", { name: "取消", exact: true }).click();
    releaseRequest();
    await page.close();
    await other.getByRole("button", { name: "立即更新" }).click();
    await expect(other.getByLabel("片段 1 脚本")).toHaveValue(
      "等待保存的草稿。",
      { timeout: 15000 },
    );
    await context.setOffline(true);
    await other.reload();
    await expect(other.getByLabel("片段 1 脚本")).toHaveValue(
      "等待保存的草稿。",
    );
    await other
      .getByRole("navigation", { name: "项目列表" })
      .getByRole("button", { name: /同一场暴雨/ })
      .click();
    await expect(other.getByLabel("片段 1 脚本")).toHaveValue(
      "第一个标签页的脚本。",
    );
    expect(calls).toBe(1);
  } finally {
    releaseRequest?.();
    await context.setOffline(false);
    await writeFile("dist/sw.js", original);
  }
});

test("without Web Locks, a waiting update is not forced", async ({ page }) => {
  const original = await readFile("dist/sw.js", "utf8");
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "locks", { value: undefined }),
  );
  try {
    await page.goto("./");
    await page.getByLabel("片段 1 脚本").fill("保留草稿。");
    await expect(page.getByText("已保存在此设备")).toBeVisible();
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await writeFile(
      "dist/sw.js",
      original.replace(/podcast-([a-f0-9]+)/, "podcast-$1-no-locks"),
    );
    await page.evaluate(async () =>
      (await navigator.serviceWorker.getRegistration())?.update(),
    );
    await expect(
      page.getByText("新版本已准备好。", { exact: false }),
    ).toBeVisible({ timeout: 15000 });
    await page.getByRole("button", { name: "立即更新" }).click();
    await expect(page.getByRole("alert")).toContainText("关闭所有应用页面");
    expect(
      await page.evaluate(
        async () =>
          (await navigator.serviceWorker.getRegistration())?.waiting?.state,
      ),
    ).toBe("installed");
    await expect(page.getByLabel("片段 1 脚本")).toHaveValue("保留草稿。");
  } finally {
    await writeFile("dist/sw.js", original);
  }
});

test("concurrent project changes preserve generated audio in a conflict copy", async ({
  context,
  page,
}) => {
  let requests = 0;
  await page.route("https://api.openai.com/**", async (route) => {
    requests++;
    await route.abort();
  });
  await page.addInitScript(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, key) {
      if (
        (window as unknown as { failCopy: boolean }).failCopy &&
        value?.title?.includes("冲突副本")
      )
        throw new DOMException("Injected quota failure", "QuotaExceededError");
      return key === undefined
        ? put.call(this, value)
        : put.call(this, value, key);
    };
  });
  await page.goto("./");
  await page.getByLabel("片段 1 脚本").fill("原始旁白。");
  await expect(page.getByText("已保存在此设备")).toBeVisible();
  const other = await context.newPage();
  await other.goto("./");
  await expect(other.getByLabel("片段 1 脚本")).toHaveValue("原始旁白。");
  await page.getByRole("button", { name: "模拟片段 1" }).click();
  await other.getByLabel("片段 1 脚本").fill("另一页的新旁白。");
  await expect(other.getByText("已保存在此设备")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "另存为新项目" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "下载未保存音频" }),
  ).toBeVisible();
  await page.evaluate(() => {
    (window as unknown as { failCopy: boolean }).failCopy = true;
  });
  await page.getByRole("button", { name: "另存为新项目" }).click();
  await expect(page.getByRole("alert")).toContainText("副本尚未保存");
  await expect(
    page.getByRole("button", { name: "下载未保存音频" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "另存为新项目" }),
  ).toBeVisible();
  await page.evaluate(() => {
    (window as unknown as { failCopy: boolean }).failCopy = false;
  });
  await page.getByRole("button", { name: "另存为新项目" }).click();
  await expect(page.getByText("冲突副本已保存在此设备")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "下载未保存音频" }),
  ).toHaveCount(0);
  await expect(page.getByLabel("片段 1 脚本")).toHaveValue("原始旁白。");
  await expect(page.getByText("已模拟", { exact: true }).first()).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("片段 1 脚本")).toHaveValue("原始旁白。");
  await expect(page.getByText("已模拟", { exact: true }).first()).toBeVisible();
  await page
    .getByRole("navigation", { name: "项目列表" })
    .getByRole("button", {
      name: "同一场暴雨，五公里外能差多少？",
      exact: true,
    })
    .click();
  await expect(page.getByLabel("片段 1 脚本")).toHaveValue("另一页的新旁白。");
  expect(requests).toBe(0);
});
