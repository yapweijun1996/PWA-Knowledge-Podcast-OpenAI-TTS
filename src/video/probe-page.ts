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

/** Render locally and verify that Chromium can decode the resulting MP4. */
export async function runVideoProbe() {
  const sampleRate = 24_000;
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
  const video = document.createElement("video");
  video.preload = "auto";
  try {
    await new Promise<void>((resolve, reject) => {
      video.addEventListener("loadeddata", () => resolve(), { once: true });
      video.addEventListener(
        "error",
        () =>
          reject(new Error(`无法解码视频样片。${video.error?.message ?? ""}`)),
        { once: true },
      );
      video.src = url;
    });
    if (
      video.videoWidth !== receipt.width ||
      video.videoHeight !== receipt.height ||
      Math.abs(video.duration - receipt.durationSeconds) > 0.05
    ) {
      throw new Error(
        `视频样片规格不符：${video.videoWidth}×${video.videoHeight}，${video.duration} 秒。`,
      );
    }
    // Seek into the caption scene to exercise decoding beyond the first frame.
    await new Promise<void>((resolve, reject) => {
      video.addEventListener("seeked", () => resolve(), { once: true });
      video.addEventListener(
        "error",
        () => reject(new Error("无法跳转到视频字幕片段。")),
        { once: true },
      );
      video.currentTime = 3;
    });
    return {
      ...receipt,
      bytes: blob.size,
      renderMilliseconds,
      playbackDurationSeconds: video.duration,
    };
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}
