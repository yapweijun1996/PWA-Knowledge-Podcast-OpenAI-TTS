import { expect, test } from "@playwright/test";
test.use({
  launchOptions: { args: ["--disable-features=WebRtcHideLocalIpsWithMdns"] },
});
test("comparison carries seven responses over real local WebRTC peers", async ({
  page,
}) => {
  test.setTimeout(90000);
  let external = 0;
  await page.route("https://api.openai.com/**", async (route) => {
    external++;
    await route.abort();
  });
  await page.addInitScript(() => {
    const Native = window.RTCPeerConnection,
      originalFetch = window.fetch;
    const state = window as unknown as {
      loopSessions: number;
      loopResponses: number;
    };
    state.loopSessions = 0;
    state.loopResponses = 0;
    let local: RTCPeerConnection;
    const remotes: RTCPeerConnection[] = [];
    class LocalPeer extends Native {
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
      state.loopSessions++;
      const remote = new Native(),
        context = new AudioContext();
      remotes.push(remote);
      await context.resume();
      const destination = context.createMediaStreamDestination();
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
          state.loopResponses++;
          const oscillator = context.createOscillator();
          oscillator.connect(destination);
          oscillator.start();
          oscillator.stop(context.currentTime + 0.5);
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
          }, 500);
        };
      };
      await gather(local);
      await remote.setRemoteDescription(local.localDescription!);
      await remote.setLocalDescription(await remote.createAnswer());
      await gather(remote);
      return new Response(remote.localDescription!.sdp, { status: 200 });
    };
  });
  await page.goto("./");
  await page.getByLabel("生成模式").selectOption("openai");
  await page.getByLabel("OpenAI API key").fill("sk-test-only");
  await page.getByRole("checkbox", { name: /我了解/ }).check();
  await page.getByText("旁白连续性对照（实验）").click();
  await page.getByRole("checkbox", { name: /我已阅读对照/ }).check();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "开始一次旁白对照" }).click();
  await expect(
    page.getByText("对照音频已保存；请逐段试听核验并记录评分"),
  ).toBeVisible({ timeout: 80000 });
  expect(
    await page.evaluate(() => ({
      sessions: (window as unknown as { loopSessions: number }).loopSessions,
      responses: (window as unknown as { loopResponses: number }).loopResponses,
    })),
  ).toEqual({ sessions: 5, responses: 7 });
  expect(external).toBe(0);
});
