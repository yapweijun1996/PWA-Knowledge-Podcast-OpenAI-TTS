import {
  expect,
  test,
  type BrowserContext,
  type Dialog,
  type Page,
} from "@playwright/test";
import { wave } from "../server/audio.mjs";
import { defaultPreferences, type Episode } from "../shared/factory";

const origin = "/";
const wavHeader = [...wave([Buffer.alloc(48_000 * 2)]).subarray(0, 44)];

function episode(
  index: number,
  topic: string,
  extra: Partial<Episode> = {},
): Episode {
  return {
    id: `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    topic,
    updated: new Date(Date.UTC(2026, 10, index)).toISOString(),
    language: "en",
    voices: { A: "marin" },
    revision: 1,
    ...extra,
  };
}

function script(title: string) {
  return {
    outline: {
      model: "fixture",
      chapters: [
        { id: "intro", title: "Opening", angle: "Topic", claimIds: [] },
      ],
    },
    script: {
      title,
      model: "fixture",
      turns: [
        {
          id: "intro-1",
          chapterId: "intro",
          host: "A" as const,
          text: "Saved opening",
          claimIds: [],
        },
      ],
    },
  };
}

function finished(id: string): NonNullable<Episode["finished"]> {
  return {
    revision: 1,
    asset: `episode-${id}.wav`,
    model: "fixture",
    duration: 180,
    intendedText: "Saved opening",
    chapters: [{ title: "Opening", start: 0 }],
    qa: { status: "matched", reasons: [] },
    transcript: { text: "Saved opening", model: "fixture", similarity: 100 },
  };
}

type Seed = {
  episode: Episode;
  audio?: "valid" | "corrupt";
  seconds?: number;
  deleted?: boolean;
};

async function saveFixtures(page: Page, records: Seed[]) {
  await page.evaluate(
    async ({ records, wavHeader }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("knowledge-podcast-library", 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction("episodes", "readwrite");
          tx.oncomplete = () => resolve();
          tx.onabort = () => reject(tx.error);
          for (const row of records) {
            const assets: Record<string, Blob> = {};
            if (row.audio) {
              const data = new Uint8Array(44 + (row.seconds ?? 2) * 48_000);
              if (row.audio === "valid") {
                data.set(wavHeader);
                const view = new DataView(data.buffer);
                view.setUint32(4, data.length - 8, true);
                view.setUint32(40, data.length - 44, true);
              }
              const blob = new Blob([data], { type: "audio/wav" });
              if (row.episode.finished) assets[row.episode.finished.asset] = blob;
              for (const clip of Object.values(row.episode.render?.clips ?? {}))
                assets[clip.asset] = blob;
            }
            tx.objectStore("episodes").put({
              episode: row.episode,
              deleted: row.deleted,
              assets,
              stamp: crypto.randomUUID(),
            });
          }
        });
        const channel = new BroadcastChannel("knowledge-podcast-library");
        channel.postMessage("fixture records changed");
        channel.close();
      } finally {
        db.close();
      }
    },
    { records, wavHeader },
  );
}

async function watchPaidRequests(context: BrowserContext) {
  const unexpected: string[] = [];
  await context.route(/\/api\/studio\/|\.openai\.com\//, async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    if (method === "GET" && url.pathname === "/api/studio/session") {
      await route.fulfill({
        json: {
          authenticated: true,
          privateMode: true,
          configured: true,
          localProduction: true,
        },
      });
    } else if (method === "GET" && url.pathname === "/api/studio/episodes") {
      await route.fulfill({ json: { episodes: [] } });
    } else if (method === "GET" && url.pathname === "/api/studio/schedule") {
      await route.fulfill({
        json: {
          preferences: defaultPreferences,
          nextCheck: null,
          running: false,
          message: "",
          used: 0,
        },
      });
    } else {
      unexpected.push(`${method} ${url.hostname}${url.pathname}`);
      await route.abort();
    }
  });
  return unexpected;
}

const libraryFor = (page: Page) =>
  page.getByRole("complementary", { name: "浏览器节目" });

test("empty library opens Studio; saved records drive mixed-language search, filters and audio actions", async ({
  page,
  context,
}) => {
  const unexpected = await watchPaidRequests(context);
  await page.goto(origin);
  const library = libraryFor(page);
  await expect(
    library.getByRole("heading", { name: "此浏览器尚无节目。" }),
  ).toBeVisible();
  await expect(
    library.getByRole("button", { name: "恢复节目备份" }),
  ).toBeVisible();
  await library.getByRole("button", { name: "新建节目" }).click();
  await expect(page).toHaveURL(/view=studio/);
  await expect(page.getByRole("heading", { name: "播客制作台" })).toBeFocused();
  await page.getByLabel("播客主题").fill("A proposed episode");
  await expect(
    page.getByRole("button", { name: "制作整集播客" }),
  ).toBeDisabled();
  await page.getByRole("link", { name: "资料库", exact: true }).click();

  const rows = [
    {
      episode: episode(1, "Park history", script("Zulu Parks")),
      audio: "valid",
    },
    {
      episode: episode(2, "城市轨道交通", { language: "zh", revision: 2 }),
      audio: "valid",
    },
    {
      episode: episode(3, "Hutan dan sungai", {
        language: "ms",
        ...script("Alam Kita"),
      }),
      audio: "valid",
    },
    { episode: episode(4, "Missing asset") },
    { episode: episode(5, "Corrupt asset"), audio: "corrupt" },
    {
      episode: episode(6, "Cancelled script", {
        job: { status: "cancelled", stage: "script" },
      }),
    },
    {
      episode: episode(7, "Paused checkpoint", {
        job: { status: "running", stage: "outline" },
      }),
    },
    {
      episode: episode(8, "Interrupted research", {
        job: { status: "interrupted", stage: "research" },
      }),
    },
    { episode: episode(9, "Deleted lesson"), deleted: true },
  ] satisfies Seed[];
  for (const row of rows.slice(0, 5))
    row.episode.finished = finished(row.episode.id);
  rows[2].episode.finished!.qa = {
    status: "review",
    reasons: ["Fixture review"],
  };
  await saveFixtures(page, rows);

  const items = library
    .getByRole("list", { name: "节目列表" })
    .getByRole("listitem");
  const card = (title: string) =>
    items.filter({
      has: page.getByRole("heading", { name: title, exact: true }),
    });
  await expect(items).toHaveCount(8);
  await expect(card("Zulu Parks")).toContainText("可离线播放");
  await expect(card("Zulu Parks")).toContainText("时长 0:02");
  await expect(card("Zulu Parks")).not.toContainText("3:00");
  await expect(card("城市轨道交通")).toContainText("上一版音频");
  await expect(card("Alam Kita")).toContainText("待试听核对");
  await expect(card("Paused checkpoint")).toContainText(
    "上次制作进度 · 节目大纲",
  );
  await expect(card("Interrupted research")).toContainText("已中断 · 网页研究");
  await expect(card("Cancelled script")).toContainText("已取消 · 节目脚本");
  for (const title of ["Missing asset", "Corrupt asset"]) {
    await expect(card(title)).toContainText("音频不可用");
    await expect(card(title)).not.toContainText("时长");
    await expect(
      card(title).getByRole("button", { name: /前往音频/ }),
    ).toHaveCount(0);
  }

  const search = library.getByRole("searchbox", { name: "搜索节目" });
  const status = library.getByLabel("制作状态");
  const language = library.getByRole("combobox", { name: "语言", exact: true });
  const sort = library.getByLabel("排序");
  await expect(items.first()).toContainText("Interrupted research");
  await sort.selectOption("oldest");
  await expect(items.first()).toContainText("Zulu Parks");
  await sort.selectOption("title");
  await expect(
    library.getByRole("heading", {
      level: 2,
      name: /^(Alam Kita|Zulu Parks)$/,
    }),
  ).toHaveText(["Alam Kita", "Zulu Parks"]);
  await search.fill("城市 中文");
  await expect(items).toHaveCount(1);
  await expect(items.first()).toContainText("城市轨道交通");
  await search.fill("ｐａｒｋ ENGLISH");
  await expect(items).toHaveCount(1);
  await expect(items.first()).toContainText("Zulu Parks");
  await search.fill("HUTAN Melayu");
  await status.selectOption("review");
  await language.selectOption("ms");
  await expect(items).toHaveCount(1);
  await expect(items.first()).toContainText("Alam Kita");
  await language.selectOption("zh");
  const noResults = library.getByRole("heading", {
    name: "找不到符合条件的节目",
  });
  await expect(noResults).toBeVisible();
  await expect(items).toHaveCount(0);
  await expect(search).toHaveValue("HUTAN Melayu");
  await expect(status).toHaveValue("review");
  await expect(sort).toHaveValue("title");
  await language.selectOption("ms");
  await expect(items.first()).toContainText("Alam Kita");
  await language.selectOption("zh");
  await expect(noResults).toBeVisible();
  await library.getByRole("button", { name: "重置搜索与筛选" }).click();
  await expect(search).toBeFocused();
  await expect(search).toHaveValue("");
  await expect(status).toHaveValue("");
  await expect(language).toHaveValue("");
  await expect(sort).toHaveValue("newest");
  await expect(items).toHaveCount(8);

  await card("Missing asset")
    .getByRole("button", { name: "Missing asset" })
    .click();
  await expect(page.getByText("此浏览器没有可用的成品 WAV。")).toBeVisible();
  await expect(page.getByLabel("成品音频播放器")).not.toHaveAttribute("src", /.+/);
  await card("Alam Kita")
    .getByRole("button", { name: /前往音频/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "成品音频", exact: true }),
  ).toBeFocused();
  await expect(page.getByLabel("成品音频播放器")).not.toHaveAttribute("src", /.+/);
  await page.getByRole("button", { name: "播放本期音频" }).click();
  await expect(page.getByLabel("成品音频播放器")).toHaveAttribute(
    "src",
    /^blob:/,
  );
  await expect
    .poll(() =>
      page
        .getByLabel("成品音频播放器")
        .evaluate((audio: HTMLAudioElement) => audio.duration),
    )
    .toBe(2);
  expect(unexpected).toEqual([]);
});

test("populated Library reflows and supports keyboard navigation, system themes and reduced motion", async ({
  page,
  context,
}) => {
  const unexpected = await watchPaidRequests(context);
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.goto(origin);
  const library = libraryFor(page);
  await expect(library.getByText("此浏览器尚无节目。")).toBeVisible();
  const start = episode(10, "Keyboard episode");
  await saveFixtures(page, [
    { episode: start },
    { episode: episode(9, "很长的播客主题".repeat(20), { language: "zh" }) },
    { episode: episode(8, "LongMalayTitle".repeat(7), { language: "ms" }) },
    { episode: episode(7, "Another episode") },
  ]);
  const list = library.getByRole("list", { name: "节目列表" });
  await expect(list.getByRole("listitem")).toHaveCount(4);
  const card = list.getByRole("article").first();
  await expect(card).toHaveCSS("background-color", "rgb(34, 27, 52)");
  await expect(card).toHaveCSS("transition-duration", /^0s(?:,\s*0s)*$/);
  await page.emulateMedia({ colorScheme: "light" });
  await expect(card).toHaveCSS("background-color", "rgb(255, 255, 255)");
  for (const scale of [100, 200]) {
    await page.evaluate((scale) => {
      document.documentElement.style.fontSize = `${scale}%`;
    }, scale);
    for (const [width, columns] of [
      [320, 1],
      [390, 1],
      [768, 2],
      [1200, 3],
      [1440, 4],
    ]) {
      await page.setViewportSize({ width, height: 860 });
      await expect(library).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
        `${width}px / ${scale}%`,
      ).toBe(width);
      if (scale === 100)
        expect(
          await list.evaluate(
            (element) =>
              getComputedStyle(element).gridTemplateColumns.split(" ").length,
          ),
        ).toBe(columns);
      const targets = await library
        .locator("input[type=search], select, .library-card-open")
        .evaluateAll((controls) =>
          controls.map((control) => control.getBoundingClientRect().height),
        );
      expect(Math.min(...targets)).toBeGreaterThanOrEqual(44);
    }
  }
  const search = library.getByRole("searchbox", { name: "搜索节目" });
  await search.focus();
  await page.keyboard.press("Tab");
  await expect(library.getByLabel("制作状态")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    library.getByRole("combobox", { name: "语言", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(library.getByLabel("排序")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(library.getByRole("button", { name: "新建节目" })).toBeFocused();
  await page.keyboard.press("Tab");
  const opener = list.getByRole("button", { name: "Keyboard episode" });
  await expect(opener).toBeFocused();
  await expect(opener).toHaveAccessibleDescription(/研究草稿/);
  await page.keyboard.press("Enter");
  const detail = page.locator("#episode-title");
  await expect(detail).toBeFocused();
  await expect(page).toHaveURL(new RegExp(`episode=${start.id}`));
  await expect(opener).toHaveAttribute("aria-current", "true");
  await page.getByRole("button", { name: "返回节目列表" }).click();
  await expect(search).toBeFocused();
  expect(unexpected).toEqual([]);
});

test("offline filters preserve the selected detail and drafts across tabs, edits and backup restore", async ({
  page,
  context,
}) => {
  const unexpected = await watchPaidRequests(context);
  await page.goto(origin);
  await expect(libraryFor(page).getByText("此浏览器尚无节目。")).toBeVisible();
  const first = episode(12, "Park history", script("Park Stories"));
  first.finished = finished(first.id);
  first.syncToken = "fixture-checkpoint";
  const other = episode(11, "Sungai", { language: "ms" });
  await saveFixtures(page, [
    { episode: first, audio: "valid" },
    { episode: other },
  ]);
  const opener = libraryFor(page).getByRole("button", {
    name: "Park Stories",
    exact: true,
  });
  await expect(opener).toBeVisible();

  const second = await context.newPage();
  await second.goto(`/?studio=factory&episode=${first.id}`);
  await expect(second.locator("#episode-title")).toHaveText("Park Stories");
  await second.waitForFunction(() => !!navigator.serviceWorker.controller);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await expect(second.getByText("离线", { exact: true })).toBeVisible();
  const search = libraryFor(second).getByRole("searchbox", {
    name: "搜索节目",
  });
  await search.fill("Park");
  const ready = libraryFor(second).getByLabel("制作状态");
  await ready.selectOption("ready");
  await expect(
    libraryFor(second).getByRole("button", {
      name: "Park Stories",
      exact: true,
    }),
  ).toHaveAttribute("aria-current", "true");

  await opener.click();
  await page.getByRole("button", { name: "编辑脚本与声音" }).click();
  const draft = page.getByLabel("主持 A · intro-1");
  await draft.fill("An offline revision");
  const draftNode = await draft.elementHandle();
  const firstSearch = libraryFor(page).getByRole("searchbox", {
    name: "搜索节目",
  });
  await firstSearch.fill("Sungai");
  expect(
    await draft.evaluate((node, previous) => node === previous, draftNode),
  ).toBe(true);
  await expect(page).toHaveURL(new RegExp(`episode=${first.id}`));
  const decline = (dialog: Dialog) => dialog.dismiss();
  page.once("dialog", decline);
  await libraryFor(page)
    .getByRole("button", { name: "Sungai", exact: true })
    .click();
  await expect(draft).toHaveValue("An offline revision");
  page.once("dialog", decline);
  await libraryFor(page).getByRole("button", { name: "新建节目" }).click();
  await expect(page.getByRole("heading", { name: "播客资料库" })).toBeVisible();
  await page.getByRole("button", { name: "保存脚本" }).click();
  await expect(
    page.getByRole("heading", { name: "上一版成品音频" }),
  ).toBeVisible();
  await expect(page.getByLabel("成品音频播放器")).not.toHaveAttribute("src", /.+/);
  await page.getByRole("button", { name: "播放本期音频" }).click();
  await expect(
    libraryFor(second).getByRole("heading", { name: "找不到符合条件的节目" }),
  ).toBeVisible();
  await expect(second.locator("#episode-title")).toHaveText("Park Stories");
  await expect(
    second.getByText("An offline revision", { exact: true }),
  ).toBeVisible();
  await expect(second).toHaveURL(new RegExp(`episode=${first.id}`));
  await ready.selectOption("stale");
  await expect(
    libraryFor(second).getByRole("list", { name: "节目列表" }),
  ).toContainText("上一版音频");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "备份本期节目" }).click(),
  ]);
  const path = await download.path();
  expect(path).toBeTruthy();
  await page.getByLabel("节目备份文件").setInputFiles(path!);
  await expect(page.getByText("备份已恢复为本地副本。")).toBeVisible();
  await expect(libraryFor(second).getByRole("listitem")).toHaveCount(2);
  await expect(libraryFor(second).locator('[aria-current="true"]')).toHaveCount(
    1,
  );
  await expect(second).toHaveURL(new RegExp(`episode=${first.id}`));
  await expect(firstSearch).toHaveValue("Sungai");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "上一版成品音频" }),
  ).toBeVisible();
  await expect(page.getByLabel("成品音频播放器")).toHaveAttribute(
    "src",
    /^blob:/,
  );
  await libraryFor(page)
    .getByRole("button", { name: "Park Stories", exact: true })
    .and(page.locator("button:not([aria-current])"))
    .click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "删除", exact: true }).click();
  await expect(libraryFor(second).getByRole("listitem")).toHaveCount(1);
  await expect(second.getByText(/尚未在此浏览器找到这一期/)).toBeVisible();
  await expect(second).toHaveURL(new RegExp(`episode=${first.id}`));
  expect(unexpected).toEqual([]);
});

function playableEpisode(index: number, title: string) {
  const value = episode(index, title, script(title));
  value.finished = {
    ...finished(value.id),
    chapters: [
      { title: "Opening", start: 0 },
      { title: "Main story", start: 12 },
    ],
  };
  return value;
}

const playerFor = (page: Page) => page.locator(".factory-shell audio");
const barFor = (page: Page) => page.getByRole("contentinfo", { name: "音频播放器" });
const openEpisode = (page: Page, title: string) =>
  libraryFor(page).getByRole("button", { name: title, exact: true }).click();
const playbackTime = (page: Page) =>
  playerFor(page).evaluate((audio: HTMLAudioElement) => audio.currentTime);
const paused = (page: Page) =>
  playerFor(page).evaluate((audio: HTMLAudioElement) => audio.paused);

test("one engine keeps playing across navigation and new details until explicit audio selection", async ({
  page,
  context,
}) => {
  const unexpected = await watchPaidRequests(context);
  await page.goto(origin);
  await expect(libraryFor(page).getByText("此浏览器尚无节目。")).toBeVisible();
  const first = playableEpisode(15, "First playback");
  const second = playableEpisode(16, "Second playback");
  second.render = {
    revision: 1, model: "fixture",
    clips: { "intro-1": { asset: "preview.wav", duration: 40 } },
  };
  await saveFixtures(page, [
    { episode: first, audio: "valid", seconds: 90 },
    { episode: second, audio: "valid", seconds: 90 },
  ]);
  const player = playerFor(page);
  const bar = barFor(page);
  await expect(bar).toContainText("尚未选择音频");
  await openEpisode(page, first.topic);
  await page.getByRole("button", { name: "播放本期音频" }).click();
  await expect(bar.getByRole("button", { name: "暂停", exact: true })).toBeVisible();
  await expect.poll(() => playbackTime(page)).toBeGreaterThan(0);
  const before = await playbackTime(page);
  const original = (await player.getAttribute("src"))!;
  const element = await player.elementHandle();
  const navigation = page.getByRole("navigation", { name: "播客工作区导航" });
  for (const label of ["制作台", "自动化", "设置", "资料库"]) {
    const link = navigation.getByRole("link", { name: label, exact: true });
    await link.click();
    await expect(link).toHaveAttribute("aria-current", "page");
    await expect(player).toHaveAttribute("src", original);
    expect(await paused(page)).toBe(false);
    await expect(bar).toContainText(first.topic);
  }
  await openEpisode(page, second.topic);
  await expect(page.locator("#episode-title")).toHaveText(second.topic);
  await expect(player).toHaveAttribute("src", original);
  await expect.poll(() => playbackTime(page)).toBeGreaterThan(before);
  expect(await player.evaluate((node, prior) => node === prior, element)).toBe(true);
  expect(await page.evaluate(async (url) => (await fetch(url)).ok, original)).toBe(true);

  await page.getByRole("button", { name: "0:12 · Main story" }).click();
  await expect(bar).toContainText(second.topic);
  await expect.poll(() => playbackTime(page)).toBeGreaterThanOrEqual(12);
  const secondUrl = (await player.getAttribute("src"))!;
  expect(secondUrl).not.toBe(original);
  expect(await page.evaluate(async (url) => fetch(url).then(() => true, () => false), original))
    .toBe(false);
  await page.getByRole("button", { name: "试听此段" }).click();
  await expect(player).toHaveAttribute("src", secondUrl);
  await page.getByRole("button", { name: "播放片段" }).click();
  await expect(bar.getByText("配音预览", { exact: true }).first()).toBeVisible();
  await expect(player).not.toHaveAttribute("src", secondUrl);
  await expect(player).toHaveCount(1);
  expect(await player.evaluate((node, prior) => node === prior, element)).toBe(true);
  expect(unexpected).toEqual([]);
});

test("a script revision preserves the pinned WAV while replacement, corruption and deletion release it", async ({
  page,
  context,
}) => {
  const unexpected = await watchPaidRequests(context);
  await page.goto(origin);
  await expect(libraryFor(page).getByText("此浏览器尚无节目。")).toBeVisible();
  const item = playableEpisode(17, "Pinned audio");
  const writer = await context.newPage();
  await writer.goto(origin);
  await saveFixtures(writer, [{ episode: item, audio: "valid", seconds: 40 }]);
  await openEpisode(page, item.topic);
  await page.getByRole("button", { name: "播放本期音频" }).click();
  const player = playerFor(page);
  const bar = barFor(page);
  const original = (await player.getAttribute("src"))!;

  item.revision++;
  await saveFixtures(writer, [{ episode: item, audio: "valid", seconds: 40 }]);
  await expect(bar).toContainText("上一版成品音频");
  await expect(player).toHaveAttribute("src", original);
  expect(await paused(page)).toBe(false);
  item.finished = { ...item.finished!, revision: item.revision, asset: "replacement.wav" };
  await saveFixtures(writer, [{ episode: item, audio: "valid", seconds: 40 }]);
  await expect(bar).toContainText("音频已变更，请重新选择。");
  await expect(player).not.toHaveAttribute("src", /.+/);
  expect(await paused(page)).toBe(true);
  expect(await page.evaluate(async (url) => fetch(url).then(() => true, () => false), original))
    .toBe(false);
  await page.getByRole("button", { name: "播放本期音频" }).click();
  await expect(player).toHaveAttribute("src", /^blob:/);
  await saveFixtures(writer, [{ episode: item, audio: "corrupt", seconds: 40 }]);
  await expect(bar).toContainText("本地音频未通过验证");
  await expect(player).not.toHaveAttribute("src", /.+/);
  await expect(page.getByRole("button", { name: "播放本期音频" })).toHaveCount(0);
  await saveFixtures(writer, [{ episode: item, audio: "valid", seconds: 40 }]);
  await page.getByRole("button", { name: "播放本期音频" }).click();
  await saveFixtures(writer, [{ episode: item }]);
  await expect(bar).toContainText("本地音频已变更或不可用");
  await expect(player).not.toHaveAttribute("src", /.+/);
  await saveFixtures(writer, [{ episode: item, audio: "valid", seconds: 40 }]);
  await page.getByRole("button", { name: "播放本期音频" }).click();
  await saveFixtures(writer, [{ episode: item, deleted: true }]);
  await expect(bar).toContainText("节目已删除，播放已停止。");
  await expect(player).not.toHaveAttribute("src", /.+/);
  expect(await page.evaluate(() => sessionStorage.getItem("podcast-v2-playback"))).toBeNull();
  expect(unexpected).toEqual([]);
});

test("offline refresh restores only the verified asset and position, with no play request", async ({
  page,
  context,
}) => {
  const unexpected = await watchPaidRequests(context);
  await page.addInitScript(() => {
    const requests: string[] = [];
    Object.defineProperty(window, "testPlayRequests", { value: requests });
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      requests.push(this.src);
      return play.call(this);
    };
  });
  await page.goto(origin);
  await expect(libraryFor(page).getByText("此浏览器尚无节目。")).toBeVisible();
  const item = playableEpisode(18, "Offline story");
  await saveFixtures(page, [{ episode: item, audio: "valid", seconds: 40 }]);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await openEpisode(page, item.topic);
  await page.getByRole("button", { name: "0:12 · Main story" }).click();
  await expect.poll(() => playbackTime(page)).toBeGreaterThan(12);
  const original = await playerFor(page).getAttribute("src");
  const stored = await page.evaluate(() => JSON.parse(sessionStorage.getItem("podcast-v2-playback")!));
  expect(stored).toEqual({ episodeId: item.id, asset: item.finished!.asset, revision: 1, position: expect.any(Number) });
  await page.reload();
  await expect(page.getByText("离线", { exact: true })).toBeVisible();
  const bar = barFor(page);
  await expect(bar).toContainText(item.topic);
  await expect.poll(() => playbackTime(page)).toBeGreaterThanOrEqual(12);
  expect(await paused(page)).toBe(true);
  expect(await page.evaluate(() => Reflect.get(window, "testPlayRequests"))).toEqual([]);
  expect(await playerFor(page).getAttribute("src")).not.toBe(original);
  await bar.getByRole("button", { name: "播放", exact: true }).click();
  await expect.poll(() => paused(page)).toBe(false);
  expect(unexpected).toEqual([]);
});

test("Now Playing fits desktop and mobile at 200% text size and supports keyboard controls", async ({
  page,
  context,
}) => {
  const unexpected = await watchPaidRequests(context);
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.goto(origin);
  await expect(libraryFor(page).getByText("此浏览器尚无节目。")).toBeVisible();
  const item = playableEpisode(19, "Long podcast title for the expandable player");
  await saveFixtures(page, [{ episode: item, audio: "valid", seconds: 40 }]);
  await openEpisode(page, item.topic);
  await page.getByRole("button", { name: "播放本期音频" }).click();
  const bar = barFor(page);
  await bar.getByRole("button", { name: "暂停", exact: true }).click();
  await expect(bar).toHaveCSS("background-color", "rgb(34, 27, 52)");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(bar).toHaveCSS("background-color", "rgb(255, 255, 255)");
  const expand = bar.getByRole("button", { name: "展开正在播放" });
  const dialog = page.getByRole("dialog", { name: "正在播放" });
  for (const scale of [100, 200]) {
    await page.evaluate((size) => {
      document.documentElement.style.fontSize = `${size}%`;
    }, scale);
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 720 });
      await page.evaluate(() => window.scrollTo(0, 0));
      const box = (await bar.boundingBox())!;
      expect(box.y + box.height, `${width}px / ${scale}%`).toBeCloseTo(720, 0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      expect((await expand.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      const inlineSeek = bar.getByRole("slider", { name: "播放进度" });
      if (width >= 768) await expect(inlineSeek).toBeVisible();
      else await expect(inlineSeek).toHaveCount(0);
      await expand.press("Enter");
      await expect(dialog.getByRole("button", { name: "关闭" })).toBeFocused();
      const expanded = (await dialog.boundingBox())!;
      expect(expanded.x).toBeGreaterThanOrEqual(0);
      expect(expanded.x + expanded.width).toBeLessThanOrEqual(width);
      expect(expanded.y).toBeGreaterThanOrEqual(0);
      expect(expanded.y + expanded.height).toBeLessThanOrEqual(720);
      await page.keyboard.press("Tab");
      await expect(dialog.getByRole("slider", { name: "播放进度" })).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(expand).toBeFocused();
    }
  }
  await expand.press("Enter");
  const seek = dialog.getByRole("slider", { name: "播放进度" });
  await seek.press("Home");
  await seek.press("ArrowRight");
  await expect.poll(() => playbackTime(page)).toBeGreaterThan(0);
  await dialog.getByRole("button", { name: "0:12 · Main story" }).press("Space");
  await expect.poll(() => playbackTime(page)).toBeCloseTo(12);
  expect(await paused(page)).toBe(true);
  await dialog.getByLabel("播放速度").selectOption("1.5");
  expect(await playerFor(page).evaluate((audio: HTMLAudioElement) => audio.playbackRate)).toBe(1.5);
  await dialog.getByRole("button", { name: "播放", exact: true }).press("Enter");
  await expect.poll(() => paused(page)).toBe(false);
  expect(unexpected).toEqual([]);
});

test("a missing worker checkpoint unlocks the saved script only after the worker confirms its absence", async ({
  page,
  context,
}) => {
  const unexpected = await watchPaidRequests(context);
  const item = episode(20, "Interrupted transfer", {
    ...script("Recovered script"),
    syncToken: "previous-checkpoint",
    job: { stage: "audio", status: "running" },
  });
  let status = 503;
  await context.route("**/api/studio/episodes/" + item.id, (route) =>
    route.fulfill({
      status,
      json: { error: "Fixture checkpoint unavailable" },
    }),
  );
  await page.goto(origin);
  await expect(libraryFor(page).getByText("此浏览器尚无节目。")).toBeVisible();
  await saveFixtures(page, [{ episode: item }]);
  await libraryFor(page)
    .getByRole("button", { name: "Recovered script", exact: true })
    .click();
  const detail = page.locator("#factory-selection");
  await expect(
    detail.getByRole("button", { name: "删除", exact: true }),
  ).toBeDisabled();
  status = 404;
  await page.reload();
  await expect(
    detail.getByRole("button", { name: "编辑脚本与声音" }),
  ).toBeEnabled({ timeout: 9000 });
  await expect(
    detail.getByRole("button", { name: "删除", exact: true }),
  ).toBeEnabled();
  await expect(
    detail.getByText("Saved opening", { exact: true }),
  ).toBeVisible();
  await expect(detail.getByRole("button", { name: "取消任务" })).toHaveCount(0);
  expect(unexpected).toEqual([]);
});

test("an interrupted creation keeps its ID and draft across refresh and needs fresh consent", async ({
  page,
  context,
}) => {
  const unexpected = await watchPaidRequests(context);
  const ids: string[] = [];
  await context.route("**/api/studio/episodes", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    ids.push(route.request().postDataJSON().id);
    await route.abort("connectionreset");
  });
  await page.goto("/?studio=factory&view=studio");
  const topic = page.getByLabel("播客主题");
  const studio = page.getByRole("main", { name: "播客制作台" });
  const hosts = studio.getByRole("combobox", { name: "主持人数" });
  const consent = page.getByRole("checkbox", { name: /同意本次 OpenAI/ });
  const submit = page.getByRole("button", { name: "制作整集播客" });
  await topic.fill("Reusable request");
  await hosts.selectOption("2");
  await consent.check();
  await submit.click();
  await expect.poll(() => ids.length).toBe(1);
  await page.reload();
  await expect(topic).toHaveValue("Reusable request");
  await expect(hosts).toHaveValue("2");
  await expect(consent).not.toBeChecked();
  await expect(submit).toBeDisabled();
  await consent.check();
  await submit.click();
  await expect.poll(() => ids.length).toBe(2);
  expect(ids[1]).toBe(ids[0]);
  expect(unexpected).toEqual([]);
});
