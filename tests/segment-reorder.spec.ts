import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("keyboard and mobile reordering preserves audio, identity and export order", async ({
  page,
}) => {
  let providerRequests = 0;
  await page.route("https://api.openai.com/**", async (route) => {
    providerRequests++;
    await route.abort();
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./");
  await page.getByRole("button", { name: "打开导航" }).click();
  await page
    .getByRole("dialog", { name: "应用导航" })
    .getByRole("button", { name: "新建项目" })
    .click();
  await page.getByLabel("片段 1 脚本").fill("第一段。");
  await page.getByRole("button", { name: "添加片段" }).click();
  await page.getByLabel("片段 2 脚本").fill("第二段。");
  await page.getByRole("button", { name: "添加片段" }).click();
  await page.getByLabel("片段 3 脚本").fill("第三段。");
  const id = await page.getByLabel("片段 2 脚本").getAttribute("id");
  await page.getByRole("button", { name: "模拟片段 2" }).click();
  await expect(page.getByText("已模拟", { exact: true })).toHaveCount(1);
  const move = page.getByRole("button", { name: "上移片段 2" });
  await expect(move).toBeEnabled({ timeout: 3000 });
  await move.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("片段 1 脚本")).toHaveValue("第二段。");
  expect(await page.getByLabel("片段 1 脚本").getAttribute("id")).toBe(id);
  await expect(page.getByRole("button", { name: "下移片段 1" })).toBeFocused();
  await page.getByRole("button", { name: "下移片段 1" }).click();
  await expect(page.getByLabel("片段 2 脚本")).toHaveValue("第二段。");
  await page.getByRole("button", { name: "上移片段 2" }).click();
  await expect(page.getByText("已模拟", { exact: true })).toHaveCount(1);
  await page.getByRole("button", { name: "生成模拟提示音" }).click();
  await expect(page.getByText("已模拟", { exact: true })).toHaveCount(3);
  await expect(page.getByText("已保存在此设备")).toBeVisible();
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("knowledge-podcast-studio");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const projects = await new Promise<
      Array<{ segments: Array<{ text: string; audio: Blob }> }>
    >((resolve, reject) => {
      const request = db
        .transaction("projects")
        .objectStore("projects")
        .getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const project = projects.find((p) => p.segments.length === 3)!;
    for (const segment of project.segments) {
      const data = await segment.audio.arrayBuffer();
      const marker =
        segment.text === "第一段。"
          ? 111
          : segment.text === "第二段。"
            ? 222
            : 333;
      new DataView(data).setInt16(44, marker, true);
      segment.audio = new Blob([data], { type: "audio/wav" });
    }
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("projects", "readwrite");
      tx.objectStore("projects").put(project);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });
  await page.reload();
  await expect(page.getByLabel("片段 1 脚本")).toHaveValue("第二段。");
  expect(await page.getByLabel("片段 1 脚本").getAttribute("id")).toBe(id);
  await expect(page.getByText("已模拟", { exact: true })).toHaveCount(3);
  const wavDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载完整 WAV 提示音" }).click();
  const wav = await readFile((await (await wavDownload).path())!);
  expect([
    wav.readInt16LE(44),
    wav.readInt16LE(44 + 32000),
    wav.readInt16LE(44 + 64000),
  ]).toEqual([222, 111, 333]);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载脚本 TXT" }).click();
  const text = await readFile((await (await download).path())!, "utf8");
  expect(text).toBe("第二段。\n\n第一段。\n\n第三段。");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(providerRequests).toBe(0);
});
