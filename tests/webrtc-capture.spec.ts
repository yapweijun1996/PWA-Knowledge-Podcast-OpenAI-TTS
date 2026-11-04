import { test, expect } from "@playwright/test";

// Host candidates are used only for an isolated same-browser peer connection.
test.use({
  launchOptions: { args: ["--disable-features=WebRtcHideLocalIpsWithMdns"] },
});

for (const delayMs of [0, 1600]) {
  test(`captures a real WebRTC audio track with ${delayMs}ms delay`, async ({
    page,
  }) => {
    test.setTimeout(30_000);
    let externalRequests = 0;
    await page.route("https://api.openai.com/**", async (route) => {
      externalRequests++;
      await route.abort();
    });
    await page.addInitScript((delay) => {
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
        const delayNode = context.createDelay(3);
        delayNode.delayTime.value = delay / 1000;
        delayNode.connect(destination);
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
            const oscillator = context.createOscillator();
            oscillator.connect(delayNode);
            oscillator.start();
            oscillator.stop(context.currentTime + 0.6);
            setTimeout(() => {
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
    }, delayMs);
    await page.goto("./");
    await page.getByLabel("生成模式").selectOption("openai");
    await page.getByLabel("OpenAI API key").fill("sk-test-only");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "生成片段" }).first().click();
    await expect(page.getByText("已生成").first()).toBeVisible({
      timeout: 15_000,
    });
    expect(externalRequests).toBe(0);
    const audio = page.locator("audio").first();
    await expect
      .poll(() => audio.evaluate((element) => element.duration))
      .toBeGreaterThan(0.4);
    expect(
      await page.evaluate(() => {
        const sink = (window as unknown as { testRemoteSink: HTMLAudioElement })
          .testRemoteSink;
        return { muted: sink.muted, released: sink.srcObject === null };
      }),
    ).toEqual({ muted: true, released: true });
  });
}
