export default [
  ["video.caption.speaker", "Host {name}"],
  ["video.timeline.invalidFrameRate", "The video frame rate must be positive."],
  [
    "video.timeline.invalidResolution",
    "The video resolution must be 1920×1080 or 1080×1920.",
  ],
  [
    "video.timeline.missingChapter",
    "The episode script refers to a missing chapter.",
  ],
  [
    "video.render.invalidSampleRate",
    "The audio sample rate must be a positive integer.",
  ],
  [
    "video.render.invalidChannels",
    "Audio must contain PCM channels of equal length.",
  ],
  [
    "video.render.invalidPlan",
    "The video duration, frame rate or resolution is invalid.",
  ],
  [
    "video.render.noVideoEncoder",
    "This browser does not support WebCodecs video encoding.",
  ],
  [
    "video.render.noAudioEncoder",
    "This browser does not support WebCodecs audio encoding.",
  ],
  [
    "video.render.noHash",
    "This browser cannot calculate the video’s SHA-256 checksum.",
  ],
  [
    "video.render.unsupportedVideoCodec",
    "This browser cannot encode this video in H.264 or in an allowed VP9 configuration.",
  ],
  [
    "video.render.unsupportedAudioCodec",
    "This browser does not support the AAC or Opus encoding required for this audio.",
  ],
  ["video.render.invalidAudioDuration", "The audio duration is invalid."],
  ["video.render.noCanvas", "This browser cannot create a video canvas."],
  [
    "video.render.noDrawingContext",
    "This browser cannot create a 2D drawing context.",
  ],
  [
    "video.render.encodedSizeLimit",
    "The encoded video exceeds the {size} MiB browser rendering limit.",
  ],
  ["video.render.videoEncodingFailed", "Video encoding failed."],
  [
    "video.render.unexpectedFrameTimestamp",
    "The video encoder returned an unexpected frame timestamp.",
  ],
  ["video.render.audioEncodingFailed", "Audio encoding failed."],
  [
    "video.render.missingFrames",
    "The video encoder did not return all frames.",
  ],
  [
    "video.render.incompleteTracks",
    "The encoders did not produce complete video and audio tracks.",
  ],
  ["video.probe.chapter", "Chapter 1 · Video in the browser"],
  ["video.probe.title", "Waveform and captions"],
  ["video.probe.browserAudio", "The browser generated this audio."],
  ["video.probe.captionFixture", "Waveform and caption test sample"],
  ["video.probe.volume", "The waveform changes with the volume."],
  ["video.probe.followsAudio", "The waveform follows the audio."],
  ["video.probe.playbackFailed", "Could not play the video sample. {detail}"],
  [
    "video.probe.unexpectedFormat",
    "The video sample has unexpected specifications: {width}×{height}, {duration} s.",
  ],
] as const;
