import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("audio backup restores takes, stale status and handles damage and quota", async ({
  page,
}) => {
  test.setTimeout(45_000);
  let requests = 0;
  await page.route("https://api.openai.com/**", async (route) => {
    requests++;
    await route.abort();
  });
  await page.addInitScript(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, key) {
      if (
        (window as unknown as { failBackupSave: boolean }).failBackupSave &&
        value?.segments?.some((s: { audio?: Blob }) => s.audio)
      )
        throw new DOMException("Injected quota failure", "QuotaExceededError");
      return key === undefined
        ? put.call(this, value)
        : put.call(this, value, key);
    };
  });
  await page.goto("./");
  await page.getByRole("button", { name: "新建项目" }).first().click();
  await page.getByLabel("项目标题").fill("备份测试");
  await page.getByLabel("片段 1 脚本").fill("第一段。");
  await page.getByRole("button", { name: "添加片段" }).click();
  await page.getByLabel("片段 2 脚本").fill("第二段。");
  await page.getByRole("button", { name: "生成模拟提示音" }).click();
  await expect(page.getByText("已模拟", { exact: true })).toHaveCount(2);
  await page.getByRole("button", { name: "重录片段 1" }).click();
  await expect(page.getByText("备选录音", { exact: true })).toBeVisible();
  await page.getByLabel("片段 2 脚本").fill("第二段已编辑。");
  await expect(page.getByText("需重新生成", { exact: true })).toHaveCount(1);
  await expect(page.getByText("已保存在此设备")).toBeVisible();
  await page.getByLabel("生成模式").selectOption("openai");
  await page.getByLabel("OpenAI API key").fill("sk-test-only");
  await page.getByLabel("生成模式").selectOption("demo");
  page.once("dialog", (dialog) => dialog.accept());
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "备份脚本与音频" }).click();
  const data = await readFile((await (await download).path())!, "utf8");
  expect(data).not.toContain("sk-test-only");
  const backup = JSON.parse(data);
  expect(backup.segments[0].take.audio).toBeTruthy();
  expect(backup.segments[0].alternative.audio).toBeTruthy();
  expect(backup.segments[1].take.audioFor).toBe("第二段。");
  // Synthetic fixture: exercise preservation of paid-take metadata without a provider call.
  backup.segments[0].take.audioKind = "openai";
  backup.segments[0].take.provenance = {
    requestedModel: "gpt-realtime-2.1-mini",
    requestedInstructions: "Read the script.",
    effectiveModel: "gpt-realtime-2.1-mini",
    effectiveVoice: "marin",
  };
  const savedData = JSON.stringify(backup);
  await page.getByRole("button", { name: "新建项目" }).first().click();
  await page.getByLabel("导入音频备份").setInputFiles({
    name: "audio.json",
    mimeType: "application/json",
    buffer: Buffer.from(savedData),
  });
  await expect(page.getByText("音频备份已导入并保存")).toBeVisible();
  await expect(page.getByLabel("项目标题")).toHaveValue("备份测试");
  await page.getByLabel("生成模式").selectOption("openai");
  await expect(page.getByText("备选录音", { exact: true })).toBeVisible();
  await expect(page.getByText("需重新生成", { exact: true })).toHaveCount(1);
  await page.reload();
  await page.getByLabel("生成模式").selectOption("openai");
  await expect(page.getByText("备选录音", { exact: true })).toBeVisible();
  await expect(page.getByText("需重新生成", { exact: true })).toHaveCount(1);
  page.once("dialog", (dialog) => dialog.accept());
  const repeatDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "备份脚本与音频" }).click();
  const restored = JSON.parse(
    await readFile((await (await repeatDownload).path())!, "utf8"),
  );
  expect(restored.segments).toEqual(backup.segments);
  const corrupted = JSON.parse(savedData);
  corrupted.segments[0].take.sha256 = "0".repeat(64);
  await page.getByLabel("导入音频备份").setInputFiles({
    name: "broken.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(corrupted)),
  });
  await expect(page.getByRole("alert")).toContainText("损坏");
  await page.getByLabel("导入音频备份").setInputFiles({
    name: "huge.json",
    mimeType: "application/json",
    buffer: Buffer.alloc(24 * 1024 * 1024 + 1),
  });
  await expect(page.getByRole("alert")).toContainText("过大");
  await page.evaluate(() => {
    (window as unknown as { failBackupSave: boolean }).failBackupSave = true;
  });
  await page.getByLabel("导入音频备份").setInputFiles({
    name: "audio.json",
    mimeType: "application/json",
    buffer: Buffer.from(savedData),
  });
  await expect(page.getByRole("alert")).toContainText("尚未保存");
  await expect(
    page.getByRole("button", { name: "重试保存项目" }),
  ).toBeVisible();
  await page.evaluate(() => {
    (window as unknown as { failBackupSave: boolean }).failBackupSave = false;
  });
  await page.getByRole("button", { name: "重试保存项目" }).click();
  await expect(page.getByRole("button", { name: "重试保存项目" })).toHaveCount(
    0,
  );
  await expect(page.getByText("已保存在此设备")).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(requests).toBe(0);
});
