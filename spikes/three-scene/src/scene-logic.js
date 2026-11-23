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
