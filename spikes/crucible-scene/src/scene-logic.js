/** Mulberry32 with a local 32-bit seed. */
export function createSeededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 2 ** 32;
  };
}

export function cameraPoseAt(t) {
  return {
    position: [
      0.8 * Math.sin(0.55 * t),
      3.25 + 0.2 * Math.sin(0.37 * t),
      8.8 + 0.35 * Math.cos(0.44 * t),
    ],
    target: [0, -0.15, 0],
  };
}

export const floorY = -1.05;
export const orbRadius = 0.54;

function clampUnit(value) {
  return Math.max(0, Math.min(1, value));
}

export function orbPoseAt(t, host, { speaker, amplitude }) {
  const energy = host === speaker ? clampUnit(amplitude) : 0;
  return {
    scale: orbRadius * (1 + 0.34 * energy),
    rotationY: t * (host === "A" ? 0.32 : -0.27),
    emission: 0.12 + 1.15 * energy,
  };
}

export function barHeightAt(bin = 0) {
  return 0.09 + 1.5 * Math.sqrt(clampUnit(bin));
}
