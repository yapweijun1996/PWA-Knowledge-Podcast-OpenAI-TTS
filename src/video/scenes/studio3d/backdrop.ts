import * as THREE from "three";
import type { Orientation } from "../../design/tokens.ts";
import type { getPalette } from "./presets.ts";

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
  orientation: Orientation,
  palette: ReturnType<typeof getPalette>,
) {
  const portrait = orientation === "portrait";
  // The landscape gradient only varies by row and the four Bayer columns.
  // Portrait also has a screen-space wash that varies across the frame.
  const pixels = new THREE.WebGLRenderTarget(portrait ? width : 4, height, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    colorSpace: THREE.NoColorSpace,
    depthBuffer: false,
  });
  const defines = portrait ? { STUDIO_PORTRAIT: 1 } : {};
  const bakeMaterial = new THREE.ShaderMaterial({
    defines,
    uniforms: {
      stageWash: { value: new THREE.Color(palette.hostA) },
      top: { value: new THREE.Color(palette.stops[0]) },
      middle: { value: new THREE.Color(palette.stops[1]) },
      bottom: { value: new THREE.Color(palette.stops[2]) },
    },
    vertexShader,
    fragmentShader: `
      uniform vec3 stageWash;
      uniform vec3 top;
      uniform vec3 middle;
      uniform vec3 bottom;
      varying vec2 screenUv;
      float bayer2(vec2 cell) {
        return 2.0 * abs(cell.x - cell.y) + cell.y;
      }
      void main() {
        float y = 1.0 - screenUv.y;
        vec3 tint = y < 0.55
          ? mix(top, middle, y / 0.55)
          : mix(middle, bottom, (y - 0.55) / 0.45);
        #ifdef STUDIO_PORTRAIT
          float wash = smoothstep(0.35, 0.44, y) * (1.0 - smoothstep(0.44, 0.52, y));
          wash *= 1.0 - smoothstep(0.08, 0.36, abs(screenUv.x - 0.43));
          tint = mix(tint, stageWash, 0.035 * wash);
        #endif
        // Store the final sRGB bytes, with the original screen-aligned dither.
        gl_FragColor = sRGBTransferOETF(vec4(tint, 1.0));
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
    defines,
    uniforms: { backdropPixels: { value: pixels.texture } },
    vertexShader,
    fragmentShader: `
      uniform sampler2D backdropPixels;
      void main() {
        ivec2 pixel = ivec2(gl_FragCoord.xy);
        #ifndef STUDIO_PORTRAIT
          pixel.x &= 3;
        #endif
        gl_FragColor = texelFetch(backdropPixels, pixel, 0);
      }
    `,
    depthTest: false,
    depthWrite: false,
  });
  return { backdrop, pixels };
}
