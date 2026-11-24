import * as THREE from "three";
import type { studioLayout } from "./layout.ts";
import type { getPalette } from "./presets.ts";

export const floorWashPeakAlpha = 0.024;

const vertexShader = `
  varying vec2 screenUv;
  void main() {
    screenUv = uv;
    gl_Position = vec4(position.xy, 0.999, 1.0);
  }
`;

export function bakeBackdrop(
  renderer: THREE.WebGLRenderer,
  width: number,
  height: number,
  layout: Pick<ReturnType<typeof studioLayout>, "orientation" | "centerX">,
  palette: ReturnType<typeof getPalette>,
) {
  const portrait = layout.orientation === "portrait";
  const projection = new THREE.Vector2(width ** 2, height ** 2);
  projection.divideScalar(projection.x + projection.y);
  const washTint = new THREE.Color(palette.hostA)
    .lerp(new THREE.Color(palette.hostB), 0.5)
    .convertLinearToSRGB();
  const pixels = new THREE.WebGLRenderTarget(width, height, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    colorSpace: THREE.NoColorSpace,
    depthBuffer: false,
  });
  const bakeMaterial = new THREE.ShaderMaterial({
    uniforms: {
      projection: { value: projection },
      washCenter: { value: new THREE.Vector2(layout.centerX, portrait ? 0.448 : 0.476) },
      washRadii: { value: new THREE.Vector2(portrait ? 0.31 : 0.33, portrait ? 0.043 : 0.054) },
      washTint: { value: washTint },
      first: { value: new THREE.Color(palette.stops[0]) },
      middle: { value: new THREE.Color(palette.stops[1]) },
      last: { value: new THREE.Color(palette.stops[2]) },
    },
    vertexShader,
    fragmentShader: `
      uniform vec2 projection;
      uniform vec2 washCenter;
      uniform vec2 washRadii;
      uniform vec3 washTint;
      uniform vec3 first;
      uniform vec3 middle;
      uniform vec3 last;
      varying vec2 screenUv;
      float bayer2(vec2 cell) {
        return 2.0 * abs(cell.x - cell.y) + cell.y;
      }
      void main() {
        vec2 point = vec2(screenUv.x, 1.0 - screenUv.y);
        // Match the linear-light 4096-step diagonal ramp in drawVideoBackground.
        float t = floor(dot(point, projection) * 4096.0 + 0.5) / 4096.0;
        vec3 tint = t < 0.55
          ? mix(first, middle, t / 0.55)
          : mix(middle, last, (t - 0.55) / 0.45);
        vec3 srgb = sRGBTransferOETF(vec4(tint, 1.0)).rgb;
        float radius = length((point - washCenter) / washRadii);
        float wash = ${floorWashPeakAlpha} * (1.0 - smoothstep(0.0, 1.0, radius));
        gl_FragColor = vec4(mix(srgb, washTint, wash), 1.0);
        // Store dithered sRGB bytes with the same screen-aligned Bayer ranks as the cards.
        vec2 pixel = floor(gl_FragCoord.xy);
        float rank = 4.0 * bayer2(mod(pixel, 2.0)) + bayer2(mod(floor(pixel * 0.5), 2.0));
        gl_FragColor.rgb += ((rank + 0.5) / 16.0 - 0.5) / 255.0;
      }
    `,
    depthTest: false,
    depthWrite: false,
  });
  const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bakeMaterial);
  backdrop.frustumCulled = false;
  backdrop.renderOrder = -1;
  const bakeScene = new THREE.Scene();
  bakeScene.add(backdrop);
  const previousTarget = renderer.getRenderTarget();
  try {
    renderer.setRenderTarget(pixels);
    renderer.render(bakeScene, new THREE.Camera());
  } catch (error) {
    pixels.dispose();
    backdrop.geometry.dispose();
    throw error;
  } finally {
    renderer.setRenderTarget(previousTarget);
    bakeMaterial.dispose();
  }

  backdrop.material = new THREE.ShaderMaterial({
    uniforms: { backdropPixels: { value: pixels.texture } },
    vertexShader,
    fragmentShader: `
      uniform sampler2D backdropPixels;
      void main() {
        gl_FragColor = texelFetch(backdropPixels, ivec2(gl_FragCoord.xy), 0);
      }
    `,
    depthTest: false,
    depthWrite: false,
  });
  return { backdrop, pixels };
}
