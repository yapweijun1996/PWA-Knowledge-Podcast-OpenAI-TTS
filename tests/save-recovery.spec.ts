import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("stops a batch when a generated segment cannot be saved and recovers it", async ({
  page,
}) => {
  let providerRequests = 0;
  await page.route("https://api.openai.com/**", async (route) => {
    providerRequests++;
    await route.abort();
  });
  await page.addInitScript(() => {
    const put = IDBObjectStore.prototype.put;
    (window as unknown as { failAudioSave: boolean }).failAudioSave = true;
    IDBObjectStore.prototype.put = function (value, key) {
      if (
        (window as unknown as { failAudioSave: boolean }).failAudioSave &&
        value?.segments?.some((segment: { audio?: Blob }) => segment.audio)
      )
        throw new DOMException("Injected quota failure", "QuotaExceededError");
      return key === undefined
        ? put.call(this, value)
        : put.call(this, value, key);
    };
  });
  await page.goto("./");
  await expect(page.getByText("已保存在此设备")).toBeVisible();
  await page.getByRole("button", { name: "生成模拟提示音" }).click();
  await expect(page.getByRole("alert")).toContainText("已停止生成");
  await page.waitForTimeout(1300);
  await expect(page.getByText("已模拟", { exact: true })).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "下载未保存音频" }),
  ).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载未保存音频" }).click();
  expect((await downloadPromise).suggestedFilename()).toMatch(/\.wav$/);
  await page.evaluate(() => {
    (window as unknown as { failAudioSave: boolean }).failAudioSave = false;
  });
  await page.getByRole("button", { name: "重试保存音频" }).click();
  await expect(
    page.getByRole("button", { name: "下载未保存音频" }),
  ).toHaveCount(0);
  await expect(page.getByText("已保存在此设备")).toBeVisible();
  await page.getByRole("button", { name: "生成模拟提示音" }).click();
  await expect(page.getByText("已模拟", { exact: true })).toHaveCount(5, {
    timeout: 10000,
  });
  expect(providerRequests).toBe(0);
});

for (const deletionFails of [false, true]) {
  test(`continues in another project after deleting the recovery segment${deletionFails ? " and retrying its save" : ""}`, async ({
    page,
  }) => {
    let requests = 0;
    await page.route("https://api.openai.com/**", async (route) => {
      requests++;
      await route.abort();
    });
    await page.addInitScript((failDeletion) => {
      const put = IDBObjectStore.prototype.put;
      let deletionRejected = false;
      IDBObjectStore.prototype.put = function (value, key) {
        if (
          this.name === "projects" &&
          ((value?.segments?.length === 5 &&
            value.segments.some(
              (segment: { audio?: Blob }) => segment.audio,
            )) ||
            (failDeletion &&
              !deletionRejected &&
              value?.segments?.length === 4))
        ) {
          if (value.segments.length === 4) deletionRejected = true;
          throw new DOMException(
            "Injected quota failure",
            "QuotaExceededError",
          );
        }
        return key === undefined
          ? put.call(this, value)
          : put.call(this, value, key);
      };
    }, deletionFails);
    await page.goto("./");
    const status = page.getByRole("status").first();
    await expect(status).toContainText("已保存在此设备");
    const title = page.getByLabel("项目标题");
    const originalTitle = await title.inputValue();
    await page.getByRole("button", { name: "新建项目" }).last().click();
    await title.fill("另一个项目");
    await page.getByLabel("片段 1 脚本").fill("可以继续模拟。");
    await expect(status).toContainText("已保存在此设备");
    await page
      .getByRole("button", { name: originalTitle, exact: true })
      .click();
    await page.getByRole("button", { name: "模拟片段 1", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("已停止生成");

    const download = page.waitForEvent("download");
    const recoveryDownload = page.getByRole("button", {
      name: "下载未保存音频",
    });
    await recoveryDownload.click();
    const downloaded = await download;
    expect(downloaded.suggestedFilename()).toBe("unsaved-segment.wav");
    const bytes = await readFile((await downloaded.path())!);
    expect(bytes.subarray(0, 4).toString()).toBe("RIFF");
    await expect(recoveryDownload).toBeVisible();

    const remove = page.getByRole("button", {
      name: "删除片段 1",
      exact: true,
    });
    if (!deletionFails) {
      page.once("dialog", (dialog) => dialog.dismiss());
      await remove.click();
      await expect(page.getByLabel("片段 5 脚本")).toBeVisible();
      await expect(recoveryDownload).toBeVisible();
    }
    page.once("dialog", (dialog) => dialog.accept());
    await remove.click();
    await expect(page.getByLabel("片段 5 脚本")).toHaveCount(0);
    if (deletionFails) {
      await expect(page.getByRole("alert")).toContainText("保存失败");
      await expect(recoveryDownload).toBeVisible();
      await page.getByRole("button", { name: "重试保存片段删除" }).click();
    }
    await expect(status).toContainText("已保存在此设备");
    await page.getByRole("button", { name: "另一个项目", exact: true }).click();
    await expect(title).toHaveValue("另一个项目");
    await page.getByRole("button", { name: "生成模拟提示音" }).click();
    await expect(status).toContainText("模拟完成");
    await expect(recoveryDownload).toHaveCount(0);
    expect(requests).toBe(0);
  });
}

test("does not send the next BYOK request after a save failure", async ({
  page,
}) => {
  test.setTimeout(30_000);
  let calls = 0;
  await page.route("https://api.openai.com/**", async (route) => {
    calls++;
    await route.fulfill({
      status: 200,
      body: "mock-answer",
      headers: { "access-control-allow-origin": "*" },
    });
  });
  await page.addInitScript(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, key) {
      if (value?.segments?.some((s: { audio?: Blob }) => s.audio))
        throw new DOMException("Injected quota failure", "QuotaExceededError");
      return key === undefined
        ? put.call(this, value)
        : put.call(this, value, key);
    };
    class Channel {
      onopen: (() => void) | null = null;
      onmessage: ((event: { data: string }) => void) | null = null;
      onGenerate: () => void = () => {};
      send(data: string) {
        if (JSON.parse(data).type !== "response.create") return;
        this.onGenerate();
        setTimeout(() => {
          this.onmessage?.({
            data: JSON.stringify({
              type: "response.done",
              response: { status: "completed" },
            }),
          });
          this.onmessage?.({
            data: JSON.stringify({ type: "output_audio_buffer.stopped" }),
          });
        }, 500);
      }
      close() {}
    }
    class Peer {
      channel = new Channel();
      context = new AudioContext();
      destination = this.context.createMediaStreamDestination();
      oscillator = this.context.createOscillator();
      ontrack: ((event: unknown) => void) | null = null;
      constructor() {
        this.oscillator.connect(this.destination);
        this.oscillator.start();
        void this.context.resume();
        this.channel.onGenerate = () =>
          this.oscillator.stop(this.context.currentTime + 0.5);
      }
      addTransceiver() {}
      createDataChannel() {
        return this.channel;
      }
      async createOffer() {
        return { sdp: "offer" };
      }
      async setLocalDescription() {}
      async setRemoteDescription() {
        this.ontrack?.({ track: this.destination.stream.getAudioTracks()[0] });
        this.channel.onopen?.();
        this.channel.onmessage?.({
          data: JSON.stringify({ type: "session.created" }),
        });
      }
      close() {
        void this.context.close();
      }
    }
    Object.defineProperty(window, "RTCPeerConnection", { value: Peer });
  });
  await page.goto("./");
  await expect(page.getByText("已保存在此设备")).toBeVisible();
  await page.getByLabel("生成模式").selectOption("openai");
  await page.getByLabel("OpenAI API key").fill("sk-test-only");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "生成 OpenAI 语音" }).click();
  await expect(page.getByRole("alert")).toContainText("已停止生成", {
    timeout: 15000,
  });
  expect(calls).toBe(1);
  await page.getByRole("button", { name: "生成 OpenAI 语音" }).click();
  await expect(page.getByRole("alert")).toContainText("未保存");
  expect(calls).toBe(1);
  await expect(
    page.getByRole("button", { name: "下载未保存音频" }),
  ).toBeVisible();
});
