export default [
  ["publish.content.untitled", "Episod tanpa tajuk"],
  ["publish.content.chapterNumber", "Bab {number}"],
  ["publish.description.intro", "Tentang episod ini: {title}"],
  ["publish.description.summary", "Dalam episod ini: {chapters}."],
  ["publish.description.chaptersHeading", "Bab"],
  [
    "publish.description.tooFewChapters",
    "Episod ini mempunyai kurang daripada tiga bab, jadi tiada cap masa dalam penerangan. Lihat {chaptersFile} untuk cap masa yang tersedia.",
  ],
  [
    "publish.description.fullChapterList",
    "Lihat {chaptersFile} untuk senarai penuh cap masa.",
  ],
  ["publish.description.sourcesHeading", "Sumber rujukan"],
  ["publish.description.namedSource", "- {title}: {url}"],
  [
    "publish.description.omittedSources",
    "Sebahagian sumber tidak disenaraikan kerana had ruang.",
  ],
  [
    "publish.description.noSources",
    "Tiada sumber penyelidikan yang boleh disenaraikan.",
  ],
  [
    "publish.description.aiNotice",
    "Episod ini mengandungi narasi yang dijana oleh AI.",
  ],
  ["publish.content.podcastTag", "podcast"],
  ["publish.files.title", "title.txt"],
  ["publish.files.description", "description.txt"],
  ["publish.files.tags", "tags.txt"],
  ["publish.files.chapters", "chapters.txt"],
  ["publish.files.checklist", "checklist.md"],
  ["publish.files.thumbnail", "thumbnail.png"],
  ["publish.files.video", "video.mp4"],
  ["publish.checklist.heading", "# Senarai semak muat naik manual YouTube"],
  [
    "publish.checklist.settings",
    "Semak nama tetapan yang tepat dalam YouTube Studio. Nama dalam senarai semak ini belum disahkan.",
  ],
  [
    "publish.checklist.upload",
    "- [ ] Muat naik `{videoFile}` secara manual dan masukkan metadata daripada `{titleFile}`, `{descriptionFile}` dan `{tagsFile}`.",
  ],
  [
    "publish.checklist.audience",
    "- [ ] Tetapkan khalayak dan nyatakan sama ada video ini dibuat untuk kanak-kanak.",
  ],
  [
    "publish.checklist.aiDisclosure",
    "- [ ] Aktifkan pendedahan kandungan yang diubah suai atau sintetik (altered or synthetic content) untuk narasi yang dijana oleh AI.",
  ],
  [
    "publish.checklist.thumbnail",
    "- [ ] Tambahkan `{thumbnailFile}` sebagai lakaran kecil tersuai.",
  ],
  [
    "publish.checklist.visibility",
    "- [ ] Tetapkan keterlihatan. Pilih Peribadi dahulu, pratonton video, kemudian tentukan siapa yang boleh menontonnya.",
  ],
  [
    "publish.checklist.estimatedChapters",
    "- [ ] Sahkan bab menggunakan `{chaptersFile}`. Sesetengah cap masa ialah anggaran. Semak setiap cap masa dengan video akhir dan betulkan jika perlu. Jika terdapat kurang daripada tiga bab, cap masa hanya disenaraikan dalam fail bab.",
  ],
  [
    "publish.checklist.measuredChapters",
    "- [ ] Sahkan bab menggunakan `{chaptersFile}`. Semak setiap cap masa dengan video akhir. Jika terdapat kurang daripada tiga bab, cap masa hanya disenaraikan dalam fail bab.",
  ],
  ["publish.zip.tooManyFiles", "Bilangan fail melebihi had ZIP."],
  ["publish.zip.invalidFilename", "Panjang nama fail ZIP tidak sah."],
  ["publish.zip.tooLarge", "Pakej melebihi had saiz ZIP."],
] as const;
