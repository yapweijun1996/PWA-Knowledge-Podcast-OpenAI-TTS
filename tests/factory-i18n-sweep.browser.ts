import {
  expect,
  test,
  type Locator,
  type Page,
  type TestInfo,
} from "@playwright/test";
import { backupRecord } from "../shared/episode-backup.ts";
import { defaultPreferences, type Episode } from "../shared/factory.ts";
import { wave } from "../server/audio.mjs";
import { createTranslator, type Locale } from "../src/i18n/index.ts";
import { fakeOpenAI } from "./fixtures/podcast-provider.mjs";

const sizes = [
  { width: 1440, height: 900, language: "en", lang: "en" },
  { width: 768, height: 1024, language: "ms", lang: "ms" },
  { width: 390, height: 844, language: "zh", lang: "zh-CN" },
  { width: 320, height: 568, language: "sg", lang: "en-SG" },
] as const;
const locales = ["zh-CN", "en", "ms"] as const;
const fixtureKey = "fixture-only";
const topic = "How a park helps its neighborhood";
const controls =
  "button, a[href], input:not([type=hidden]), select, textarea, summary, [tabindex], [contenteditable]";
const inactiveControls =
  "[inert], details:not([open]) > :not(summary), details:not([open]) > :not(summary) *";
const shell = ".factory-shell";
const scrollArea = ".factory-shell-layout";

test.use({ serviceWorkers: "block", colorScheme: "light" });

async function scanLocale(page: Page, locale: Locale, state: string) {
  await expect(page.locator("html")).toHaveAttribute("lang", locale);
  const leaks = await page.evaluate((locale) => {
    const root = document.body;
    const attributes = ["aria-label", "title", "placeholder", "alt"];
    const cjk =
      /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
    const latinWords = /\p{Script=Latin}+/gu;
    const leaks: string[] = [];
    const visible = (element: Element) => {
      if (element.closest("[hidden]")) return false;
      for (
        let ancestor = element;
        ancestor && ancestor !== root;
        ancestor = ancestor.parentElement!
      ) {
        const parent = ancestor.parentElement;
        if (
          parent?.matches("details:not([open])") &&
          !ancestor.matches("summary")
        )
          return false;
      }
      const box =
        element instanceof HTMLOptionElement
          ? element.closest("select")!
          : element;
      const style = getComputedStyle(box);
      return style.visibility === "visible" && box.getClientRects().length > 0;
    };
    const check = (
      element: Element,
      value: string | null,
      attribute = "text",
    ) => {
      const clean = value?.replace(/\s+/g, " ").trim();
      if (!clean) return;
      if (
        element.matches("option[lang]") &&
        ["简体中文", "English", "Bahasa Melayu"].includes(clean)
      )
        return;
      const boundary = element.closest("[lang], [data-user-content]");
      const userContent =
        boundary &&
        boundary !== document.documentElement &&
        !boundary.matches("option, .factory-citations small");
      if (
        userContent ||
        (attribute === "aria-label" &&
          element.hasAttribute("data-user-content-label"))
      )
        return;
      const latin = clean.replace(
        /Podcast Studio|OpenAI|API|IndexedDB|Safari|Chrome|Firefox|WAV|MP3|BYOK|JSON|YouTube/gi,
        "",
      );
      const englishSentence =
        (latin.match(latinWords)?.length ?? 0) >= 3 && !cjk.test(clean);
      if (
        clean.includes("⟦") ||
        (locale === "zh-CN" ? englishSentence : cjk.test(clean))
      ) {
        const selector = element.id
          ? `#${element.id}`
          : element.className || element.localName;
        leaks.push(`${selector} [${attribute}]: ${clean}`);
      }
    };
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const { parentElement, nodeValue } = walker.currentNode;
      if (parentElement && visible(parentElement))
        check(parentElement, nodeValue);
    }
    for (const element of root.querySelectorAll(
      attributes.map((a) => `[${a}]`).join(","),
    )) {
      if (!visible(element)) continue;
      for (const attribute of attributes)
        check(element, element.getAttribute(attribute), attribute);
    }
    return leaks;
  }, locale);
  expect.soft(leaks, `${locale} ${state}: mixed-locale UI copy`).toEqual([]);
}

async function inspectLayout(page: Page, state: string) {
  try {
    for (const zoom of ["100%", "200%"]) {
      const problems = await page.evaluate(
        async ({ scrollArea, zoom }) => {
          document.documentElement.style.fontSize = zoom;
          // Allow the bar ResizeObserver to update the scroll area after reflow.
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          );
          const problems: string[] = [];
          const root = document.documentElement;
          const layout = document.querySelector(scrollArea)!;
          for (const [name, width, available] of [
            ["document", root.scrollWidth, innerWidth],
            [scrollArea, layout.scrollWidth, layout.clientWidth],
          ] as const) {
            if (width > available)
              problems.push(`${name}: ${width}px > ${available}px`);
          }
          const dialog = document.querySelector("dialog[open]");
          if (dialog && dialog.scrollWidth > dialog.clientWidth)
            problems.push(
              `open dialog: ${dialog.scrollWidth}px > ${dialog.clientWidth}px`,
            );
          for (const node of document.querySelectorAll<HTMLElement>(
            "button, label, .factory-nav a",
          )) {
            if (
              !node.checkVisibility({ checkVisibilityCSS: true }) ||
              node.clientWidth === 0
            )
              continue;
            if (node.scrollWidth > node.clientWidth) {
              problems.push(
                `${node.localName}.${node.className} ${node.innerText.trim().slice(0, 120)}: ${node.scrollWidth}px > ${node.clientWidth}px`,
              );
            }
          }
          return problems;
        },
        { scrollArea, zoom },
      );
      expect
        .soft(problems, `${state}: overflow or clipping at ${zoom} text`)
        .toEqual([]);
    }
  } finally {
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "";
    });
  }
}

async function inspectReachability(page: Page, state: string, expanded: boolean) {
  const geometry = await page.evaluate(
    async ({ scrollArea, controls, inactiveControls, expanded }) => {
      const layout = document.querySelector<HTMLElement>(scrollArea)!;
      const bar = document.querySelector(".playback-bar")!;
      const scroller = expanded
        ? document.querySelector<HTMLDialogElement>(".playback-dialog[open]")
        : layout;
      if (!scroller) throw new Error("Expected the playback dialog to be open");

      // The playback bar may still be resizing after the text-size audit.
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      const candidates = [
        ...scroller.querySelectorAll<HTMLElement>(controls),
      ].filter(
        (control) =>
          !control.matches(':disabled, [tabindex="-1"]') &&
          control.checkVisibility({ checkVisibilityCSS: true }) &&
          !control.closest(inactiveControls),
      );
      const layoutBottom = layout.getBoundingClientRect().bottom;
      const barTop = bar.getBoundingClientRect().top;
      const { scrollTop, scrollLeft } = scroller;
      const { scrollX, scrollY } = window;
      const problems: string[] = [];

      const reachable = (control: HTMLElement, block: ScrollLogicalPosition) => {
        control.scrollIntoView({
          behavior: "instant",
          block,
          inline: "nearest",
        });
        const port = scroller.getBoundingClientRect();
        const box = control.getBoundingClientRect();
        const top = Math.max(0, port.top + scroller.clientTop);
        const bottom = Math.min(
          innerHeight,
          port.top + scroller.clientTop + scroller.clientHeight,
          expanded ? innerHeight : bar.getBoundingClientRect().top,
        );
        if (box.top < top - 1 || box.bottom > bottom + 1) return false;

        // Probe near the top and bottom for controls or headers that cover this target.
        const x = box.left + box.width / 2;
        const inset = Math.min(2, box.height / 2);
        return [box.top + inset, box.bottom - inset].every((y) =>
          control.contains(document.elementFromPoint(x, y)),
        );
      };
      try {
        for (const control of candidates) {
          if (
            (["center", "start", "end"] as const).some((block) =>
              reachable(control, block),
            )
          )
            continue;
          const name =
            control.getAttribute("aria-label") ||
            control.textContent?.trim() ||
            control.getAttribute("type") ||
            "";
          const target = control.id
            ? `#${control.id}`
            : `${control.localName} ${name}`.trim();
          problems.push(target);
        }
      } finally {
        scroller.scrollTo({
          top: scrollTop,
          left: scrollLeft,
          behavior: "instant",
        });
        window.scrollTo({ top: scrollY, left: scrollX, behavior: "instant" });
      }
      return { layoutBottom, barTop, checked: candidates.length, problems };
    },
    { scrollArea, controls, inactiveControls, expanded },
  );
  expect
    .soft(geometry.layoutBottom, `${state}: workspace ends above playback`)
    .toBeLessThanOrEqual(geometry.barTop + 1);
  expect
    .soft(geometry.checked, `${state}: found interactive controls`)
    .toBeGreaterThan(0);
  expect
    .soft(geometry.problems, `${state}: controls must scroll clear of overlays`)
    .toEqual([]);
}

async function inspectTouch(page: Page, state: string) {
  const problems = await page.evaluate(
    ({ shell, inactiveControls }) => {
      const problems: string[] = [];
      const dialog = document.querySelector("dialog[open]");
      const root = dialog ?? document.querySelector(shell)!;
      for (const node of root.querySelectorAll<HTMLElement>(
        "input, textarea, button, a[href]",
      )) {
        if (
          node.matches(".factory-skip:not(:focus)") ||
          !node.checkVisibility({ checkVisibilityCSS: true }) ||
          node.closest(inactiveControls)
        )
          continue;
        const selector = node.id
          ? `#${node.id}`
          : `${node.tagName.toLowerCase()}.${node.className}`;
        const name =
          node.getAttribute("aria-label") ||
          node.textContent?.trim() ||
          node.getAttribute("type");
        if (node.matches("input, textarea")) {
          const size = parseFloat(getComputedStyle(node).fontSize);
          if (size < 16)
            problems.push(`${selector} (${name}): font-size ${size}px`);
        }
        if (node.matches("button, a[href], input[type=checkbox]")) {
          // The associated label activates the checkbox across its full hit area.
          const target =
            (node instanceof HTMLInputElement && node.labels?.[0]) || node;
          const { width, height } = target.getBoundingClientRect();
          if (width < 44 || height < 44)
            problems.push(`${selector} (${name}): ${width} × ${height}px`);
        }
      }
      return problems;
    },
    { shell, inactiveControls },
  );
  expect
    .soft(problems, `${state}: 16px fields and 44px coarse-pointer targets`)
    .toEqual([]);
}

async function assertFocusIndicator(page: Page) {
  const focus = page.locator(":focus");
  await expect.soft(focus).toHaveAccessibleName(/\S/);
  const indicator = await focus.evaluate((node) => {
    const styles = [getComputedStyle(node), getComputedStyle(node, "::after")];
    const drawn = styles.some(
      (style) =>
        (style.outlineStyle !== "none" &&
          parseFloat(style.outlineWidth) > 0 &&
          !["transparent", "rgba(0, 0, 0, 0)"].includes(style.outlineColor)) ||
        style.boxShadow !== "none",
    );
    return { drawn, element: node.id || node.className || node.localName };
  });
  expect
    .soft(indicator.drawn, `Visible keyboard focus on ${indicator.element}`)
    .toBe(true);
}

async function tabThrough(page: Page) {
  const candidates = await page.locator(controls).elementHandles();
  const expected: number[] = [];
  for (const [index, candidate] of candidates.entries()) {
    if (
      await candidate.evaluate(
        (node, inactiveControls) =>
          (node as HTMLElement).tabIndex >= 0 &&
          !node.matches(":disabled") &&
          !node.closest(inactiveControls) &&
          node.checkVisibility({ checkVisibilityCSS: true }),
        inactiveControls,
      )
    )
      expected.push(index);
  }
  const visited = new Set<number>();
  for (let step = 0; step < expected.length + 2; step++) {
    await page.keyboard.press("Tab");
    const active = await page.evaluate(
      (controls) =>
        [...document.querySelectorAll(controls)].indexOf(
          document.activeElement!,
        ),
      controls,
    );
    if (active < 0) continue;
    if (visited.has(active)) break;
    visited.add(active);
    await assertFocusIndicator(page);
  }
  expect
    .soft(
      [...visited].sort((a, b) => a - b),
      "Tab visits every enabled visible control",
    )
    .toEqual(expected);
}

async function inspectDisabled(control: Locator, state: string) {
  await expect(control).toBeDisabled();
  await expect.soft(control, state).toHaveAccessibleDescription(/\S/);
  const info = await control.evaluate((node) => {
    const reason = (node.getAttribute("aria-describedby") ?? "")
      .split(/\s+/)
      .map((id) => document.getElementById(id))
      .some(
        (el) =>
          el?.textContent?.trim() &&
          el.checkVisibility({ checkVisibilityCSS: true }),
      );
    const style = getComputedStyle(node);
    const luminance = (color: string) => {
      const linear = (color.match(/\d+(?:\.\d+)?/g) ?? [])
        .slice(0, 3)
        .map((value) => {
          const channel = Number(value) / 255;
          return channel <= 0.04045
            ? channel / 12.92
            : ((channel + 0.055) / 1.055) ** 2.4;
        });
      return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
    };
    const colors = [
      luminance(style.color),
      luminance(style.backgroundColor),
    ].sort((a, b) => b - a);
    return {
      reason,
      contrast: (colors[0] + 0.05) / (colors[1] + 0.05),
      opacity: style.opacity,
    };
  });
  expect.soft(info.reason, `${state}: the linked reason is visible`).toBe(true);
  expect
    .soft(info.contrast, `${state}: disabled text contrast`)
    .toBeGreaterThanOrEqual(3);
  expect.soft(info.opacity, `${state}: full-opacity disabled colors`).toBe("1");
}

async function screenshot(page: Page, info: TestInfo, state: string) {
  const path = info.outputPath(`${state}.png`);
  await page.screenshot({ path, animations: "disabled" });
  await info.attach(state, { path, contentType: "image/png" });
}

async function fixtureBackup(language: Episode["language"]) {
  const title = {
    en: "A harbor story",
    zh: "海港的故事",
    ms: "Kisah pelabuhan",
    sg: "A harbor story · 海港",
  }[language];
  const id = "10000000-0000-4000-8000-000000000047";
  const updated = "2026-11-23T00:00:00.000Z";
  const asset = `episode-${id}.wav`;
  const chapter = { id: "intro", title, angle: title, claimIds: ["C1"] };
  const episode: Episode = {
    id,
    topic: title,
    language,
    updated,
    voices: { A: "marin" },
    revision: 1,
    research: {
      searchedAt: updated,
      model: "fixture",
      sources: [
        {
          id: "S1",
          url: "https://example.test/harbor",
          title,
          published: "2026-11-23",
        },
      ],
      claims: [
        {
          id: "C1",
          text: title,
          uncertainty: title,
          status: "supported",
          sourceIds: ["S1"],
        },
      ],
    },
    outline: { model: "fixture", chapters: [chapter] },
    script: {
      title,
      model: "fixture",
      turns: [
        {
          id: "intro-1",
          chapterId: "intro",
          host: "A",
          text: title,
          claimIds: ["C1"],
        },
      ],
    },
    finished: {
      revision: 1,
      asset,
      model: "fixture",
      duration: 60,
      intendedText: title,
      chapters: [{ title, start: 0 }],
      qa: { status: "matched", reasons: [] },
      transcript: { text: title, model: "fixture", similarity: 100 },
    },
  };
  const wav = new Blob([new Uint8Array(wave([Buffer.alloc(60 * 48_000)]))], {
    type: "audio/wav",
  });
  const backup = await backupRecord({ episode, assets: { [asset]: wav } });
  return {
    title,
    file: {
      name: "harbor.kps",
      mimeType: backup.type,
      buffer: Buffer.from(await backup.arrayBuffer()),
    },
  };
}

for (const locale of locales) {
  for (const size of sizes) {
    const { width, height, language, lang } = size;
    const touch = width === 390;
    test.describe(`${locale} / ${width}x${height}`, () => {
      test.use({
        viewport: { width, height },
        isMobile: touch,
        hasTouch: touch,
      });
      test("T47 workspace sweep", async ({ page, context, baseURL }, info) => {
        test.setTimeout(90_000);
        const t = createTranslator(locale);
        await context.addInitScript(
          (code) => localStorage.setItem("podcast-ui-locale", code),
          locale,
        );
        const origin = new URL(baseURL!).origin;
        const fixture = fakeOpenAI({ dynamic: true, cast: 2 });
        const unexpected: string[] = [];
        const paid: string[] = [];
        let releaseResearch!: () => void;
        const holdResearch = new Promise<void>((resolve) => {
          releaseResearch = resolve;
        });

        await context.route("**/*", async (route) => {
          const url = new URL(route.request().url());
          const method = route.request().method();
          if (
            url.origin === origin &&
            !url.pathname.startsWith("/api/studio/")
          ) {
            await route.continue();
          } else if (url.origin === origin && method === "GET") {
            switch (url.pathname) {
              case "/api/studio/session":
                await route.fulfill({
                  json: {
                    authenticated: true,
                    privateMode: true,
                    configured: true,
                    localProduction: true,
                  },
                });
                return;
              case "/api/studio/episodes":
                await route.fulfill({ json: { episodes: [] } });
                return;
              case "/api/studio/schedule":
                await route.fulfill({
                  json: {
                    preferences: defaultPreferences,
                    nextCheck: null,
                    running: false,
                    used: 0,
                    message: "",
                  },
                });
                return;
            }
            unexpected.push(`${method} ${url.pathname}`);
            await route.abort();
          } else {
            unexpected.push(`${method} ${url.origin}${url.pathname}`);
            await route.abort();
          }
        });
        await context.route("https://api.openai.com/**", async (route) => {
          const request = route.request();
          const path = new URL(request.url()).pathname;
          const headers = {
            "access-control-allow-origin": origin,
            "access-control-allow-headers": "Authorization, Content-Type",
            "access-control-allow-methods": "POST, OPTIONS",
          };
          if (request.method() === "OPTIONS") {
            await route.fulfill({ status: 204, headers });
            return;
          }
          if (
            request.method() !== "POST" ||
            (path !== "/v1/responses" && path !== "/v1/realtime/calls") ||
            (await request.headerValue("authorization")) !==
              `Bearer ${fixtureKey}`
          ) {
            unexpected.push(
              `Unexpected provider request: ${request.method()} ${path}`,
            );
            await route.abort();
            return;
          }
          paid.push(path);
          if (paid.length === 1) await holdResearch;
          if (path === "/v1/realtime/calls") {
            await route.fulfill({
              status: 503,
              headers,
              json: { error: "Private fixture provider diagnostics." },
            });
          } else {
            const response = await fixture.fetcher(request.url(), {
              headers: { Authorization: `Bearer ${fixtureKey}` },
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

        // Reload would run the init script again and change this document identity.
        const nav = page.locator(".factory-nav");
        const heading = page.locator("#factory-page-title");
        const go = async (
          name: "library" | "studio" | "automation" | "settings",
        ) => {
          const link = nav.getByRole("link", {
            name: t(`shell.nav.${name}`),
            exact: true,
          });
          await link.click();
          await expect(link).toHaveAttribute("aria-current", "page");
        };
        const audit = async (state: string, expanded = false) => {
          await scanLocale(page, locale, state);
          await inspectLayout(page, state);
          if (width <= 390) await inspectReachability(page, state, expanded);
          if (touch) await inspectTouch(page, state);
          await screenshot(page, info, state);
        };

        await page.goto("/");
        await expect(
          page.getByRole("heading", { name: t("library.empty.noEpisodes") }),
        ).toBeVisible();
        const liveStatus = page.locator(".playback-bar [role=status]").first();
        const liveAlert = page.locator(".playback-bar [role=alert]").first();
        await expect(liveStatus).toBeAttached();
        await expect(liveAlert).toBeAttached();
        await expect.soft(liveAlert).toBeEmpty();
        const initialStatus = await liveStatus.elementHandle();
        const initialAlert = await liveAlert.elementHandle();
        if (locale === "zh-CN") {
          await expect.soft(heading).toHaveCSS("letter-spacing", "normal");
          await expect
            .soft(heading)
            .toHaveCSS("font-family", /PingFang SC|Noto Sans CJK SC/);
        }
        await page.keyboard.press("Tab");
        const skip = page.locator(".factory-skip");
        await expect(skip).toBeFocused();
        await assertFocusIndicator(page);
        // The skip link is visually hidden until it receives focus.
        await scanLocale(page, locale, "library skip link");
        await page.keyboard.press("Enter");
        await expect(heading).toBeFocused();
        await expect(page.locator(".factory-intro p")).toHaveText(/\S/);
        await audit("library-empty");

        await go("studio");
        await expect(page.locator("#studio-topic")).toBeVisible();
        await tabThrough(page);
        await inspectDisabled(
          page.getByRole("button", { name: t("studio.intake.submit") }),
          "Studio without a topic",
        );
        await audit("studio-idle");

        await go("automation");
        await expect(page.locator(".factory-intro p")).toHaveText(/\S/);
        await expect(
          page.getByRole("heading", { name: t("settings.schedule.title") }),
        ).toBeVisible();
        await audit("automation");

        await go("settings");
        const keys = page.getByRole("region", {
          name: t("settings.browserKey.title"),
        });
        const input = keys.getByLabel(t("settings.browserKey.label"), {
          exact: true,
        });
        const setKey = keys.getByRole("button", {
          name: t("settings.browserKey.set"),
        });
        const localeSelect = page.locator("#settings-ui-language");
        await expect(localeSelect).toHaveValue(locale);
        await expect(localeSelect).toHaveAccessibleName(
          t("settings.appearance.language"),
        );
        await expect(input).toHaveAttribute("type", "password");
        await expect(keys.getByRole("alert")).toBeEmpty();
        await tabThrough(page);
        await inspectDisabled(setKey, "Browser key acknowledgement");
        await input.fill(fixtureKey);
        const show = keys.getByRole("button", { name: t("settings.key.show") });
        await expect(show).toHaveAccessibleName(/\S/);
        await show.click();
        await expect(input).toHaveAttribute("type", "text");
        await expect(input).toHaveValue(fixtureKey);
        await keys
          .getByRole("button", { name: t("settings.key.hide") })
          .click();
        await expect(input).toHaveAttribute("type", "password");
        await keys.getByRole("checkbox").check();
        await setKey.click();
        await expect(input).toHaveValue("");
        await expect(keys.getByRole("status")).toHaveText(
          t("settings.browserKey.configured"),
        );
        const assertSecretAbsent = async () => {
          const leaked = await page.evaluate(
            (key) => ({
              text: document.body.textContent?.includes(key),
              live: [
                ...document.querySelectorAll(
                  "[role=status], [role=alert], [aria-live]",
                ),
              ].some((el) => el.textContent?.includes(key)),
              attributes: [...document.querySelectorAll("*")].some((el) =>
                [...el.attributes].some(
                  ({ name, value }) =>
                    name.startsWith("aria-") && value.includes(key),
                ),
              ),
            }),
            fixtureKey,
          );
          expect
            .soft(leaked)
            .toEqual({ text: false, live: false, attributes: false });
        };
        await assertSecretAbsent();
        await audit("settings-key-controls");

        if (locale === "zh-CN") {
          const identity = await heading.elementHandle();
          for (const next of ["en", "ms", locale] as const) {
            const translated = createTranslator(next);
            await localeSelect.selectOption(next);
            await expect(heading).toHaveText(translated("shell.nav.settings"));
            await expect(localeSelect).toHaveValue(next);
            await expect(localeSelect).toHaveAccessibleName(
              translated("settings.appearance.language"),
            );
            await scanLocale(page, next, "settings runtime toggle");
            expect
              .soft(
                await page.evaluate(() =>
                  localStorage.getItem("podcast-ui-locale"),
                ),
              )
              .toBe(next);
            expect
              .soft(
                await heading.evaluate(
                  (node, previous) => node === previous,
                  identity,
                ),
              )
              .toBe(true);
            await expect(
              page.getByLabel(translated("settings.browserKey.label"), {
                exact: true,
              }),
            ).toBeVisible();
          }
          await expect(keys.getByRole("status")).toHaveText(
            t("settings.browserKey.configured"),
          );
        }

        await go("library");
        const episode = await fixtureBackup(language);
        await page
          .locator('.library-storage input[type="file"]')
          .setInputFiles(episode.file);
        const card = page
          .getByRole("button", { name: episode.title, exact: true })
          .first();
        await expect(card).toBeVisible();
        await card.click();
        await expect(page.locator("#episode-title")).toHaveAttribute(
          "lang",
          lang,
        );
        await expect(card.locator("..")).toHaveAttribute("lang", lang);
        const evidence = page.locator(
          ".episode-workspace details.factory-panel",
        );
        await evidence.nth(0).locator("summary").click();
        await evidence.nth(1).locator("summary").click();
        for (const content of [
          ".factory-claims p",
          ".factory-outline strong",
          ".factory-chapter h4",
          ".factory-turn p",
          ".factory-transcript p[lang]",
        ]) {
          await expect
            .soft(page.locator(content).first())
            .toHaveAttribute("lang", lang);
        }
        await audit("library-episode-selected");

        await page
          .getByRole("button", { name: t("episode.script.edit") })
          .click();
        const scriptTitle = page.getByLabel(t("episode.script.episodeTitle"));
        await expect(scriptTitle).toHaveAttribute("lang", lang);
        await expect(
          page.locator(".factory-turn textarea").first(),
        ).toHaveAttribute("lang", lang);
        await scriptTitle.fill("");
        await inspectDisabled(
          page.getByRole("button", {
            name: t("episode.script.save"),
            exact: true,
          }),
          "Script missing a title",
        );
        await page
          .getByRole("button", { name: t("episode.script.discard") })
          .click();

        await page
          .getByRole("button", {
            name: t("playback.episode.play"),
            exact: true,
          })
          .click();
        const expand = page.getByRole("button", {
          name: t("playback.bar.expand"),
        });
        await expect(expand).toBeVisible();
        const dialog = page.getByRole("dialog", {
          name: t("playback.dialog.title"),
        });
        await expand.press("Enter");
        const close = dialog.getByRole("button", {
          name: t("playback.dialog.close"),
        });
        await expect(close).toBeFocused();
        await assertFocusIndicator(page);
        await page.keyboard.press("Tab");
        await expect(dialog.getByRole("slider")).toBeFocused();
        await assertFocusIndicator(page);
        await audit("playback-expanded", true);
        await page.keyboard.press("Escape");
        await expect(dialog).toHaveCount(0);
        await expect(expand).toBeFocused();
        await audit("playback-collapsed");
        await page.locator(".playback-toggle:visible").click();

        await context.setOffline(true);
        try {
          await expect(page.locator(".factory-status")).toHaveText(
            t("shell.status.offline"),
          );
          await expect(page.locator("#episode-title")).toHaveText(
            episode.title,
          );
          await audit("library-offline");
        } finally {
          await context.setOffline(false);
        }
        await expect(page.locator(".factory-status")).toHaveText(
          t("shell.status.workerOnline"),
        );

        await go("studio");
        await page
          .getByRole("button", { name: t("library.selection.create") })
          .click();
        await page.locator("#studio-topic").fill(topic);
        await expect(
          page.getByText(t("studio.cost.usage"), { exact: true }),
        ).toBeVisible();
        const submit = page.getByRole("button", {
          name: t("studio.intake.submit"),
        });
        await inspectDisabled(submit, "Studio without consent");
        await page
          .getByRole("checkbox", { name: t("studio.intake.consent") })
          .check();
        await expect(submit).toBeEnabled();
        expect(paid).toEqual([]);
        await audit("studio-key-and-consent");

        try {
          await submit.click();
          await expect(page.locator("#browser-progress-title")).toBeVisible();
          await expect.poll(() => paid.length).toBe(1);
          await audit("studio-running");
        } finally {
          releaseResearch();
        }
        await expect(page.locator("#episode-title")).toHaveText(
          "Fixture episode",
        );
        await expect(
          page
            .locator(".factory-episode")
            .getByRole("alert")
            .filter({
              hasText: t("studio.production.unknown"),
            }),
        ).toBeVisible();
        await expect(
          page.getByText("Private fixture provider diagnostics."),
        ).toHaveCount(0);
        await audit("studio-failed");
        await assertSecretAbsent();
        expect
          .soft(
            await liveStatus.evaluate(
              (node, initial) => node === initial,
              initialStatus,
            ),
          )
          .toBe(true);
        expect
          .soft(
            await liveAlert.evaluate(
              (node, initial) => node === initial,
              initialAlert,
            ),
          )
          .toBe(true);
        expect(paid).toEqual([
          ...Array<string>(4).fill("/v1/responses"),
          "/v1/realtime/calls",
        ]);
        expect(unexpected).toEqual([]);
      });
    });
  }
}
