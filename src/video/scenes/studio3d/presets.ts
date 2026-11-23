import { paletteIds, palettes, type PaletteId } from "../../design/palettes.ts";
import type { Orientation } from "../../design/tokens.ts";

export const studio3dSceneId = "studio3d";

export const cameraLabels = {
  drift: "video.studio3d.camera.drift",
  orbit: "video.studio3d.camera.orbit",
  static: "video.studio3d.camera.static",
  "push-in": "video.studio3d.camera.pushIn",
} as const;

export const paletteLabels = {
  aurora: "video.studio3d.palette.aurora",
  sunset: "video.studio3d.palette.sunset",
  mono: "video.studio3d.palette.mono",
  ocean: "video.studio3d.palette.ocean",
} as const satisfies Record<PaletteId, string>;

const moods = {
  calm: 0.7,
  curious: 1,
  urgent: 1.15,
  warm: 0.8,
  serious: 0.55,
} as const;

type MoodId = keyof typeof moods;
type CameraPresetId = keyof typeof cameraLabels;
export const defaultStudio3dMood = "calm";

export type Studio3dSettings = {
  paletteId: PaletteId;
  cameraPresetId: CameraPresetId;
  intensity: number;
  moodId?: MoodId;
  reducedMotion?: boolean;
};

export type Studio3dOptions = {
  paletteId?: string;
  cameraPresetId?: string;
  intensity?: number;
  moodId?: string;
  reducedMotion?: boolean;
};

export type Studio3dNotice = "unknown-palette" | "unknown-camera";

export const defaultStudio3dSettings: Readonly<Studio3dSettings> = {
  paletteId: "aurora",
  cameraPresetId: "drift",
  intensity: 0.55,
};

function clampIntensity(intensity: number = defaultStudio3dSettings.intensity) {
  return Number.isNaN(intensity)
    ? defaultStudio3dSettings.intensity
    : Math.max(0, Math.min(1, intensity));
}

export function resolveStudio3dOptions(options: Studio3dOptions = {}) {
  const settings = { ...defaultStudio3dSettings };
  const notices: Studio3dNotice[] = [];
  const { paletteId, cameraPresetId, intensity, moodId, reducedMotion } =
    options;
  if (paletteId !== undefined) {
    if (paletteIds.some((id) => id === paletteId))
      settings.paletteId = paletteId as PaletteId;
    else notices.push("unknown-palette");
  }
  if (cameraPresetId !== undefined) {
    if (Object.hasOwn(cameraLabels, cameraPresetId))
      settings.cameraPresetId = cameraPresetId as CameraPresetId;
    else notices.push("unknown-camera");
  }
  if (typeof intensity === "number")
    settings.intensity = clampIntensity(intensity);
  if (moodId !== undefined)
    settings.moodId = Object.hasOwn(moods, moodId)
      ? (moodId as MoodId)
      : defaultStudio3dMood;
  if (typeof reducedMotion === "boolean")
    settings.reducedMotion = reducedMotion;
  return { settings, notices };
}

export function getPalette(id: PaletteId) {
  return palettes[id];
}

export function motionMultipliers(moodId: MoodId = "curious", intensity = 1) {
  const mood = moods[moodId];
  return {
    audio: Math.min(1, mood * clampIntensity(intensity)),
    camera: Math.min(1, mood),
  };
}

export const cameraFov = 38;
export const cameraDistance = 10;
const radians = Math.PI / 180;
const target = [0, 0, 0] as const;

export function cameraPoseAt(
  preset: CameraPresetId,
  time: number,
  moodId: MoodId = "curious",
  orientation: Orientation = "landscape",
  reducedMotion = false,
) {
  let yaw = 0;
  let pitch = 8 * radians;
  let distance = cameraDistance;
  const excursion =
    motionMultipliers(moodId).camera * (orientation === "portrait" ? 0.65 : 1);
  if (!reducedMotion) {
    switch (preset) {
      case "static":
        break;
      case "orbit":
        yaw += 7 * radians * excursion * Math.sin((2 * Math.PI * time) / 56);
        break;
      case "push-in": {
        const progress = Math.max(0, Math.min(1, (time - 2) / 12));
        const eased = progress ** 3 * (10 + progress * (-15 + 6 * progress));
        distance *= 1 - 0.04 * excursion * eased;
        break;
      }
      default: {
        const phase = (2 * Math.PI * time) / 36;
        yaw += 4 * radians * excursion * Math.sin(phase);
        pitch += 1.25 * radians * excursion * Math.sin(phase);
      }
    }
  }

  const sinYaw = Math.sin(yaw);
  const cosYaw = Math.cos(yaw);
  const sinPitch = Math.sin(pitch);
  const cosPitch = Math.cos(pitch);
  const back = [sinYaw * cosPitch, sinPitch, cosYaw * cosPitch] as const;
  const right = [cosYaw, 0, -sinYaw] as const;
  const up = [-sinYaw * sinPitch, cosPitch, -cosYaw * sinPitch] as const;
  const position = [
    distance * back[0],
    distance * back[1],
    distance * back[2],
  ] as const;

  return { position, target, distance, back, right, up };
}
