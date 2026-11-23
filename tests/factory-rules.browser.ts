import { expect, type Page } from "@playwright/test";
import { createTranslator } from "../src/i18n/index.ts";
import { test } from "./fixtures/guards";
import { fakeOpenAI, heard } from "./fixtures/podcast-provider.mjs";

const t = createTranslator("en");
const key = "fixture-only";
const topic = "How a park helps its neighborhood";

const rules = test.extend<{
  provider: {
    attempts: string[];
    posts: string[];
    mock: (options?: { dropResearch?: boolean }) => void;
  };
}>({
  provider: async ({ context, baseURL, guard }, use) => {
    const origin = new URL(baseURL!).origin;
    await context.addInitScript(() => {
      localStorage.setItem("podcast-ui-locale", "en");
    });
    await context.route(
      (url) => url.origin === origin && url.pathname.startsWith("/api/studio/"),
      async (route) => {
        expect(route.request().method()).toBe("GET");
        expect(new URL(route.request().url()).pathname).toBe(
          "/api/studio/session",
        );
        await route.fulfill({ status: 404 });
      },
    );

    const attempts: string[] = [];
    const posts: string[] = [];
    const fixture = fakeOpenAI({ dynamic: true, cast: 2 });
    await use({
      attempts,
      posts,
      mock: ({ dropResearch = false } = {}) => {
        guard.mockProvider(async (route) => {
          const request = route.request();
          const path = new URL(request.url()).pathname;
          const method = request.method();
          attempts.push(`${method} ${path}`);
          const headers = {
            "access-control-allow-origin": origin,
            "access-control-allow-headers": "Authorization, Content-Type",
            "access-control-allow-methods": "POST, OPTIONS",
          };
          if (method === "OPTIONS") {
            await route.fulfill({ status: 204, headers });
            return;
          }
          expect(method).toBe("POST");
          const authorization = await request.headerValue("authorization");
          expect(authorization).toBe(`Bearer ${key}`);
          posts.push(path);
          if (path === "/v1/realtime/calls") {
            await route.fulfill({
              status: 201,
              headers,
              body: "Fixture SDP answer",
            });
          } else if (path === "/v1/audio/transcriptions") {
            expect(await request.headerValue("content-type")).toMatch(
              /^multipart\/form-data;/,
            );
            await route.fulfill({ headers, json: { text: heard } });
          } else {
            expect(path).toBe("/v1/responses");
            expect(request.postData()).toBeTruthy();
            if (dropResearch) {
              // The caller attempted a POST. The fixture simulates losing its response.
              await route.abort("connectionclosed");
              return;
            }
            const response = await fixture.fetcher(request.url(), {
              headers: { Authorization: authorization },
              redirect: "error",
              body: request.postData()!,
            });
            await route.fulfill({
              status: response.status,
              headers,
              json: await response.json(),
            });
          }
        });
      },
    });
  },
});

function browserKeyPanel(page: Page) {
  return page.getByRole("region", { name: t("settings.browserKey.title") });
}

async function setKey(page: Page) {
  const settings = browserKeyPanel(page);
  const input = settings.getByLabel(t("settings.browserKey.label"));
  await input.fill(key);
  await settings.getByRole("checkbox").check();
  await settings
    .getByRole("button", { name: t("settings.browserKey.set") })
    .click();
  await expect(input).toHaveValue("");
  await expect(settings.getByRole("status")).toHaveText(
    t("settings.browserKey.configured"),
  );
}

async function openStudio(page: Page) {
  await page.goto("/?view=settings");
  await setKey(page);
  await page
    .getByRole("link", { name: t("shell.nav.studio"), exact: true })
    .click();
  await expect(
    page.getByText(t("studio.availability.browserReady"), { exact: true }),
  ).toBeVisible();
  const topicInput = page.getByRole("textbox", {
    name: t("studio.intake.topic"),
  });
  await topicInput.fill(topic);
  await page
    .getByRole("combobox", { name: t("studio.intake.hosts") })
    .selectOption("2");
  return {
    topicInput,
    submit: page.getByRole("button", { name: t("studio.intake.submit") }),
    consent: page.getByRole("checkbox", { name: t("studio.intake.consent") }),
  };
}

async function mockRealtimeAudio(page: Page) {
  // Keep the app's provider HTTP routing, production checkpoints and WAV assembly.
  // Replace browser WebRTC and the worklet with deterministic PCM and session events.
  await page.addInitScript(() => {
    type Receiver = ((event: { data: Record<string, unknown> }) => void) | null;
    let receive: Receiver = null;
    class Worklet {
      port = {
        get onmessage() {
          return receive;
        },
        set onmessage(handler: Receiver) {
          receive = handler;
        },
        postMessage(command: string) {
          queueMicrotask(() =>
            receive?.({
              data: { type: command === "start" ? "ready" : "done" },
            }),
          );
        },
        close() {},
      };
      connect() {}
      disconnect() {}
    }
    class Context {
      state = "running";
      sampleRate = 24_000;
      destination = {};
      audioWorklet = { addModule: async () => {} };
      async resume() {}
      async close() {}
      createMediaStreamSource() {
        return { connect() {}, disconnect() {} };
      }
    }
    class Peer {
      ontrack?: (event: { track: EventTarget }) => void;
      onmessage?: (event: { data: string }) => void;
      emit(data: object) {
        this.onmessage?.({ data: JSON.stringify(data) });
      }
      addTransceiver() {}
      createDataChannel() {
        const peer = this;
        return {
          readyState: "open",
          close() {},
          set onmessage(handler: Peer["onmessage"]) {
            peer.onmessage = handler;
          },
          send(message: string) {
            if (JSON.parse(message).type !== "response.create") return;
            const samples = new Float32Array(12_000);
            for (let i = 0; i < samples.length; i++)
              samples[i] = 0.1 * Math.sin(i / 10);
            receive?.({ data: { type: "data", samples } });
            peer.emit({
              type: "response.done",
              response: { id: "mock", status: "completed" },
            });
            peer.emit({
              type: "output_audio_buffer.stopped",
              response_id: "mock",
            });
          },
        };
      }
      async createOffer() {
        return { type: "offer", sdp: "Fixture SDP offer" };
      }
      async setLocalDescription() {}
      async setRemoteDescription() {
        this.ontrack?.({
          track: Object.assign(new EventTarget(), { kind: "audio", stop() {} }),
        });
        this.emit({ type: "session.created" });
      }
      close() {}
    }
    Object.assign(window, {
      RTCPeerConnection: Peer,
      AudioContext: Context,
      AudioWorkletNode: Worklet,
      Audio: class {
        async play() {}
        pause() {}
      },
      MediaStream: class {},
    });
  });
}

rules(
  "a completed browser run and its Library backup contain no key",
  async ({ page, provider, scanForKey }) => {
    rules.setTimeout(45_000);
    provider.mock();
    await mockRealtimeAudio(page);
    const { consent, submit } = await openStudio(page);
    await consent.check();
    await submit.click();

    const episode = page.getByRole("region", { name: "Fixture episode" });
    const saved = episode.getByRole("list", {
      name: t("episode.stages.label"),
    });
    await expect(
      saved.getByText(t("episode.stages.saved"), { exact: true }),
    ).toHaveCount(5, { timeout: 25_000 });
    expect(provider.posts).toEqual([
      ...Array<string>(4).fill("/v1/responses"),
      ...Array<string>(4).fill("/v1/realtime/calls"),
      "/v1/audio/transcriptions",
    ]);
    const backup = page.waitForEvent("download");
    // The export buttons live in their own region, outside the episode summary.
    await page
      .getByRole("button", { name: t("episode.exports.backup") })
      .click();
    expect((await backup).suggestedFilename()).toMatch(/\.kps$/);
    expect(await scanForKey(page, key)).toEqual([]);
  },
);

rules(
  "Studio sends zero provider requests before per-run consent",
  async ({ page, provider }) => {
    provider.mock({ dropResearch: true });
    const { consent, submit, topicInput } = await openStudio(page);
    await expect(
      page.getByText(t("studio.cost.usage"), { exact: true }),
    ).toBeVisible();
    await expect(consent).not.toBeChecked();
    await expect(submit).toBeDisabled();
    await topicInput.evaluate((input: HTMLTextAreaElement) =>
      input.form!.requestSubmit(),
    );
    expect(provider.attempts).toEqual([]);

    await consent.check();
    await expect(submit).toBeEnabled();
    expect(provider.attempts).toEqual([]);
    await submit.click();
    await expect.poll(() => provider.posts).toEqual(["/v1/responses"]);
  },
);

rules(
  "a dropped paid request stays unknown without an automatic or plain retry",
  async ({ page, provider }) => {
    provider.mock({ dropResearch: true });
    await page.clock.install();
    const { consent, submit } = await openStudio(page);
    await consent.check();
    await submit.click();

    const episode = page.getByRole("region", { name: topic });
    await expect(episode.getByRole("alert")).toHaveText(
      t("studio.production.unknown"),
    );
    const warning = page.getByRole("region", {
      name: t("studio.continuation.title"),
    });
    await expect(
      warning.getByText(t("studio.continuation.warning")),
    ).toBeVisible();
    await expect(warning.getByRole("checkbox")).not.toBeChecked();
    await expect(
      warning.getByRole("button", { name: t("studio.continuation.title") }),
    ).toBeDisabled();
    await expect(page.getByRole("button", { name: /^Retry\b/ })).toHaveCount(0);

    await page.clock.fastForward(60_000);
    await expect(episode.getByRole("alert")).toHaveText(
      t("studio.production.unknown"),
    );
    expect(provider.posts).toEqual(["/v1/responses"]);
  },
);

rules(
  "the browser key clears on pagehide and is absent after reload",
  async ({ page, provider, scanForKey }) => {
    await page.goto("/?view=settings");
    const settings = browserKeyPanel(page);
    await setKey(page);
    await page.evaluate(() =>
      window.dispatchEvent(
        new PageTransitionEvent("pagehide", { persisted: true }),
      ),
    );
    await expect(settings.getByRole("status")).toHaveText(
      t("settings.browserKey.unconfigured"),
    );
    await setKey(page);
    await page.reload();
    await expect(settings.getByRole("status")).toHaveText(
      t("settings.browserKey.unconfigured"),
    );
    await expect(
      settings.getByLabel(t("settings.browserKey.label")),
    ).toHaveValue("");
    expect(provider.attempts).toEqual([]);
    expect(await scanForKey(page, key)).toEqual([]);
  },
);
