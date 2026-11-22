import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createAudioBackup } from "../src/audio-backup";
import { pcmToWav } from "../src/browser-tts";
import { makeProject, type AudioTake, type Project } from "../src/model";

function openAITake(project: Project, text: string): AudioTake {
  return {
    audio: pcmToWav([new Float32Array(160).fill(0.2)], 16000),
    audioKind: "openai",
    audioFor: text,
    voice: project.voice,
    instructions: project.instructions,
    audioVerified: true,
    provenance: {
      requestedModel: "gpt-realtime-2.1-mini",
      effectiveVoice: project.voice,
      responseStatus: "completed",
    },
  };
}

async function importAudioFixture(page: Page, project: Project) {
  const fixture = await createAudioBackup(project);
  await page.getByLabel("导入音频备份").setInputFiles({
    name: "openai-takes.json",
    mimeType: "application/json",
    buffer: Buffer.from(await fixture.arrayBuffer()),
  });
  await expect(page.getByText("音频备份已导入并保存")).toBeVisible();
  return JSON.parse(await fixture.text());
}

async function downloadAudioBackup(page: Page) {
  page.once("dialog", (dialog) => dialog.accept());
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "备份脚本与音频" }).click();
  return JSON.parse(await readFile((await (await download).path())!, "utf8"));
}

let providerRequests: number;
test.beforeEach(async ({ context }) => {
  providerRequests = 0;
  await context.route("https://api.openai.com/**", async (route) => {
    providerRequests++;
    await route.abort();
  });
});
test.afterEach(() => expect(providerRequests).toBe(0));

for (const generation of ["single", "batch"] as const) {
  test(`demo ${generation} generation preserves saved OpenAI takes`, async ({
    page,
  }) => {
    const project = makeProject();
    const take = openAITake(project, "已核验片段。");
    project.segments = [
      { id: crypto.randomUUID(), text: take.audioFor, ...take },
      {
        id: crypto.randomUUID(),
        text: "脚本后来修改过。",
        ...take,
        audioFor: "原有脚本。",
        audioVerified: false,
        provenance: {
          requestedModel: "gpt-realtime-2.1-mini",
          responseStatus: "incomplete",
        },
      },
      { id: crypto.randomUUID(), text: "可以模拟的片段。" },
      {
        id: crypto.randomUUID(),
        text: "有 OpenAI 备选录音的片段。",
        ...take,
        audioKind: "demo",
        audioFor: "旧版演示脚本。",
        audioVerified: false,
        provenance: undefined,
        alternative: { ...take, audioFor: "有 OpenAI 备选录音的片段。" },
      },
    ];
    await page.goto("./");
    const original = await importAudioFixture(page, project);
    await page.getByLabel("生成模式").selectOption("openai");
    await expect(page.getByText("已核验", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("生成模式")).toHaveValue("demo");

    if (generation === "single") {
      await expect(
        page.getByRole("button", { name: "模拟片段 1", exact: true }),
      ).toBeDisabled({ timeout: 2000 });
      await expect(
        page.getByRole("button", { name: "模拟片段 2", exact: true }),
      ).toBeDisabled();
      await expect(
        page.getByRole("button", { name: "模拟片段 4", exact: true }),
      ).toBeDisabled();
      await page
        .getByRole("button", { name: "模拟片段 3", exact: true })
        .click();
    } else {
      await page.getByRole("button", { name: "生成模拟提示音" }).click();
    }
    await expect(page.getByRole("status").first()).toContainText("模拟完成");
    await page.reload();
    await expect(page.getByText("已模拟", { exact: true })).toHaveCount(1, {
      timeout: 2000,
    });
    await expect(page.getByText("已保留 OpenAI 录音")).toHaveCount(3);
    const saved = await downloadAudioBackup(page);
    expect(saved.segments.slice(0, 2)).toEqual(original.segments.slice(0, 2));
    expect(saved.segments[2].take.audioKind).toBe("demo");
    expect(saved.segments[3]).toEqual(original.segments[3]);

    if (generation === "batch") {
      const alert = page.getByRole("alert");
      await page.getByRole("button", { name: "下载完整 WAV 提示音" }).click();
      await expect(alert).toContainText(
        "片段 1、片段 2、片段 4 受 OpenAI 录音保护",
      );
      await expect(alert).toContainText("按段下载");
      await page.getByLabel("从片段开始试听").selectOption({ label: "片段 3" });
      await page.getByRole("button", { name: "准备连续试听" }).click();
      await expect(alert).toContainText("片段 4 受 OpenAI 录音保护");
      await expect(alert).not.toContainText("片段 1");
      await expect(alert).toContainText("按段下载");
      const download = page.waitForEvent("download");
      await page
        .getByRole("button", { name: "下载 WAV 提示音", exact: true })
        .click();
      const bytes = await readFile((await (await download).path())!);
      expect(bytes.subarray(0, 4).toString()).toBe("RIFF");
    }
  });
}

test("an all-protected demo batch makes zero project writes", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const put = IDBObjectStore.prototype.put;
    let writes = 0;
    Object.defineProperty(window, "projectWrites", { get: () => writes });
    IDBObjectStore.prototype.put = function (value, key) {
      if (this.name === "projects") writes++;
      return key === undefined
        ? put.call(this, value)
        : put.call(this, value, key);
    };
  });
  const project = makeProject();
  const take = openAITake(project, "受保护的片段。");
  project.segments[0] = {
    ...project.segments[0],
    text: take.audioFor,
    ...take,
  };
  await page.goto("./");
  const original = await importAudioFixture(page, project);
  const writes = () =>
    page.evaluate(
      () => (window as unknown as { projectWrites: number }).projectWrites,
    );
  const before = await writes();
  expect(before).toBeGreaterThan(0);
  await page.getByRole("button", { name: "生成模拟提示音" }).click();
  await expect(page.getByRole("alert")).toContainText("没有需要生成的非空片段");
  expect((await downloadAudioBackup(page)).segments).toEqual(original.segments);
  expect(await writes()).toBe(before);
});

for (const generation of ["single", "batch"] as const) {
  test(`stale-tab demo ${generation} cannot overwrite a newer OpenAI take`, async ({
    page,
    context,
  }) => {
    const project = makeProject();
    project.title = "跨标签页录音保护";
    project.segments[0].text = "另一标签页将保存录音。";
    await page.goto("./");
    await importAudioFixture(page, project);
    const other = await context.newPage();
    await other.goto("./");
    await expect(other.getByLabel("项目标题")).toHaveValue(project.title);
    const take = openAITake(project, project.segments[0].text);
    const expected = JSON.parse(
      await (
        await createAudioBackup({
          ...project,
          segments: [{ ...project.segments[0], ...take }],
        })
      ).text(),
    );
    const { audio, ...metadata } = take;
    await other.evaluate(
      async ({ title, bytes, metadata }) => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open("knowledge-podcast-studio");
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        try {
          // Emulate the newer tab committing a completed provider result.
          await new Promise<void>((resolve, reject) => {
            const tx = db.transaction("projects", "readwrite");
            const store = tx.objectStore("projects");
            const request = store.getAll();
            request.onsuccess = () => {
              const project = request.result.find(
                (project) => project.title === title,
              );
              if (!project) {
                tx.abort();
                return;
              }
              Object.assign(project.segments[0], metadata, {
                audio: new Blob([Uint8Array.from(bytes)], {
                  type: "audio/wav",
                }),
              });
              project.revision = crypto.randomUUID();
              store.put(project);
            };
            tx.oncomplete = () => resolve();
            tx.onabort = () =>
              reject(tx.error ?? new Error("Fixture save aborted"));
          });
        } finally {
          db.close();
        }
      },
      {
        title: project.title,
        bytes: Array.from(new Uint8Array(await audio.arrayBuffer())),
        metadata,
      },
    );

    const button = page.getByRole("button", {
      name: generation === "single" ? "模拟片段 1" : "生成模拟提示音",
      exact: true,
    });
    await expect(button).toBeEnabled();
    await button.click();
    await expect(
      page.getByRole("button", { name: "另存为新项目" }),
    ).toBeVisible();
    await other.reload();
    await other.getByLabel("生成模式").selectOption("openai");
    await expect(other.getByLabel("确认片段 1 音频完整")).toBeChecked();
    expect((await downloadAudioBackup(other)).segments).toEqual(
      expected.segments,
    );
  });
}
