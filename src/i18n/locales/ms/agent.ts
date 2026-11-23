export default [
  ["agent.run.replyLanguage", "Bahasa Melayu"],
  ["agent.run.aborted", "Sesi ini telah dibatalkan."],
  ["agent.run.invalidInput", "Semak matlamat, model dan had langkah."],
  [
    "agent.run.stepLimit",
    "Bilangan langkah untuk sesi ini telah mencapai had.",
  ],
  [
    "agent.run.modelError",
    "OpenAI tidak mengembalikan hasil yang boleh digunakan oleh ejen.",
  ],
  [
    "agent.run.toolError",
    "Alat tidak dapat menyelesaikan tugasnya. Ejen telah berhenti.",
  ],
  // native-review
  [
    "agent.run.estimate",
    "Token input dibil secara berasingan. Alat berbayar boleh memulakan penerbitan dan akan menunjukkan anggaran tersendiri sebelum meminta persetujuan.",
  ],
  // native-review
  [
    "agent.failure.consentRequired",
    "Semak anggaran kos dan berikan persetujuan sebelum memulakan sesi ini.",
  ],
  // native-review
  [
    "agent.failure.consentDenied",
    "Persetujuan untuk kos sesi ini tidak diberikan.",
  ],
  // native-review
  [
    "agent.failure.keyInContent",
    "Kandungan ini mengandungi kunci API. Buangkannya sebelum mencuba lagi.",
  ],
  // native-review
  [
    "agent.failure.noKey",
    "Tetapkan kunci API OpenAI anda pada halaman ini dahulu.",
  ],
  [
    "agent.failure.providerRejected",
    "OpenAI menolak permintaan tersebut. Semak akses model dan penggunaan anda.",
  ],
  // native-review
  [
    "agent.failure.unknownOutcome",
    "Hasil permintaan tidak diketahui dan bayaran mungkin telah dikenakan. Semak penggunaan OpenAI anda dan kemajuan yang disimpan dalam Pustaka sebelum memulakan sesi lain.",
  ],
  ["agent.bridge.unknownTool", "Alat ini tidak ditemui."],
  ["agent.bridge.invalidArguments", "Argumen alat tidak sah."],
  ["agent.bridge.aborted", "Operasi telah dibatalkan."],
  ["agent.bridge.timeout", "Operasi telah melebihi had masa."],
  ["agent.bridge.notFound", "Episod ini tiada dalam Pustaka."],
  [
    "agent.bridge.prerequisiteRequired",
    "Selesaikan dahulu peringkat yang diperlukan untuk episod ini.",
  ],
  [
    "agent.bridge.conflict",
    "Episod telah dikemas kini atau sedang dihasilkan. Muat semula episod daripada Pustaka.",
  ],
  // native-review
  [
    "agent.bridge.saveFailed",
    "Hasil ini tidak dapat disimpan. Semak storan pelayar dan penggunaan anda.",
  ],
  [
    "agent.bridge.error",
    "Alat tidak dapat menyelesaikan operasi. Semak kemajuan anda dalam Pustaka.",
  ],
  [
    "agent.bridge.strictSchema",
    "Skema alat yang ketat mesti mewajibkan semua sifat dan menolak sifat tambahan.",
  ],
  ["agent.bridge.invalidTimeout", "Had masa alat tidak sah."],
  ["agent.bridge.invalidToolName", "Nama alat tidak sah atau berulang."],
  [
    "agent.tool.listEpisodes",
    "Senaraikan episod yang baru dikemas kini dalam Pustaka dan tunjukkan kemajuan penghasilannya.",
  ],
  [
    "agent.tool.getEpisode",
    "Semak kemajuan penghasilan episod dalam Pustaka menggunakan ID episod.",
  ],
  [
    "agent.tool.research",
    "Cipta episod, selidik topik, buat semakan silang bukti dan simpan hasilnya dalam Pustaka.",
  ],
  // native-review
  [
    "agent.estimate.research",
    "Anggaran penggunaan ini menunjukkan had token output dan carian web untuk penyelidikan dan semakan silang. Token input dikira secara berasingan.",
  ],
  [
    "agent.tool.writeScript",
    "Tulis rangka dan skrip untuk episod yang telah diselidik, kemudian simpan hasilnya dalam Pustaka.",
  ],
  // native-review
  [
    "agent.estimate.script",
    "Anggaran penggunaan ini menunjukkan had token output untuk rangka dan skrip. Token input dikira secara berasingan.",
  ],
  [
    "agent.tool.narrate",
    "Jana narasi dan transkrip daripada skrip yang disimpan. Simpan setiap segmen audio dalam Pustaka sebaik sahaja siap.",
  ],
  // native-review
  [
    "agent.estimate.narration",
    "Anggaran penggunaan ini menunjukkan had token output untuk narasi dan had tempoh audio untuk transkripsi. Token input dikira secara berasingan.",
  ],
  [
    "agent.tool.renderVideo",
    "Hasilkan MP4 daripada audio dan sari kata versi semasa episod dalam pelayar ini.",
  ],
  [
    "agent.tool.exportPackage",
    "Simpan MP4 versi semasa, lakaran kecil dan bahan penerbitan dalam ZIP untuk dimuat naik secara manual.",
  ],
  ["agent.panel.title", "Ejen"],
  [
    "agent.panel.offline",
    "Sambungkan peranti ke internet untuk menjalankan ejen.",
  ],
  ["agent.panel.goal", "Matlamat"],
  ["agent.panel.goalCount", "{count} / {limit} aksara"],
  [
    "agent.panel.goalLength",
    "Masukkan matlamat yang mengandungi paling banyak 500 aksara.",
  ],
  ["agent.panel.goalRequired", "Masukkan matlamat untuk meneruskan."],
  [
    "agent.panel.example.produce",
    "Hasilkan episod dua minit tentang kebun bandar dan render videonya.",
  ],
  [
    "agent.panel.example.list",
    "Senaraikan episod dalam Pustaka saya dan ringkaskan kemajuannya.",
  ],
  ["agent.panel.model", "Model: {model}"],
  ["agent.panel.steps", "Bilangan langkah maksimum: {count}"],
  // native-review
  ["agent.panel.estimate.title", "Anggaran had atas penggunaan"],
  // native-review
  [
    "agent.panel.estimate.requests",
    { other: "Sehingga {count} permintaan kepada penyedia" },
  ],
  // native-review
  ["agent.panel.estimate.tokens", { other: "Sehingga {count} token output" }],
  // native-review
  ["agent.panel.estimate.searches", { other: "Sehingga {count} carian web" }],
  // native-review
  [
    "agent.panel.estimate.narration",
    { other: "Sehingga {count} segmen narasi" },
  ],
  // native-review
  [
    "agent.panel.estimate.tokensPerTurn",
    { other: "Sehingga {count} token output setiap segmen narasi" },
  ],
  // native-review
  [
    "agent.panel.estimate.transcription",
    { other: "Sehingga {count} saat audio untuk transkripsi" },
  ],
  // native-review
  [
    "agent.panel.estimate.ceiling",
    "Anggaran kos menunjukkan had atas, bukan bil. Had penggunaan tidak mengehadkan jumlah perbelanjaan.",
  ],
  // native-review
  [
    "agent.panel.runConsent",
    "Saya bersetuju membayar OpenAI untuk permintaan model dalam sesi ini.",
  ],
  ["agent.panel.start", "Jalankan ejen"],
  ["agent.panel.cancel", "Batalkan sesi"],
  ["agent.panel.cancelling", "Sedang dihentikan…"],
  ["agent.panel.result", "Hasil sesi"],
  // native-review
  ["agent.panel.dialog.title", "Luluskan alat berbayar: {tool}"],
  ["agent.panel.dialog.topic", "Topik"],
  ["agent.panel.dialog.episode", "ID episod"],
  // native-review
  ["agent.panel.dialog.deny", "Tolak"],
  // native-review
  ["agent.panel.dialog.approve", "Luluskan panggilan ini"],
  ["agent.panel.tool.run", "Sesi ejen"],
  ["agent.panel.tool.list", "Senaraikan episod"],
  ["agent.panel.tool.get", "Lihat episod"],
  ["agent.panel.tool.research", "Selidik topik"],
  ["agent.panel.tool.script", "Tulis skrip"],
  ["agent.panel.tool.narration", "Hasilkan narasi episod"],
  ["agent.panel.tool.video", "Render video"],
  ["agent.panel.tool.export", "Eksport pakej penerbitan"],
  ["agent.panel.tool.unknown", "Alat tidak diketahui"],
  ["agent.panel.toolSucceeded", "Selesai."],
  // native-review
  ["agent.panel.toolDenied", "Persetujuan ditolak."],
  // native-review
  [
    "agent.panel.stoppedAfterDenial",
    "Ejen berhenti selepas anda menolak penggunaan alat berbayar.",
  ],
  ["agent.panel.log.title", "Aktiviti ejen"],
  ["agent.panel.log.time", "+{seconds} s"],
  ["agent.panel.log.step", "Langkah model {step} daripada {maximum}"],
  ["agent.panel.log.toolCall", "Alat dipanggil: {tool}"],
  ["agent.panel.log.toolResult", "Hasil alat {tool}: {status}"],
  // native-review
  ["agent.panel.log.consentAsked", "Persetujuan diminta untuk {tool}."],
  // native-review
  ["agent.panel.log.consentGranted", "Persetujuan diberikan untuk {tool}."],
  // native-review
  ["agent.panel.log.consentDenied", "Persetujuan ditolak untuk {tool}."],
  ["agent.panel.log.error", "Sesi berakhir: {status}"],
  ["agent.panel.savedSummary", "Disimpan pada peranti ini: {items}."],
  [
    "agent.panel.savedNone",
    "Sesi ini tidak menyimpan episod atau hasil penerbitan baharu.",
  ],
  ["agent.panel.saved.episode", "rekod episod"],
  ["agent.panel.saved.researchDraft", "penyelidikan awal"],
  ["agent.panel.saved.research", "penyelidikan yang telah disemak silang"],
  ["agent.panel.saved.outline", "rangka"],
  ["agent.panel.saved.script", "skrip"],
  ["agent.panel.saved.narration", "segmen narasi"],
  ["agent.panel.saved.audio", "audio episod"],
  ["agent.panel.saved.transcript", "transkrip"],
  ["agent.panel.saved.video", "video MP4"],
  ["agent.panel.saved.publish", "ZIP penerbitan"],
] as const;
