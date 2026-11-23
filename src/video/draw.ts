import type { Host } from "../../shared/factory.ts";
import { t } from "../i18n/index.ts";
import {
  drawBackground,
  drawCaption,
  drawSpeakerLabel,
  drawTitleCard,
} from "./overlay.ts";
import type { PcmAudio } from "./pcm.ts";
import type { DrawingContext, TextLayoutCache } from "./scenes/types.ts";
import { drawWaveform } from "./scenes/waveform.ts";
import type { VideoTheme } from "./themes.ts";
import { latestStarted, type TimelinePlan } from "./timeline.ts";

export { sampleAmplitude, turnSampleRange, type PcmAudio } from "./pcm.ts";
export type { DrawingContext } from "./scenes/types.ts";

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
  const turn = latestStarted(plan.scenes, time);
  if (turn?.kind !== "turn") {
    drawTitleCard(context, plan, theme, textLayouts, turn?.title);
    return;
  }
  const name = turn.speakerId;
  drawBackground(context, plan, theme);
  drawWaveform(context, { plan, audio, theme, time, turn }, () =>
    drawSpeakerLabel(
      context,
      plan,
      theme,
      speakerLabels?.get(name) ?? t("video.caption.speaker", { name }),
    ),
  );
  drawCaption(context, plan, theme, textLayouts, turn, time);
}
