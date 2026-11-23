import type { MessageKey } from "../../i18n/index.ts";
import { studio3dSceneId, type Studio3dSettings } from "./studio3d/presets.ts";
import type { VideoScene } from "./types.ts";
import { createWaveformScene, waveformSceneId } from "./waveform.ts";

export const defaultSceneId = waveformSceneId;

type SceneRegistration = Pick<VideoScene, "id" | "kind"> & {
  label: Extract<MessageKey, `video.scene.${string}`>;
  requiresWebgl2?: boolean;
  /** Create an independent instance. Allocate render resources in init(). */
  create: (options?: Studio3dSettings) => VideoScene | Promise<VideoScene>;
};

const waveform: SceneRegistration = {
  id: waveformSceneId,
  kind: "2d",
  label: "video.scene.waveform",
  create: createWaveformScene,
};

const studio3d: SceneRegistration = {
  id: studio3dSceneId,
  kind: "webgl",
  label: "video.scene.studio3d",
  requiresWebgl2: true,
  async create(options) {
    const { createStudio3dScene } = await import("./studio3d/index.ts");
    return createStudio3dScene(options);
  },
};

const scenes = new Map([waveform, studio3d].map((scene) => [scene.id, scene]));

export function registerScene(scene: SceneRegistration) {
  if (!scene.id || scenes.has(scene.id))
    throw new Error(`Invalid or duplicate video scene ID: ${scene.id}`);
  scenes.set(scene.id, { ...scene });
}

/** A differing result ID indicates that the requested scene was unavailable. */
export function getScene(id: string): Readonly<SceneRegistration> {
  return scenes.get(id) ?? waveform;
}

export function listScenes() {
  return [...scenes.values()].map(({ id, kind, label }) => ({
    id,
    kind,
    label,
  }));
}
