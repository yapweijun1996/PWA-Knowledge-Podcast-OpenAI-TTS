import { test, expect } from "@playwright/test";

// Host candidates are used only for an isolated same-browser peer connection.
test.use({
  launchOptions: { args: ["--disable-features=WebRtcHideLocalIpsWithMdns"] },
});

type Scenario =
  | "normal"
  | "delayed"
  | "late-tail"
  | "low-ending"
  | "reordered"
  | "disconnected"
  | "cancelled";
for (const scenario of [
  "normal",
  "delayed",
  "late-tail",
  "low-ending",
  "reordered",
  "disconnected",
  "cancelled",
] as Scenario[]) {
  test(`handles real WebRTC audio: ${scenario}`, async ({ page }) => {
    test.setTimeout(30_000);
    let externalRequests = 0;
    await page.route("https://api.openai.com/**", async (route) => {
      externalRequests++;
      await route.abort();
    });
    await page.addInitScript((kind: Scenario) => {
      const NativePeer = window.RTCPeerConnection;
      const originalFetch = window.fetch;
      const NativeAudio = window.Audio;
      Object.defineProperty(window, "Audio", {
        value: function () {
          const element = new NativeAudio();
          (
            window as unknown as { testRemoteSink: HTMLAudioElement }
          ).testRemoteSink = element;
          return element;
        },
      });
      let local: RTCPeerConnection;
      const peers: RTCPeerConnection[] = [];
      class LocalPeer extends NativePeer {
        constructor() {
          super();
          local = this;
        }
      }
      Object.defineProperty(window, "RTCPeerConnection", { value: LocalPeer });
      async function gather(peer: RTCPeerConnection) {
        if (peer.iceGatheringState === "complete") return;
        await new Promise<void>((resolve) => {
          const done = () => {
            if (peer.iceGatheringState === "complete") {
              peer.removeEventListener("icegatheringstatechange", done);
              resolve();
            }
          };
          peer.addEventListener("icegatheringstatechange", done);
          setTimeout(resolve, 2000);
        });
      }
      window.fetch = async (input, init) => {
        if (String(input) !== "https://api.openai.com/v1/realtime/calls")
          return originalFetch(input, init);
        const remote = new NativePeer();
        peers.push(remote);
        const context = new AudioContext();
        await context.resume();
        const destination = context.createMediaStreamDestination();
        const delay = context.createDelay(5);
        delay.delayTime.value = kind === "delayed" ? 3.6 : 0;
        delay.connect(destination);
        remote.addTrack(
          destination.stream.getAudioTracks()[0],
          destination.stream,
        );
        remote.ondatachannel = ({ channel }) => {
          const ready = () =>
            channel.send(JSON.stringify({ type: "session.created" }));
          if (channel.readyState === "open") ready();
          else channel.onopen = ready;
          channel.onmessage = (event) => {
            if (JSON.parse(event.data).type !== "response.create") return;
            (
              window as unknown as { testResponseStarted: boolean }
            ).testResponseStarted = true;
            const oscillator = context.createOscillator();
            const gain = context.createGain();
            oscillator.connect(gain).connect(delay);
            const now = context.currentTime;
            if (kind === "late-tail") {
              gain.gain.setValueAtTime(0.3, now);
              gain.gain.setValueAtTime(0, now + 0.5);
              gain.gain.setValueAtTime(0.3, now + 4);
              gain.gain.setValueAtTime(0, now + 4.5);
              oscillator.start();
              oscillator.stop(now + 4.5);
            } else if (kind === "low-ending") {
              gain.gain.setValueAtTime(0.3, now);
              gain.gain.setValueAtTime(0.0005, now + 0.5);
              gain.gain.setValueAtTime(0, now + 1.3);
              oscillator.start();
              oscillator.stop(now + 1.3);
            } else {
              oscillator.start();
              oscillator.stop(now + 0.6);
            }
            if (kind === "disconnected") {
              setTimeout(() => remote.close(), 250);
              return;
            }
            if (kind === "cancelled") return;
            setTimeout(() => {
              if (kind === "reordered") {
                channel.send(
                  JSON.stringify({ type: "output_audio_buffer.stopped" }),
                );
                return;
              }
              channel.send(
                JSON.stringify({
                  type: "response.done",
                  response: { status: "completed" },
                }),
              );
              channel.send(
                JSON.stringify({ type: "output_audio_buffer.stopped" }),
              );
            }, 600);
          };
        };
        await gather(local);
        await remote.setRemoteDescription(local.localDescription!);
        await remote.setLocalDescription(await remote.createAnswer());
        await gather(remote);
        return new Response(remote.localDescription!.sdp, { status: 200 });
      };
    }, scenario);
    await page.goto("./");
    await page.getByLabel("生成模式").selectOption("openai");
    await page.getByLabel("OpenAI API key").fill("sk-test-only");
    await page.getByRole("checkbox", { name: /我了解/ }).check();
    await page.getByRole("button", { name: "生成片段" }).first().click();
    if (scenario === "cancelled") {
      await page.waitForFunction(
        () =>
          (window as unknown as { testResponseStarted?: boolean })
            .testResponseStarted,
      );
      await page.getByRole("button", { name: "取消", exact: true }).click();
      await expect(page.getByRole("status").first()).toContainText("已取消");
      await expect(page.getByText("待试听核验")).toHaveCount(0);
    } else if (scenario === "reordered" || scenario === "disconnected") {
      await expect(page.getByRole("alert")).toContainText(
        scenario === "reordered" ? "顺序异常" : "连接",
        { timeout: 15000 },
      );
      await expect(page.getByText("待试听核验")).toHaveCount(0);
    } else {
      await expect(page.getByText("待试听核验").first()).toBeVisible({
        timeout: 15000,
      });
      await expect(page.getByText("已核验")).toHaveCount(0);
      const audio = page.locator("audio").first();
      await expect
        .poll(() => audio.evaluate((element) => element.duration))
        .toBeGreaterThan(0.4);
      if (scenario === "late-tail")
        expect(
          await audio.evaluate((element) => element.duration),
        ).toBeLessThan(2);
      expect(
        await page.evaluate(() => {
          const sink = (
            window as unknown as { testRemoteSink: HTMLAudioElement }
          ).testRemoteSink;
          return { muted: sink.muted, released: sink.srcObject === null };
        }),
      ).toEqual({ muted: true, released: true });
    }
    expect(externalRequests).toBe(0);
  });
}
