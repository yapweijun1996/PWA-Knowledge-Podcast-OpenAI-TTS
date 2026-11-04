import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

for (const scenario of [
  "success",
  "save-failure",
  "incomplete",
  "cancel-save",
] as const) {
  test(`bounded comparison preserves request order and results: ${scenario}`, async ({
    page,
    context,
  }) => {
    test.setTimeout(65_000);
    const sessions: string[] = [];
    await page.route(
      "https://api.openai.com/v1/realtime/calls",
      async (route) => {
        sessions.push(route.request().postData() ?? "");
        await route.fulfill({
          status: 200,
          body: "mock-answer",
          headers: { "access-control-allow-origin": "*" },
        });
      },
    );
    await page.addInitScript((kind) => {
      const win = window as unknown as {
        spoken: string[];
        responses: number;
        savedAtResponse: number[];
        saveAttempted: boolean;
      };
      win.spoken = [];
      win.responses = 0;
      win.savedAtResponse = [];
      win.saveAttempted = false;
      const get = IDBObjectStore.prototype.get;
      IDBObjectStore.prototype.get = function (key) {
        if (kind === "cancel-save" && win.responses > 0)
          win.saveAttempted = true;
        return get.call(this, key);
      };
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (value, key) {
        if (
          kind === "save-failure" &&
          value?.title?.startsWith("旁白对照 B") &&
          value.segments.filter((s: { audio?: Blob }) => s.audio).length >= 2
        )
          throw new DOMException(
            "Injected quota failure",
            "QuotaExceededError",
          );
        return key === undefined
          ? put.call(this, value)
          : put.call(this, value, key);
      };
      class Channel {
        onopen: (() => void) | null = null;
        onmessage: ((event: { data: string }) => void) | null = null;
        onGenerate: () => void = () => {};
        send(data: string) {
          const event = JSON.parse(data);
          if (event.type === "conversation.item.create")
            win.spoken.push(event.item.content[0].text);
          if (event.type !== "response.create") return;
          win.responses++;
          const status =
            kind === "incomplete" && win.responses === 2
              ? "incomplete"
              : "completed";
          void (async () => {
            const projects = await new Promise<
              Array<{ segments: Array<{ audio?: Blob }> }>
            >((resolve, reject) => {
              const req = indexedDB.open("knowledge-podcast-studio");
              req.onerror = () => reject(req.error);
              req.onsuccess = () => {
                const get = req.result
                  .transaction("projects")
                  .objectStore("projects")
                  .getAll();
                get.onsuccess = () => resolve(get.result);
                get.onerror = () => reject(get.error);
              };
            });
            win.savedAtResponse.push(
              projects
                .flatMap((project) => project.segments)
                .filter((segment) => segment.audio).length,
            );
            this.onGenerate();
            setTimeout(() => {
              this.onmessage?.({
                data: JSON.stringify({
                  type: "response.done",
                  response: { status },
                }),
              });
              this.onmessage?.({
                data: JSON.stringify({ type: "output_audio_buffer.stopped" }),
              });
            }, 400);
          })();
        }
        close() {}
      }
      class Peer {
        channel = new Channel();
        context = new AudioContext();
        destination = this.context.createMediaStreamDestination();
        ontrack: ((event: unknown) => void) | null = null;
        constructor() {
          void this.context.resume();
          this.channel.onGenerate = () => {
            const oscillator = this.context.createOscillator();
            oscillator.connect(this.destination);
            oscillator.start();
            oscillator.stop(this.context.currentTime + 0.4);
          };
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
            data: JSON.stringify({ type: "session.created" }),
          });
        }
        close() {
          void this.context.close();
        }
      }
      Object.defineProperty(window, "RTCPeerConnection", { value: Peer });
    }, scenario);
    await page.goto("./");
    await page.getByLabel("生成模式").selectOption("openai");
    await page.getByLabel("OpenAI API key").fill("sk-test-only");
    await page.getByRole("checkbox", { name: /我了解/ }).check();
    await page.getByText("旁白连续性对照（实验）").click();
    await expect(page.getByText("会话 5 · 方案 C")).toBeVisible();
    await page.getByRole("checkbox", { name: /我已阅读对照/ }).check();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "开始一次旁白对照" }).click();
    if (scenario === "cancel-save") {
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              (window as unknown as { savedAtResponse: number[] })
                .savedAtResponse.length,
          ),
        )
        .toBe(1);
      const blocker = await context.newPage();
      await blocker.goto("./");
      await blocker.evaluate(async () => {
        const win = window as unknown as { releaseIdb: boolean };
        win.releaseIdb = false;
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const req = indexedDB.open("knowledge-podcast-studio");
          req.onerror = () => reject(req.error);
          req.onsuccess = () => resolve(req.result);
        });
        const tx = db.transaction("projects", "readwrite"),
          store = tx.objectStore("projects");
        const loop = () => {
          if (!win.releaseIdb) {
            const req = store.get("__test_lock__");
            req.onsuccess = loop;
          }
        };
        loop();
      });
      try {
        await expect
          .poll(
            () =>
              page.evaluate(
                () =>
                  (window as unknown as { saveAttempted: boolean })
                    .saveAttempted,
              ),
            { timeout: 12000 },
          )
          .toBe(true);
        await page.getByRole("button", { name: "取消", exact: true }).click();
        expect(sessions).toHaveLength(1);
        await expect(
          page.getByRole("button", { name: "取消", exact: true }),
        ).toBeVisible();
      } finally {
        await blocker.evaluate(() => {
          (window as unknown as { releaseIdb: boolean }).releaseIdb = true;
        });
      }
      await expect(
        page.getByText("对照已取消；已保存音频保留", { exact: false }),
      ).toBeVisible({ timeout: 10000 });
      await expect(page.getByText("待试听核验", { exact: true })).toHaveCount(
        1,
      );
      expect(sessions).toHaveLength(1);
      expect(
        await page.evaluate(
          () => (window as unknown as { responses: number }).responses,
        ),
      ).toBe(1);
      await blocker.close();
    } else if (scenario === "success") {
      await expect(
        page.getByText("对照音频已保存；请逐段试听核验并记录评分"),
      ).toBeVisible({ timeout: 45000 });
      expect(sessions).toHaveLength(5);
      const stored = await page.evaluate(async () => {
        const projects = await new Promise<
          Array<{
            title: string;
            segments: Array<{ audio?: Blob; audioVerified?: boolean }>;
          }>
        >((resolve, reject) => {
          const req = indexedDB.open("knowledge-podcast-studio");
          req.onerror = () => reject(req.error);
          req.onsuccess = () => {
            const get = req.result
              .transaction("projects")
              .objectStore("projects")
              .getAll();
            get.onsuccess = () => resolve(get.result);
            get.onerror = () => reject(get.error);
          };
        });
        return projects
          .filter((p) => p.title.startsWith("旁白对照 "))
          .sort((a, b) => a.title.localeCompare(b.title))
          .map((p) => ({
            count: p.segments.filter((s) => s.audio).length,
            verified: p.segments.some((s) => s.audioVerified),
          }));
      });
      expect(stored).toEqual([
        { count: 1, verified: false },
        { count: 3, verified: false },
        { count: 3, verified: false },
      ]);
      expect(
        await page.evaluate(
          () => (window as unknown as { responses: number }).responses,
        ),
      ).toBe(7);
      const spoken = await page.evaluate(
        () => (window as unknown as { spoken: string[] }).spoken,
      );
      expect(
        await page.evaluate(
          () =>
            (window as unknown as { savedAtResponse: number[] })
              .savedAtResponse,
        ),
      ).toEqual([0, 1, 2, 3, 4, 5, 6]);
      expect(spoken).toHaveLength(7);
      expect(spoken[0]).toBe(spoken.slice(1, 4).join("\n"));
      expect(spoken.slice(4)).toEqual(spoken.slice(1, 4));
      expect(
        sessions.every((body) => body.includes('"max_output_tokens":1024')),
      ).toBe(true);
      expect(sessions[2]).toContain("后文：");
      expect(sessions[4]).toContain("前文：");
      await expect(page.getByText("待试听核验", { exact: true })).toHaveCount(
        3,
      );
    } else if (scenario === "save-failure") {
      await expect(page.getByRole("alert")).toContainText("保存失败", {
        timeout: 25000,
      });
      await expect(
        page.getByRole("button", { name: "下载未保存音频" }),
      ).toBeVisible();
      expect(sessions).toHaveLength(2);
      expect(
        await page.evaluate(
          () => (window as unknown as { responses: number }).responses,
        ),
      ).toBe(3);
    } else {
      await expect(page.getByRole("alert")).toContainText("不完整", {
        timeout: 25000,
      });
      expect(sessions).toHaveLength(2);
      expect(
        await page.evaluate(
          () => (window as unknown as { responses: number }).responses,
        ),
      ).toBe(2);
      await expect(
        page.getByText("服务端报告不完整", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("checkbox", { name: "确认片段 1 音频完整" }),
      ).toBeDisabled();
      page.once("dialog", (dialog) => dialog.accept());
      const download = page.waitForEvent("download");
      await page.getByRole("button", { name: "备份脚本与音频" }).click();
      const file = await readFile((await (await download).path())!);
      expect(
        JSON.parse(file.toString()).segments[0].take.provenance.responseStatus,
      ).toBe("incomplete");
      await page.getByRole("button", { name: "新建项目" }).first().click();
      await page.getByLabel("导入音频备份").setInputFiles({
        name: "fixture.json",
        mimeType: "application/json",
        buffer: file,
      });
      await expect(
        page.getByText("服务端报告不完整", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("checkbox", { name: "确认片段 1 音频完整" }),
      ).toBeDisabled();
    }
    expect(
      await page.evaluate(async () =>
        JSON.stringify(
          await new Promise((resolve, reject) => {
            const req = indexedDB.open("knowledge-podcast-studio");
            req.onerror = () => reject(req.error);
            req.onsuccess = () => {
              const get = req.result
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
}

test("comparison requires consent and preflights every context before a request", async ({
  page,
}) => {
  let calls = 0;
  await page.route("https://api.openai.com/**", async (route) => {
    calls++;
    await route.abort();
  });
  await page.goto("./");
  await page.getByLabel("生成模式").selectOption("openai");
  await page.getByLabel("OpenAI API key").fill("sk-test-only");
  await page.getByRole("checkbox", { name: /我了解/ }).check();
  await page.getByText("旁白连续性对照（实验）").click();
  const start = page.getByRole("button", { name: "开始一次旁白对照" });
  await expect(start).toBeDisabled();
  await page.getByRole("checkbox", { name: /我已阅读对照/ }).check();
  await page.getByLabel("Narrator instructions").fill("x".repeat(1950));
  await start.click();
  await expect(page.getByRole("alert")).toContainText("本次未发送请求");
  expect(calls).toBe(0);
  await page.getByLabel("Narrator instructions").fill("Speak clearly.");
  page.once("dialog", (dialog) => dialog.dismiss());
  await start.click();
  expect(calls).toBe(0);
});
