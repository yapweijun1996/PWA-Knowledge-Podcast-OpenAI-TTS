import type { Palette } from "./palettes.ts";
import type { DrawingContext, SceneCanvas } from "../scenes/types.ts";

function linearChannel(value: number) {
  const srgb = value / 255;
  return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}

function srgbChannel(value: number) {
  return (
    255 *
    (value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055)
  );
}

const steps = 4096;
const rampCache = new WeakMap<Palette, Float32Array>();

function colorRamp(palette: Palette) {
  const cached = rampCache.get(palette);
  if (cached) return cached;

  const colors = palette.stops.map((hex) =>
    [1, 3, 5].map((start) =>
      linearChannel(parseInt(hex.slice(start, start + 2), 16)),
    ),
  );
  const ramp = new Float32Array((steps + 1) * 3);
  for (let step = 0; step <= steps; step++) {
    const t = step / steps;
    const span = t < 0.55 ? 0 : 1;
    const amount = span === 0 ? t / 0.55 : (t - 0.55) / 0.45;
    for (let channel = 0; channel < 3; channel++) {
      const start = colors[span][channel];
      ramp[3 * step + channel] = srgbChannel(
        start + amount * (colors[span + 1][channel] - start),
      );
    }
  }
  rampCache.set(palette, ramp);
  return ramp;
}

// Same four-pixel ordered pattern as Studio 3D, in screen coordinates.
// Apply before 8-bit quantization so the texture stays constant across frames.
const bayer = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
].map((row) => row.map((rank) => (rank + 0.5) / 16 - 0.5));

type Backdrop = {
  width: number;
  height: number;
  palette: Palette;
  source: SceneCanvas;
};
const backdrops = new WeakMap<DrawingContext, Backdrop>();

function createBackdrop(width: number, height: number, palette: Palette) {
  if (typeof OffscreenCanvas !== "function") return;
  const source = new OffscreenCanvas(width, height);
  const context = source.getContext("2d", { alpha: false });
  if (!context) return;
  const pixels = context.createImageData(width, height);
  const ramp = colorRamp(palette);
  const projection = steps / (width ** 2 + height ** 2);
  const xStep = width * projection;
  const yStep = height * projection;
  for (let y = 0, offset = 0; y < height; y++) {
    const row = bayer[(height - 1 - y) % 4];
    let t = (y + 0.5) * yStep + 0.5 * xStep;
    for (let x = 0; x < width; x++, offset += 4, t += xStep) {
      const color = 3 * Math.round(t);
      const bias = row[x % 4];
      pixels.data[offset] = ramp[color] + bias;
      pixels.data[offset + 1] = ramp[color + 1] + bias;
      pixels.data[offset + 2] = ramp[color + 2] + bias;
      pixels.data[offset + 3] = 255;
    }
  }
  context.putImageData(pixels, 0, 0);
  return { width, height, palette, source };
}

/** Draw the static linear-light background. Keep one full-size texture per context. */
export function drawVideoBackground(
  context: DrawingContext,
  width: number,
  height: number,
  palette: Palette,
) {
  if (context.drawImage) {
    let backdrop = backdrops.get(context);
    if (
      !backdrop ||
      backdrop.palette !== palette ||
      backdrop.width !== width ||
      backdrop.height !== height
    ) {
      backdrop = createBackdrop(width, height, palette);
      if (backdrop) backdrops.set(context, backdrop);
    }
    if (backdrop) {
      context.drawImage(backdrop.source, 0, 0);
      return;
    }
  }

  const gradient = context.createLinearGradient?.(0, 0, width, height);
  if (gradient) {
    const ramp = colorRamp(palette);
    for (let step = 0; step <= steps; step += steps / 64) {
      const offset = 3 * step;
      gradient.addColorStop(
        step / steps,
        `rgb(${ramp[offset]}, ${ramp[offset + 1]}, ${ramp[offset + 2]})`,
      );
    }
  }
  context.fillStyle = gradient ?? palette.stops[0];
  context.fillRect(0, 0, width, height);
}
