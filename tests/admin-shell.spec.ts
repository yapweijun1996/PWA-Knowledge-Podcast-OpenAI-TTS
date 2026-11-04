import { test, expect } from "@playwright/test";

test("desktop sidebar, sticky header and appearance persist", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("./");
  await expect(
    page.getByRole("navigation", { name: "工作区导航" }),
  ).toBeVisible();
  const sidebar = page.locator("#app-navigation");
  await page.getByRole("button", { name: "收起侧边栏" }).click();
  expect(
    await sidebar.evaluate((el) =>
      Math.round(el.getBoundingClientRect().width),
    ),
  ).toBe(64);
  await expect(
    page.getByRole("button", { name: "展开侧边栏" }),
  ).toHaveAttribute("aria-expanded", "false");
  const scriptLink = page.getByRole("link", { name: "脚本编辑" });
  await scriptLink.focus();
  const tooltip = page.getByRole("tooltip");
  await expect(tooltip).toHaveText("脚本编辑");
  await expect(scriptLink).toHaveAttribute("aria-describedby", "sidebar-hint");
  const [tooltipBox, sidebarBox] = await Promise.all([
    tooltip.boundingBox(),
    sidebar.boundingBox(),
  ]);
  expect(tooltipBox!.x).toBeGreaterThanOrEqual(
    sidebarBox!.x + sidebarBox!.width,
  );
  expect(tooltipBox!.y).toBeGreaterThanOrEqual(0);
  await page.reload();
  await expect(page.getByRole("button", { name: "展开侧边栏" })).toBeVisible();
  await page.getByRole("button", { name: "展开侧边栏" }).click();
  await page.getByRole("link", { name: "设置", exact: true }).click();
  await expect(page.getByRole("heading", { name: "设置" })).toBeInViewport();
  await page.getByRole("link", { name: "设置浏览器 BYOK" }).click();
  await expect(page.getByRole("link", { name: "生成音频" })).toHaveAttribute(
    "aria-current",
    "location",
  );
  await page.goBack();
  await expect(
    page.getByRole("link", { name: "设置", exact: true }),
  ).toHaveAttribute("aria-current", "location");
  const top = await page.locator(".top").boundingBox();
  expect(top?.y).toBe(0);
  await page.getByLabel("外观").selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.getByLabel("外观")).toHaveValue("dark");
  await page.getByLabel("外观").selectOption("light");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByLabel("外观").selectOption("system");
});

test("mobile drawer navigation is accessible and keeps BYOK in memory", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./");
  const menu = page.getByRole("button", { name: "打开导航" });
  await menu.click();
  const drawer = page.getByRole("dialog", { name: "应用导航" });
  await expect(drawer).toBeVisible();
  await expect(
    page.getByRole("button", { name: "关闭导航" }).last(),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await expect(menu).toBeFocused();
  await menu.click();
  await drawer.getByRole("link", { name: "生成音频" }).click();
  await expect(drawer).toBeHidden();
  await expect(page.getByLabel("生成模式")).toBeInViewport();
  await page.getByLabel("生成模式").selectOption("openai");
  const key = page.getByLabel("OpenAI API key");
  await key.fill("sk-example-not-a-real-key");
  await page.getByRole("checkbox").check();
  await menu.click();
  await drawer.getByRole("link", { name: "脚本编辑" }).click();
  await expect(page.getByLabel("片段 1 脚本")).toBeVisible();
  await menu.click();
  await drawer.getByRole("link", { name: "生成音频" }).click();
  await expect(key).toHaveValue("sk-example-not-a-real-key");
  await expect(page.getByRole("checkbox")).toBeChecked();
  await page.getByRole("button", { name: "清除 key" }).click();
  await expect(key).toHaveValue("");
  await menu.click();
  await drawer.getByRole("button", { name: "新建项目" }).click();
  await expect(drawer).toBeHidden();
  await expect(page.getByLabel("项目标题")).toHaveValue("未命名项目");
  await expect(page.getByLabel("片段 1 脚本")).toBeInViewport();
  await menu.click();
  await page
    .getByRole("button", { name: "关闭导航" })
    .first()
    .click({ position: { x: 380, y: 400 } });
  await expect(drawer).toBeHidden();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
});

test("long project names and the app bar fit a narrow mobile screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("./");
  await page.getByLabel("项目标题").fill("很长的播客项目名称".repeat(12));
  const header = await page.evaluate(() => ({
    left: document.querySelector(".top-left")!.getBoundingClientRect().right,
    right: document.querySelector(".top-right")!.getBoundingClientRect().left,
  }));
  expect(header.left).toBeLessThanOrEqual(header.right);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await page.getByRole("button", { name: "打开导航" }).click();
  await expect(page.getByRole("dialog", { name: "应用导航" })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
});

test("an unsaved project blocks updates even after another project saves", async ({
  page,
}) => {
  const fs = await import("node:fs/promises");
  const swPath = "dist/sw.js";
  const original = await fs.readFile(swPath, "utf8");
  try {
    await page.addInitScript(() => {
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (value, ...args) {
        if (value?.title === "FAIL_PROJECT")
          throw new DOMException("Injected failure", "QuotaExceededError");
        return put.call(this, value, ...args);
      };
    });
    await page.goto("./");
    await page.getByLabel("项目标题").fill("FAIL_PROJECT");
    await expect(page.getByRole("alert")).toContainText("保存失败");
    await page.getByRole("button", { name: "新建项目" }).last().click();
    await expect(page.getByRole("status").first()).toContainText(
      "部分项目保存失败",
    );
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await fs.writeFile(
      swPath,
      original.replace(/podcast-([a-f0-9]+)/, "podcast-$1-save-test"),
    );
    await page.evaluate(async () => {
      const r = await navigator.serviceWorker.getRegistration();
      await r?.update();
    });
    await expect(
      page.getByText("有项目尚未保存，请先解决保存问题。"),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "立即更新" })).toBeDisabled();
    await page.getByRole("button", { name: "FAIL_PROJECT" }).click();
    await page.getByLabel("项目标题").fill("RECOVERED");
    await expect(page.getByRole("button", { name: "立即更新" })).toBeEnabled();
  } finally {
    await fs.writeFile(swPath, original);
  }
});

test("a pending backup import cannot replace a project during generation", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const text = Blob.prototype.text;
    Blob.prototype.text = async function () {
      await new Promise((resolve) => setTimeout(resolve, 900));
      return text.call(this);
    };
  });
  await page.goto("./");
  const originalTitle = await page.getByLabel("项目标题").inputValue();
  const backup = {
    format: "podcast-studio-project",
    version: 1,
    project: {
      title: "Unexpected import",
      language: "zh-CN",
      voice: "marin",
      instructions: "",
      notes: "",
      segments: [{ text: "script" }],
    },
  };
  await page.locator('input[type="file"]').setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await page.getByRole("button", { name: "生成模拟提示音" }).click();
  await expect(page.locator('input[type="file"]')).toBeDisabled();
  await expect(page.getByRole("alert")).toContainText("导入期间项目状态已变化");
  await expect(page.getByLabel("项目标题")).toHaveValue(originalTitle);
  await page.getByRole("button", { name: "取消", exact: true }).click();
});

test("deleting a project locks editing and project switches until deletion completes", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const delayed = new WeakSet<IDBRequest>();
    const remove = IDBObjectStore.prototype.delete;
    IDBObjectStore.prototype.delete = function (key) {
      const req = remove.call(this, key);
      delayed.add(req);
      return req;
    };
    const listen = IDBRequest.prototype.addEventListener;
    IDBRequest.prototype.addEventListener = function (type, listener, options) {
      if (
        type === "success" &&
        delayed.has(this) &&
        typeof listener === "function"
      ) {
        const request = this;
        return listen.call(
          this,
          type,
          (event) => setTimeout(() => listener.call(request, event), 900),
          options,
        );
      }
      return listen.call(this, type, listener, options);
    };
  });
  await page.goto("./");
  await page.getByLabel("项目标题").fill("Project A");
  await expect(page.getByRole("status").first()).toContainText(
    "已保存在此设备",
  );
  await page.getByRole("button", { name: "新建项目" }).last().click();
  await page.getByLabel("项目标题").fill("Project B");
  await expect(page.getByRole("status").first()).toContainText(
    "已保存在此设备",
  );
  page.on("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "删除此项目" }).click();
  await expect(page.getByLabel("项目标题")).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "新建项目" }).last(),
  ).toBeDisabled();
  await expect(page.getByRole("button", { name: "Project A" })).toBeDisabled();
  await expect(page.locator('input[type="file"]')).toBeDisabled();
  await expect(page.getByLabel("项目标题")).toHaveValue("Project A");
  await expect(page.getByLabel("项目标题")).toBeEnabled();
  await page.reload();
  await expect(page.getByLabel("项目标题")).toHaveValue("Project A");
  await expect(page.getByRole("button", { name: "Project B" })).toHaveCount(0);
});
