import type { PcmAudio } from "../pcm.ts";
import type { VideoTheme } from "../themes.ts";
import type { TimelinePlan, VideoTurn } from "../timeline.ts";

export type SceneCanvas = OffscreenCanvas | HTMLCanvasElement;
export type SceneContext =
  OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
export type DrawingContext = Pick<
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

type SceneInputs = {
  readonly canvas: SceneCanvas;
  readonly plan: TimelinePlan;
  readonly audio: PcmAudio;
  readonly theme: VideoTheme;
};

export type VideoSceneEnvironment = SceneInputs & {
  readonly signal: AbortSignal;
};

export type VideoSceneFrame = SceneInputs & {
  readonly time: number;
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
  /** Honor the signal during asynchronous initialization. */
  init(env: VideoSceneEnvironment): Promise<void> | void;
  draw(frame: VideoSceneFrame): void;
  /** Release resources even when initialization was interrupted. */
  dispose(): void;
}
