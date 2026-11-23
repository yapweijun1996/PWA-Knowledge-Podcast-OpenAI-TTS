import { renderVideo, type VideoRenderPlan } from "./render.ts";

const plan: VideoRenderPlan = {
  duration: 5,
  fps: 30,
  resolution: { width: 1920, height: 1080 },
  estimated: false,
  allowVp9: true,
  chapters: [{ title: "第一章 · 浏览器视频", start: 0, timestamp: "0:00" }],
  scenes: [
    { kind: "intro", title: "波形与字幕", start: 0, end: 1 },
    {
      kind: "chapter",
      chapterId: "fixture",
      title: "第一章 · 浏览器视频",
      start: 1,
      end: 2,
    },
    {
      kind: "turn",
      chapterId: "fixture",
      turnId: "fixture",
      speakerId: "A",
      start: 2,
      end: 5,
      audioStart: 0,
      captions: [
        {
          start: 2,
          end: 3.5,
          lines: ["这段音频由浏览器生成。", "Waveform and caption fixture"],
        },
        {
          start: 3.5,
          end: 5,
          lines: ["波形会随音量变化。", "The waveform follows the audio."],
        },
      ],
    },
  ],
};

function waitForMedia(
  video: HTMLVideoElement,
  event: "loadeddata" | "timeupdate" | "seeked",
  start: () => void | Promise<void>,
  ready = () => true,
) {
  const listeners = new AbortController();
  const options = { signal: listeners.signal };
  const arrived = new Promise<void>((resolve, reject) => {
    video.addEventListener(
      event,
      () => {
        if (ready()) resolve();
      },
      options,
    );
    video.addEventListener(
      "error",
      () => {
        reject(new Error(`无法播放视频样片。${video.error?.message ?? ""}`));
      },
      options,
    );
  });
  return Promise.all([arrived, Promise.resolve().then(start)]).finally(() =>
    listeners.abort(),
  );
}

/** Render locally and exercise decoding, playback, and seeking in Chromium. */
export async function runVideoProbe() {
  const sampleRate = 24_000;
  const aacSupported = await AudioEncoder.isConfigSupported({
    codec: "mp4a.40.2",
    sampleRate,
    numberOfChannels: 1,
    bitrate: 64_000,
  }).then(
    ({ supported }) => supported === true,
    () => false,
  );
  const samples = Float32Array.from({ length: 3 * sampleRate }, (_, index) => {
    const time = index / sampleRate;
    return (
      Math.sin(2 * Math.PI * 330 * time) *
      (0.11 + 0.09 * Math.sin(2 * Math.PI * 2 * time))
    );
  });
  const start = performance.now();
  const { blob, ...receipt } = await renderVideo({
    plan,
    audio: { sampleRate, channels: [samples] },
    theme: "dark",
  });
  const renderMilliseconds = Math.round(performance.now() - start);
  const url = URL.createObjectURL(blob);
  const video = document.createElement("video") as HTMLVideoElement & {
    readonly webkitAudioDecodedByteCount?: number;
    readonly webkitVideoDecodedByteCount?: number;
  };
  video.preload = "auto";
  video.muted = true;
  document.body.append(video);
  try {
    await waitForMedia(video, "loadeddata", () => {
      video.src = url;
    });
    if (
      video.videoWidth !== receipt.width ||
      video.videoHeight !== receipt.height ||
      !Number.isFinite(video.duration) ||
      Math.abs(video.duration - receipt.durationSeconds) > 0.05
    ) {
      throw new Error(
        `视频样片规格不符：${video.videoWidth}×${video.videoHeight}，${video.duration} 秒。`,
      );
    }
    await waitForMedia(
      video,
      "timeupdate",
      () => video.play(),
      () => video.currentTime >= 0.25,
    );
    const playedSeconds = video.currentTime;
    const decodedAudioBytes = video.webkitAudioDecodedByteCount;
    const decodedVideoBytes = video.webkitVideoDecodedByteCount;
    video.pause();
    // Seek into the caption scene to exercise decoding beyond the first frame.
    await waitForMedia(video, "seeked", () => {
      video.currentTime = 3;
    });
    return {
      ...receipt,
      bytes: blob.size,
      aacSupported,
      renderMilliseconds,
      playbackDurationSeconds: video.duration,
      playedSeconds,
      seekedSeconds: video.currentTime,
      decodedAudioBytes,
      decodedVideoBytes,
    };
  } finally {
    video.removeAttribute("src");
    video.load();
    video.remove();
    URL.revokeObjectURL(url);
  }
}
