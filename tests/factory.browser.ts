import { expect, test, type Page } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buffer } from "node:stream/consumers";
import { episodeAssets } from "../shared/episode-record";
import type { Episode, EpisodeSummary } from "../shared/factory";

async function downloadBytes(page: Page, button: string) {
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: button, exact: true }).click();
  const download = await pending;
  return buffer(await download.createReadStream());
}

async function readCommittedEpisode(page: Page, id: string) {
  return page.evaluate(async (id) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open("knowledge-podcast-library");
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    try {
      const request = db
        .transaction("episodes")
        .objectStore("episodes")
        .get(id);
      const row = await new Promise<
        {
          episode: Episode;
          assets: Record<string, Blob | { bytes: ArrayBuffer; type: string }>;
        } | undefined
      >((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      return (
        row && {
          episode: row.episode,
          assets: Object.fromEntries(
            Object.entries(row.assets).map(([asset, audio]) => [
              asset,
              {
                type: audio.type,
                size: audio instanceof Blob ? audio.size : audio.bytes.byteLength,
              },
            ]),
          ),
        }
      );
    } finally {
      db.close();
    }
  }, id);
}

test("autonomous worker hands off audio and research, then offline editing and backup restore work", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "播客资料库" })).toBeVisible();
  const library = page.getByRole("complementary", { name: "浏览器节目" });
  await expect(library).toBeVisible();
  await expect(library.getByText("此浏览器尚无节目。")).toBeVisible();
  const nav = page.getByRole("navigation", { name: "播客工作区导航" });
  await nav.getByRole("link", { name: "设置" }).click();
  await page.getByLabel("OpenAI API 密钥").fill("sk-fixture-browser-only");
  await page.getByRole("button", { name: "设置密钥", exact: true }).click();
  await expect(page.getByText(/已接收密钥/)).toBeVisible();

  await nav.getByRole("link", { name: "自动化" }).click();
  await page
    .getByLabel("选题兴趣与听众")
    .fill("Singapore for curious commuters");
  await page.getByLabel("启用无人值守选题").check();
  await page.getByLabel("同意按保存的上限").check();
  const wavRequest = /\/api\/studio\/episodes\/[^/]+\/audio\?asset=/;
  let allowWav = false;
  let wavDownloads = 0;
  await page.route(wavRequest, async (route) => {
    if (!allowWav) {
      await route.fulfill({ status: 404 });
      return;
    }
    wavDownloads++;
    await route.continue();
  });
  await page.getByRole("button", { name: "保存偏好并应用排程" }).click();
  await nav.getByRole("link", { name: "资料库" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "音频检查点已变化或无法下载" }),
  ).toBeVisible({ timeout: 10_000 });
  const listStaged = async (): Promise<EpisodeSummary[]> => {
    const response = await page.request.get("/api/studio/episodes");
    expect(response.ok()).toBe(true);
    return (await response.json()).episodes;
  };
  const [staged] = await listStaged();
  expect(staged).toMatchObject({
    title: "Fixture episode",
    hasScript: true,
    hasAudio: true,
  });
  const pathToEpisode = "/api/studio/episodes/" + staged.id;
  const snapshot = await page.request.get(pathToEpisode);
  expect(snapshot.ok()).toBe(true);
  const episode: Episode = await snapshot.json();
  expect(episode.job).toBeUndefined();
  expect(episode.finished?.transcript?.text).toBeTruthy();
  expect(
    (await readCommittedEpisode(page, staged.id))?.episode.syncToken,
  ).not.toBe(episode.syncToken);

  const handoffRequest = new RegExp(pathToEpisode + "/handoff$");
  let allowHandoff = false;
  await page.route(handoffRequest, async (route) => {
    expect(route.request().postDataJSON()).toEqual({
      syncToken: episode.syncToken,
    });
    if (allowHandoff) {
      await route.continue();
      return;
    }
    const saved = await readCommittedEpisode(page, staged.id);
    if (!saved) throw new Error("Handoff started before the browser commit.");
    expect(saved.episode).toEqual(episode);
    expect(Object.keys(saved.assets).sort()).toEqual(
      episodeAssets(episode)
        .map(({ asset }) => asset)
        .sort(),
    );
    for (const { asset, type } of episodeAssets(episode)) {
      expect(saved.assets[asset].type).toBe(type);
      expect(saved.assets[asset].size).toBeGreaterThan(44);
    }
    await route.fulfill({
      status: 503,
      json: { error: "Fixture handoff unavailable." },
    });
  });
  allowWav = true;
  await expect(
    page.getByRole("alert").filter({ hasText: "Fixture handoff unavailable." }),
  ).toBeVisible({ timeout: 10_000 });
  await expect(
    library.getByRole("button", { name: "Fixture episode", exact: true }),
  ).toBeVisible();
  expect((await listStaged()).map(({ id }) => id)).toEqual([staged.id]);

  allowHandoff = true;
  await page.reload();
  await library.getByRole("button", { name: "Fixture episode", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "成品音频", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("从成品音频转录", { exact: true })).toBeVisible();
  await expect(
    page.locator("#factory-selection").getByText("待试听核对", { exact: false }),
  ).toBeVisible();
  await expect(page.getByText(/3 位主持/)).toBeVisible();
  await expect(page.getByText("主持 C", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Independent example" }).first(),
  ).toHaveAttribute("href", "https://independent.test/example");
  await expect.poll(listStaged, { timeout: 10_000 }).toEqual([]);
  await expect(
    page.getByText("节目同步未完成。", { exact: false }),
  ).toHaveCount(0);
  expect(wavDownloads).toBe(1);
  await page.unroute(handoffRequest);
  await page.unroute(wavRequest);

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载 WAV" }).click();
  expect((await download).suggestedFilename()).toMatch(/^podcast-.*\.wav$/);
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText("离线", { exact: true })).toBeVisible();
  const player = page.getByLabel("成品音频播放器");
  await expect(player).not.toHaveAttribute("src", /.+/);
  await page.getByRole("button", { name: "0:00 · What happened" }).click();
  await expect(player).toHaveAttribute("src", /^blob:/);
  await expect
    .poll(() => player.evaluate((audio: HTMLAudioElement) => audio.duration))
    .toBeGreaterThan(0);
  await expect
    .poll(() => player.evaluate((audio: HTMLAudioElement) => audio.currentTime))
    .toBeGreaterThan(0);
  await page.getByRole("button", { name: "编辑脚本与声音" }).click();
  const draft = page.getByLabel("主持 A · ch1-1");
  await draft.fill("An edited opening.");
  const draftNode = await draft.elementHandle();
  const episodeParam = new URL(page.url()).searchParams.get("episode");
  await nav.getByRole("link", { name: "制作台" }).click();
  await expect(draft).toHaveValue("An edited opening.");
  await nav.getByRole("link", { name: "设置" }).click();
  await expect(player).toBeHidden();
  await page.getByRole("link", { name: "本地编辑器" }).click();
  const localTitle = page.getByRole("textbox", { name: "项目标题" });
  await localTitle.fill("Local editor draft");
  const localNode = await localTitle.elementHandle();
  await page.getByRole("link", { name: "打开播客制作台" }).click();
  await expect(nav.getByRole("link", { name: "设置" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await nav.getByRole("link", { name: "资料库" }).click();
  expect(new URL(page.url()).searchParams.get("episode")).toBe(episodeParam);
  await expect(draft).toHaveValue("An edited opening.");
  expect(
    await draft.evaluate((node, previous) => node === previous, draftNode),
  ).toBe(true);
  await page.getByRole("link", { name: "本地编辑器" }).click();
  await expect(localTitle).toHaveValue("Local editor draft");
  expect(
    await localTitle.evaluate((node, previous) => node === previous, localNode),
  ).toBe(true);
  await page.getByRole("link", { name: "打开播客制作台" }).click();
  await page.getByLabel("主持 B 的声音").selectOption("alloy");
  await page.getByRole("button", { name: "保存脚本" }).click();
  await expect(
    page.getByRole("heading", { name: "上一版成品音频" }),
  ).toBeVisible();
  await expect(
    page.getByText("An edited opening.", { exact: true }),
  ).toBeVisible();

  const path = await mkdtemp(join(tmpdir(), "podcast-browser-backup-"));
  try {
    const backup = page.waitForEvent("download");
    await page.getByRole("button", { name: "备份本期节目" }).click();
    const file = join(path, (await backup).suggestedFilename());
    await (await backup).saveAs(file);
    await page.getByLabel("节目备份文件").setInputFiles(file);
    await expect(page.getByText("备份已恢复为本地副本。")).toBeVisible();
    await expect(
      library.getByRole("button", { name: "Fixture episode", exact: true }),
    ).toHaveCount(2);
    await expect(
      page.getByText("An edited opening.", { exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "上一版成品音频" }),
    ).toBeVisible();
    await expect(player).toHaveAttribute("src", /^blob:/);
    await page.getByRole("button", { name: "0:00 · What happened" }).click();
    await expect
      .poll(() =>
        player.evaluate((audio: HTMLAudioElement) => audio.currentTime),
      )
      .toBeGreaterThan(0);
    await expect(
      page.getByRole("link", { name: "Independent example" }).first(),
    ).toHaveAttribute("href", "https://independent.test/example");
    await expect(
      page.getByText(episode.finished!.transcript!.text, { exact: true }),
    ).toBeVisible();

    await context.setOffline(false);
    await expect(page.getByText("制作进程在线", { exact: true })).toBeVisible();
    await page.getByLabel("我同意本次 OpenAI 请求").check();
    await page.getByRole("button", { name: "生成整集配音" }).click();
    await expect(
      page.getByRole("heading", { name: "成品音频", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("从成品音频转录", { exact: true }),
    ).toBeVisible();
  } finally {
    await rm(path, { recursive: true, force: true });
  }

  await page.getByRole("button", { name: "复制脚本到本地编辑器" }).click();
  await expect(page.getByText(/已复制脚本到本地编辑器/)).toBeVisible();
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(library).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
  }
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "";
  });
  await context.setOffline(true);
  await page.getByRole("link", { name: "本地编辑器" }).click();
  await expect(page.getByLabel("项目标题")).toHaveValue("Fixture episode");
  await expect(page.getByLabel("片段 1 脚本")).toHaveValue(
    "An edited opening.",
  );
  await expect(
    page.getByRole("option", { name: "OpenAI · 浏览器 BYOK" }),
  ).toHaveCount(0);
});

test("manual Studio creation saves an exact two-speaker episode and recovers it offline", async ({
  page,
  context,
  browser,
}) => {
  const topic = "新加坡的组屋为何能容纳不同族群？";
  const providerRequests: string[] = [];
  await page.route("https://api.openai.com/**", async (route) => {
    providerRequests.push(route.request().url());
    await route.abort();
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?studio=factory&view=settings");
  const key = page.getByLabel("OpenAI API 密钥");
  await expect(key).toBeVisible();
  const clearKey = page.getByRole("button", { name: "清除会话密钥" });
  if (await clearKey.isVisible()) await clearKey.click();
  await expect(page.getByText(/尚无密钥/)).toBeVisible();

  const nav = page.getByRole("navigation", { name: "播客工作区导航" });
  await nav.getByRole("link", { name: "制作台" }).click();
  const studio = page.getByRole("main", { name: "播客制作台" });
  const submit = studio.getByRole("button", { name: "制作整集播客" });
  const topicInput = studio.getByRole("textbox", { name: "播客主题" });
  const consent = studio.getByRole("checkbox", { name: /同意本次 OpenAI/ });
  const hosts = studio.getByRole("combobox", { name: "主持人数" });
  await expect(hosts).toHaveValue("auto");
  await topicInput.fill(topic);
  await expect(studio.getByText("需要 OpenAI 密钥")).toBeVisible();
  await expect(consent).toBeDisabled();
  await expect(submit).toBeDisabled();
  await studio.getByRole("link", { name: "前往设置" }).click();
  await key.fill("sk-fixture-browser-only");
  await page.getByRole("button", { name: "设置密钥", exact: true }).click();
  await expect(page.getByText(/已接收密钥/)).toBeVisible();
  await nav.getByRole("link", { name: "制作台" }).click();
  await expect(studio.getByText("可以开始制作")).toBeVisible();
  await expect(topicInput).toHaveValue(topic);
  await expect(submit).toBeDisabled();
  await consent.check();
  await hosts.selectOption("2");
  await expect(consent).not.toBeChecked();
  await expect(submit).toBeDisabled();
  await consent.check();
  await expect(submit).toBeEnabled();
  const submitted = page.waitForRequest(
    (request) =>
      request.method() === "POST" &&
      new URL(request.url()).pathname === "/api/studio/episodes",
  );
  await submit.click();
  expect((await submitted).postDataJSON().exactHosts).toBe(2);

  const episode = studio.getByRole("region", { name: "Fixture episode" });
  const stages = episode.getByRole("list", { name: "制作阶段" });
  await expect(stages.getByText("已保存", { exact: true })).toHaveCount(5, {
    timeout: 10_000,
  });
  for (const name of [
    "网页研究",
    "节目大纲",
    "节目脚本",
    "节目配音",
    "音频转录",
  ]) {
    await expect(stages.getByText(name)).toBeVisible();
  }
  await expect(episode.getByText(topic, { exact: true })).toBeVisible();
  await expect(episode.getByText(/2 位主持/)).toBeVisible();
  await expect(
    studio.getByRole("heading", { name: "音频转录与脚本对照" }),
  ).toBeVisible();
  await expect(studio.getByRole("button", { name: "下载 WAV" })).toBeEnabled();
  const episodeId = new URL(page.url()).searchParams.get("episode");
  expect(episodeId).toBeTruthy();

  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(stages).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
      `Studio result at ${width}px`,
    ).toBeLessThanOrEqual(width);
  }

  await nav.getByRole("link", { name: "资料库" }).click();
  const library = page.getByRole("complementary", { name: "浏览器节目" });
  await expect(
    library.getByRole("button", { name: "Fixture episode", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "音频转录与脚本对照" }),
  ).toBeVisible();
  expect(new URL(page.url()).searchParams.get("episode")).toBe(episodeId);
  await expect
    .poll(async () => {
      const response = await page.request.get("/api/studio/episodes");
      const { episodes } = (await response.json()) as {
        episodes: EpisodeSummary[];
      };
      return episodes.some(({ id }) => id === episodeId);
    })
    .toBe(false);

  const originalWav = await downloadBytes(page, "下载 WAV");
  expect(originalWav.toString("ascii", 8, 12)).toBe("WAVE");
  expect(originalWav.length).toBeGreaterThan(44);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "音频转录与脚本对照" }),
  ).toBeVisible();
  expect((await downloadBytes(page, "下载 WAV")).equals(originalWav)).toBe(true);
  const backup = await downloadBytes(page, "备份本期节目");
  const recovery = await browser.newContext();
  try {
    const copy = await recovery.newPage();
    await copy.goto(new URL("/", page.url()).href);
    await expect(copy.getByText("此浏览器尚无节目。")).toBeVisible();
    await copy.waitForFunction(() => !!navigator.serviceWorker.controller);
    await recovery.setOffline(true);
    await copy.getByLabel("节目备份文件").setInputFiles({
      name: "two-speakers.kps",
      mimeType: "application/octet-stream",
      buffer: backup,
    });
    await expect(copy.getByText("备份已恢复为本地副本。")).toBeVisible();
    await copy.reload();
    await expect(
      copy.getByRole("heading", { name: "音频转录与脚本对照" }),
    ).toBeVisible();
    const copyId = new URL(copy.url()).searchParams.get("episode");
    if (!copyId) throw new Error("Missing restored episode ID");
    expect(copyId).not.toBe(episodeId);
    const saved = (await readCommittedEpisode(copy, copyId))?.episode;
    expect(saved?.voices).toEqual({ A: "marin", B: "cedar" });
    expect(new Set(saved?.script?.turns.map(({ host }) => host))).toEqual(
      new Set(["A", "B"]),
    );
    expect((await downloadBytes(copy, "下载 WAV")).equals(originalWav)).toBe(true);
    await copy.getByRole("button", { name: "0:00 · What happened" }).click();
    const player = copy.getByLabel("成品音频播放器");
    await expect
      .poll(() => player.evaluate((audio: HTMLAudioElement) => audio.currentTime))
      .toBeGreaterThan(0);
  } finally {
    await recovery.close();
  }
  expect(providerRequests).toEqual([]);
});

test("all four destinations reflow across shell breakpoints and at 200% text size", async ({
  page,
}) => {
  await page.goto("/?source=qa");
  const nav = page.getByRole("navigation", { name: "播客工作区导航" });
  const library = page.getByRole("complementary", { name: "浏览器节目" });
  const heading = page.getByRole("heading", { level: 1 });
  const destinations = [
    ["资料库", "播客资料库"],
    ["制作台", "播客制作台"],
    ["自动化", "自动化"],
    ["设置", "设置"],
  ];

  for (const [scale, widths] of [
    [100, [320, 390, 767, 768, 1199, 1200, 1440]],
    [200, [320, 390, 768, 1440]],
  ] as const) {
    await page.evaluate((scale) => {
      document.documentElement.style.fontSize = `${scale}%`;
    }, scale);
    const textSize = await page.evaluate(() =>
      parseFloat(getComputedStyle(document.documentElement).fontSize),
    );
    expect(textSize).toBe((16 * scale) / 100);
    for (const width of widths) {
      await page.setViewportSize({ width, height: 860 });
      for (const [label, title] of destinations) {
        await nav.getByRole("link", { name: label }).click();
        await expect(heading).toHaveText(title);
        await expect(nav.locator('[aria-current="page"]')).toHaveText(label);
        const dimensions = await page.evaluate(() => {
          const nav = document
            .querySelector(".factory-nav")!
            .getBoundingClientRect();
          const main = document
            .querySelector(".factory-main")!
            .getBoundingClientRect();
          return {
            page: document.documentElement.scrollWidth,
            viewport: document.documentElement.clientWidth,
            navRight: nav.right,
            navBottom: nav.bottom,
            mainTop: main.top,
            mainLeft: main.left,
          };
        });
        expect(dimensions.page, `${label} at ${width}px / ${scale}%`).toBe(
          dimensions.viewport,
        );
        if (width >= 1200)
          expect(dimensions.navRight).toBeLessThanOrEqual(dimensions.mainLeft);
        else
          expect(dimensions.navBottom).toBeLessThanOrEqual(dimensions.mainTop);
        if (label === "资料库") {
          await expect(library).toBeVisible();
        } else {
          await expect(library).toBeHidden();
        }
        if (label === "制作台")
          await expect(page.getByLabel("播客主题")).toBeVisible();
      }
    }
  }
});

test("keyboard navigation, offline URL history, and appearance preferences work together", async ({
  page,
  context,
}) => {
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?studio=factory&episode=missing&source=qa");
  const heading = page.getByRole("heading", { level: 1 });
  await expect(heading).toHaveText("播客资料库");

  const skip = page.getByRole("link", { name: "跳到主要内容" });
  await page.keyboard.press("Tab");
  await expect(skip).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(heading).toBeFocused();

  const nav = page.getByRole("navigation", { name: "播客工作区导航" });
  const studio = nav.getByRole("link", { name: "制作台" });
  await nav.getByRole("link", { name: "资料库" }).focus();
  await page.keyboard.press("Tab");
  await expect(studio).toBeFocused();
  await expect(studio).toHaveCSS("outline-style", "solid");
  await expect(studio).toHaveCSS("transition-duration", "0s");
  await page.keyboard.press("Enter");
  await expect(heading).toHaveText("播客制作台");
  await expect(heading).toBeFocused();
  await expect(studio).toHaveAttribute("aria-current", "page");
  expect(Object.fromEntries(new URL(page.url()).searchParams)).toEqual({
    studio: "factory",
    episode: "missing",
    source: "qa",
    view: "studio",
  });

  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await expect(page.getByText("离线", { exact: true })).toBeVisible();
  await page.goBack();
  await expect(heading).toHaveText("播客资料库");
  await page.goForward();
  await expect(heading).toHaveText("播客制作台");
  await page.reload();
  await expect(heading).toHaveText("播客制作台");
  await expect(page.getByText(/尚未在此浏览器找到这一期/)).toBeVisible();

  const shell = page.locator(".factory-shell");
  await expect(shell).toHaveCSS("color-scheme", "dark");
  await expect(shell).toHaveCSS("background-color", "rgb(23, 19, 36)");
  await nav.getByRole("link", { name: "设置" }).click();
  const theme = page.getByLabel("外观");
  await expect(theme).toHaveValue("system");
  await theme.selectOption("light");
  await expect(shell).toHaveCSS("color-scheme", "light");
  await page.reload();
  await expect(theme).toHaveValue("light");
  await theme.selectOption("dark");
  await expect(shell).toHaveCSS("color-scheme", "dark");
  await theme.selectOption("system");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(shell).toHaveCSS("color-scheme", "light");
});
