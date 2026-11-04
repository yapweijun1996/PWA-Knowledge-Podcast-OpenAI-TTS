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
    // Model a browser that cannot decode its recorder container. The source,
    // browser audio graph and resulting samples remain real browser APIs.
    AudioContext.prototype.decodeAudioData = async () => {
      throw new DOMException("Unable to decode audio data", "EncodingError");
    };
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
          }, 500);
      }
      close() {
        this.onclose?.();
      }
    }
    class Peer {
      channel = new Channel();
      connectionState = "new";
      context = new AudioContext();
      destination = this.context.createMediaStreamDestination();
      oscillator = this.context.createOscillator();
      ontrack: ((e: unknown) => void) | null = null;
      onconnectionstatechange: (() => void) | null = null;
      constructor() {
        this.oscillator.connect(this.destination);
        this.oscillator.start();
        void this.context.resume();
      }
      addTransceiver() {}
      createDataChannel() {
        return this.channel;
      }
      async createOffer() {
        return { type: "offer", sdp: "mock-offer" };
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
        this.oscillator.stop();
        void this.context.close();
        this.connectionState = "closed";
        this.onconnectionstatechange?.();
      }
    }
    Object.defineProperty(window, "RTCPeerConnection", { value: Peer });
  });
  await page.goto("./");
  await page.evaluate(() => navigator.serviceWorker.ready);
  expect(
    await page.evaluate(
      async () =>
        !!(await caches.match(`${location.pathname}pcm-capture-worklet.js`)),
    ),
  ).toBe(true);
  await page.getByLabel("生成模式").selectOption("openai");
  const key = page.getByLabel("OpenAI API key");
  await key.fill(fakeKey);
  await expect(
    page.getByRole("button", { name: "生成 OpenAI 语音" }),
  ).toBeDisabled();
  expect(calls).toHaveLength(0);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "生成 OpenAI 语音" }).click();
  await expect(page.getByText("已生成")).toHaveCount(5, { timeout: 20000 });
  expect(calls).toEqual(["POST", "POST", "POST", "POST", "POST"]);
  await expect(page.getByRole("status").first()).toContainText(
    "已保存在此设备",
  );
  const wav = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("knowledge-podcast-studio");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const records = await new Promise<
      Array<{ segments: Array<{ audio?: Blob; audioKind?: string }> }>
    >((resolve, reject) => {
      const request = db
        .transaction("projects")
        .objectStore("projects")
        .getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const blob = records
      .flatMap((p) => p.segments)
      .find((s) => s.audioKind === "openai")?.audio;
    if (!blob) throw new Error("Missing generated audio");
    const audioUrl = URL.createObjectURL(blob);
    const media = new Audio(audioUrl);
    const duration = await new Promise<number>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("WAV playback timed out")),
        5000,
      );
      media.onloadedmetadata = () => {
        clearTimeout(timer);
        resolve(media.duration);
      };
      media.onerror = () => {
        clearTimeout(timer);
        reject(new Error("WAV playback failed"));
      };
      media.load();
    });
    URL.revokeObjectURL(audioUrl);
    const bytes = await blob.arrayBuffer();
    const view = new DataView(bytes);
    let nonzero = 0;
    for (let i = 44; i + 1 < bytes.byteLength; i += 2)
      if (view.getInt16(i, true) !== 0) nonzero++;
    return {
      mime: blob.type,
      header: new TextDecoder().decode(bytes.slice(0, 4)),
      wave: new TextDecoder().decode(bytes.slice(8, 12)),
      size: bytes.byteLength,
      rate: view.getUint32(24, true),
      dataSize: view.getUint32(40, true),
      nonzero,
      duration,
    };
  });
  expect(wav.mime).toBe("audio/wav");
  expect(wav.header).toBe("RIFF");
  expect(wav.wave).toBe("WAVE");
  expect(wav.dataSize).toBe(wav.size - 44);
  expect(wav.rate).toBeGreaterThanOrEqual(16000);
  expect(wav.nonzero).toBeGreaterThan(wav.rate / 4);
  expect(wav.duration).toBeGreaterThan(0.25);
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

test("unsupported audio capture fails before any paid request", async ({
  page,
}) => {
  let calls = 0;
  await page.route("https://api.openai.com/**", async (route) => {
    calls++;
    await route.abort();
  });
  await page.addInitScript(() =>
    Object.defineProperty(window, "AudioWorkletNode", { value: undefined }),
  );
  await page.goto("./");
  await page.getByLabel("生成模式").selectOption("openai");
  await page.getByLabel("OpenAI API key").fill(fakeKey);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "生成片段" }).first().click();
  await expect(page.getByRole("alert")).toContainText(
    "此浏览器不支持实时音频采集",
  );
  expect(calls).toBe(0);
});

test("key field is in a form and PWA mobile capability is declared", async ({
  page,
}) => {
  const warnings: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "warning") warnings.push(message.text());
  });
  await page.goto("./");
  await page.getByLabel("生成模式").selectOption("openai");
  await expect(
    page.locator('meta[name="mobile-web-app-capable"]'),
  ).toHaveAttribute("content", "yes");
  expect(
    await page
      .getByLabel("OpenAI API key")
      .evaluate((el) => !!el.closest("form")),
  ).toBe(true);
  expect(
    warnings.some((text) =>
      text.includes("Password field is not contained in a form"),
    ),
  ).toBe(false);
});

test("cancel during audio startup never sends an OpenAI request", async ({
  page,
}) => {
  let calls = 0;
  await page.route("https://api.openai.com/**", async (route) => {
    calls++;
    await route.abort();
  });
  await page.addInitScript(() => {
    AudioContext.prototype.resume = () => new Promise<void>(() => {});
  });
  await page.goto("./");
  await page.getByLabel("生成模式").selectOption("openai");
  await page.getByLabel("OpenAI API key").fill(fakeKey);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "生成片段" }).first().click();
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "生成 OpenAI 语音" }),
  ).toBeEnabled();
  expect(calls).toBe(0);
});
