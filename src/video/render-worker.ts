import { setLocale } from "../i18n/index.ts";
import { probeVideoSupport } from "./capabilities.ts";
import type {
  WorkerRenderMessage,
  WorkerRenderRequest,
} from "./render-client.ts";
import { renderVideo } from "./render.ts";
import { WebglContextLostError } from "./scenes/types.ts";

const worker = globalThis as typeof globalThis & {
  postMessage(data: WorkerRenderMessage): void;
  fonts?: FontFaceSet;
};

worker.addEventListener(
  "message",
  async (event: MessageEvent<WorkerRenderRequest>) => {
    const { locale, ...options } = event.data;
    setLocale(locale);
    try {
      const result = await renderVideo({
        ...options,
        onProgress(value) {
          worker.postMessage({ kind: "progress", value });
        },
      });
      worker.postMessage({ kind: "done", result });
    } catch (error) {
      worker.postMessage({
        kind: "failed",
        contextLost: error instanceof WebglContextLostError,
      });
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
