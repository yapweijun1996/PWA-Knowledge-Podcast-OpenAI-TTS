export default [
  ["publish.content.untitled", "Untitled episode"],
  ["publish.content.chapterNumber", "Chapter {number}"],
  ["publish.description.intro", "About this episode: {title}"],
  ["publish.description.summary", "In this episode: {chapters}."],
  ["publish.description.chaptersHeading", "Chapters"],
  [
    "publish.description.tooFewChapters",
    "The episode has fewer than three chapters, so the description has no timestamps. See {chaptersFile} for available timestamps.",
  ],
  [
    "publish.description.fullChapterList",
    "See {chaptersFile} for the full list of timestamps.",
  ],
  ["publish.description.sourcesHeading", "Sources"],
  ["publish.description.namedSource", "- {title}: {url}"],
  [
    "publish.description.omittedSources",
    "Space limits prevent us from listing every source.",
  ],
  [
    "publish.description.noSources",
    "No research sources are available to list.",
  ],
  [
    "publish.description.aiNotice",
    "This episode includes AI-generated narration.",
  ],
  ["publish.content.podcastTag", "podcast"],
  ["publish.files.title", "title.txt"],
  ["publish.files.description", "description.txt"],
  ["publish.files.tags", "tags.txt"],
  ["publish.files.chapters", "chapters.txt"],
  ["publish.files.checklist", "checklist.md"],
  ["publish.files.thumbnail", "thumbnail.png"],
  ["publish.files.video", "video.mp4"],
  ["publish.checklist.heading", "# YouTube manual upload checklist"],
  [
    "publish.checklist.settings",
    "Check the exact setting names in YouTube Studio. The names in this checklist have yet to be verified.",
  ],
  [
    "publish.checklist.upload",
    "- [ ] Upload `{videoFile}` manually and enter the metadata from `{titleFile}`, `{descriptionFile}` and `{tagsFile}`.",
  ],
  [
    "publish.checklist.audience",
    "- [ ] Set the audience and indicate whether the video is made for children.",
  ],
  [
    "publish.checklist.aiDisclosure",
    "- [ ] Enable the altered or synthetic content disclosure for the AI-generated narration.",
  ],
  [
    "publish.checklist.thumbnail",
    "- [ ] Add `{thumbnailFile}` as the custom thumbnail.",
  ],
  [
    "publish.checklist.visibility",
    "- [ ] Set visibility. Start with Private, preview the video and then choose who can see it.",
  ],
  [
    "publish.checklist.estimatedChapters",
    "- [ ] Verify the chapters using `{chaptersFile}`. Some timestamps are estimates. Check each against the final video and adjust as needed. With fewer than three chapters, timestamps appear only in the chapter file.",
  ],
  [
    "publish.checklist.measuredChapters",
    "- [ ] Verify the chapters using `{chaptersFile}`. Review each timestamp against the final video. With fewer than three chapters, timestamps appear only in the chapter file.",
  ],
  ["publish.zip.tooManyFiles", "The number of files exceeds the ZIP limit."],
  ["publish.zip.invalidFilename", "The ZIP filename length is invalid."],
  ["publish.zip.tooLarge", "The package exceeds the ZIP size limit."],
] as const;
