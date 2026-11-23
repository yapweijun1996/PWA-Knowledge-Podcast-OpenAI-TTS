import { createStudioScene } from "../src/scene.js";
import { createFixture, durationSeconds, fps, frameCount } from "./fixture.js";
import { probeWebCodecs } from "./webcodecs.js";

const hashFrames = new Set([0, 15, 30, 60, 120]);

function heapBytes() {
  const memory = performance.memory;
  if (!memory) return null;
  const { usedJSHeapSize, totalJSHeapSize, jsHeapSizeLimit } = memory;
  return { usedJSHeapSize, totalJSHeapSize, jsHeapSizeLimit };
}

function rendererInfo(gl) {
  const debug = gl.getExtension("WEBGL_debug_renderer_info");
  return {
    renderer: gl.getParameter(gl.RENDERER),
    vendor: gl.getParameter(gl.VENDOR),
    unmaskedRenderer: debug
      ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)
      : null,
    unmaskedVendor: debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : null,
    version: gl.getParameter(gl.VERSION),
    contextAttributes: gl.getContextAttributes(),
  };
}

function timingSummary(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    min: sorted[0],
    mean: samples.reduce((sum, sample) => sum + sample, 0) / samples.length,
    median:
      (sorted[Math.floor((sorted.length - 1) / 2)] +
        sorted[Math.floor(sorted.length / 2)]) /
      2,
    p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
    max: sorted.at(-1),
    perFrame: samples,
  };
}

async function pixelHash(pixels) {
  const digest = await crypto.subtle.digest("SHA-256", pixels);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function measureScene({ canvas, width, height, mode }) {
  const details = { mode, width, height, fps, durationSeconds, frameCount };
  let studio;
  try {
    const before = heapBytes();
    const stateAt = createFixture();
    studio = createStudioScene({ width, height, theme: "dark", canvas });
    const gl = canvas.getContext("webgl2");
    const webgl = rendererInfo(gl);
    const onePixel = new Uint8Array(4);
    const pixels = new Uint8Array(width * height * 4);
    const pixelSha256 = {};
    const samples = [];

    for (let index = 0; index < frameCount; index++) {
      const t = index / fps;
      const state = stateAt(t);
      const start = performance.now();
      studio.renderAt(t, state);
      // This synchronous readback waits for GPU rendering to the drawing buffer.
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, onePixel);
      samples.push(performance.now() - start);
      if (gl.isContextLost())
        throw new Error(`WebGL context lost on frame ${index}.`);

      if (hashFrames.has(index)) {
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        if (gl.getError() !== gl.NO_ERROR)
          throw new Error(`WebGL error reading frame ${index}.`);
        pixelSha256[index] = await pixelHash(pixels);
      } else if ((index + 1) % 15 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
    const afterRender = heapBytes();
    if (new Set(Object.values(pixelSha256)).size < 2)
      throw new Error("All sampled frames have identical pixels.");

    const webCodecs = await probeWebCodecs(
      canvas,
      (index) => {
        const t = index / fps;
        studio.renderAt(t, stateAt(t));
        if (gl.isContextLost())
          throw new Error(`WebGL context lost on frame ${index}.`);
      },
      width,
      height,
    );

    return {
      ...details,
      status: "PASS",
      webgl,
      renderMs: timingSummary(samples),
      heapBytes: { before, afterRender, afterWebCodecs: heapBytes() },
      pixelSha256,
      webCodecs,
    };
  } catch (error) {
    return { ...details, status: "FAIL", error: String(error) };
  } finally {
    studio?.dispose();
  }
}
