import { measureScene } from "./measure.js";

self.addEventListener("message", async ({ data: { width, height } }) => {
  const mode = "offscreen-worker";
  if (typeof OffscreenCanvas !== "function") {
    self.postMessage({
      mode,
      width,
      height,
      status: "UNAVAILABLE",
      error: "OffscreenCanvas is unavailable.",
    });
    return;
  }
  try {
    const canvas = new OffscreenCanvas(width, height);
    self.postMessage(await measureScene({ canvas, width, height, mode }));
  } catch (error) {
    self.postMessage({
      mode,
      width,
      height,
      status: "FAIL",
      error: String(error),
    });
  }
});
