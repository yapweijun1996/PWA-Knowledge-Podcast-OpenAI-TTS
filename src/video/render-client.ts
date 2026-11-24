import type { Locale } from "../i18n/index.ts";
import type { PcmAudio } from "./pcm.ts";
import type { renderVideo } from "./render.ts";
import { WebglContextLostError } from "./scenes/types.ts";

type RenderOptions = Parameters<typeof renderVideo>[0];
type ClientOptions = Omit<RenderOptions, "deps"> & { locale: Locale };
export type WorkerRenderRequest = Pick<
  ClientOptions,
  "plan" | "theme" | "sceneId" | "studio3d" | "locale"
> & { audio: PcmAudio | Blob };
type RenderResult = Awaited<ReturnType<typeof renderVideo>>;
export type WorkerRenderMessage =
  | { kind: "ready"; supported: boolean }
  | { kind: "progress"; value: number }
  | { kind: "done"; result: RenderResult }
  | { kind: "failed"; contextLost: boolean };

async function renderInWorker({
  plan,
  audio,
  theme,
  sceneId,
  studio3d,
  locale,
  signal,
  onProgress,
}: ClientOptions) {
  signal?.throwIfAborted();
  // A Blob is cloneable. A caller-provided window reader runs on the page.
  if (
    "readWindow" in audio ||
    typeof Worker !== "function" ||
    typeof OffscreenCanvas !== "function"
  )
    return;
  let worker: Worker;
  try {
    worker = new Worker(new URL("./render-worker.ts", import.meta.url), {
      type: "module",
    });
  } catch {
    return;
  }
  let dispatched = false;
  let startupTimer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  try {
    return await new Promise<RenderResult | undefined>((resolve, reject) => {
      abort = () =>
        reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
      if (signal?.aborted) return abort();
      signal?.addEventListener("abort", abort, { once: true });
      startupTimer = setTimeout(() => resolve(undefined), 7_000);
      worker.onerror = (event) => {
        event.preventDefault();
        if (dispatched) reject(new Error("Video worker stopped"));
        else resolve(undefined);
      };
      worker.onmessage = ({ data }: MessageEvent<WorkerRenderMessage>) => {
        switch (data.kind) {
          case "ready": {
            clearTimeout(startupTimer);
            if (!data.supported) return resolve(undefined);
            try {
              const options = { plan, theme, sceneId, studio3d, locale };
              if (audio instanceof Blob) {
                const request: WorkerRenderRequest = { ...options, audio };
                worker.postMessage(request);
              } else {
                const channels =
                  "channels" in audio
                    ? audio.channels.map((channel) => channel.slice())
                    : Array.from({ length: audio.numberOfChannels }, (_, index) =>
                        audio.getChannelData(index).slice(),
                      );
                const request: WorkerRenderRequest = {
                  ...options,
                  audio: { sampleRate: audio.sampleRate, channels },
                };
                worker.postMessage(request, channels.map((channel) => channel.buffer));
              }
              dispatched = true;
            } catch (error) {
              reject(error);
            }
            break;
          }
          case "progress":
            onProgress?.(data.value);
            break;
          case "done":
            resolve(data.result);
            break;
          case "failed":
            reject(
              data.contextLost
                ? new WebglContextLostError()
                : new Error("Video worker failed"),
            );
            break;
        }
      };
    });
  } finally {
    clearTimeout(startupTimer);
    if (abort) signal?.removeEventListener("abort", abort);
    worker.terminate();
  }
}

export async function renderEpisodeVideo(options: ClientOptions) {
  const result = await renderInWorker(options);
  if (result) return result;
  options.signal?.throwIfAborted();
  // An engine may expose WebCodecs on Window only. Keep its existing export path.
  const { renderVideo } = await import("./render.ts");
  return renderVideo(options);
}
