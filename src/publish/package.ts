import { limits, type Episode } from "../../shared/factory.ts";
import type { TimelinePlan } from "../video/timeline.ts";
import { createStoredZip } from "./zip.ts";

export type PublishFile = { name: string; mime: string } & (
  { text: string } | { blob: Blob }
);

type PublishInput = {
  episode: Episode;
  plan: TimelinePlan;
  videoBlob?: Blob;
  thumbnailBlob?: Blob;
};

const encoder = new TextEncoder();
const byteLength = (text: string) => encoder.encode(text).length;
const descriptionLimit = 5000;
// Leave room for research links even when a timeline has many chapter breaks.
const chapterListLimit = 2000;
const aiNotice = "本节目包含由 AI 生成的旁白。";
const omittedSources = "部分来源因篇幅限制未列出。";
const plainText = "text/plain;charset=utf-8";

function cleanLine(text: string) {
  return text
    .replace(/[<>\u202a-\u202e\u2066-\u2069]/gu, "")
    .replace(/[\s\p{Cc}]+/gu, " ")
    .trim();
}

function shorten(text: string, limit: number) {
  // Keep the stricter UTF-16 limit without splitting a surrogate pair.
  return text
    .slice(0, limit)
    .replace(/[\uD800-\uDBFF]$/u, "")
    .trimEnd();
}

function descriptionChapters(lines: readonly string[]) {
  if (lines.length < 3) {
    return "章节不足三段，未在简介中添加时间点。现有时间点见 chapters.txt。";
  }

  const selected: string[] = [];
  let remaining = chapterListLimit;
  for (const line of lines) {
    remaining -= byteLength(line) + 1;
    if (remaining < 0) break;
    selected.push(line);
  }
  if (selected.length < lines.length) {
    selected.push("完整时间点见章节文件（chapters.txt）。");
  }
  return ["章节", ...selected].join("\n");
}

function sourceURL(raw: string) {
  try {
    const url = new URL(raw);
    if (
      (url.protocol === "https:" || url.protocol === "http:") &&
      !url.username &&
      !url.password
    ) {
      return url.href;
    }
  } catch {
    // An invalid citation cannot be published as a link.
  }
}

function descriptionSources(episode: Episode, budget: number) {
  const lines = ["参考资料"];
  const seen = new Set<string>();
  let remaining = budget - byteLength(`${lines[0]}\n${omittedSources}`);
  let omitted = false;
  for (const source of episode.research?.sources ?? []) {
    const url = sourceURL(source.url);
    if (!url || seen.has(url)) continue;
    seen.add(url);

    const title = cleanLine(source.title);
    const link = `- ${url}`;
    const label = title ? `- ${title}： ${url}` : link;
    const line = byteLength(label) + 1 <= remaining ? label : link;
    const size = byteLength(line) + 1;
    if (size > remaining) {
      omitted = true;
      continue;
    }
    remaining -= size;
    lines.push(line);
  }
  if (omitted) lines.push(omittedSources);
  if (lines.length === 1) lines.push("暂无可列出的研究来源。");
  return lines.join("\n");
}

function uploadChecklist(plan: TimelinePlan) {
  const chapterReview = plan.estimated
    ? "当前时间点包含估算，请对照最终视频逐一校正。"
    : "请对照最终视频逐一核对时间点。";
  return [
    "# YouTube 手动上传检查清单",
    "",
    "请在 YouTube Studio 核对设置的准确名称。本清单中的设置名称未经验证。",
    "",
    "- [ ] 手动上传 `video.mp4`，填写 `title.txt`、`description.txt` 和 `tags.txt` 中的元数据。",
    "- [ ] 设置受众，确认视频是否面向儿童。",
    "- [ ] 为 AI 生成的旁白启用「经过修改或合成的内容」（altered or synthetic content）披露。",
    "- [ ] 添加 `thumbnail.png` 作为自定义缩略图。",
    "- [ ] 设置可见性，建议先设为私享，预览无误后再选择发布范围。",
    `- [ ] 参照 \`chapters.txt\` 验证章节。${chapterReview}如果不足三章，简介会省略时间点，章节文件保留已有时间点。`,
  ].join("\n");
}

export function buildPublishPackage({
  episode,
  plan,
  videoBlob,
  thumbnailBlob,
}: PublishInput) {
  const topic = shorten(cleanLine(episode.topic), limits.topic);
  const scriptTitle = cleanLine(episode.script?.title ?? "");
  const title = shorten(scriptTitle || topic || "未命名节目", 100);
  const chapters = plan.chapters.map(({ timestamp, title }, index) => ({
    timestamp,
    title: shorten(cleanLine(title), 70) || `第 ${index + 1} 章`,
  }));
  const chapterLines = chapters.map(
    ({ timestamp, title }) => `${timestamp} ${title}`,
  );
  const chapterTitles = [...new Set(chapters.map(({ title }) => title))];
  const summary = [`节目简介：${topic || title}`];
  if (chapterTitles.length) {
    summary.push(`本期内容：${chapterTitles.slice(0, 3).join("、")}。`);
  }
  const introduction = [
    summary.join("\n"),
    descriptionChapters(chapterLines),
  ].join("\n\n");
  const sources = descriptionSources(
    episode,
    descriptionLimit - byteLength(`${introduction}\n\n\n\n${aiNotice}`),
  );
  const description = [introduction, sources, aiNotice].join("\n\n");
  const tags = [
    ...new Set(
      ["播客", topic, ...chapterTitles]
        .map((tag) => shorten(cleanLine(tag.replace(/[,，]/gu, " ")), 50))
        .filter(Boolean),
    ),
  ]
    .slice(0, 5)
    .join(", ");

  const files: PublishFile[] = [
    { name: "title.txt", text: title, mime: plainText },
    { name: "description.txt", text: description, mime: plainText },
    { name: "tags.txt", text: tags, mime: plainText },
    { name: "chapters.txt", text: chapterLines.join("\n"), mime: plainText },
    {
      name: "checklist.md",
      text: uploadChecklist(plan),
      mime: "text/markdown;charset=utf-8",
    },
  ];
  if (thumbnailBlob)
    files.push({
      name: "thumbnail.png",
      blob: thumbnailBlob,
      mime: "image/png",
    });
  if (videoBlob)
    files.push({ name: "video.mp4", blob: videoBlob, mime: "video/mp4" });

  return {
    files,
    zip: () =>
      createStoredZip(
        files.map((file) => ({
          name: file.name,
          blob:
            "blob" in file
              ? file.blob
              : new Blob([file.text], { type: file.mime }),
        })),
      ),
  };
}
