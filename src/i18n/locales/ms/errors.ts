export default [
  ["errors.audio.assetNameInvalid", "Nama fail audio tidak sah."],
  ["errors.audio.clipMissing", "Klip narasi ini tidak ditemui."],
  // native-review
  [
    "errors.audio.connectionInterrupted",
    "Sambungan Realtime terputus. Semak kebenaran model OpenAI, kuota dan rangkaian proses pengeluaran sebelum mencuba semula secara manual.",
  ],
  [
    "errors.audio.durationExceeded",
    "Narasi melebihi had tempoh. Segmen yang boleh digunakan telah disimpan. Pendekkan bahagian skrip sebelum mencuba lagi.",
  ],
  [
    "errors.audio.fileTooLarge",
    "Audio akhir melebihi 24 MB. Pendekkan dialog.",
  ],
  [
    "errors.audio.formatUnconfirmed",
    "Realtime tidak mengesahkan suara yang dipilih atau format PCM. Semak konfigurasi model.",
  ],
  ["errors.audio.missing", "Audio ini tidak ditemui."],
  // native-review
  [
    "errors.audio.nearSilence",
    "Segmen narasi hampir senyap. Cuba semula secara manual.",
  ],
  [
    "errors.audio.pcmMissing",
    "Segmen narasi tidak mengandungi data PCM yang boleh digunakan.",
  ],
  // native-review
  [
    "errors.audio.segmentIncomplete",
    "OpenAI tidak menyelesaikan segmen narasi ini. Cuba lagi atau pendekkan segmen.",
  ],
  [
    "errors.audio.segmentTooLong",
    "Segmen narasi melebihi had tempoh. Pendekkan bahagian skrip ini.",
  ],
  // native-review
  [
    "errors.audio.timeout",
    "Masa untuk narasi tamat. Cuba semula secara manual.",
  ],
  [
    "errors.backup.audioMissing",
    "Sebahagian audio belum disimpan dalam pelayar ini. Segerakkan episod dahulu.",
  ],
  [
    "errors.backup.invalid",
    "Sandaran tidak sah, tiada audio atau melebihi 120 MB.",
  ],
  [
    "errors.backup.recordTooLarge",
    "Rekod episod terlalu besar untuk dieksport.",
  ],
  [
    "errors.discovery.busy",
    "Pemilihan topik automatik sedang berjalan. Tunggu sehingga selesai atau batalkannya.",
  ],
  // native-review
  [
    "errors.discovery.cancelled",
    "Pemilihan topik dihentikan. Permintaan yang sudah dihantar masih mungkin dikenakan kos.",
  ],
  // native-review
  [
    "errors.discovery.consentRequired",
    "Sahkan bahawa pemilihan topik automatik dan produksi mungkin melibatkan kos.",
  ],
  [
    "errors.discovery.failed",
    "Pemilihan topik automatik terhenti. Semak sambungan dan storan setempat anda.",
  ],
  ["errors.discovery.resultInvalid", "Format hasil pemilihan topik tidak sah."],
  ["errors.discovery.searchIncomplete", "Carian topik tidak selesai."],
  // native-review
  [
    "errors.discovery.unavailable",
    "Pemilihan topik belum boleh dijalankan. Semak minat topik, kunci API, kapasiti storan sementara serta had penerbitan 24 jam dan 7 hari.",
  ],
  [
    "errors.edit.revisionChanged",
    "Skrip telah dikemas kini dalam tab lain. Buka semula dan cuba lagi.",
  ],
  [
    "errors.edit.scriptLength",
    "Skrip episod boleh mengandungi sehingga {maximum} aksara.",
  ],
  [
    "errors.edit.titleAndVoices",
    "Masukkan tajuk dan pilih suara yang berbeza bagi setiap hos.",
  ],
  [
    "errors.edit.turnLength",
    "Setiap giliran bercakap mesti mengandungi antara 1 hingga {maximum} aksara.",
  ],
  [
    "errors.episode.alreadyAccepted",
    "Episod ini telah diserahkan kepada pelayar. Semak pustaka pelayar.",
  ],
  ["errors.episode.idUsed", "ID projek ini sudah digunakan."],
  [
    "errors.episode.limit",
    "Sudah ada {count} episod. Muat turun dan padam episod yang tidak lagi diperlukan.",
  ],
  ["errors.episode.missing", "Episod ini tidak ditemui."],
  ["errors.episode.topicInvalid", "Masukkan topik yang sah dan pilih bahasa."],
  [
    "errors.job.active",
    "Tunggu sehingga tugas selesai atau batalkannya sebelum membuat perubahan.",
  ],
  [
    "errors.job.audioChanged",
    "Audio siap atau titik semak produksi telah berubah. Segerakkan episod dahulu.",
  ],
  [
    "errors.job.cancelled",
    "Tugas dihentikan. Anda boleh menyambung daripada peringkat yang telah disimpan.",
  ],
  [
    "errors.job.checkpointChanged",
    "Titik semak produksi telah berubah. Segerakkan sebelum mencuba lagi.",
  ],
  [
    "errors.job.checkpointResubmit",
    "Titik semak produksi telah berubah. Segerakkan sebelum menghantar semula.",
  ],
  // native-review
  [
    "errors.job.consentRequired",
    "Sahkan bahawa penggunaan OpenAI kali ini mungkin melibatkan kos sebelum meneruskan.",
  ],
  [
    "errors.job.currentAudioRequired",
    "Audio siap untuk versi skrip semasa diperlukan.",
  ],
  [
    "errors.job.episodeBusy",
    "Satu episod sedang dihasilkan. Tunggu sehingga selesai atau batalkan tugas itu.",
  ],
  [
    "errors.job.failed",
    "Tugas tidak dapat diselesaikan. Semak rangkaian dan storan proses pengeluaran sebelum mencuba lagi.",
  ],
  [
    "errors.job.handoffUnavailable",
    "Titik semak episod telah berubah atau transkripsi belum selesai.",
  ],
  [
    "errors.job.interrupted",
    "Proses pengeluaran terganggu. Anda boleh menyambung daripada peringkat yang telah disimpan.",
  ],
  [
    "errors.job.requestAccepted",
    "Permintaan produksi ini telah diserahkan kepada pelayar. Semak pustaka pelayar.",
  ],
  [
    "errors.job.revisionChanged",
    "Skrip telah dikemas kini dalam tab lain. Muat semula dan cuba lagi.",
  ],
  ["errors.job.scriptInvalid", "Rekod skrip setempat tidak sah."],
  ["errors.job.scriptNotReady", "Skrip setempat belum tersedia."],
  [
    "errors.job.stageUnavailable",
    "Peringkat ini sudah selesai atau belum tersedia.",
  ],
  [
    "errors.job.stagingFull",
    "Storan sementara proses pengeluaran sudah penuh. Segerakkan episod dahulu.",
  ],
  ["errors.job.unknownKind", "Tugas produksi tidak dikenal pasti."],
  [
    "errors.openai.invalidStructuredContent",
    "OpenAI mengembalikan kandungan berstruktur yang tidak sah.",
  ],
  // native-review
  [
    "errors.openai.keyInvalid",
    "Kunci API OpenAI tidak sah. Kemas kini kunci pada pelayan dan mulakan semula pelayan.",
  ],
  [
    "errors.openai.modelAccess",
    "Projek OpenAI tidak mempunyai akses kepada titik akhir atau model ini. Semak konfigurasi model pelayan dan kebenaran projek.",
  ],
  [
    "errors.openai.noContent",
    "OpenAI tidak mengembalikan kandungan yang boleh digunakan.",
  ],
  // native-review
  [
    "errors.openai.quotaExceeded",
    "Kuota projek OpenAI tidak mencukupi. Semak bil dan belanjawan projek.",
  ],
  // native-review
  [
    "errors.openai.rateLimited",
    "Had kadar OpenAI telah dicapai atau kuota tidak mencukupi. Semak tetapan projek dan cuba semula secara manual kemudian.",
  ],
  [
    "errors.openai.requestRejected",
    "OpenAI menolak permintaan. Semak sama ada model menyokong titik akhir yang digunakan pada peringkat ini.",
  ],
  [
    "errors.openai.responseIncomplete",
    "OpenAI tidak menyelesaikan peringkat ini dan mungkin telah mencapai had output.",
  ],
  [
    "errors.openai.responseUnreadable",
    "OpenAI mengembalikan hasil yang tidak dapat dibaca.",
  ],
  // native-review
  [
    "errors.openai.serverKeyRequired",
    "Tetapkan OPENAI_API_KEY pada pelayan dahulu.",
  ],
  // native-review
  [
    "errors.openai.timeout",
    "Sambungan ke OpenAI gagal atau tamat masa. Permintaan ini mungkin telah dikenakan kos. Anda boleh mencuba semula secara manual.",
  ],
  [
    "errors.openai.topicRefused",
    "OpenAI enggan memproses topik ini. Semak kandungan topik.",
  ],
  // native-review
  [
    "errors.openai.unavailable",
    "Perkhidmatan OpenAI tidak tersedia buat sementara waktu. Cuba semula secara manual kemudian.",
  ],
  [
    "errors.outline.hostCount",
    "Rangka tidak menetapkan tepat dua orang hos. Penyelidikan telah disimpan. Anda boleh cuba lagi.",
  ],
  [
    "errors.preferences.invalid",
    "Semak minat topik, bahasa atau had produksi anda.",
  ],
  [
    "errors.production.hostChoice",
    "Pilih penetapan automatik atau tepat dua hos.",
  ],
  [
    "errors.record.audioSize",
    "Saiz audio tidak sepadan dengan rekod produksi. Segerakkan semula atau semak sandaran.",
  ],
  ["errors.record.invalid", "Rekod episod tidak sah atau melebihi had."],
  [
    "errors.record.mp3Invalid",
    "Fail MP3 episod ini tidak dapat dikenal pasti.",
  ],
  [
    "errors.record.wavInvalid",
    "Fail WAV episod ini tidak dapat dikenal pasti.",
  ],
  [
    "errors.research.citationsMissing",
    "Carian tidak menemui rujukan yang boleh dikaitkan dengan dakwaan. Cuba lagi atau mulakan episod baharu dengan topik yang lebih khusus.",
  ],
  [
    "errors.research.crossCheckIncomplete",
    "Semakan silang bebas tidak selesai. Penyelidikan awal telah disimpan. Anda boleh cuba lagi.",
  ],
  [
    "errors.research.searchIncomplete",
    "OpenAI tidak menyelesaikan carian web. Semak sama ada model penyelidikan menyokong web_search.",
  ],
  // native-review
  [
    "errors.schedule.consentRequired",
    "Sahkan bahawa OpenAI mungkin mengenakan caj sebelum mengaktifkan jadual.",
  ],
  [
    "errors.script.chapterClaimMissing",
    "Pengesahan skrip gagal kerana sekurang-kurangnya satu giliran dalam bab {chapter} mesti memetik dakwaan. Peringkat terdahulu telah disimpan. Anda boleh cuba lagi.",
  ],
  [
    "errors.script.chapterCount",
    "Pengesahan skrip gagal kerana skrip mempunyai {count} bab dan rangka memerlukan {expected} bab. Peringkat terdahulu telah disimpan. Anda boleh cuba lagi.",
  ],
  [
    "errors.script.chapterHostsMissing",
    "Pengesahan skrip gagal kerana bab {chapter} tiada dialog daripada hos {hosts}. Peringkat terdahulu telah disimpan. Anda boleh cuba lagi.",
  ],
  [
    "errors.script.chapterInvalid",
    "Pengesahan skrip gagal kerana format bab {chapter} tidak sah. Peringkat terdahulu telah disimpan. Anda boleh cuba lagi.",
  ],
  [
    "errors.script.chapterOrder",
    "Pengesahan skrip gagal kerana nombor atau susunan bab {chapter} tidak sepadan dengan rangka. Peringkat terdahulu telah disimpan. Anda boleh cuba lagi.",
  ],
  [
    "errors.script.chapterTurnLimit",
    "Pengesahan skrip gagal kerana bab {chapter} mempunyai {count} giliran bercakap, melebihi had {maximum}. Peringkat terdahulu telah disimpan. Anda boleh cuba lagi.",
  ],
  [
    "errors.script.chaptersRequired",
    "Pengesahan skrip gagal kerana bab mesti dalam bentuk senarai. Peringkat terdahulu telah disimpan. Anda boleh cuba lagi.",
  ],
  [
    "errors.script.contentInvalid",
    "Kandungan yang dijana melebihi had panjang atau mempunyai rujukan yang tidak lengkap. Peringkat terdahulu telah disimpan. Anda boleh cuba lagi.",
  ],
  [
    "errors.script.hostsMissing",
    "Pengesahan skrip gagal kerana skrip penuh tiada dialog daripada hos {hosts}. Peringkat terdahulu telah disimpan. Anda boleh cuba lagi.",
  ],
  [
    "errors.script.lengthLimit",
    "Pengesahan skrip gagal kerana keseluruhan dialog mengandungi {count} aksara, melebihi had {maximum}. Peringkat terdahulu telah disimpan. Anda boleh cuba lagi.",
  ],
  [
    "errors.script.titleEmpty",
    "Pengesahan skrip gagal kerana tajuk episod tidak boleh kosong. Peringkat terdahulu telah disimpan. Anda boleh cuba lagi.",
  ],
  [
    "errors.script.titleTextRequired",
    "Pengesahan skrip gagal kerana tajuk episod mesti dalam bentuk teks. Peringkat terdahulu telah disimpan. Anda boleh cuba lagi.",
  ],
  [
    "errors.script.titleTooLong",
    "Pengesahan skrip gagal kerana tajuk episod mengandungi {count} aksara, melebihi had {maximum}. Peringkat terdahulu telah disimpan. Anda boleh cuba lagi.",
  ],
  [
    "errors.script.tooFewSpokenUnits",
    "Pengesahan skrip gagal kerana skrip penuh hanya mempunyai {count} unit pertuturan dan memerlukan sekurang-kurangnya {minimum} unit. Peringkat terdahulu telah disimpan. Anda boleh cuba lagi.",
  ],
  [
    "errors.script.turnClaimsInvalid",
    "Pengesahan skrip gagal kerana giliran {turn} dalam bab {chapter} memetik dakwaan yang tidak diperuntukkan kepada bab ini dalam rangka. Peringkat terdahulu telah disimpan. Anda boleh cuba lagi.",
  ],
  [
    "errors.script.turnClaimsRequired",
    "Pengesahan skrip gagal kerana rujukan dakwaan bagi giliran {turn} dalam bab {chapter} mesti dalam bentuk senarai. Peringkat terdahulu telah disimpan. Anda boleh cuba lagi.",
  ],
  [
    "errors.script.turnHostInvalid",
    "Pengesahan skrip gagal kerana hos bagi giliran {turn} dalam bab {chapter} tiada dalam senarai hos episod. Peringkat terdahulu telah disimpan. Anda boleh cuba lagi.",
  ],
  [
    "errors.script.turnInvalid",
    "Pengesahan skrip gagal kerana format giliran {turn} dalam bab {chapter} tidak sah. Peringkat terdahulu telah disimpan. Anda boleh cuba lagi.",
  ],
  [
    "errors.script.turnLimit",
    "Pengesahan skrip gagal kerana skrip penuh mempunyai {count} giliran bercakap, melebihi had {maximum}. Peringkat terdahulu telah disimpan. Anda boleh cuba lagi.",
  ],
  [
    "errors.script.turnTextEmpty",
    "Pengesahan skrip gagal kerana giliran {turn} dalam bab {chapter} tidak boleh kosong. Peringkat terdahulu telah disimpan. Anda boleh cuba lagi.",
  ],
  [
    "errors.script.turnTextRequired",
    "Pengesahan skrip gagal kerana giliran {turn} dalam bab {chapter} mesti mengandungi teks. Peringkat terdahulu telah disimpan. Anda boleh cuba lagi.",
  ],
  [
    "errors.script.turnTextTooLong",
    "Pengesahan skrip gagal kerana giliran {turn} dalam bab {chapter} mengandungi {count} aksara, melebihi had {maximum}. Peringkat terdahulu telah disimpan. Anda boleh cuba lagi.",
  ],
  [
    "errors.script.turnsRequired",
    "Pengesahan skrip gagal kerana giliran bercakap dalam bab {chapter} mesti dalam bentuk senarai. Peringkat terdahulu telah disimpan. Anda boleh cuba lagi.",
  ],
  // native-review
  [
    "errors.transcript.consentRequired",
    "Sahkan bahawa transkripsi mungkin melibatkan kos sebelum meneruskan.",
  ],
  [
    "errors.transcript.invalid",
    "Transkripsi kosong atau melebihi had panjang. Dengar audio yang disimpan atau cuba transkripsi sekali lagi.",
  ],
  ["errors.worker.backupInvalid", "Sandaran episod atau audio gagal disahkan."],
  ["errors.worker.backupRequired", "Fail sandaran episod diperlukan."],
  ["errors.worker.bodyTooLong", "Permintaan terlalu besar."],
  ["errors.worker.fileMissing", "Fail tidak wujud."],
  ["errors.worker.finishedAudioMissing", "Audio siap tidak ditemui."],
  [
    "errors.worker.hostMismatch",
    "Hos permintaan tidak sepadan dengan konfigurasi pelayan.",
  ],
  ["errors.worker.jsonInvalid", "Permintaan JSON tidak sah."],
  ["errors.worker.jsonRequired", "Permintaan mesti menggunakan JSON."],
  // native-review
  [
    "errors.worker.keyBusy",
    "Tunggu sehingga tugas semasa selesai sebelum menukar kunci API.",
  ],
  // native-review
  ["errors.worker.keyInvalid", "Format kunci API tidak sah."],
  // native-review
  ["errors.worker.keyRequired", "Tetapkan kunci API dahulu."],
  ["errors.worker.localMode", "Pelayan ini berjalan dalam mod setempat."],
  ["errors.worker.localVersionInvalid", "Versi setempat tidak sah."],
  [
    "errors.worker.loginRateLimited",
    "Terlalu banyak percubaan log masuk. Cuba lagi kemudian.",
  ],
  ["errors.worker.loginRequired", "Log masuk ke ruang kerja peribadi dahulu."],
  ["errors.worker.methodUnsupported", "Kaedah permintaan tidak disokong."],
  [
    "errors.worker.originMismatch",
    "Asal permintaan tidak sepadan dengan ruang kerja.",
  ],
  ["errors.worker.pathInvalid", "Laluan permintaan tidak sah."],
  ["errors.worker.routeMissing", "Titik akhir ini tidak ditemui."],
  [
    "errors.worker.storageFailed",
    "Pelayan tidak menyelesaikan permintaan. Semak storannya sebelum mencuba lagi.",
  ],
  ["errors.worker.syncBusy", "Satu tugas sedang berjalan. Segerakkan dahulu."],
  ["errors.worker.tokenIncorrect", "Frasa laluan ruang kerja peribadi salah."],
  [
    "errors.worker.workspaceRequired",
    "Hantar permintaan daripada ruang kerja ini.",
  ],
] as const;
