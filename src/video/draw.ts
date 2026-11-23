import type { Host } from "../../shared/factory.ts";
import { overlayCopy, prepareOverlay } from "./overlay.ts";
import type { PcmAudio } from "./pcm.ts";
import type { DrawingContext, TextLayoutCache } from "./scenes/types.ts";
import { drawWaveform, prepareWaveform } from "./scenes/waveform.ts";
import { themePalette, type VideoTheme } from "./themes.ts";
import type { TimelinePlan } from "./timeline.ts";

export { sampleAmplitude, turnSampleRange, type PcmAudio } from "./pcm.ts";
export type { DrawingContext } from "./scenes/types.ts";

const waveforms = new WeakMap<
  TimelinePlan,
  WeakMap<PcmAudio, ReturnType<typeof prepareWaveform>>
>();

/** Draw a standalone waveform frame using the same drawing as the export scene. */
export function drawFrame(
  context: DrawingContext,
  plan: TimelinePlan,
  audio: PcmAudio,
  theme: VideoTheme,
  time: number,
  speakerLabels?: ReadonlyMap<Host, string>,
  textLayouts: TextLayoutCache = new Map(),
) {
  const overlay = prepareOverlay(
    context,
    plan,
    overlayCopy(plan, speakerLabels),
    textLayouts,
  );
  const paletteId = themePalette(theme, plan.paletteId);
  const frame = overlay.frameAt(time);
  overlay.drawBackground(paletteId);
  if (frame.turn && !frame.card) {
    let byAudio = waveforms.get(plan);
    if (!byAudio) {
      byAudio = new WeakMap();
      waveforms.set(plan, byAudio);
    }
    let waveform = byAudio.get(audio);
    if (!waveform) {
      waveform = prepareWaveform(plan, audio);
      byAudio.set(audio, waveform);
    }
    const index = Math.floor(time * (plan.fps ?? 30) + 1e-9);
    drawWaveform(context, waveform, {
      index,
      time,
      turn: frame.turn,
      paletteId,
    });
    overlay.drawStageFade(frame, paletteId);
  }
  overlay.draw(frame, paletteId);
}
