import { test, expect, type Page } from "@playwright/test";

async function startMockGeneration(page: Page, silent = false) {
  let externalRequests = 0;
  await page.route("https://api.openai.com/**", async (route) => {
    externalRequests++;
    await route.fulfill({
      status: 200,
      body: "mock-sdp-answer",
      headers: { "access-control-allow-origin": "*" },
    });
  });
  await page.addInitScript((silent) => {
    class Channel {
      onopen: (() => void) | null = null;
      onclose: (() => void) | null = null;
      onerror: (() => void) | null = null;
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
        }, 600);
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
      gain = this.context.createGain();
      ontrack: ((event: unknown) => void) | null = null;
      onconnectionstatechange: (() => void) | null = null;
      constructor() {
        this.gain.gain.value = 0;
        this.oscillator.connect(this.gain).connect(this.destination);
        this.oscillator.start();
        void this.context.resume();
        this.channel.onGenerate = () => {
          if (silent) return;
          const now = this.context.currentTime;
          this.gain.gain.setValueAtTime(0.3, now + 1.6);
          this.gain.gain.setValueAtTime(0, now + 2.0);
          this.gain.gain.setValueAtTime(0.3, now + 2.8);
          this.gain.gain.setValueAtTime(0, now + 3.2);
        };
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
      }
    }
    Object.defineProperty(window, "RTCPeerConnection", { value: Peer });
  }, silent);
  await page.goto("./");
  await page.getByLabel("生成模式").selectOption("openai");
  await page.getByLabel("OpenAI API key").fill("sk-example-browser-test-only");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "生成片段" }).first().click();
  return () => externalRequests;
}

test("waits for delayed browser audio after the provider finishes", async ({
  page,
}) => {
  test.setTimeout(30_000);
  const calls = await startMockGeneration(page);
  await expect(page.getByText("待试听核验").first()).toBeVisible({
    timeout: 15_000,
  });
  expect(calls()).toBe(1);
  const duration = await page
    .locator("audio")
    .first()
    .evaluate((audio) => audio.duration);
  expect(duration).toBeGreaterThan(1.5);
  expect(duration).toBeLessThan(4);
});

test("reports silence without saving or retrying a paid request", async ({
  page,
}) => {
  test.setTimeout(30_000);
  const calls = await startMockGeneration(page, true);
  await expect(page.getByRole("alert")).toContainText("未收到可听见的音频", {
    timeout: 15_000,
  });
  expect(calls()).toBe(1);
  await expect(page.getByText("待试听核验")).toHaveCount(0);
});
