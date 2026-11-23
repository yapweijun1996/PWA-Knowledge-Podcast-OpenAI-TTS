import { spectrumBins } from "./audio-state.js";
import {
  barHeightAt,
  cameraPoseAt,
  createSeededRandom,
  floorY,
  orbRadius,
} from "./scene-logic.js";

const palettes = {
  dark: { floor: 0x101826, horizon: 0x273859, a: 0x83e2ce, b: 0xbca4ff },
  light: { floor: 0x201b2a, horizon: 0x493653, a: 0xffc58b, b: 0xf29ede },
};

export const hostIds = ["A", "B"];
export const barId = (index) => `bar-${index}`;

function displayRgb(hex) {
  return [16, 8, 0].map((shift) => ((hex >> shift) & 255) / 255);
}

function linearRgb(hex) {
  return displayRgb(hex).map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
}

/** Build a plain JSON-compatible crucible.scene recipe from a trusted palette. */
export function createRecipe(theme = "dark") {
  if (!Object.hasOwn(palettes, theme))
    throw new RangeError(`Unknown theme: ${theme}`);
  const palette = palettes[theme];
  const floorColor = linearRgb(palette.floor);
  const hostColors = [linearRgb(palette.a), linearRgb(palette.b)];
  const { position, target } = cameraPoseAt(0);
  const materials = [
    { id: "floor", tag: "unlit", color: floorColor },
    { id: "pedestal", color: linearRgb(0x263347), roughness: 0.46 },
  ];
  const nodes = [
    {
      id: "floor",
      geometry: "floor",
      material: "floor",
      translation: [0, floorY, 0],
      rotation: [-Math.SQRT1_2, 0, 0, Math.SQRT1_2],
      scale: [120, 120, 1],
    },
  ];
  for (const [index, host] of hostIds.entries()) {
    const x = index === 0 ? -1.28 : 1.28;
    const id = `orb-${host}`;
    const color = hostColors[index];
    materials.push({ id, color, roughness: 0.38, emission: 0.12 });
    nodes.push(
      {
        id: `pedestal-${host}`,
        geometry: "pedestal",
        material: "pedestal",
        translation: [x, -0.79, 0],
        scale: [1, 0.52, 1],
      },
      {
        id,
        geometry: "orb",
        material: id,
        translation: [x, 0.29, 0],
        scale: [orbRadius, orbRadius, orbRadius],
      },
    );
  }

  const random = createSeededRandom(51);
  const [a, b] = hostColors;
  const idleHeight = barHeightAt();
  for (let index = 0; index < spectrumBins; index++) {
    const id = barId(index);
    const angle = (2 * Math.PI * index) / spectrumBins;
    const blend = (1 + Math.cos(angle)) / 2;
    const brightness = 0.16 + 0.13 * random();
    const color = a.map(
      (channel, i) => (channel + (b[i] - channel) * blend) * brightness,
    );
    materials.push({ id, color, roughness: 0.5 });
    nodes.push({
      id,
      geometry: "bar",
      material: id,
      translation: [
        3.35 * Math.cos(angle),
        floorY + idleHeight / 2,
        3.35 * Math.sin(angle),
      ],
      scale: [0.17, idleHeight, 0.17],
    });
  }

  return {
    format: "crucible.scene",
    schemaVersion: 1,
    geometries: [
      { id: "floor", type: "plane", segments: 1 },
      {
        id: "pedestal",
        type: "cone",
        segments: 40,
        radiusTop: 0.72,
        radiusBottom: 0.9,
      },
      { id: "orb", type: "icoSphere", subdivisions: 2 },
      { id: "bar", type: "box", bevel: 0 },
    ],
    materials,
    nodes,
    camera: { eye: position, target, fov: 40, near: 0.1, far: 80 },
    environment: {
      setup: "studio",
      world: true,
      ground: false,
      resolveCoplanar: false,
      objectReflections: false,
      lightDirection: [2, 6, 4],
      keyColor: linearRgb(0xe3edff),
      keyIntensity: 2.1,
      skyTop: displayRgb(palette.floor),
      skyBottom: displayRgb(palette.horizon),
      daylight: 0,
      fogColor: floorColor,
      fogDensity: 0.038,
    },
    effects: { bloom: { strength: 0.55, threshold: 0.4, radius: 2 } },
  };
}
