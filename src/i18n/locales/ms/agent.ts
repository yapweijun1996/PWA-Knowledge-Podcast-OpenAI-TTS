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
    "Anggaran penggunaan ini menunjukkan had permintaan model dan token output untuk sesi ejen ini. Token input dikira secara berasingan, dan alat berbayar memerlukan persetujuan berasingan.",
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
    "Hasil permintaan tidak diketahui dan kos mungkin telah dikenakan. Semak penggunaan anda dan kemajuan dalam Pustaka.",
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
] as const;
