import { expect, type Locator, type Page } from "@playwright/test";
import { createTranslator } from "../src/i18n/index.ts";
import { agentAnswerTurn, agentToolTurn } from "./fixtures/agent-provider";
import { test, type ProviderMock } from "./fixtures/guards";

const t = createTranslator("en");
const fixtureKey = "fixture-agent-only";
const fixtureTopic = "How public gardens use rainwater";

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() =>
    localStorage.setItem("podcast-ui-locale", "en"),
  );
});

function startButton(panel: Locator) {
  return panel.getByRole("button", { name: t("agent.panel.start") });
}

async function openAgent(page: Page, withKey: boolean) {
  await page.goto("/");
  const nav = page.locator(".factory-nav");
  if (withKey) {
    await nav.getByRole("link", { name: t("shell.nav.settings") }).click();
    const keys = page.getByRole("region", {
      name: t("settings.browserKey.title"),
    });
    await keys
      .getByLabel(t("settings.browserKey.label"), { exact: true })
      .fill(fixtureKey);
    await keys.getByRole("checkbox").check();
    await keys
      .getByRole("button", { name: t("settings.browserKey.set") })
      .click();
    await expect(keys.getByRole("status")).toHaveText(
      t("settings.browserKey.configured"),
    );
  }
  await nav.getByRole("link", { name: t("shell.nav.studio") }).click();
  const panel = page.locator(".agent-panel");
  await expect(panel.locator("summary")).toHaveText(t("agent.panel.title"));
  await expect(panel).not.toHaveAttribute("open", "");
  await panel.locator("summary").click();
  return panel;
}

async function consentToRun(panel: Locator, goal: string) {
  const consent = panel.getByRole("checkbox", {
    name: t("agent.panel.runConsent"),
  });
  await expect(consent).not.toBeChecked();
  await panel.getByRole("textbox", { name: t("agent.panel.goal") }).fill(goal);
  await expect(startButton(panel)).toBeDisabled();
  await consent.check();
  await expect(startButton(panel)).toBeEnabled();
}

// All requests are routed through the default-deny fixture, including preflight.
function mockResponses(
  guard: { mockProvider: (mock: ProviderMock) => void },
  origin: string,
  next: (body: Record<string, unknown>) => unknown | Promise<unknown>,
) {
  guard.mockProvider(async (route) => {
    const request = route.request();
    expect(new URL(request.url()).pathname).toBe("/v1/responses");
    const headers = {
      "access-control-allow-origin": origin,
      "access-control-allow-headers": "Authorization, Content-Type",
      "access-control-allow-methods": "POST, OPTIONS",
    };
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers });
      return;
    }
    expect(request.method()).toBe("POST");
    expect(
      (await request.headerValue("authorization")) === `Bearer ${fixtureKey}`,
    ).toBe(true);
    expect(request.postData()!.includes(fixtureKey)).toBe(false);
    await route.fulfill({ headers, json: await next(request.postDataJSON()) });
  });
}

test("agent free tool uses only run consent and keeps the key out of browser surfaces", async ({
  page,
  baseURL,
  guard,
  scanForKey,
}) => {
  const requests: Record<string, unknown>[] = [];
  const answer = "The Library is empty.";
  mockResponses(guard, new URL(baseURL!).origin, (body) => {
    requests.push(body);
    return requests.length === 1
      ? agentToolTurn("list_episodes", {})
      : agentAnswerTurn(`${answer} ${fixtureKey}`);
  });

  const panel = await openAgent(page, true);
  const log = panel.getByRole("log", { name: t("agent.panel.log.title") });
  await expect(log).toBeEmpty();
  await expect(log).toHaveAttribute("aria-live", "polite");
  await expect(
    panel.getByText(t("agent.panel.estimate.ceiling")),
  ).toBeVisible();
  await consentToRun(panel, "List the episodes in my Library.");
  expect(requests).toHaveLength(0);
  await startButton(panel).click();

  await expect(
    panel.getByText(answer + " [REDACTED]", { exact: true }),
  ).toBeVisible();
  await expect(
    log.getByText(t("agent.panel.log.step", { step: 2, maximum: 12 })),
  ).toBeVisible();
  const tool = t("agent.panel.tool.list");
  await expect(
    log.getByText(t("agent.panel.log.toolCall", { tool })),
  ).toBeVisible();
  await expect(
    log.getByText(
      t("agent.panel.log.toolResult", {
        tool,
        status: t("agent.panel.toolSucceeded"),
      }),
    ),
  ).toBeVisible();
  await expect(
    log.getByText(
      t("agent.panel.log.consentAsked", { tool: t("agent.panel.tool.run") }),
    ),
  ).toHaveCount(1);
  await expect(
    log.getByText(t("agent.panel.log.consentAsked", { tool })),
  ).toHaveCount(0);
  await expect(panel.getByRole("dialog")).toHaveCount(0);
  await expect(panel.getByRole("checkbox")).not.toBeChecked();
  expect(requests).toHaveLength(2);
  expect((requests[1].input as unknown[]).at(-1)).toEqual({
    type: "function_call_output",
    call_id: "call_fixture",
    output: '{"total":0,"episodes":[]}',
  });
  expect(await scanForKey(page, fixtureKey)).toEqual([]);
});

for (const action of ["Deny", "Escape"] as const) {
  test(`agent paid tool stops on ${action} without sending a production request`, async ({
    page,
    baseURL,
    guard,
    scanForKey,
  }) => {
    let modelCalls = 0;
    mockResponses(guard, new URL(baseURL!).origin, () => {
      modelCalls++;
      return agentToolTurn("research_topic", { topic: fixtureTopic });
    });
    const panel = await openAgent(page, true);
    await consentToRun(panel, "Research local rainwater gardens.");
    await startButton(panel).click();
    const tool = t("agent.panel.tool.research");
    const dialog = page.getByRole("dialog", {
      name: t("agent.panel.dialog.title", { tool }),
    });
    const deny = dialog.getByRole("button", {
      name: t("agent.panel.dialog.deny"),
    });
    const approve = dialog.getByRole("button", {
      name: t("agent.panel.dialog.approve"),
    });
    await expect(dialog.getByRole("heading")).toBeFocused();
    await expect(dialog.getByText(fixtureTopic)).toBeVisible();
    await expect(
      dialog.getByText(t("agent.panel.estimate.ceiling")),
    ).toBeVisible();
    expect(modelCalls).toBe(1);

    await page.keyboard.press("Shift+Tab");
    await expect(approve).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(deny).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(approve).toBeFocused();
    if (action === "Escape") await page.keyboard.press("Escape");
    else await deny.click();

    await expect(dialog).toHaveCount(0);
    await expect(panel.locator("summary")).toBeFocused();
    await expect(
      panel.getByRole("status").getByText(t("agent.panel.stoppedAfterDenial")),
    ).toBeVisible();
    await expect(
      panel.getByRole("log").getByText(
        t("agent.panel.log.toolResult", {
          tool,
          status: t("agent.panel.toolDenied"),
        }),
      ),
    ).toBeVisible();
    expect(modelCalls).toBe(1);
    expect(await scanForKey(page, fixtureKey)).toEqual([]);
  });
}

test("agent cancel during a dispatched model request shows the unknown outcome and saved summary", async ({
  page,
  baseURL,
  guard,
  scanForKey,
}) => {
  let modelCalls = 0;
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  mockResponses(guard, new URL(baseURL!).origin, async () => {
    modelCalls++;
    await held;
    return agentAnswerTurn("Late fixture response.");
  });
  const panel = await openAgent(page, true);
  await consentToRun(panel, "List my episodes.");
  try {
    await startButton(panel).click();
    await expect.poll(() => modelCalls).toBe(1);
    await panel.getByRole("button", { name: t("agent.panel.cancel") }).click();
    const result = panel.getByRole("status");
    await expect(
      result.getByText(t("agent.run.aborted"), { exact: true }),
    ).toBeVisible();
    await expect(
      result.getByText(t("agent.failure.unknownOutcome"), { exact: true }),
    ).toBeVisible();
    await expect(
      result.getByText(t("agent.panel.savedNone"), { exact: true }),
    ).toBeVisible();
    await expect(panel.getByRole("button", { name: /retry/i })).toHaveCount(0);
  } finally {
    release();
  }
  expect(modelCalls).toBe(1);
  expect(await scanForKey(page, fixtureKey)).toEqual([]);
});

test("agent without a browser key provides the Settings link and stays disabled", async ({
  page,
}) => {
  const panel = await openAgent(page, false);
  await expect(startButton(panel)).toBeDisabled();
  await expect(startButton(panel)).toHaveAccessibleDescription(
    t("agent.failure.noKey"),
  );
  await panel
    .getByRole("link", { name: t("studio.availability.openSettings") })
    .click();
  await expect(
    page.getByRole("heading", { name: t("settings.browserKey.title") }),
  ).toBeVisible();
});

test("agent offline uses one visible reason for its disabled controls", async ({
  page,
  context,
}) => {
  const panel = await openAgent(page, true);
  await context.setOffline(true);
  try {
    const reason = t("agent.panel.offline");
    await expect(panel.getByText(reason, { exact: true })).toHaveCount(1);
    await expect(panel.getByText(reason, { exact: true })).toBeVisible();
    await expect(startButton(panel)).toBeDisabled();
    await expect(startButton(panel)).toHaveAccessibleDescription(reason);
  } finally {
    await context.setOffline(false);
  }
});
