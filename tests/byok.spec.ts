import { test, expect } from "@playwright/test";

const fakeKey = "sk-example-browser-test-only";

test("browser BYOK uses a user gesture and never stores the key", async ({
  page,
}) => {
  const calls: string[] = [];
  await page.route(
    "https://api.openai.com/v1/realtime/calls",
    async (route) => {
      calls.push(route.request().method());
      expect(route.request().headers().authorization).toBe(`Bearer ${fakeKey}`);
      expect(route.request().postData()).toContain("gpt-realtime-2.1-mini");
      expect(route.request().postData()).not.toContain(fakeKey);
      await route.fulfill({
        status: 200,
        body: "mock-sdp-answer",
        headers: { "access-control-allow-origin": "*" },
      });
    },
  );
  await page.addInitScript(() => {
    class Channel {
      onopen: (() => void) | null = null;
      onclose: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onmessage: ((e: { data: string }) => void) | null = null;
      send(data: string) {
        if (JSON.parse(data).type === "response.create")
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
          }, 20);
      }
      close() {
        this.onclose?.();
      }
    }
    class Peer {
      channel = new Channel();
      connectionState = "new";
      ontrack: ((e: unknown) => void) | null = null;
      onconnectionstatechange: (() => void) | null = null;
      addTransceiver() {}
      createDataChannel() {
        return this.channel;
      }
      async createOffer() {
        return { type: "offer", sdp: "mock-offer" };
      }
      async setLocalDescription() {}
      async setRemoteDescription() {
        this.ontrack?.({ track: { kind: "audio", stop() {} } });
        this.channel.onopen?.();
        this.channel.onmessage?.({
          data: JSON.stringify({ type: "session.created" }),
        });
      }
      close() {
        this.connectionState = "closed";
        this.onconnectionstatechange?.();
      }
    }
    class Stream {
      constructor(_tracks: unknown[]) {}
    }
    class Recorder {
      state = "inactive";
      mimeType = "audio/webm";
      ondataavailable: ((e: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(_stream: unknown) {}
      start() {
        this.state = "recording";
      }
      stop() {
        this.state = "inactive";
        this.ondataavailable?.({ data: new Blob(["fake recording"]) });
        this.onstop?.();
      }
    }
    class Context {
      async decodeAudioData() {
        return {
          length: 320,
          duration: 0.02,
          numberOfChannels: 1,
          sampleRate: 16000,
          getChannelData: () => new Float32Array(320).fill(0.1),
        };
      }
      async close() {}
    }
    Object.defineProperty(window, "RTCPeerConnection", { value: Peer });
    Object.defineProperty(window, "MediaStream", { value: Stream });
    Object.defineProperty(window, "MediaRecorder", { value: Recorder });
    Object.defineProperty(window, "AudioContext", { value: Context });
  });
  await page.goto("./");
  await page.getByLabel("生成模式").selectOption("openai");
  const key = page.getByLabel("OpenAI API key");
  await key.fill(fakeKey);
  await expect(
    page.getByRole("button", { name: "生成 OpenAI 语音" }),
  ).toBeDisabled();
  expect(calls).toHaveLength(0);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "生成片段" }).first().click();
  await expect(page.getByText("已生成").first()).toBeVisible({
    timeout: 10000,
  });
  expect(calls).toEqual(["POST"]);
  const storage = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("knowledge-podcast-studio");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const records = await new Promise<unknown[]>((resolve, reject) => {
      const req = db.transaction("projects").objectStore("projects").getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return JSON.stringify({
      records,
      local: JSON.stringify(localStorage),
      session: JSON.stringify(sessionStorage),
      cacheRequests: await Promise.all(
        (await caches.keys()).map(async (name) =>
          (await (await caches.open(name)).keys()).map(
            (request) => request.url,
          ),
        ),
      ),
    });
  });
  expect(storage).not.toContain(fakeKey);
  await page.getByRole("button", { name: "清除 key" }).click();
  await expect(key).toHaveValue("");
  await expect(
    page.getByRole("button", { name: "生成 OpenAI 语音" }),
  ).toBeDisabled();
  await key.fill(fakeKey);
  await page.getByRole("checkbox").check();
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  await expect(key).toHaveValue("");
  await expect(page.getByRole("checkbox")).not.toBeChecked();
  await page.reload();
  await page.getByLabel("生成模式").selectOption("openai");
  await expect(page.getByLabel("OpenAI API key")).toHaveValue("");
});

test("provider errors are sanitized and are not automatically retried", async ({
  page,
}) => {
  let calls = 0;
  await page.route(
    "https://api.openai.com/v1/realtime/calls",
    async (route) => {
      calls++;
      await route.fulfill({
        status: 401,
        body: fakeKey,
        headers: { "access-control-allow-origin": "*" },
      });
    },
  );
  await page.addInitScript(() => {
    class Peer {
      connectionState = "new";
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
  await page.getByLabel("OpenAI API key").fill(fakeKey);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "生成片段" }).first().click();
  await expect(page.getByRole("alert")).toContainText("API key 无效或已过期");
  expect(await page.getByRole("alert").innerText()).not.toContain(fakeKey);
  expect(calls).toBe(1);
});
