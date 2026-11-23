import type { MessageKey } from "../../i18n/index.ts";
import type { VideoScene } from "./types.ts";
import { createWaveformScene, waveformSceneId } from "./waveform.ts";

export const defaultSceneId = waveformSceneId;

type SceneRegistration = Pick<VideoScene, "id" | "kind"> & {
  label: Extract<MessageKey, `video.scene.${string}`>;
  /** Create an independent instance for each render. */
  create: () => VideoScene;
};

const waveform: SceneRegistration = {
  id: waveformSceneId,
  kind: "2d",
  label: "video.scene.waveform",
  create: createWaveformScene,
};

const scenes = new Map([[waveform.id, waveform]]);

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
