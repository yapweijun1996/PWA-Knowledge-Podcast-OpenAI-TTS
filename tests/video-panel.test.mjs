import assert from "node:assert/strict";
import test from "node:test";
import { clear, set } from "../src/factory/browser-key.ts";
import { createTranslator, setLocale } from "../src/i18n/index.ts";
import { turnSampleRange } from "../src/video/draw.ts";
import {
  buildReviewedPublishPackage,
  isCurrentVideo,
  maxVideoSeconds,
  planStudioVideo,
  renameVideoChapter,
  reviewLimits,
  validatePublishReview,
  videoArtifactKey,
  videoWithinLimits,
} from "../src/factory/useVideoRender.ts";

const source = {
  episodeId: "episode:123",
  revision: 2,
  sourceStamp: "final.wav:original-hash",
};
const chapters = [
  { start: 0, timestamp: "0:00", title: "Opening" },
  { start: 6.4, timestamp: "0:06", title: "Evidence" },
  { start: 13, timestamp: "0:13", title: "Conclusion" },
];
const review = {
  title: "A reviewed title",
  summary: "A revised summary.\n\nA second paragraph.",
  tags: "science, podcasts, science",
  chapterTitles: ["A new opening", "Evidence", "Conclusion"],
  status: "approved",
};
const episode = {
  id: source.episodeId,
  revision: source.revision,
  language: "ms",
  topic: "Fixture",
  outline: {
    chapters: chapters.map(({ title }, index) => ({
      id: `chapter-${index}`,
      title,
    })),
  },
  script: {
    title: "Fixture script",
    turns: chapters.map(({ title }, index) => ({
      id: `turn-${index}`,
      chapterId: `chapter-${index}`,
      host: "A",
      text: title,
    })),
  },
};

test("video keys and currency include the episode, script revision and verified audio stamp", () => {
  const artifact = { ...source, kind: "video", id: videoArtifactKey(source) };
  assert.equal(isCurrentVideo(artifact, source), true);
  assert.equal(isCurrentVideo(artifact), false);
  assert.equal(isCurrentVideo({ ...artifact, kind: "publish" }, source), false);
  assert.equal(isCurrentVideo({ ...artifact, id: "old-id" }, source), false);
  for (const changed of [
    { ...source, episodeId: "episode:other" },
    { ...source, revision: 3 },
    { ...source, sourceStamp: "final.wav:replacement-hash" },
  ]) {
    assert.notEqual(videoArtifactKey(changed), artifact.id);
    assert.equal(isCurrentVideo(artifact, changed), false);
  }
});

test("video preflight bounds source and timeline duration", () => {
  assert.equal(videoWithinLimits(maxVideoSeconds, maxVideoSeconds), true);
  assert.equal(videoWithinLimits(maxVideoSeconds + 1, 1), false);
  assert.equal(videoWithinLimits(1, maxVideoSeconds + 1), false);
  assert.equal(videoWithinLimits(0, 1), false);
  assert.equal(videoWithinLimits(1, Number.NaN), false);
});

test("estimated timelines fit verified WAV duration and use final chapter anchors", () => {
  const plan = planStudioVideo(
    {
      ...episode,
      finished: { chapters: [{ start: 0 }, { start: 2.23 }, { start: 5.46 }] },
    },
    9.46,
  );
  assert.equal(plan.estimated, true);
  assert.deepEqual(
    plan.scenes
      .filter(({ kind }) => kind === "turn")
      .map(({ audioStart }) => audioStart),
    [0, 2.23, 5.46],
  );
  // Speech starts at frame 0 and chapter cards overlay the stage, so the video
  // lasts exactly as long as the verified audio.
  assert.equal(plan.duration, 9.46);
  assert.equal(plan.chapters[0].timestamp, "0:00");

  const measured = planStudioVideo(
    {
      ...episode,
      render: {
        revision: episode.revision,
        clips: {
          "turn-0": { duration: 2 },
          "turn-1": { duration: 3 },
          "turn-2": { duration: 4 },
        },
      },
    },
    9.46,
  );
  assert.equal(measured.estimated, false);
  assert.deepEqual(measured.chapters, plan.chapters);
  const sourceRanges = plan.scenes
    .filter(({ kind }) => kind === "turn")
    .map((turn) => turnSampleRange(turn, 24_000));
  let covered = 0;
  for (const { start, end, source } of sourceRanges) {
    assert.equal(source, covered);
    covered += end - start;
  }
  assert.equal(covered, Math.round(9.46 * 24_000));
});

test("review normalizes fields and rejects invalid publication metadata", () => {
  const result = validatePublishReview(
    { ...review, title: "  A <reviewed> title  " },
    chapters,
  );
  assert.equal(result.value.title, review.title);
  assert.equal(result.value.summary, review.summary);
  assert.equal(result.value.tags, "science, podcasts");
  for (const [changes, error] of [
    [{ title: " <> " }, "invalidTitle"],
    [{ title: "x".repeat(reviewLimits.title + 1) }, "invalidTitle"],
    [{ summary: "\n  " }, "invalidSummary"],
    [{ summary: "🙂".repeat(reviewLimits.summary / 4 + 1) }, "invalidSummary"],
    [{ tags: "x".repeat(reviewLimits.tags + 1) }, "invalidTags"],
    [{ chapterTitles: [" ", "Evidence", "Conclusion"] }, "invalidChapters"],
  ]) {
    assert.equal(
      validatePublishReview({ ...review, ...changes }, chapters).error,
      `publish.review.${error}`,
    );
  }
});

test("chapter edits only rename existing entries and clear approval", () => {
  const edited = renameVideoChapter(review, 1, "Renamed evidence");
  assert.equal(edited.status, "pending");
  assert.deepEqual(edited.chapterTitles, [
    "A new opening",
    "Renamed evidence",
    "Conclusion",
  ]);
  assert.equal(review.status, "approved");
  assert.equal(review.chapterTitles[1], "Evidence");
  assert.equal(renameVideoChapter(review, 7, "Extra"), review);
  assert.equal(renameVideoChapter(review, 1, review.chapterTitles[1]), review);
  assert.ok(validatePublishReview(edited, chapters).value);
  assert.equal(
    validatePublishReview(edited, chapters.slice(1)).error,
    "publish.review.invalidChapters",
  );
  for (const invalid of [
    [{ ...chapters[0], start: 1, timestamp: "0:01" }, ...chapters.slice(1)],
    [
      chapters[0],
      { ...chapters[1], start: 0.5, timestamp: "0:00" },
      chapters[2],
    ],
    [chapters[0], { ...chapters[1], timestamp: "0:05" }, chapters[2]],
    [chapters[0], chapters[2], chapters[1]],
  ]) {
    assert.equal(
      validatePublishReview(edited, invalid).error,
      "publish.review.invalidChapters",
    );
  }
});

test("the active page key is rejected in editable review fields", (test) => {
  const fakeKey = "fixture-current-page-key";
  set(fakeKey);
  test.after(clear);
  assert.equal(
    validatePublishReview({ ...review, tags: `science, ${fakeKey}` }, chapters)
      .error,
    "publish.review.keyInContent",
  );
});

test("approved edits enter the package with episode-language description and UI-language checklist", (test) => {
  setLocale("en");
  test.after(() => setLocale("zh-CN"));
  const artifact = {
    ...source,
    id: videoArtifactKey(source),
    kind: "video",
    blob: new Blob(["video"], { type: "video/mp4" }),
    metadata: {
      studioVideo: {
        durationSeconds: 18,
        timeline: { chapters, estimated: true },
        review,
      },
    },
  };
  const png = new Blob(["image"], { type: "image/png" });
  const result = buildReviewedPublishPackage(episode, artifact, png);
  const files = new Map(
    result.files.map((file) => [file.name, file.text ?? file.blob]),
  );
  assert.equal(files.get("title.txt"), review.title);
  assert.equal(files.get("tags.txt"), "science, podcasts");
  assert.equal(files.get("video.mp4"), artifact.blob);
  assert.equal(files.get("thumbnail.png"), png);
  const chapterText = "0:00 A new opening\n0:06 Evidence\n0:13 Conclusion";
  assert.equal(files.get("chapters.txt"), chapterText);
  assert.ok(files.get("description.txt").startsWith(review.summary));
  assert.ok(files.get("description.txt").includes(chapterText));
  assert.ok(
    files
      .get("description.txt")
      .includes(createTranslator("ms")("publish.description.aiNotice")),
  );
  assert.ok(
    files
      .get("checklist.md")
      .startsWith(createTranslator("en")("publish.checklist.heading")),
  );

  const cited = {
    ...episode,
    research: {
      sources: Array.from({ length: 50 }, (_, index) => ({
        url: `https://fixture.test/${index}/${"long-path".repeat(30)}`,
        title: `Source ${index}`,
      })),
    },
  };
  artifact.metadata.studioVideo.review = {
    ...review,
    summary: "x".repeat(reviewLimits.summary),
  };
  const longDescription = buildReviewedPublishPackage(
    cited,
    artifact,
    png,
  ).files.find(({ name }) => name === "description.txt").text;
  const content = createTranslator("ms");
  assert.ok(Buffer.byteLength(longDescription) <= 5000);
  assert.ok(
    longDescription.includes(content("publish.description.omittedSources")),
  );
  assert.ok(longDescription.endsWith(content("publish.description.aiNotice")));

  artifact.metadata.studioVideo.review = { ...review, status: "rejected" };
  assert.throws(
    () => buildReviewedPublishPackage(episode, artifact, png),
    /approval required/,
  );
});
