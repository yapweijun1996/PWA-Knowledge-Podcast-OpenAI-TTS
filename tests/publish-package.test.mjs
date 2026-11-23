import assert from "node:assert/strict";
import test from "node:test";
import { crc32 } from "node:zlib";
import { readEpisode } from "../shared/episode-record.ts";
import { buildPublishPackage, cleanSourceUrl } from "../src/publish/package.ts";
import { thumbnailByteLimit, ThumbnailError } from "../src/publish/thumbnail.ts";
import { buildTimeline } from "../src/video/timeline.ts";

const source = {
  id: "S1",
  title: "研究与数据",
  url: "https://research.example.test/report?year=2026&region=sg",
  published: null,
};

function fixture() {
  const chapters = ["开场", "研究\n  证据", "结论"].map((title, index) => ({
    id: `chapter-${index}`,
    title,
    angle: title,
    claimIds: ["C1"],
  }));
  const model = "fixture";
  const updated = "2026-11-23T00:00:00Z";
  const turns = chapters.map(({ id, claimIds }, index) => ({
    id: `turn-${index}`,
    chapterId: id,
    host: "A",
    text: "这是一段测试旁白。",
    claimIds,
  }));
  const research = {
    model,
    searchedAt: updated,
    sources: [source],
    claims: [
      {
        id: "C1",
        text: "A fixture claim.",
        status: "qualified",
        uncertainty: "Fixture limitations.",
        sourceIds: [source.id],
      },
    ],
  };
  return {
    id: "7baa7fc0-fbad-492d-abb7-8896fcd15d3f",
    topic: "节目主题",
    language: "zh",
    voices: { A: "marin" },
    revision: 1,
    updated,
    outline: { model, chapters },
    script: { model, title: "<播客>\r\n\u0000 新一期\u202e", turns },
    research,
    researchDraft: {
      ...research,
      claims: [],
      sources: [{ ...source, url: "https://draft.example.test/" }],
    },
    render: {
      model,
      revision: 1,
      clips: Object.fromEntries(
        turns.map(({ id }, index) => [
          id,
          {
            asset: `clip-${String(index).repeat(64)}.pcm`,
            duration: index ? 14 : 12,
          },
        ]),
      ),
    },
  };
}

const chapterRows = (text) => text.match(/^\d+:\d{2} .+$/gm) ?? [];
const contents = (files, name) =>
  files.find((file) => file.name === name)?.text;

test("exports sanitized metadata, timeline chapters and finalized research offline", (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => {
    throw new Error("Publish export must be offline");
  });
  const episode = readEpisode(fixture());
  const plan = buildTimeline(episode);
  const { files } = buildPublishPackage({ episode, plan });
  assert.deepEqual(
    files.map(({ name }) => name),
    [
      "title.txt",
      "description.txt",
      "tags.txt",
      "chapters.txt",
      "checklist.md",
    ],
  );
  assert.equal(contents(files, "title.txt"), "播客 新一期");
  assert.equal(
    contents(files, "tags.txt"),
    "播客, 节目主题, 开场, 研究 证据, 结论",
  );

  // Chapters start at their first voiced frame: 12 s, then 12 + 14 s of speech.
  const chapters = ["0:00 开场", "0:12 研究 证据", "0:26 结论"];
  for (const name of ["description.txt", "chapters.txt"]) {
    assert.deepEqual(chapterRows(contents(files, name)), chapters);
  }
  const description = contents(files, "description.txt");
  assert.ok(description.includes(episode.topic));
  assert.ok(description.includes(source.title));
  assert.ok(description.includes(source.url));
  assert.doesNotMatch(description, /draft\.example/);
  assert.match(description, /AI 生成的旁白/);

  const checklist = contents(files, "checklist.md");
  for (const item of [
    "受众",
    "altered or synthetic content",
    "thumbnail.png",
    "版式：双主持人",
    "9:16 开场画面",
    "可见性",
    "验证章节",
    "YouTube Studio",
    "未经验证",
  ]) {
    assert.ok(checklist.includes(item));
  }
  assert.equal(fetch.mock.callCount(), 0);
});

test("limits titles without breaking Unicode characters", () => {
  const draft = fixture();
  draft.topic = `<播客>\r\n\u0000${"甲".repeat(96)}😀${"乙".repeat(40)}`;
  draft.script.title = "<>\n";
  const episode = readEpisode(draft);
  const { files } = buildPublishPackage({
    episode,
    plan: buildTimeline(episode),
  });
  const title = contents(files, "title.txt");
  assert.equal(title, `播客 ${"甲".repeat(96)}`);
  assert.ok(title.length <= 100);
  assert.doesNotMatch(title, /[<>\p{Cc}]/u);
});

test("exports clean trial-style citation URLs and preserves the research record", () => {
  const urls = [
    "https://www.hdb.gov.sg/buying-a-flat/resale-flats/process-for-buying-a-resale-flat/resale-flat-planning/eip-and-spr-quota",
    "https://www.hdb.gov.sg/cs/infoweb/residential/buying-a-flat?sc_lang=en&hash=A%2fb%20c~",
    "https://www.gov.sg/explainers/hdb-ethnic-integration-policy/?sc_lang=en",
  ];
  const tracked = urls.map((url) =>
    `${url}${url.includes("?") ? "&" : "?"}utm_source=openai`,
  );
  const draft = fixture();
  draft.research.sources = [...tracked, urls[0]].map((url, index) => ({
    ...source,
    id: `S${index + 1}`,
    url,
  }));
  const episode = readEpisode(draft);
  const { files } = buildPublishPackage({ episode, plan: buildTimeline(episode) });
  const description = contents(files, "description.txt");
  assert.deepEqual(description.match(/https:\/\/\S+/gu), urls);
  assert.deepEqual(episode.research.sources.map(({ url }) => url), [
    ...tracked,
    urls[0],
  ]);
});

test("cleans provider referrals while preserving functional query bytes and fragments", () => {
  assert.equal(
    cleanSourceUrl(
      "https://www.hdb.gov.sg/search?%55TM_campaign=trial&ref=openai&ref=hdb&source=chatgpt.com&hash=x%20y~&sc_lang=en&hash=&referrer=OpenAI.com#eligibility",
    ),
    "https://www.hdb.gov.sg/search?ref=hdb&hash=x%20y~&sc_lang=en&hash=#eligibility",
  );
  assert.equal(cleanSourceUrl("javascript:void(0)"), undefined);
  assert.equal(cleanSourceUrl("https://user:secret@www.hdb.gov.sg/"), undefined);
});

test("keeps the UTF-8 description within 5000 bytes using whole chapter and citation lines", () => {
  const draft = fixture();
  draft.topic = "知".repeat(200);
  for (const [index, chapter] of draft.outline.chapters.entries()) {
    chapter.title = `${index}${"节".repeat(69)}`;
  }
  draft.script.turns = Array.from({ length: 25 }, (_, index) => ({
    ...draft.script.turns[index % 3],
    id: `turn-${index}`,
  }));
  draft.research.sources = [
    source,
    ...Array.from({ length: 18 }, (_, index) => ({
      id: `S-${index}`,
      title: "研".repeat(300),
      url: `https://research.example.test/${"x".repeat(1200)}/${index}`,
      published: null,
    })),
  ];
  const episode = readEpisode(draft);
  const { files } = buildPublishPackage({
    episode,
    plan: buildTimeline(episode),
  });
  const description = contents(files, "description.txt");
  const bytes = Buffer.byteLength(description);
  assert.ok(bytes <= 5000 && bytes > 4000);

  const allChapters = chapterRows(contents(files, "chapters.txt"));
  const listedChapters = chapterRows(description);
  assert.equal(allChapters.length, 25);
  assert.ok(
    listedChapters.length >= 3 && listedChapters.length < allChapters.length,
  );
  assert.deepEqual(listedChapters, allChapters.slice(0, listedChapters.length));
  const links = description.match(/https:\/\/\S+/g);
  assert.equal(links[0], source.url);
  assert.ok(links.length > 1 && links.length < draft.research.sources.length);
  assert.ok(
    links.every((url) =>
      draft.research.sources.some((item) => item.url === url),
    ),
  );
  assert.match(description, /部分来源因篇幅限制未列出/);
  assert.match(description, /AI 生成的旁白。$/);
});

test("documents short chapter lists and preserves any timestamps in the sidecar", () => {
  const edited = fixture();
  delete edited.render;
  edited.script.turns.pop();
  const draft = { ...edited };
  delete draft.script;
  for (const [record, chapterCount] of [
    [draft, 0],
    [edited, 2],
  ]) {
    const episode = readEpisode(record);
    const plan = buildTimeline(episode);
    const { files } = buildPublishPackage({ episode, plan });
    const description = contents(files, "description.txt");
    assert.match(description, /章节不足三段.*chapters\.txt/);
    assert.deepEqual(chapterRows(description), []);
    const chapters = chapterRows(contents(files, "chapters.txt"));
    assert.equal(chapters.length, chapterCount);
    assert.deepEqual(
      chapters,
      plan.chapters.map(
        ({ timestamp, title }) => `${timestamp} ${title.replace(/\s+/g, " ")}`,
      ),
    );
    if (plan.estimated)
      assert.match(contents(files, "checklist.md"), /时间点包含估算/);
  }
});

function readStoredEntries(bytes) {
  const end = bytes.length - 22;
  assert.equal(bytes.readUInt32LE(end), 0x06054b50);
  assert.equal(bytes.readUInt16LE(end + 4), 0);
  assert.equal(bytes.readUInt16LE(end + 6), 0);
  assert.equal(bytes.readUInt16LE(end + 20), 0);
  const count = bytes.readUInt16LE(end + 10);
  assert.equal(bytes.readUInt16LE(end + 8), count);
  const centralStart = bytes.readUInt32LE(end + 16);
  assert.equal(centralStart + bytes.readUInt32LE(end + 12), end);
  const entries = [];
  let central = centralStart;
  let nextLocal = 0;
  for (let index = 0; index < count; index++) {
    assert.equal(bytes.readUInt32LE(central), 0x02014b50);
    assert.equal(bytes.readUInt16LE(central + 8), 0x0800);
    assert.equal(bytes.readUInt16LE(central + 10), 0);
    const checksum = bytes.readUInt32LE(central + 16);
    const size = bytes.readUInt32LE(central + 24);
    assert.equal(bytes.readUInt32LE(central + 20), size);
    const nameLength = bytes.readUInt16LE(central + 28);
    assert.equal(bytes.readUInt16LE(central + 30), 0);
    assert.equal(bytes.readUInt16LE(central + 32), 0);
    const local = bytes.readUInt32LE(central + 42);
    assert.equal(local, nextLocal);
    const name = bytes.toString(
      "utf8",
      central + 46,
      central + 46 + nameLength,
    );
    assert.equal(bytes.readUInt32LE(local), 0x04034b50);
    assert.equal(bytes.readUInt16LE(local + 6), 0x0800);
    assert.equal(bytes.readUInt16LE(local + 8), 0);
    assert.equal(bytes.readUInt32LE(local + 14), checksum);
    assert.equal(bytes.readUInt32LE(local + 18), size);
    assert.equal(bytes.readUInt32LE(local + 22), size);
    assert.equal(bytes.readUInt16LE(local + 26), nameLength);
    assert.equal(bytes.readUInt16LE(local + 28), 0);
    const start = local + 30 + nameLength;
    assert.equal(bytes.toString("utf8", local + 30, start), name);
    nextLocal = start + size;
    const data = bytes.subarray(start, nextLocal);
    assert.equal(data.length, size);
    assert.equal(crc32(data), checksum);
    entries.push({ name, size, data });
    central += 46 + nameLength;
  }
  assert.equal(nextLocal, centralStart);
  assert.equal(central, end);
  return entries;
}

test("round-trips ZIP headers, UTF-8 text, optional media, sizes and CRCs", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => {
    throw new Error("ZIP export must be offline");
  });
  const episode = readEpisode(fixture());
  const thumbnailBlob = new Blob([Uint8Array.of(0x89, 0x50, 0x4e, 0x47)], {
    type: "image/png",
  });
  const videoBlob = new Blob([Buffer.alloc(200_000, 0xaa), "123456789"], {
    type: "video/mp4",
  });
  const { files, zip } = buildPublishPackage({
    episode,
    plan: buildTimeline(episode),
    thumbnailBlob,
    videoBlob,
  });
  assert.deepEqual(files.slice(-2), [
    { name: "thumbnail.png", mime: "image/png", blob: thumbnailBlob },
    { name: "video.mp4", mime: "video/mp4", blob: videoBlob },
  ]);
  const archive = await zip();
  assert.equal(archive.type, "application/zip");
  const entries = readStoredEntries(Buffer.from(await archive.arrayBuffer()));
  assert.deepEqual(
    entries.map(({ name }) => name),
    files.map(({ name }) => name),
  );
  for (const [index, file] of files.entries()) {
    const data = file.blob
      ? Buffer.from(await file.blob.arrayBuffer())
      : Buffer.from(file.text, "utf8");
    assert.equal(entries[index].size, data.length);
    assert.deepEqual(entries[index].data, data);
  }
  assert.equal(fetch.mock.callCount(), 0);
});

test("checks the byte limit of a caller-supplied thumbnail", () => {
  const episode = readEpisode(fixture());
  const plan = buildTimeline(episode);
  const thumbnailBlob = new Blob([new Uint8Array(thumbnailByteLimit)], {
    type: "image/png",
  });
  assert.throws(
    () => buildPublishPackage({ episode, plan, thumbnailBlob }),
    (error) => error instanceof ThumbnailError &&
      error.code === "publish.thumbnail.pngTooLarge",
  );
});
