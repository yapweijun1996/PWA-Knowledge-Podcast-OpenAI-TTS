import { CrucibleRenderer } from "@codepawlhq/crucible";
import { createAgentScene } from "@codepawlhq/crucible/addons/agent-scene";
import { spectrumBins } from "./audio-state.js";
import { barId, createRecipe, hostIds } from "./recipe.js";
import { barHeightAt, cameraPoseAt, floorY, orbPoseAt } from "./scene-logic.js";

export function createCrucibleStudioScene({
  width,
  height,
  theme = "dark",
  canvas,
}) {
  if (![width, height].every((size) => Number.isSafeInteger(size) && size > 0))
    throw new RangeError("Scene dimensions must be positive integers.");

  const scene = createAgentScene(createRecipe(theme));
  const orbNames = new Set(hostIds.map((host) => `orb-${host}`));
  const parts = scene.parts.map((part) => ({
    ...part,
    castShadow: false,
    receiveShadow: false,
    matrix: part.matrix.slice(),
    material: orbNames.has(part.name) ? { ...part.material } : part.material,
  }));
  const byId = new Map(parts.map((part) => [part.name, part]));
  const orbs = hostIds.map((host) => byId.get(`orb-${host}`));
  const bars = Array.from({ length: spectrumBins }, (_, index) =>
    byId.get(barId(index)),
  );
  const animatedParts = [...orbs, ...bars];
  const camera = scene.camera;
  const environment = scene.environment;
  const effects = scene.effects;

  // Crucible 0.22 reads layout dimensions even with a fixed pixel ratio.
  // Supply the export size for both a CSS-sized canvas and an OffscreenCanvas.
  const surface = {
    clientWidth: width,
    clientHeight: height,
    get width() {
      return canvas.width;
    },
    set width(value) {
      canvas.width = value;
    },
    get height() {
      return canvas.height;
    },
    set height(value) {
      canvas.height = value;
    },
    getContext: (...args) => canvas.getContext(...args),
  };
  const renderer = new CrucibleRenderer(surface, parts, {
    pixelRatio: 1,
    samples: 4,
    hdr: true,
    world: environment.world,
    ground: false,
    environment,
    reversedDepth: false,
    exactFrames: true,
  });

  function renderAt(t, state) {
    for (const [index, orb] of orbs.entries()) {
      const { scale, rotationY, emission } = orbPoseAt(
        t,
        hostIds[index],
        state,
      );
      const cosine = scale * Math.cos(rotationY);
      const sine = scale * Math.sin(rotationY);
      orb.matrix[0] = orb.matrix[10] = cosine;
      orb.matrix[2] = -sine;
      orb.matrix[5] = scale;
      orb.matrix[8] = sine;
      orb.material.emission = emission;
    }
    for (const [index, bar] of bars.entries()) {
      const height = barHeightAt(state.spectrum[index]);
      bar.matrix[5] = height;
      bar.matrix[13] = floorY + height / 2;
    }
    const { position, target } = cameraPoseAt(t);
    renderer.updateParts(animatedParts, { shadows: false });
    renderer.render({
      ...camera,
      eye: position,
      target,
      effects,
      exposure: effects.exposure,
      time: t,
    });
  }

  return { renderAt, dispose: () => renderer.dispose() };
}
