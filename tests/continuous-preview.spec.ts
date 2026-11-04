import { expect, test } from "@playwright/test";

test("previews current segments in order without generating new audio", async ({
  page,
}) => {
  let requests = 0;
  await page.route("https://api.openai.com/**", async (route) => {
    requests++;
    await route.abort();
  });
  await page.goto("./");
  await page.getByRole("button", { name: "新建项目" }).first().click();
  await page.getByLabel("片段 1 脚本").fill("第一段。");
  await page.getByRole("button", { name: "添加片段" }).click();
  await page.getByLabel("片段 2 脚本").fill("第二段。");
  await page.getByRole("button", { name: "添加片段" }).click();
  await page.getByLabel("片段 3 脚本").fill("第三段。");
  await page.getByRole("button", { name: "生成模拟提示音" }).click();
  await expect(page.getByText("已模拟", { exact: true })).toHaveCount(3);
  await expect(page.getByText("已保存在此设备")).toBeVisible();
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("knowledge-podcast-studio");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const projects = await new Promise<
      Array<{ segments: Array<{ text: string; audio: Blob }> }>
    >((resolve, reject) => {
      const request = db
        .transaction("projects")
        .objectStore("projects")
        .getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const project = projects.find((p) => p.segments.length === 3)!;
    for (let i = 0; i < project.segments.length; i++) {
      const data = await project.segments[i].audio.arrayBuffer();
      new DataView(data).setInt16(44, (i + 1) * 111, true);
      project.segments[i].audio = new Blob([data], { type: "audio/wav" });
    }
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("projects", "readwrite");
      tx.objectStore("projects").put(project);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });
  await page.reload();
  const start = page.getByLabel("从片段开始试听");
  await expect(start).toBeVisible({ timeout: 3000 });
  await start.selectOption({ label: "片段 2" });
  await page.getByRole("button", { name: "准备连续试听" }).click();
  const player = page.getByLabel("连续试听播放器");
  await expect(player).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect
    .poll(() => player.evaluate((audio: HTMLAudioElement) => audio.duration))
    .toBeCloseTo(2, 1);
  expect(
    await player.evaluate(async (audio: HTMLAudioElement) => {
      const data = new DataView(await (await fetch(audio.src)).arrayBuffer());
      return [data.getInt16(44, true), data.getInt16(44 + 32000, true)];
    }),
  ).toEqual([222, 333]);
  await player.evaluate(async (audio: HTMLAudioElement) => {
    await audio.play();
    audio.currentTime = 1;
    audio.pause();
  });
  expect(await player.evaluate((audio: HTMLAudioElement) => audio.paused)).toBe(
    true,
  );
  await player.evaluate(async (audio: HTMLAudioElement) => {
    await audio.play();
  });
  expect(await player.evaluate((audio: HTMLAudioElement) => audio.paused)).toBe(
    false,
  );
  await player.evaluate((audio: HTMLAudioElement) => audio.pause());
  expect(
    await player.evaluate((audio: HTMLAudioElement) => audio.currentTime),
  ).toBeGreaterThan(0.9);
  await page.getByRole("button", { name: "关闭连续试听" }).click();
  await expect(player).toHaveCount(0);
  await start.selectOption({ label: "片段 3" });
  await page.getByRole("button", { name: "准备连续试听" }).click();
  await expect(player).toBeVisible();
  await page.getByLabel("片段 3 脚本").fill("第三段已修改。");
  await expect(player).toHaveCount(0);
  await page.getByRole("button", { name: "准备连续试听" }).click();
  await expect(page.getByRole("alert")).toContainText("需要重新生成");
  expect(requests).toBe(0);
});
