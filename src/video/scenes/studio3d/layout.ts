import { designTokens, type Orientation } from "../../design/tokens.ts";
import { spectrumBins } from "./audio-state.ts";
import { cameraDistance, cameraFov, type cameraPoseAt } from "./presets.ts";

type Point = readonly [number, number, number];
type CameraPose = ReturnType<typeof cameraPoseAt>;
const halfFovTangent = Math.tan((cameraFov * Math.PI) / 360);
const viewHeight = 2 * halfFovTangent;

export const pedestalFootRadius = 0.98;
export const groundRingWidthH = 0.003;
export const groundRingMaxAlpha = 0.18;

export function studioLayout(width: number, height: number) {
  const aspect = width / height;
  const orientation: Orientation = width < height ? "portrait" : "landscape";
  const portrait = orientation === "portrait";
  const { orbCenters, orbDiameterH } = designTokens[orientation];
  const [first, second] = orbCenters;
  const centerX = (first[0] + second[0]) / 2;
  const centerY = portrait ? 0.30 : first[1];
  const hostX =
    ((second[0] - first[0]) / 2) * aspect * viewHeight * cameraDistance;
  const orbRadius =
    cameraDistance *
    Math.sin(Math.atan((portrait ? 0.118 : orbDiameterH) * halfFovTangent));
  const floorY = portrait ? -0.77 : -0.93;
  const pedestalHeight = portrait ? 0.32 : 0.2;
  const pedestalRadius = orbRadius * (portrait ? 0.83 : 1.04);
  const barWidth = portrait ? 0.04 : 0.106;
  const ringWidth = portrait ? 1.24 : 3.61;
  const ringDepth = 1.24 * (portrait ? 0.55 : 1);
  // Leave the foreground arc open in front of each pedestal throughout the
  // camera paths. Use fewer ticks in the narrower center span in portrait.
  const centerCount = portrait ? 4 : 8;
  const centerSpan = portrait ? 0.12 : 0.20;
  const side = portrait ? 0.95 : 0.89;
  const foregroundX = [
    0.999,
    side,
    ...Array.from(
      { length: centerCount },
      (_, index) => centerSpan * (1 - (2 * index) / (centerCount - 1)),
    ),
    -side,
    -0.999,
  ];
  const rearCount = spectrumBins - foregroundX.length;
  const ring = Array.from({ length: spectrumBins }, (_, index) => {
    const front = index < foregroundX.length;
    const angle = front
      ? Math.acos(foregroundX[index])
      : Math.PI * (1 + (index - foregroundX.length + 0.5) / rearCount);
    const x = ringWidth * Math.cos(angle);
    const z = ringDepth * Math.sin(angle);
    const bias = (1 + Math.cos(angle)) / 2;
    const rearDepth = Math.max(0, -z / ringDepth);
    const heightCap = 0.012 + (0.055 - 0.012) * Math.min(1, rearDepth / 0.95);
    // Raise the landscape front arc to clear the chips through the camera path.
    // Portrait has room to lower the arc and separate it from the pedestals.
    const baseY = floorY + (portrait ? -0.035 : 0.28) * Math.max(0, z / ringDepth);
    return {
      x,
      z,
      bias,
      rearDepth,
      baseY,
      heightCap,
      baseCorners: ([-1, 1] as const).flatMap((side) =>
        ([-1, 1] as const).map(
          (end) =>
            [
              x + (side * barWidth) / 2,
              baseY,
              z + (end * barWidth) / 2,
            ] as const,
        ),
      ),
    };
  });

  return {
    aspect,
    orientation,
    centerX,
    centerY,
    hostX,
    orbRadius,
    floorY,
    pedestalHeight,
    pedestalRadius,
    groundRingRadius: portrait ? 1.52 : 1.29,
    barWidth,
    ringWidth,
    ringDepth,
    ring,
  };
}

type StudioLayout = ReturnType<typeof studioLayout>;

const dot = (a: Point, b: Point) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export function projectStagePoint(
  layout: StudioLayout,
  pose: CameraPose,
  point: Point,
) {
  const depth = pose.distance - dot(pose.back, point);
  return [
    layout.centerX +
      dot(pose.right, point) / (depth * viewHeight * layout.aspect),
    layout.centerY - dot(pose.up, point) / (depth * viewHeight),
  ] as const;
}

export function spectrumBarHeight(
  pose: CameraPose,
  { baseCorners, heightCap }: StudioLayout["ring"][number],
  energy: number,
) {
  let lowest = Infinity;
  for (const corner of baseCorners)
    lowest = Math.min(
      lowest,
      dot(pose.up, corner) / (pose.distance - dot(pose.back, corner)),
    );
  // Invert the perspective projection for each top corner. The cap includes
  // the depth of the block and applies to its entire projected silhouette.
  const highest = lowest + heightCap * viewHeight;
  let maxHeight = Infinity;
  for (const corner of baseCorners) {
    const depth = pose.distance - dot(pose.back, corner);
    maxHeight = Math.min(
      maxHeight,
      (highest * depth - dot(pose.up, corner)) /
        (pose.up[1] + highest * pose.back[1]),
    );
  }
  return maxHeight * (0.1 + 0.9 * Math.max(0, Math.min(1, energy)));
}

const unit = (value: number) => Math.max(0, Math.min(1, value));

export const orbScaleAt = (
  energy: number,
  emphasis: number,
  reducedMotion = false,
) =>
  1 + 0.013 * unit(energy) + (reducedMotion ? 0 : 0.04 * unit(emphasis));

export const haloOpacityAt = (energy: number, reducedMotion = false) =>
  0.09 + (reducedMotion ? 0 : 0.03 * unit(energy));

export const studioParticleCount = 12;

export function studioParticles(layout: StudioLayout, seed: number): Point[] {
  let state = seed >>> 0;
  // Mulberry32 gives each scene an independent, fixed sequence.
  function random() {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 2 ** 32;
  }
  return Array.from({ length: studioParticleCount }, () => [
    (2 * random() - 1) * layout.ringWidth,
    (random() * 2 - 0.4) * layout.orbRadius,
    -2.3 - 0.9 * random(),
  ]);
}
