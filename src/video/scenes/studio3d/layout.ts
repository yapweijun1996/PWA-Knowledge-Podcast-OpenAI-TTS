import { designTokens, type Orientation } from "../../design/tokens.ts";
import { spectrumBins } from "./audio-state.ts";
import { cameraDistance, cameraFov, type cameraPoseAt } from "./presets.ts";

type Point = readonly [number, number, number];
type CameraPose = ReturnType<typeof cameraPoseAt>;
const halfFovTangent = Math.tan((cameraFov * Math.PI) / 360);
const viewHeight = 2 * halfFovTangent;

export function studioLayout(width: number, height: number) {
  const aspect = width / height;
  const orientation: Orientation = width < height ? "portrait" : "landscape";
  const portrait = orientation === "portrait";
  const { orbCenters, orbDiameterH } = designTokens[orientation];
  const [first, second] = orbCenters;
  const centerX = (first[0] + second[0]) / 2;
  const centerY = portrait ? 0.36 : first[1];
  const hostX =
    ((second[0] - first[0]) / 2) * aspect * viewHeight * cameraDistance;
  const orbRadius =
    cameraDistance *
    Math.sin(Math.atan((portrait ? 0.138 : orbDiameterH) * halfFovTangent));
  const floorY = portrait ? -0.59 : -0.93;
  const pedestalHeight = portrait ? 0.155 : 0.2;
  const pedestalRadius = orbRadius * (portrait ? 0.71 : 1.04);
  const barWidth = portrait ? 0.05 : 0.129;
  const ringWidth = portrait ? 1.21 : 3.61;
  const ringDepth = 1.24 * (portrait ? 0.55 : 1);
  const pedestalBounds = [-hostX, hostX].map((x) =>
    [-pedestalRadius, pedestalRadius].flatMap((dx) =>
      [-pedestalRadius, pedestalRadius].flatMap((z) =>
        [floorY, floorY + pedestalHeight].map((y) => [x + dx, y, z] as const),
      ),
    ),
  );
  const ring = Array.from({ length: spectrumBins }, (_, index) => {
    const angle = (2 * Math.PI * index) / spectrumBins;
    const near = index <= spectrumBins / 2;
    const x = ringWidth * Math.cos(angle);
    const depth = index % (spectrumBins / 2) === 0 ? 0 : Math.sin(angle);
    const z = ringDepth * depth;
    const bias = (1 + Math.cos(angle)) / 2;
    const foreground = Math.max(0, depth);
    const heightCap = near ? 0.012 : 0.04;
    // Compensate the projected tilt of the portrait rear rail. The shallow
    // foreground sits high enough to clear the chips.
    const baseY = floorY + (portrait ? 0.15 + 0.10 * Math.min(0, depth) : 0)
      + (portrait ? 0.16 : 0.28) * foreground;
    return {
      x,
      z,
      near,
      bias,
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
    pedestalBounds,
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
  for (let index = 0; index < baseCorners.length; index++) {
    const corner = baseCorners[index];
    lowest = Math.min(
      lowest,
      dot(pose.up, corner) / (pose.distance - dot(pose.back, corner)),
    );
  }
  // Invert the perspective projection for each top corner. The cap includes
  // the depth of the block and applies to its entire projected silhouette.
  const highest = lowest + heightCap * viewHeight;
  let maxHeight = Infinity;
  for (let index = 0; index < baseCorners.length; index++) {
    const corner = baseCorners[index];
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

function screenBounds() {
  return { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
}

/** Preserve a 0.015H gap between near spectrum bars and the two podiums. */
export function prepareForegroundSpectrum(layout: StudioLayout, pose: CameraPose) {
  const pedestals = layout.pedestalBounds.map(screenBounds);
  const bar = screenBounds();

  function projectBox(bounds: ReturnType<typeof screenBounds>, corners: readonly Point[], height: number) {
    bounds.left = bounds.top = Infinity;
    bounds.right = bounds.bottom = -Infinity;
    const { distance, back, right, up } = pose;
    for (let index = 0; index < corners.length; index++) {
      const corner = corners[index];
      const depth = distance - dot(back, corner);
      const horizontal = dot(right, corner);
      const vertical = dot(up, corner);
      // Work in units of frame height on both axes.
      const px = horizontal / (depth * viewHeight);
      const py = -vertical / (depth * viewHeight);
      const topDepth = (depth - height * back[1]) * viewHeight;
      const topX = (horizontal + height * right[1]) / topDepth;
      const topY = -(vertical + height * up[1]) / topDepth;
      bounds.left = Math.min(bounds.left, px, topX);
      bounds.top = Math.min(bounds.top, py, topY);
      bounds.right = Math.max(bounds.right, px, topX);
      bounds.bottom = Math.max(bounds.bottom, py, topY);
    }
  }

  function update() {
    for (let index = 0; index < pedestals.length; index++)
      projectBox(pedestals[index], layout.pedestalBounds[index], 0);
  }

  function scale(block: StudioLayout["ring"][number], height: number) {
    if (!block.near) return 1;
    projectBox(bar, block.baseCorners, height);
    let clearance = Infinity;
    for (let index = 0; index < pedestals.length; index++) {
      const pedestal = pedestals[index];
      const horizontal = Math.max(pedestal.left - bar.right, bar.left - pedestal.right);
      const vertical = Math.max(pedestal.top - bar.bottom, bar.top - pedestal.bottom);
      clearance = Math.min(clearance, Math.max(horizontal, vertical));
    }
    // Taper the bar near the clearance limit to avoid pop-in as the camera moves.
    return unit((clearance - 0.015) / 0.012);
  }

  return { update, scale };
}

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
