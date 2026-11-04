import { expect, test } from "@playwright/test";

test("OpenAI audio stays unverified until a listener confirms it", async ({
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
  await page.getByRole("button", { name: "新建项目" }).first().click();
  await page.getByLabel("片段 1 脚本").fill("这是一个用于试听核验的片段。");
  await page.getByLabel("生成模式").selectOption("openai");
  await page.getByLabel("OpenAI API key").fill("sk-test-only");
  await page.getByRole("checkbox", { name: /我了解/ }).check();
  await page.getByRole("button", { name: "生成片段" }).first().click();
  await expect(page.getByText("待试听核验").first()).toBeVisible({
    timeout: 15000,
  });
  await page.getByRole("button", { name: "下载完整 WAV 语音" }).click();
  await expect(page.getByRole("alert")).toContainText("核验");
  expect(calls).toBe(1);
  const confirmed = page.getByRole("checkbox", { name: "确认片段 1 音频完整" });
  await confirmed.check();
  await expect(page.getByText("已核验").first()).toBeVisible();
  await expect(page.getByText("已保存在此设备")).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载完整 WAV 语音" }).click();
  expect((await download).suggestedFilename()).toBe("podcast.wav");
  await page.reload();
  await page.getByLabel("生成模式").selectOption("openai");
  await expect(
    page.getByRole("checkbox", { name: "确认片段 1 音频完整" }),
  ).toBeChecked();
  // A pre-upgrade audio record has no confirmation and must stay unverified.
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("knowledge-podcast-studio");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("projects", "readwrite");
      const store = tx.objectStore("projects");
      const request = store.getAll();
      request.onsuccess = () => {
        const project = request.result.find((p) =>
          p.segments.some((s: { audio?: Blob }) => s.audio),
        );
        delete project.segments[0].audioVerified;
        store.put(project);
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });
  await page.reload();
  await page.getByLabel("生成模式").selectOption("openai");
  await expect(
    page.getByRole("checkbox", { name: "确认片段 1 音频完整" }),
  ).not.toBeChecked();
  await expect(page.getByText("待试听核验").first()).toBeVisible();
  expect(calls).toBe(1);
});
