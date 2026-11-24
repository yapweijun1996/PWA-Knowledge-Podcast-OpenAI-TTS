import { setLocale } from "../i18n/index.ts";
import { probeVideoSupport } from "./capabilities.ts";
import { Mp4StorageError } from "./mp4-sink.ts";
import { OpfsSink } from "./opfs-sink.ts";
import type {
  WorkerRenderCommand,
  WorkerRenderMessage,
} from "./render-client.ts";
import { renderVideo } from "./render.ts";
import { WebglContextLostError } from "./scenes/types.ts";

const worker = globalThis as typeof globalThis & {
  postMessage(data: WorkerRenderMessage): void;
  fonts?: FontFaceSet;
};

worker.addEventListener(
  "message",
  async (event: MessageEvent<WorkerRenderCommand>) => {
    if ("kind" in event.data) return;
    const { locale, opfsFileName, ...options } = event.data;
    setLocale(locale);
    const controller = opfsFileName ? new AbortController() : undefined;
    function cancel({ data }: MessageEvent<WorkerRenderCommand>) {
      if ("kind" in data && data.kind === "cancel") controller?.abort();
    }
    if (opfsFileName) worker.addEventListener("message", cancel);
    try {
      const result = await renderVideo({
        ...options,
        sink: opfsFileName ? await OpfsSink.open({ fileName: opfsFileName }) : undefined,
        signal: controller?.signal,
        onProgress(value) {
          worker.postMessage({ kind: "progress", value });
        },
      });
      worker.postMessage({ kind: "done", result });
    } catch (error) {
      worker.postMessage({
        kind: "failed",
        contextLost: error instanceof WebglContextLostError,
        ...(error instanceof Mp4StorageError ? { storageError: error.kind } : {}),
      });
    } finally {
      worker.removeEventListener("message", cancel);
    }
  },
  { once: true },
);

const { codecs, videoFrame, offscreenCanvas } = await probeVideoSupport(worker);
worker.postMessage({
  kind: "ready",
  supported:
    videoFrame &&
    offscreenCanvas &&
    (codecs.avc1 || codecs.vp09) &&
    (codecs.mp4a || codecs.opus) &&
    typeof worker.AudioData === "function" &&
    typeof worker.FontFace === "function" &&
    !!worker.fonts &&
    !!worker.crypto?.subtle,
});
