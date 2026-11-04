import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("offline demo works and export skips blank segments without provider calls", async ({
  page,
  context,
}) => {
  let requests = 0;
  await page.route("https://api.openai.com/**", async (route) => {
    requests++;
    await route.abort();
  });
  await page.goto("./");
  await page.getByRole("button", { name: "新建项目" }).first().click();
  await page.getByLabel("片段 1 脚本").fill("离线演示。");
  await page.getByRole("button", { name: "添加片段" }).click();
  await expect(page.getByText("已保存在此设备")).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await page.waitForFunction(() => !navigator.onLine);
  const generate = page.getByRole("button", { name: "生成模拟提示音" });
  await expect(generate).toBeEnabled();
  await generate.click();
  await expect(page.getByText("已模拟", { exact: true })).toHaveCount(1);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载完整 WAV 提示音" }).click();
  const bytes = await readFile((await (await download).path())!);
  expect(bytes.subarray(0, 4).toString()).toBe("RIFF");
  await page.getByLabel("生成模式").selectOption("openai");
  await page.getByLabel("OpenAI API key").fill("sk-test-only");
  await page.getByRole("checkbox", { name: /我了解/ }).check();
  await expect(
    page.getByRole("button", { name: "生成 OpenAI 语音" }),
  ).toBeDisabled();
  expect(requests).toBe(0);
});
