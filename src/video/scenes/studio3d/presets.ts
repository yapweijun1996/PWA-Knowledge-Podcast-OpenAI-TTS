export const studio3dSceneId = "studio3d";

const palettes = {
  aurora: { floor: 0x101826, horizon: 0x273859, a: 0x83e2ce, b: 0xbca4ff },
  sunset: { floor: 0x201b2a, horizon: 0x493653, a: 0xffc58b, b: 0xf29ede },
  mono: { floor: 0x17191c, horizon: 0x464b52, a: 0xecf0f3, b: 0xb1b9c4 },
  ocean: { floor: 0x071e28, horizon: 0x144c67, a: 0x60e4ea, b: 0x76abff },
} as const;

const cameraLabels = {
  drift: "video.studio3d.camera.drift",
  orbit: "video.studio3d.camera.orbit",
  static: "video.studio3d.camera.static",
  "push-in": "video.studio3d.camera.pushIn",
} as const;

type PaletteId = keyof typeof palettes;
type CameraPresetId = keyof typeof cameraLabels;

export const paletteLabels = {
  aurora: "video.studio3d.palette.aurora",
  sunset: "video.studio3d.palette.sunset",
  mono: "video.studio3d.palette.mono",
  ocean: "video.studio3d.palette.ocean",
} as const satisfies Record<PaletteId, string>;
export { cameraLabels };

export type Studio3dSettings = {
  paletteId: PaletteId;
  cameraPresetId: CameraPresetId;
  intensity: number;
};

export type Studio3dOptions = {
  paletteId?: string;
  cameraPresetId?: string;
  intensity?: number;
};

export type Studio3dNotice = "unknown-palette" | "unknown-camera";

export const defaultStudio3dSettings: Readonly<Studio3dSettings> = {
  paletteId: "aurora",
  cameraPresetId: "drift",
  intensity: 1,
};

export function resolveStudio3dOptions(options: Studio3dOptions = {}) {
  const settings = { ...defaultStudio3dSettings };
  const notices: Studio3dNotice[] = [];
  const { paletteId, cameraPresetId, intensity } = options;
  if (paletteId !== undefined) {
    if (Object.hasOwn(palettes, paletteId))
      settings.paletteId = paletteId as PaletteId;
    else notices.push("unknown-palette");
  }
  if (cameraPresetId !== undefined) {
    if (Object.hasOwn(cameraLabels, cameraPresetId))
      settings.cameraPresetId = cameraPresetId as CameraPresetId;
    else notices.push("unknown-camera");
  }
  if (typeof intensity === "number" && !Number.isNaN(intensity))
    settings.intensity = Math.max(0, Math.min(1, intensity));
  return { settings, notices };
}

export function getPalette(id: PaletteId) {
  return palettes[id];
}

export function cameraPoseAt(preset: CameraPresetId, time: number) {
  let position: [number, number, number];
  switch (preset) {
    case "static":
      position = [0, 3.25, 9.15];
      break;
    case "orbit": {
      const angle = 0.3 * Math.sin(0.35 * time);
      position = [9.15 * Math.sin(angle), 3.25, 9.15 * Math.cos(angle)];
      break;
    }
    case "push-in":
      position = [0, 3.25, 7.85 + 1.3 * Math.exp(-0.16 * time)];
      break;
    default:
      position = [
        0.8 * Math.sin(0.55 * time),
        3.25 + 0.2 * Math.sin(0.37 * time),
        8.8 + 0.35 * Math.cos(0.44 * time),
      ];
  }
  return { position, target: [0, -0.15, 0] as const };
}
