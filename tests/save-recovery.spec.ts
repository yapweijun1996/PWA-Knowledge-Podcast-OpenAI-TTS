import { expect, test } from "@playwright/test";

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
