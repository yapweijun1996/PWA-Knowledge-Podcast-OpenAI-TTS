import { expect, test } from "@playwright/test";

test("warns before closing while an edit is awaiting local storage", async ({
  context,
  page,
}) => {
  await page.goto("./");
  await expect(page.getByText("已保存在此设备")).toBeVisible();
  const blocker = await context.newPage();
  await blocker.goto("./");
  await blocker.evaluate(async () => {
    const win = window as unknown as { releaseIdb: boolean };
    win.releaseIdb = false;
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("knowledge-podcast-studio");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const tx = db.transaction("projects", "readwrite");
    const store = tx.objectStore("projects");
    const loop = () => {
      if (win.releaseIdb) return;
      const req = store.get("__test_lock__");
      req.onsuccess = loop;
    };
    loop();
  });
  try {
    await page.getByLabel("片段 1 脚本").fill("等待保存的改动。");
    await expect(page.getByRole("status").first()).toContainText("正在保存");
    let dialogType = "";
    page.once("dialog", async (dialog) => {
      dialogType = dialog.type();
      await dialog.dismiss();
    });
    await page.reload({ timeout: 3000 }).catch(() => {});
    expect(dialogType).toBe("beforeunload");
    await expect(page.getByLabel("片段 1 脚本")).toHaveValue(
      "等待保存的改动。",
    );
  } finally {
    await blocker.evaluate(() => {
      (window as unknown as { releaseIdb: boolean }).releaseIdb = true;
    });
  }
  await expect(page.getByText("已保存在此设备")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("片段 1 脚本")).toHaveValue("等待保存的改动。");
});
