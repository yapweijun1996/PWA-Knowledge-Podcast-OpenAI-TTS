import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("adjusts and reverts boundary silence without provider calls", async ({
  page,
}) => {
  let calls = 0;
  await page.route("https://api.openai.com/**", async (route) => {
    calls++;
    await route.abort();
  });
  await page.goto("./");
  await page.getByRole("button", { name: "新建项目" }).first().click();
  await page.getByLabel("片段 1 脚本").fill("第一段。");
  await page.getByRole("button", { name: "添加片段" }).click();
  await page.getByLabel("片段 2 脚本").fill("第二段。");
  await page.getByRole("button", { name: "生成模拟提示音" }).click();
  await expect(page.getByText("已模拟", { exact: true })).toHaveCount(2);
  const player = page.getByLabel("连续试听播放器");
  await page.getByRole("button", { name: "准备连续试听" }).click();
  await expect
    .poll(() => player.evaluate((audio: HTMLAudioElement) => audio.duration))
    .toBeCloseTo(2, 1);
  await page.getByLabel("片段间停顿").selectOption("200");
  await expect(player).toHaveCount(0);
  await page.getByRole("button", { name: "准备连续试听" }).click();
  await expect
    .poll(() => player.evaluate((audio: HTMLAudioElement) => audio.duration))
    .toBeCloseTo(2.2, 1);
  const bytes = await player.evaluate(async (audio: HTMLAudioElement) => {
    const v = new DataView(await (await fetch(audio.src)).arrayBuffer());
    return {
      size: v.getUint32(40, true),
      silence: v.getInt16(44 + 32000 + 100, true),
    };
  });
  expect(bytes).toEqual({ size: 70400, silence: 0 });
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载完整 WAV 提示音" }).click();
  const file = await readFile((await (await download).path())!);
  expect(file.readUInt32LE(40)).toBe(70400);
  await page.getByLabel("片段间停顿").selectOption("0");
  await page.getByRole("button", { name: "准备连续试听" }).click();
  await expect
    .poll(() => player.evaluate((audio: HTMLAudioElement) => audio.duration))
    .toBeCloseTo(2, 1);
  expect(calls).toBe(0);
});
