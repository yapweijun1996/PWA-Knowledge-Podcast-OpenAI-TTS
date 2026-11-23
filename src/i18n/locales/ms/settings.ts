export default [
  ["settings.appearance.title", "Rupa aplikasi"],
  ["settings.appearance.theme", "Tema"],
  ["settings.appearance.system", "Ikut tetapan sistem"],
  ["settings.appearance.light", "Cerah"],
  ["settings.appearance.dark", "Gelap"],
  ["settings.appearance.language", "Bahasa antara muka"],
  ["settings.language.zh-CN", "简体中文"],
  ["settings.language.en", "English"],
  ["settings.language.ms", "Bahasa Melayu"],

  ["settings.browserKey.title", "Kunci API pelayar"],
  ["settings.browserKey.label", "Kunci API OpenAI untuk pelayar ini"],
  // native-review
  [
    "settings.browserKey.risk",
    "Saya faham bahawa kod halaman, sambungan pelayar dan peranti yang diceroboh boleh membaca kunci API ini. Saya akan menggunakan kunci dengan kebenaran terhad. Kunci API hanya disimpan dalam memori tab ini dan dipadam apabila saya meninggalkan atau memuat semula halaman.",
  ],
  ["settings.browserKey.set", "Tetapkan kunci API pelayar"],
  ["settings.browserKey.clear", "Padam kunci API pelayar"],
  [
    "settings.browserKey.configured",
    "Kunci API pelayar telah ditetapkan. Permintaan pertama akan mengesahkan kebenarannya.",
  ],
  [
    "settings.browserKey.unconfigured",
    "Tetapkan kunci API pelayar untuk menghasilkan episod terus dalam pelayar.",
  ],
  [
    "settings.browserKey.saveFailed",
    "Kunci API pelayar tidak dapat ditetapkan.",
  ],
  [
    "settings.browserKey.invalid",
    {
      other:
        "Masukkan kunci API yang panjangnya maksimum {count} aksara dan tidak mengandungi ruang kosong.",
    },
  ],
  // native-review
  ["settings.browserKey.redacted", "[DIRAHSIAKAN]"],

  [
    "settings.workerKey.title",
    "Proses pengeluaran setempat dan kunci API (pilihan)",
  ],
  // native-review
  [
    "settings.workerKey.risk",
    "Kunci API hanya dihantar kepada proses dipercayai yang disambungkan ke ruang kerja ini. Kunci yang dimasukkan di sini kekal dalam memori proses walaupun halaman ditutup. Masukkan semula kunci selepas memulakan semula proses. Sandaran pelayar tidak mengandungi kunci API.",
  ],
  ["settings.workerKey.label", "Kunci API OpenAI"],
  ["settings.workerKey.set", "Tetapkan kunci API"],
  ["settings.workerKey.clear", "Padam kunci API sesi"],
  ["settings.workerKey.status", "{keyStatus} {audioStatus}"],
  [
    "settings.workerKey.environment",
    "Kunci API telah dimuatkan daripada persekitaran setempat. Permintaan pertama akan mengesahkan kebenarannya.",
  ],
  [
    "settings.workerKey.configured",
    "Proses telah menerima kunci API. Permintaan pertama akan mengesahkan kebenarannya.",
  ],
  [
    "settings.workerKey.unconfigured",
    "Kunci API OpenAI diperlukan untuk penyelidikan, narasi dan penjadualan automatik.",
  ],
  ["settings.workerKey.mp3", "Proses setempat boleh mengekod audio MP3."],
  [
    "settings.workerKey.wav",
    "Proses setempat menghasilkan audio WAV. Pasang FFmpeg dengan libmp3lame untuk menghasilkan fail MP3.",
  ],
  // native-review
  [
    "settings.workerKey.unavailable",
    "Mulakan proses pengeluaran setempat yang dipercayai, kemudian tetapkan kunci API di alamat yang sama.",
  ],

  ["settings.contentLanguage.english", "Bahasa Inggeris"],
  ["settings.contentLanguage.mandarin", "Bahasa Mandarin"],
  ["settings.contentLanguage.malay", "Bahasa Melayu"],
  ["settings.contentLanguage.singaporeMixed", "Bahasa campuran Singapura"],

  [
    "settings.schedule.signIn",
    "Log masuk ke proses pengeluaran setempat untuk menyediakan automasi.",
  ],
  [
    "settings.schedule.connect",
    "Sambungkan proses pengeluaran setempat untuk menyediakan automasi. Anda juga boleh menghasilkan episod secara manual dalam Studio dengan kunci API pelayar.",
  ],
  ["settings.schedule.title", "Keutamaan dan jadual pengeluaran"],
  ["settings.schedule.interests", "Topik diminati dan sasaran pendengar"],
  [
    "settings.schedule.interestsExample",
    "Contohnya, terangkan dasar bandar kepada pengguna pengangkutan di Singapura melalui situasi harian",
  ],
  ["settings.schedule.language", "Bahasa pilihan"],
  ["settings.schedule.autoLanguage", "Biar AI memilih mengikut topik"],
  ["settings.schedule.maxHosts", "Bilangan maksimum hos"],
  ["settings.schedule.maxMinutes", "Tempoh maksimum audio (minit)"],
  ["settings.schedule.cadence", "Kekerapan semakan topik"],
  ["settings.schedule.adaptive", "Biar AI melaras mengikut nilai topik"],
  ["settings.schedule.daily", "Setiap hari"],
  ["settings.schedule.weekly", "Setiap minggu"],
  [
    "settings.schedule.weeklyLimit",
    "Semakan topik maksimum dalam tempoh 7 hari bergerak",
  ],
  ["settings.schedule.allowedLanguages", "Bahasa yang tersedia untuk episod"],
  [
    "settings.schedule.enable",
    "Dayakan pemilihan topik, pengeluaran dan semakan audio tanpa pengawasan",
  ],
  // native-review
  [
    "settings.schedule.limits",
    "Pastikan peranti kekal aktif dan proses setempat terus berjalan. Semakan topik dihadkan kepada sekali sehari. Semakan yang dilangkau, dibatalkan atau gagal turut dikira dalam had. Mematikan jadual akan menghentikan pemilihan topik. Episod yang sedang dihasilkan boleh dibatalkan satu demi satu.",
  ],
  // native-review
  [
    "settings.schedule.consent",
    "Saya memberikan persetujuan untuk menghantar permintaan automatik kepada OpenAI mengikut had yang disimpan. Kos sebenar mengikut bil OpenAI.",
  ],
  ["settings.schedule.save", "Simpan keutamaan dan gunakan jadual"],
  ["settings.schedule.enabled", "Jadual setempat dihidupkan."],
  ["settings.schedule.disabled", "Jadual setempat dimatikan."],
  [
    "settings.schedule.usage",
    {
      other:
        "{state} {count} daripada {limit} semakan topik telah digunakan dalam 7 hari yang lalu.",
    },
  ],
  [
    "settings.schedule.nextCheck",
    " Semakan seterusnya paling awal pada {date}.",
  ],
  ["settings.schedule.detail", " {message}"],
  ["settings.schedule.cancel", "Batalkan semakan topik ini"],
  ["settings.schedule.runNow", "Cari topik dan mulakan pengeluaran sekarang"],
  [
    "settings.schedule.checkReserved",
    "Satu semakan telah diperuntukkan. Carian topik sedang dijalankan.",
  ],
  [
    "settings.schedule.noNewTopic",
    "Semakan ini tidak menemukan topik baharu yang sesuai untuk dijadikan episod.",
  ],
  [
    "settings.schedule.productionStarted",
    "Topik telah dipilih dan pengeluaran telah bermula.",
  ],
  // native-review
  [
    "settings.schedule.checkCancelled",
    "Pemilihan topik dihentikan. Permintaan yang sudah dihantar masih mungkin dikenakan kos.",
  ],
  [
    "settings.schedule.checkFailed",
    "Pemilihan topik automatik terhenti. Semak sambungan dan storan setempat anda.",
  ],
  ["settings.schedule.searchIncomplete", "Carian topik tidak selesai."],
  ["settings.schedule.invalidTopic", "Format hasil pemilihan topik tidak sah."],
  // native-review
  [
    "settings.schedule.connectionFailed",
    "Sambungan ke OpenAI gagal atau tamat masa. Permintaan ini mungkin telah dikenakan kos. Anda boleh mencuba semula secara manual.",
  ],
] as const;
