import { t } from "../i18n/index.ts";
import { renderVideo, type VideoRenderPlan } from "./render.ts";

function fixturePlan(): VideoRenderPlan {
  const chapter = t("video.probe.chapter");
  return {
    duration: 5,
    fps: 30,
    resolution: { width: 1920, height: 1080 },
    estimated: false,
    allowVp9: true,
    chapters: [{ title: chapter, start: 0, timestamp: "0:00" }],
    scenes: [
      { kind: "intro", title: t("video.probe.title"), start: 0, end: 1 },
      {
        kind: "chapter",
        chapterId: "fixture",
        title: chapter,
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
            lines: [
              t("video.probe.browserAudio"),
              t("video.probe.captionFixture"),
            ],
          },
          {
            start: 3.5,
            end: 5,
            lines: [t("video.probe.volume"), t("video.probe.followsAudio")],
          },
        ],
      },
    ],
  };
}

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
        reject(
          new Error(
            t("video.probe.playbackFailed", {
              detail: video.error?.message ?? "",
            }),
          ),
        );
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
    plan: fixturePlan(),
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
        t("video.probe.unexpectedFormat", {
          width: String(video.videoWidth),
          height: String(video.videoHeight),
          duration: String(video.duration),
        }),
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
