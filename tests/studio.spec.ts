import { test, expect } from "@playwright/test";

test("save, simulate, mark stale and recover offline", async ({
  page,
  context,
}) => {
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "把好奇，讲成故事。" }),
  ).toBeVisible();
  await expect(
    page.getByText("提示音，不是语音", { exact: false }),
  ).toBeVisible();
  const editor = page.getByLabel("片段 1 脚本");
  await editor.fill("这是一段用于测试的脚本。");
  await page.getByRole("button", { name: "生成模拟提示音" }).click();
  await expect(page.getByText("已模拟").first()).toBeVisible({
    timeout: 10000,
  });
  await editor.fill("修改后需要重新生成。");
  await expect(page.getByText("需重新生成").first()).toBeVisible();
  await expect(page.getByText("已保存在此设备")).toBeVisible();
  await page.reload();
  await expect(editor).toHaveValue("修改后需要重新生成。");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.reload();
  await expect(editor).toHaveValue("修改后需要重新生成。");
  await expect(
    page.getByRole("button", { name: "生成模拟提示音" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "生成模拟提示音" }).click();
  await expect(page.getByText("已模拟").first()).toBeVisible();
});
for (const width of [360, 390, 768, 1280, 1440])
  test(`responsive ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("./");
    await expect(
      page.getByRole("heading", { name: "把好奇，讲成故事。" }),
    ).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    );
    expect(overflow).toBe(false);
    if (width === 390 || width === 1440)
      await page.screenshot({
        path: `test-results/studio-${width}.png`,
        fullPage: true,
      });
  });

test("a waiting update needs confirmation and preserves the draft", async ({
  page,
}) => {
  const fs = await import("node:fs/promises");
  const sw = "dist/sw.js";
  const original = await fs.readFile(sw, "utf8");
  try {
    await page.goto("./");
    await expect(page.getByLabel("片段 1 脚本")).toBeVisible();
    await page.getByLabel("片段 1 脚本").fill("更新前的本地草稿。");
    await expect(page.getByText("已保存在此设备")).toBeVisible();
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await fs.writeFile(
      sw,
      original.replace(/podcast-([a-f0-9]+)/, "podcast-$1-test-update"),
    );
    await page.evaluate(async () => {
      const r = await navigator.serviceWorker.getRegistration();
      await r?.update();
    });
    await expect(page.getByText("新版本已准备好。")).toBeVisible({
      timeout: 15000,
    });
    await page.getByRole("button", { name: "立即更新" }).click();
    await expect(page.getByLabel("片段 1 脚本")).toHaveValue(
      "更新前的本地草稿。",
      { timeout: 15000 },
    );
  } finally {
    await fs.writeFile(sw, original);
  }
});

test("a mixed-version install fails without replacing the active worker", async ({
  page,
}) => {
  const fs = await import("node:fs/promises");
  const swPath = "dist/sw.js",
    htmlPath = "dist/index.html";
  const sw = await fs.readFile(swPath, "utf8"),
    html = await fs.readFile(htmlPath, "utf8");
  try {
    await page.goto("./");
    await page.getByLabel("片段 1 脚本").fill("升级前草稿");
    await expect(page.getByText("已保存在此设备")).toBeVisible();
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await fs.writeFile(htmlPath, html + "<!-- incorrect cached release -->");
    await fs.writeFile(
      swPath,
      sw.replace(/podcast-([a-f0-9]+)/, "podcast-$1-stale"),
    );
    const result = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration) throw new Error("Missing registration");
      const state = new Promise<string>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("Worker did not settle")),
          15000,
        );
        registration.addEventListener(
          "updatefound",
          () => {
            const worker = registration.installing;
            if (!worker) return;
            worker.addEventListener("statechange", () => {
              if (
                worker.state === "redundant" ||
                worker.state === "installed"
              ) {
                clearTimeout(timer);
                resolve(worker.state);
              }
            });
          },
          { once: true },
        );
      });
      await registration.update();
      return await state;
    });
    expect(result).toBe("redundant");
    expect(
      await page.evaluate(async () =>
        (await caches.keys()).some((key) => key.endsWith("-stale")),
      ),
    ).toBe(false);
    await page.reload();
    await expect(page.getByLabel("片段 1 脚本")).toHaveValue("升级前草稿");
    await expect(page.getByRole("button", { name: "立即更新" })).toHaveCount(0);
  } finally {
    await fs.writeFile(htmlPath, html);
    await fs.writeFile(swPath, sw);
  }
});
