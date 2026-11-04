import { expect, test } from "@playwright/test";

test("style selection follows actual project instructions", async ({
  page,
}) => {
  let requests = 0;
  await page.route("https://api.openai.com/**", async (route) => {
    requests++;
    await route.abort();
  });
  await page.goto("./");
  const style = page.getByLabel("朗读风格");
  const instructions = page.getByLabel("Narrator instructions");
  await expect(style).toHaveValue("Documentary");
  await instructions.fill("Read with a gentle, even cadence.");
  await expect(style).toHaveValue("Custom");
  await expect(page.getByText("已保存在此设备")).toBeVisible();
  await page.reload();
  await expect(style).toHaveValue("Custom");
  await expect(instructions).toHaveValue("Read with a gentle, even cadence.");
  await style.selectOption("Curious");
  await expect(instructions).toHaveValue(
    "Speak with warmth and curiosity, with natural pauses.",
  );
  await expect(page.getByText("已保存在此设备")).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "备份脚本与设置" }).click();
  const backup = await download;
  await page.getByRole("button", { name: "新建项目" }).first().click();
  await expect(style).toHaveValue("Documentary");
  await page.getByLabel("导入脚本备份").setInputFiles((await backup.path())!);
  await expect(style).toHaveValue("Curious");
  await expect(instructions).toHaveValue(
    "Speak with warmth and curiosity, with natural pauses.",
  );
  await page
    .getByRole("navigation", { name: "项目列表" })
    .getByRole("button", { name: "未命名项目" })
    .click();
  await expect(style).toHaveValue("Documentary");
  expect(requests).toBe(0);
});
