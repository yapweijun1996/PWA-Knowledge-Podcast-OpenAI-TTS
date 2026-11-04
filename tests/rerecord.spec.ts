import { expect, test } from "@playwright/test";

test("re-records one segment and keeps both takes for comparison", async ({
  page,
}) => {
  let providerRequests = 0;
  await page.route("https://api.openai.com/**", async (route) => {
    providerRequests++;
    await route.abort();
  });
  await page.goto("./");
  await page.getByRole("button", { name: "模拟片段 1" }).click();
  await expect(page.getByText("已模拟", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "重录片段 1" })).toBeVisible({
    timeout: 3000,
  });
  await page.getByRole("button", { name: "重录片段 1" }).click();
  await expect(page.getByText("备选录音", { exact: true })).toBeVisible();
  await expect(page.getByLabel("播放音频")).toHaveCount(2);
  await expect(page.getByText("已保存在此设备")).toBeVisible();
  await page.reload();
  await expect(page.getByText("备选录音", { exact: true })).toBeVisible();
  await expect(page.getByLabel("播放音频")).toHaveCount(2);
  await page.getByRole("button", { name: "采用备选录音 1" }).click();
  await expect(page.getByLabel("播放音频")).toHaveCount(2);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "移除备选录音 1" }).click();
  await expect(page.getByText("备选录音", { exact: true })).toHaveCount(0);
  expect(providerRequests).toBe(0);
});

test("a rejected or cancelled BYOK re-record preserves the existing take", async ({
  page,
}) => {
  test.setTimeout(30_000);
  let calls = 0;
  let release: (() => void) | undefined;
  await page.route("https://api.openai.com/**", async (route) => {
    calls++;
    if (calls === 1)
      await route.fulfill({
        status: 200,
        body: "mock-answer",
        headers: { "access-control-allow-origin": "*" },
      });
    else if (calls === 2)
      await route.fulfill({
        status: 401,
        body: "",
        headers: { "access-control-allow-origin": "*" },
      });
    else {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      await route.abort().catch(() => {});
    }
  });
  await page.addInitScript(() => {
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
  await page.getByLabel("生成模式").selectOption("openai");
  await page.getByLabel("OpenAI API key").fill("sk-test-only");
  await page.getByRole("checkbox", { name: /我了解/ }).check();
  await page.getByRole("button", { name: "生成片段 1" }).click();
  await expect(
    page.getByText("待试听核验", { exact: true }).first(),
  ).toBeVisible({ timeout: 15000 });
  const original = await page
    .getByLabel("播放音频")
    .first()
    .getAttribute("src");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "重录片段 1" }).click();
  expect(calls).toBe(1);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "重录片段 1" }).click();
  await expect(page.getByRole("alert")).toContainText("API key 无效或已过期");
  expect(calls).toBe(2);
  expect(await page.getByLabel("播放音频").first().getAttribute("src")).toBe(
    original,
  );
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "重录片段 1" }).click();
  await expect.poll(() => calls).toBe(3);
  await page.getByRole("button", { name: "取消", exact: true }).click();
  release?.();
  await expect(page.getByRole("status").first()).toContainText("已取消");
  expect(await page.getByLabel("播放音频").first().getAttribute("src")).toBe(
    original,
  );
  expect(calls).toBe(3);
});

test("a failed candidate save keeps the previous take and allows recovery", async ({
  page,
}) => {
  let providerRequests = 0;
  await page.route("https://api.openai.com/**", async (route) => {
    providerRequests++;
    await route.abort();
  });
  await page.addInitScript(() => {
    const put = IDBObjectStore.prototype.put;
    (window as unknown as { failCandidateSave: boolean }).failCandidateSave =
      true;
    IDBObjectStore.prototype.put = function (value, key) {
      if (
        (window as unknown as { failCandidateSave: boolean })
          .failCandidateSave &&
        value?.segments?.some((s: { alternative?: unknown }) => s.alternative)
      )
        throw new DOMException("Injected quota failure", "QuotaExceededError");
      return key === undefined
        ? put.call(this, value)
        : put.call(this, value, key);
    };
  });
  await page.goto("./");
  await page.getByRole("button", { name: "模拟片段 1" }).click();
  await expect(page.getByText("已模拟", { exact: true }).first()).toBeVisible();
  const original = await page
    .getByLabel("播放音频")
    .first()
    .getAttribute("src");
  await page.getByRole("button", { name: "重录片段 1" }).click();
  await expect(page.getByRole("alert")).toContainText("已停止生成");
  expect(await page.getByLabel("播放音频").first().getAttribute("src")).toBe(
    original,
  );
  await expect(
    page.getByRole("button", { name: "下载未保存音频" }),
  ).toBeVisible();
  await page.evaluate(() => {
    (window as unknown as { failCandidateSave: boolean }).failCandidateSave =
      false;
  });
  await page.getByRole("button", { name: "重试保存音频" }).click();
  await expect(
    page.getByRole("button", { name: "下载未保存音频" }),
  ).toHaveCount(0);
  await expect(page.getByText("备选录音", { exact: true })).toBeVisible();
  expect(providerRequests).toBe(0);
});
