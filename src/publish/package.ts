import { limits, type Episode } from "../../shared/factory.ts";
import {
  createFormatters,
  createTranslator,
  t,
} from "../i18n/index.ts";
import type { ensureVideoFonts } from "../video/fonts/loader.ts";
import type { TimelinePlan } from "../video/timeline.ts";
import { themePalette } from "../video/themes.ts";
import {
  assertThumbnailSize,
  encodeThumbnail,
  resolveThumbnailVariant,
  type ThumbnailCanvas,
  type ThumbnailOptions,
  type ThumbnailVariant,
} from "./thumbnail.ts";
import { cleanSourceUrl } from "./citations.ts";
import { publishLocales } from "./thumbnail-headline.ts";
import { createStoredZip } from "./zip.ts";

export { cleanSourceUrl } from "./citations.ts";
export { publishLocales } from "./thumbnail-headline.ts";

export type PublishFile = { name: string; mime: string } & (
  { text: string } | { blob: Blob }
);

type PublishInput = {
  episode: Episode;
  plan: TimelinePlan;
  videoBlob?: Blob;
  thumbnailBlob?: Blob;
  thumbnail?: Omit<ThumbnailOptions, "title" | "language">;
  thumbnailCanvas?: ThumbnailCanvas;
  loadThumbnailFonts?: typeof ensureVideoFonts;
};

type PublishPackage = { files: PublishFile[]; zip: () => Promise<Blob> };

const encoder = new TextEncoder();
const byteLength = (text: string) => encoder.encode(text).length;
const descriptionLimit = 5000;
// Leave room for research links even when a timeline has many chapter breaks.
const chapterListLimit = 2000;
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

function descriptionChapters(
  lines: readonly string[],
  translate: typeof t,
  chaptersFile: string,
) {
  if (lines.length < 3) {
    return translate("publish.description.tooFewChapters", { chaptersFile });
  }

  const selected: string[] = [];
  let remaining = chapterListLimit;
  for (const line of lines) {
    remaining -= byteLength(line) + 1;
    if (remaining < 0) break;
    selected.push(line);
  }
  if (selected.length < lines.length) {
    selected.push(
      translate("publish.description.fullChapterList", { chaptersFile }),
    );
  }
  return [translate("publish.description.chaptersHeading"), ...selected].join(
    "\n",
  );
}

function descriptionSources(
  episode: Episode,
  budget: number,
  translate: typeof t,
) {
  const lines = [translate("publish.description.sourcesHeading")];
  const omittedSources = translate("publish.description.omittedSources");
  const seen = new Set<string>();
  let remaining = budget - byteLength(`${lines[0]}\n${omittedSources}`);
  let omitted = false;
  for (const source of episode.research?.sources ?? []) {
    const url = cleanSourceUrl(source.url);
    if (!url || seen.has(url)) continue;
    seen.add(url);

    const title = cleanLine(source.title);
    const link = `- ${url}`;
    const label = title
      ? translate("publish.description.namedSource", { title, url })
      : link;
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
  if (lines.length === 1)
    lines.push(translate("publish.description.noSources"));
  return lines.join("\n");
}

function uploadChecklist(
  estimated: boolean,
  fileNames: Record<string, string>,
  variant: ThumbnailVariant,
) {
  const variantNames = {
    "topic-graphic": "publish.thumbnail.variantTopicGraphic",
    "host-pair": "publish.thumbnail.variantHostPair",
    headline: "publish.thumbnail.variantHeadline",
  } as const;
  return [
    t("publish.checklist.heading"),
    "",
    t("publish.checklist.settings"),
    "",
    t("publish.checklist.upload", fileNames),
    t("publish.checklist.audience"),
    t("publish.checklist.aiDisclosure"),
    t("publish.checklist.thumbnail", { ...fileNames, variant: t(variantNames[variant]) }),
    t("publish.checklist.portraitCover"),
    t("publish.checklist.visibility"),
    t(
      estimated
        ? "publish.checklist.estimatedChapters"
        : "publish.checklist.measuredChapters",
      fileNames,
    ),
  ].join("\n");
}

export function buildPublishPackage(input: PublishInput & { thumbnailCanvas: ThumbnailCanvas }): Promise<PublishPackage>;
export function buildPublishPackage(input: PublishInput & { thumbnailCanvas?: undefined }): PublishPackage;
export function buildPublishPackage(input: PublishInput): PublishPackage | Promise<PublishPackage>;
export function buildPublishPackage({
  episode,
  plan,
  videoBlob,
  thumbnailBlob,
  thumbnail,
  thumbnailCanvas,
  loadThumbnailFonts,
}: PublishInput): PublishPackage | Promise<PublishPackage> {
  const locale = publishLocales[episode.language];
  const translate = createTranslator(locale);
  const formatters = createFormatters(locale, translate);
  const fileNames = {
    titleFile: t("publish.files.title"),
    descriptionFile: t("publish.files.description"),
    tagsFile: t("publish.files.tags"),
    chaptersFile: t("publish.files.chapters"),
    checklistFile: t("publish.files.checklist"),
    thumbnailFile: t("publish.files.thumbnail"),
    videoFile: t("publish.files.video"),
  };
  const topic = shorten(cleanLine(episode.topic), limits.topic);
  const scriptTitle = cleanLine(episode.script?.title ?? "");
  const title = shorten(
    scriptTitle || topic || translate("publish.content.untitled"),
    100,
  );
  const thumbnailOptions = {
    title: scriptTitle || topic,
    language: episode.language,
    topicKeywords: [topic, scriptTitle],
    ...thumbnail,
    paletteId:
      thumbnail?.paletteId ??
      themePalette(thumbnail?.theme ?? "dark", plan.paletteId),
  };
  const { variant } = resolveThumbnailVariant(thumbnailOptions);
  const chapters = plan.chapters.map(({ timestamp, title }, index) => ({
    timestamp,
    title:
      shorten(cleanLine(title), 70) ||
      translate("publish.content.chapterNumber", {
        number: formatters.number(index + 1, { useGrouping: false }),
      }),
  }));
  const chapterLines = chapters.map(
    ({ timestamp, title }) => `${timestamp} ${title}`,
  );
  const chapterTitles = [...new Set(chapters.map(({ title }) => title))];
  const summary = [
    translate("publish.description.intro", { title: topic || title }),
  ];
  if (chapterTitles.length) {
    const titles = chapterTitles.slice(0, 3);
    // Preserve the source copy's ideographic commas between all chapter titles.
    const list =
      locale === "zh-CN" ? titles.join("、") : formatters.list(titles);
    summary.push(translate("publish.description.summary", { chapters: list }));
  }
  const introduction = [
    summary.join("\n"),
    descriptionChapters(chapterLines, translate, fileNames.chaptersFile),
  ].join("\n\n");
  const aiNotice = translate("publish.description.aiNotice");
  const sources = descriptionSources(
    episode,
    descriptionLimit - byteLength(`${introduction}\n\n\n\n${aiNotice}`),
    translate,
  );
  const description = [introduction, sources, aiNotice].join("\n\n");
  const tags = [
    ...new Set(
      [translate("publish.content.podcastTag"), topic, ...chapterTitles]
        .map((tag) => shorten(cleanLine(tag.replace(/[,，]/gu, " ")), 50))
        .filter(Boolean),
    ),
  ]
    .slice(0, 5)
    .join(", ");

  const files: PublishFile[] = [
    { name: fileNames.titleFile, text: title, mime: plainText },
    { name: fileNames.descriptionFile, text: description, mime: plainText },
    { name: fileNames.tagsFile, text: tags, mime: plainText },
    {
      name: fileNames.chaptersFile,
      text: chapterLines.join("\n"),
      mime: plainText,
    },
    {
      name: fileNames.checklistFile,
      text: uploadChecklist(plan.estimated, fileNames, variant),
      mime: "text/markdown;charset=utf-8",
    },
  ];
  function finish(png?: Blob): PublishPackage {
    if (png) {
      assertThumbnailSize(png);
      files.push({ name: fileNames.thumbnailFile, blob: png, mime: "image/png" });
    }
    if (videoBlob) files.push({ name: fileNames.videoFile, blob: videoBlob, mime: "video/mp4" });

    return {
      files,
      zip: () =>
        createStoredZip(
          files.map((file) => ({
            name: file.name,
            blob: "blob" in file ? file.blob : new Blob([file.text], { type: file.mime }),
          })),
        ),
    };
  }

  if (thumbnailCanvas) {
    return encodeThumbnail(thumbnailCanvas, thumbnailOptions, loadThumbnailFonts).then(finish);
  }
  return finish(thumbnailBlob);
}
