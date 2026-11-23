export default [
  ["studio.availability.offline", "Anda di luar talian"],
  [
    "studio.availability.offlineHint",
    "Masukkan topik sekarang dan hantarkannya apabila anda kembali dalam talian.",
  ],
  ["studio.availability.browserKeyMissing", "Kunci API pelayar diperlukan"],
  [
    "studio.availability.browserKeyMissingHint",
    "Tambahkan kunci API pelayar dalam Tetapan, atau jalankan proses pengeluaran setempat.",
  ],
  [
    "studio.availability.workerLocked",
    "Log masuk ke proses pengeluaran diperlukan",
  ],
  [
    "studio.availability.workerLockedHint",
    "Tambahkan kunci API pelayar dalam Tetapan, atau log masuk ke proses pengeluaran setempat.",
  ],
  ["studio.availability.keyMissing", "Kunci API OpenAI diperlukan"],
  [
    "studio.availability.keyMissingHint",
    "Tambahkan kunci API pelayar dalam Tetapan, atau tetapkan kunci API untuk proses pengeluaran setempat.",
  ],
  ["studio.availability.workerBusy", "Proses pengeluaran sedang sibuk"],
  [
    "studio.availability.workerBusyHint",
    "Anda boleh menghasilkan episod baharu selepas tugas semasa selesai.",
  ],
  ["studio.availability.workerReady", "Sedia untuk memulakan pengeluaran"],
  [
    "studio.availability.workerReadyHint",
    "Proses pengeluaran dan kunci API OpenAI sudah sedia.",
  ],
  ["studio.availability.browserReady", "Sedia untuk pengeluaran dalam pelayar"],
  [
    "studio.availability.browserReadyHint",
    "Tab ini bersambung terus dengan OpenAI dan menyimpan kemajuan pengeluaran.",
  ],
  ["studio.availability.openSettings", "Buka Tetapan"],

  // native-review
  [
    "studio.cost.wholeEpisode",
    "Anggaran kos (penggunaan untuk seluruh episod)",
  ],
  // native-review
  ["studio.cost.usage", "Anggaran kos (berdasarkan penggunaan)"],
  // native-review
  [
    "studio.cost.disclosure",
    "{output}, {searches} dan {transcription}. Input dan panggilan alat juga mungkin dikenakan kos. Kos sebenar mengikut bil OpenAI.",
  ],
  // native-review
  ["studio.cost.output", { other: "Kira-kira {count} token output" }],
  // native-review
  ["studio.cost.searches", { other: "sehingga {count} carian web" }],
  // native-review
  [
    "studio.cost.transcription",
    { other: "kira-kira {displayCount} saat transkripsi" },
  ],

  ["studio.continuation.title", "Sambung pengeluaran dalam pelayar"],
  // native-review
  [
    "studio.continuation.warning",
    "Pengeluaran akan disambung daripada kemajuan yang telah disimpan. Jika hasil permintaan terdahulu tidak diketahui, menyambung secara manual mungkin dikenakan caj sekali lagi.",
  ],
  [
    "studio.continuation.offline",
    "Anda di luar talian. Sambung ke internet untuk meneruskan pengeluaran.",
  ],
  [
    "studio.continuation.workerUnavailable",
    "Tiada proses pengeluaran setempat yang disambungkan.",
  ],
  [
    "studio.continuation.workerLocked",
    "Anda perlu log masuk ke proses pengeluaran.",
  ],
  ["studio.continuation.keyMissing", "Kunci API OpenAI diperlukan."],
  ["studio.continuation.workerBusy", "Proses pengeluaran sedang sibuk."],
  [
    "studio.continuation.keyHint",
    "Tambahkan kunci API pelayar dalam Tetapan untuk menyambung pengeluaran dalam tab ini.",
  ],
  // native-review
  [
    "studio.continuation.consent",
    "Saya memberikan persetujuan untuk menyambung pengeluaran melalui permintaan OpenAI yang mungkin dikenakan kos.",
  ],

  ["studio.intake.title", "Hasilkan episod daripada topik"],
  ["studio.intake.topic", "Topik podcast"],
  ["studio.intake.topicCount", { other: "{count} / {limit}" }],
  [
    "studio.intake.topicExample",
    "Contohnya, bagaimanakah perumahan awam Singapura menempatkan pelbagai kumpulan etnik?",
  ],
  ["studio.intake.hosts", "Bilangan hos"],
  ["studio.intake.autoHosts", "Pilih secara automatik"],
  ["studio.intake.twoHosts", { other: "Tepat dua hos" }],
  ["studio.intake.location", "Lokasi pengeluaran"],
  ["studio.intake.browser", "Pelayar ini"],
  ["studio.intake.worker", "Proses pengeluaran setempat"],
  // native-review
  [
    "studio.intake.consent",
    "Saya memberikan persetujuan untuk permintaan OpenAI bagi penyelidikan, penulisan skrip, narasi dan transkripsi yang mungkin dikenakan kos.",
  ],
  ["studio.intake.submit", "Hasilkan episod penuh"],

  ["studio.workflow.title", "Aliran kerja pengeluaran"],
  ["studio.workflow.research", "Selidik dan semak sumber"],
  [
    "studio.workflow.researchHint",
    "Semak silang sumber dan simpan dakwaan bersama rujukannya.",
  ],
  ["studio.workflow.script", "Sediakan rangka dan tulis skrip"],
  [
    "studio.workflow.scriptHint",
    "Tetapkan bahasa, hos dan tempoh mengikut keutamaan anda.",
  ],
  ["studio.workflow.narration", "Jana narasi dan transkripsi"],
  [
    "studio.workflow.narrationHint",
    "Dengar dalam Pustaka dan semak audio dengan merujuk skrip asal.",
  ],

  [
    "studio.production.noKey",
    "Tetapkan kunci API OpenAI pada halaman ini dahulu.",
  ],
  // native-review
  [
    "studio.production.noConsent",
    "Semak anggaran kos penggunaan OpenAI untuk sesi ini dan berikan persetujuan untuk meneruskannya.",
  ],
  [
    "studio.production.invalidInput",
    "Masukkan topik yang sah dan semak bahasa, bilangan hos serta had tempoh pengeluaran.",
  ],
  [
    "studio.production.invalidCheckpoint",
    "Rekod pengeluaran setempat atau audio tidak sah. Semak Pustaka.",
  ],
  [
    "studio.production.missingCheckpoint",
    "Rekod pengeluaran ini tiada dalam Pustaka.",
  ],
  [
    "studio.production.conflict",
    "Episod ini sedang dihasilkan atau telah dikemas kini dalam tab lain. Buka semula episod dan cuba lagi.",
  ],
  // native-review
  [
    "studio.production.saveFailed",
    "Kemajuan pengeluaran tidak dapat disimpan. Semak storan pelayar sebelum menyambung secara manual.",
  ],
  [
    "studio.production.loadFailed",
    "Kemajuan pengeluaran setempat tidak dapat dimuatkan. Semak storan pelayar.",
  ],
  [
    "studio.production.cancelled",
    "Pengeluaran dibatalkan. Anda boleh menyambung daripada kemajuan yang telah disimpan.",
  ],
  // native-review
  [
    "studio.production.unknown",
    "Hasil permintaan tidak diketahui dan mungkin telah dikenakan kos. Semak akaun penyedia anda sebelum mencuba semula secara manual.",
  ],
  // native-review
  [
    "studio.production.rejected",
    "OpenAI menolak permintaan. Semak kunci API, kebenaran model atau penggunaan sebelum mencuba semula secara manual.",
  ],
  // native-review
  [
    "studio.production.invalidResult",
    "Hasil OpenAI gagal disahkan. Anda boleh mencuba semula secara manual daripada kemajuan yang telah disimpan.",
  ],
  // native-review
  [
    "studio.production.incompleteTake",
    "Segmen narasi tidak selesai dan mungkin telah dikenakan kos. Cuba semula segmen ini secara manual.",
  ],
  [
    "studio.production.audioTooLong",
    "Narasi melebihi had tempoh. Segmen terdahulu telah disimpan.",
  ],
  // native-review
  [
    "studio.production.keyInContent",
    "Pengeluaran dihentikan kerana kandungan mengandungi kunci API semasa. Keluarkan kunci sebelum mencuba lagi.",
  ],
  // native-review
  [
    "studio.production.callbackFailed",
    "Pengeluaran dihentikan kerana anggaran atau kemajuan tidak dapat dipaparkan.",
  ],

  ["studio.narration.cancelled", "Dibatalkan."],
  // native-review
  [
    "studio.narration.noConsent",
    "Semak anggaran kos untuk sesi ini dan berikan persetujuan untuk meneruskannya.",
  ],
  ["studio.narration.saveRequired", "Tetapkan cara penyimpanan audio dahulu."],
  [
    "studio.narration.invalidInput",
    "Semak kunci API, suara, panjang segmen (maksimum {segmentLimit}) dan arahan narasi (maksimum {instructionsLimit}).",
  ],
  ["studio.narration.characterLimit", { other: "{displayCount} aksara" }],
  // native-review
  [
    "studio.narration.keyInContent",
    "Keluarkan kunci API daripada skrip dan arahan narasi.",
  ],
  [
    "studio.narration.tokenLimit",
    "Had token output mestilah nombor bulat antara 1 dengan {limit}.",
  ],
  [
    "studio.narration.unsupported",
    "Pelayar ini tidak menyokong rakaman audio masa nyata. Cuba versi terkini Chrome.",
  ],
  // native-review
  [
    "studio.narration.startupFailed",
    "Rakaman audio dalam pelayar tidak dapat dimulakan. Tiada permintaan dihantar kepada OpenAI.",
  ],
  // native-review
  [
    "studio.narration.channelError",
    "Sambungan Realtime terputus. Kos mungkin telah dikenakan.",
  ],
  // native-review
  [
    "studio.narration.channelClosed",
    "Sambungan Realtime ditutup sebelum selesai. Kos mungkin telah dikenakan.",
  ],
  // native-review
  [
    "studio.narration.peerFailed",
    "Sambungan Realtime gagal. Kos mungkin telah dikenakan.",
  ],
  // native-review
  [
    "studio.narration.captureFailed",
    "Rakaman audio dalam pelayar gagal. Kos mungkin telah dikenakan.",
  ],
  // native-review
  [
    "studio.narration.trackEnded",
    "Trek audio Realtime tamat lebih awal. Kos mungkin telah dikenakan.",
  ],
  // native-review
  [
    "studio.narration.playbackFailed",
    "Pelayar tidak dapat memulakan main balik audio jauh. Kos mungkin telah dikenakan.",
  ],
  // native-review
  [
    "studio.narration.remoteCaptureFailed",
    "Pelayar ini tidak dapat merakam audio jauh. Kos mungkin telah dikenakan.",
  ],
  // native-review
  [
    "studio.narration.malformedEvent",
    "Format respons Realtime tidak sah. Kos mungkin telah dikenakan.",
  ],
  // native-review
  [
    "studio.narration.providerFailed",
    "Permintaan OpenAI gagal. Semak kunci API, kebenaran model dan penggunaan. Kos mungkin telah dikenakan.",
  ],
  // native-review
  [
    "studio.narration.sessionTimeout",
    "Permintaan tamat masa. Semak sambungan dan kebenaran model. Kos mungkin telah dikenakan.",
  ],
  // native-review
  ["studio.narration.redacted", "[Dirahsiakan]"],
  ["studio.narration.saveFailed", "Narasi tidak dapat dijana atau disimpan."],
  [
    "studio.narration.offerFailed",
    "Sambungan audio dalam pelayar tidak dapat diwujudkan.",
  ],
  // native-review
  [
    "studio.narration.connectionFailed",
    "Sambungan ke OpenAI gagal. Semak sambungan dan kebenaran model. Kos mungkin telah dikenakan.",
  ],
  // native-review
  [
    "studio.narration.connectionTimeout",
    "Sambungan tamat masa. Kos mungkin telah dikenakan.",
  ],
  [
    "studio.narration.invalidKey",
    "Kunci API tidak sah atau telah tamat tempoh.",
  ],
  [
    "studio.narration.rateLimited",
    "Kuota atau had kadar OpenAI telah dicapai. Semak akaun anda.",
  ],
  // native-review
  [
    "studio.narration.invalidAnswer",
    "Butiran sambungan daripada OpenAI tidak dapat digunakan. Kos mungkin telah dikenakan.",
  ],
  // native-review
  [
    "studio.narration.incomplete",
    "Penjanaan narasi tidak selesai. Kos mungkin telah dikenakan.",
  ],
  // native-review
  [
    "studio.narration.unexpectedEvent",
    "Peristiwa penamatan audio tiba dalam turutan yang salah, jadi hasilnya tidak dapat disahkan. Kos mungkin telah dikenakan.",
  ],
  // native-review
  [
    "studio.narration.noAudio",
    "Tiada bunyi yang dapat didengar diterima. Semak sambungan anda. Kos mungkin telah dikenakan.",
  ],
  // native-review
  [
    "studio.narration.undrainedAudio",
    "Penerimaan audio lengkap tidak dapat disahkan. Kos mungkin telah dikenakan.",
  ],
  // native-review
  [
    "studio.narration.requestFailed",
    "Penjanaan audio tidak dapat dimulakan. Kos mungkin telah dikenakan.",
  ],
  // native-review
  [
    "studio.narration.captureTooLong",
    "Audio yang dijana terlalu panjang. Kos mungkin telah dikenakan.",
  ],
  // native-review
  [
    "studio.narration.truncatedAudio",
    "Audio tidak diterima sepenuhnya. Kos mungkin telah dikenakan.",
  ],

  ["studio.demoAudio.missingScript", "Masukkan skrip dahulu"],
  ["studio.demoAudio.cancelled", "Dibatalkan"],
  ["studio.demoAudio.noAudio", "Tiada audio untuk dieksport"],
  ["studio.demoAudio.tooLarge", "Audio yang digabungkan terlalu besar"],
  ["studio.demoAudio.invalidPause", "Tempoh jeda tidak sah"],
  ["studio.demoAudio.invalidWave", "Audio WAV tidak sah atau tidak serasi"],

  ["studio.project.untitled", "Projek tanpa tajuk"],

  [
    "studio.sample.title",
    "Berapa besar perbezaan hujan pada jarak lima kilometer semasa ribut yang sama?",
  ],
  [
    "studio.sample.introduction",
    "Berapa besar perbezaan hujan pada jarak lima kilometer semasa ribut yang sama? Kadangkala hujan sudah lebat di satu kawasan kejiranan, tetapi kawasan berdekatan masih kering.",
  ],
  [
    "studio.sample.localRainfall",
    "Perolakan setempat boleh menyebabkan hujan lebat di kawasan kecil, tetapi sistem cuaca berbeza-beza. Kedudukan, arah pergerakan dan tempoh awan bertahan semuanya mempengaruhi jumlah hujan di tempat yang berbeza.",
  ],
  [
    "studio.sample.measurements",
    "Jumlah hujan biasanya diukur dalam milimeter. Satu milimeter hujan di atas kawasan seluas satu meter persegi bersamaan dengan satu liter air. Ini ialah penukaran unit geometri dan tidak memberikan ukuran bagi mana-mana ribut tertentu.",
  ],
  [
    "studio.sample.comparison",
    "Untuk mengetahui perbezaan pada jarak lima kilometer, kita perlu mencari stesen yang berjarak sekitar lima kilometer, menyemak bacaan bagi tempoh yang sama dan menerangkan bacaan yang tiada serta batas liputan stesen. Perbandingan itu belum dibuat dalam contoh ini.",
  ],
  [
    "studio.sample.stationData",
    "Apabila hujan turun lagi, semak data rasmi stesen cuaca. Perhatikan tempoh, lokasi dan unit ukuran. Perbezaan setempat wajar diperhatikan, dan pengukuran diperlukan untuk mengesahkannya.",
  ],
] as const;
