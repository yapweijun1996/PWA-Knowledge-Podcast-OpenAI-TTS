import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

for (const { label, session } of [
  { label: "missing confirmation", session: null },
  {
    label: "mismatched confirmation",
    session: {
      model: "gpt-realtime-2.1",
      audio: { output: { voice: "alloy" } },
    },
  },
])
  test(`keeps the run snapshot and truthful provenance with ${label}`, async ({
    page,
  }) => {
    test.setTimeout(30_000);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let calls = 0;
    await page.route("https://api.openai.com/**", async (route) => {
      calls++;
      await gate;
      await route.fulfill({
        status: 200,
        body: "mock-answer",
        headers: { "access-control-allow-origin": "*" },
      });
    });
    await page.addInitScript(
      (
        session: {
          model?: string;
          audio?: { output: { voice: string } };
        } | null,
      ) => {
        class Channel {
          onopen: (() => void) | null = null;
          onmessage: ((event: { data: string }) => void) | null = null;
          onGenerate: () => void = () => {};
          send(data: string) {
            const event = JSON.parse(data);
            if (event.type === "conversation.item.create") {
              const win = window as unknown as { sentTexts: string[] };
              (win.sentTexts ??= []).push(event.item.content[0].text);
            }
            if (event.type !== "response.create") return;
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
            this.ontrack?.({
              track: this.destination.stream.getAudioTracks()[0],
            });
            this.channel.onopen?.();
            this.channel.onmessage?.({
              data: JSON.stringify({ type: "session.created", session }),
            });
          }
          close() {
            void this.context.close();
          }
        }
        Object.defineProperty(window, "RTCPeerConnection", { value: Peer });
      },
      session,
    );
    await page.goto("./");
    await page.getByRole("button", { name: "新建项目" }).first().click();
    await page.getByLabel("片段 1 脚本").fill("第一段。");
    await page.getByRole("button", { name: "添加片段" }).click();
    const script = page.getByLabel("片段 2 脚本");
    await script.fill("原来的脚本。\n  第二行。");
    await page.getByLabel("生成模式").selectOption("openai");
    await page.getByLabel("OpenAI API key").fill("sk-test-only");
    await page.getByRole("checkbox", { name: /我了解/ }).check();
    await page.getByRole("button", { name: "生成 OpenAI 语音" }).click();
    const snapshot = page
      .locator("details")
      .filter({ hasText: "本次生成输入快照" });
    await expect(snapshot).toContainText("原来的脚本。");
    expect(await snapshot.textContent()).toContain("原来的脚本。\n  第二行。");
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await script.fill("编辑后的脚本。");
    await expect(snapshot).toContainText("原来的脚本。");
    release();
    await expect(page.getByText("需重新生成").first()).toBeVisible({
      timeout: 15000,
    });
    await expect(
      page.getByRole("button", { name: "生成 OpenAI 语音" }),
    ).toBeEnabled({ timeout: 15000 });
    await expect(page.getByText("已保存在此设备")).toBeVisible();
    expect(
      await page.evaluate(
        () => (window as unknown as { sentTexts: string[] }).sentTexts,
      ),
    ).toEqual(["第一段。", "原来的脚本。\n  第二行。"]);
    const detail = page
      .locator("details")
      .filter({ hasText: "录音来源与生成输入" })
      .nth(1);
    await detail.locator("summary").click();
    await expect(detail).toContainText("生成时脚本：原来的脚本。");
    await expect(detail).toContainText(
      `服务端会话报告的模型：${session?.model ?? "未知"}`,
    );
    await expect(detail).toContainText(
      `服务端会话报告的声音：${session?.audio.output.voice ?? "未知"}`,
    );
    if (session) await expect(detail).toContainText("服务端会话报告与请求不同");
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "备份脚本与设置" }).click();
    const backup = await readFile((await (await download).path())!, "utf8");
    expect(backup).not.toContain("sk-test-only");
    expect(backup).not.toContain("provenance");
    expect(calls).toBe(2);
    await page.reload();
    await page.getByLabel("生成模式").selectOption("openai");
    const afterReload = page
      .locator("details")
      .filter({ hasText: "录音来源与生成输入" })
      .nth(1);
    await afterReload.locator("summary").click();
    await expect(afterReload).toContainText(
      `服务端会话报告的模型：${session?.model ?? "未知"}`,
    );
    expect(
      await page.evaluate(async () =>
        JSON.stringify(
          await new Promise((resolve, reject) => {
            const request = indexedDB.open("knowledge-podcast-studio");
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
              const get = request.result
                .transaction("projects")
                .objectStore("projects")
                .getAll();
              get.onsuccess = () => resolve(get.result);
              get.onerror = () => reject(get.error);
            };
          }),
        ),
      ),
    ).not.toContain("sk-test-only");
  });
