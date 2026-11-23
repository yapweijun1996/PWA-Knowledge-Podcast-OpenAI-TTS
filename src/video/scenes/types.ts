import { t } from "../../i18n/index.ts";
import type { GraphicContext } from "../../publish/topic-graphics.ts";
import type { Orientation } from "../design/tokens.ts";
import type { PcmAudio } from "../pcm.ts";
import type { VideoPaletteId, VideoTheme } from "../themes.ts";
import type { TimelinePlan, VideoMood, VideoTurn } from "../timeline.ts";
import type { Studio3dNotice } from "./studio3d/presets.ts";

export type SceneCanvas = OffscreenCanvas | HTMLCanvasElement;
export type SceneContext =
  OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
export type DrawingContext = Partial<
  Pick<
    SceneContext,
    | "beginPath"
    | "arc"
    | "roundRect"
    | "fill"
    | "stroke"
    | "strokeStyle"
    | "lineWidth"
    | "globalAlpha"
    | "createLinearGradient"
    | "drawImage"
  > &
    GraphicContext
> &
  Pick<
    SceneContext,
    | "fillStyle"
    | "font"
    | "textAlign"
    | "textBaseline"
    | "fillRect"
    | "fillText"
    | "measureText"
  >;
export type TextLayoutCache = Map<string, string[]>;

export type SceneNotice =
  | {
      reason: "unknown-scene" | "webgl-unavailable";
      fallbackSceneId: string;
      chapterId?: string;
    }
  | { reason: Studio3dNotice };

export class WebglContextLostError extends Error {
  constructor() {
    super(t("video.render.webglContextLost"));
    this.name = "WebglContextLostError";
  }
}

type SceneInputs = {
  readonly canvas: SceneCanvas;
  readonly plan: TimelinePlan;
  readonly audio: PcmAudio;
  readonly theme: VideoTheme;
  /** Supplied by renderVideo. Optional for existing scene callers and fixtures. */
  readonly orientation?: Orientation;
  readonly paletteId?: VideoPaletteId;
  readonly mood?: VideoMood;
};

export type VideoSceneEnvironment = SceneInputs & {
  readonly signal: AbortSignal;
  /** Fail the render even when the scene is not currently drawing. */
  readonly fail: (error: Error) => void;
};

export type VideoSceneFrame = SceneInputs & {
  readonly time: number;
  /** A storyboard chapter starts its camera clock at zero. PCM stays on the episode clock. */
  readonly sceneTime?: number;
  readonly index: number;
  readonly turn: VideoTurn;
  readonly textLayouts: TextLayoutCache;
} & (
    | {
        readonly kind: "2d";
        readonly context: SceneContext;
        /** Draw the shared label early when the 2D context uses its default state. */
        readonly drawSpeakerLabel: () => void;
      }
    | { readonly kind: "webgl" }
  );

/**
 * Each draw renders a complete turn frame from the plan, PCM and timeline time.
 * Treat input data as read-only. Do not use the wall clock, unseeded randomness,
 * state from prior draws, or the network. Caches may reuse derived results.
 * The canvas is the export target for 2D and a private layer for WebGL.
 */
export interface VideoScene {
  readonly id: string;
  readonly kind: "2d" | "webgl";
  /** Honor cancellation and report WebGL startup failure for 2D fallback. */
  init(
    env: VideoSceneEnvironment,
  ): Promise<void | "webgl-unavailable"> | void | "webgl-unavailable";
  draw(frame: VideoSceneFrame): void;
  /** Release resources even when initialization was interrupted. */
  dispose(): void;
}
