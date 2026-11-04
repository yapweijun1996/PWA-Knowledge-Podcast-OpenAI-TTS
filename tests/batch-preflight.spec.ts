import { expect, test } from "@playwright/test";

test("validates all paid segments and instructions before contacting the provider", async ({
  page,
}) => {
  let calls = 0;
  await page.route("https://api.openai.com/**", async (route) => {
    calls++;
    await route.fulfill({
      status: 401,
      body: "",
      headers: { "access-control-allow-origin": "*" },
    });
  });
  await page.addInitScript(() => {
    class Peer {
      addTransceiver() {}
      createDataChannel() {
        return { close() {} };
      }
      async createOffer() {
        return { sdp: "offer" };
      }
      async setLocalDescription() {}
      close() {}
    }
    Object.defineProperty(window, "RTCPeerConnection", { value: Peer });
  });
  await page.goto("./");
  await page.getByLabel("生成模式").selectOption("openai");
  await page.getByLabel("OpenAI API key").fill("sk-test-only");
  await page.getByRole("checkbox").check();
  const segment = page.getByLabel("片段 2 脚本");
  await segment.fill("雨".repeat(4001));
  const fourth = page.getByLabel("片段 4 脚本");
  await fourth.fill("风".repeat(4001));
  await page.getByRole("button", { name: "生成 OpenAI 语音" }).click();
  await expect(page.getByRole("alert")).toContainText("片段 2");
  await expect(page.getByRole("alert")).toContainText("片段 4");
  expect(calls).toBe(0);
  await expect(segment).toHaveValue("雨".repeat(4001));

  await segment.fill("这一段已修正。");
  await fourth.fill("另一段也已修正。");
  const instructions = page.getByLabel("Narrator instructions");
  await instructions.fill("a".repeat(2001));
  await page.getByRole("button", { name: "生成 OpenAI 语音" }).click();
  await expect(page.getByRole("alert")).toContainText("旁白指令");
  expect(calls).toBe(0);
  await expect(instructions).toHaveValue("a".repeat(2001));

  await instructions.fill("Speak calmly.");
  await page.getByRole("button", { name: "生成 OpenAI 语音" }).click();
  await expect(page.getByRole("alert")).toContainText("API key 无效或已过期");
  expect(calls).toBe(1);
});
