export default [
  ["video.caption.speaker", "Hos {name}"],
  [
    "video.timeline.invalidFrameRate",
    "Kadar bingkai video mestilah nombor positif.",
  ],
  [
    "video.timeline.invalidResolution",
    "Resolusi video mestilah 1920×1080 atau 1080×1920.",
  ],
  [
    "video.timeline.missingChapter",
    "Skrip episod merujuk kepada bab yang tiada.",
  ],
  [
    "video.render.invalidSampleRate",
    "Kadar pensampelan audio mestilah integer positif.",
  ],
  [
    "video.render.invalidChannels",
    "Audio mesti mempunyai saluran PCM yang sama panjang.",
  ],
  [
    "video.render.invalidPlan",
    "Tempoh, kadar bingkai atau resolusi video tidak sah.",
  ],
  [
    "video.render.noVideoEncoder",
    "Pelayar ini tidak menyokong pengekodan video WebCodecs.",
  ],
  [
    "video.render.noAudioEncoder",
    "Pelayar ini tidak menyokong pengekodan audio WebCodecs.",
  ],
  [
    "video.render.noHash",
    "Pelayar ini tidak dapat mengira jumlah semak SHA-256 video.",
  ],
  [
    "video.render.unsupportedVideoCodec",
    "Pelayar ini tidak dapat mengekod video ini dalam H.264 atau dalam konfigurasi VP9 yang dibenarkan.",
  ],
  [
    "video.render.unsupportedAudioCodec",
    "Pelayar ini tidak menyokong pengekodan AAC atau Opus yang diperlukan untuk audio ini.",
  ],
  ["video.render.invalidAudioDuration", "Tempoh audio tidak sah."],
  ["video.render.noCanvas", "Pelayar ini tidak dapat mencipta kanvas video."],
  [
    "video.render.noDrawingContext",
    "Pelayar ini tidak dapat menyediakan ruang lukis 2D.",
  ],
  [
    "video.render.encodedSizeLimit",
    "Data video yang dikodkan melebihi had {size} MiB untuk pemaparan dalam pelayar.",
  ],
  ["video.render.videoEncodingFailed", "Pengekodan video gagal."],
  [
    "video.render.unexpectedFrameTimestamp",
    "Pengekod video mengembalikan cap masa bingkai yang tidak dijangka.",
  ],
  ["video.render.audioEncodingFailed", "Pengekodan audio gagal."],
  [
    "video.render.missingFrames",
    "Pengekod video tidak mengembalikan semua bingkai.",
  ],
  [
    "video.render.incompleteTracks",
    "Pengekod tidak menghasilkan trek video dan audio yang lengkap.",
  ],
  ["video.probe.chapter", "Bab 1 · Video dalam pelayar"],
  ["video.probe.title", "Bentuk gelombang dan sari kata"],
  ["video.probe.browserAudio", "Audio ini dijana oleh pelayar."],
  ["video.probe.captionFixture", "Sampel ujian bentuk gelombang dan sari kata"],
  ["video.probe.volume", "Bentuk gelombang berubah mengikut kelantangan."],
  ["video.probe.followsAudio", "Bentuk gelombang mengikuti audio."],
  [
    "video.probe.playbackFailed",
    "Sampel video tidak dapat dimainkan. {detail}",
  ],
  [
    "video.probe.unexpectedFormat",
    "Spesifikasi sampel video berbeza daripada jangkaan: {width}×{height}, {duration} s.",
  ],
] as const;
