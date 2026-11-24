import * as THREE from "three";

const pedestalBody = new THREE.Color("#253247");
export const pedestalBevel = new THREE.Color("#53617D");

export function activePedestalBevel(accent: THREE.Color) {
  return pedestalBevel.clone().lerp(accent, 0.55);
}

export function pedestalGeometry(radius: number, height: number) {
  // Duplicate the bevel endpoints so its color ends at the two seams.
  const profile = [
    [0, 0, 0],
    [0.9, 0, 0],
    [1, 0.12, 0],
    [0.97, 0.55, 0],
    [0.97, 0.55, 1],
    [0.79, 1, 1],
    [0.79, 1, 0],
    [0, 1, 0],
  ] as const;
  const geometry = new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r * radius, y * height)),
    40,
  );
  const bevels = new Float32Array(geometry.getAttribute("position").count);
  for (let index = 0; index < bevels.length; index++)
    bevels[index] = profile[index % profile.length][2];
  geometry.setAttribute("bevel", new THREE.BufferAttribute(bevels, 1));
  return geometry;
}

export function pedestalMaterial(accent: THREE.Color) {
  return new THREE.ShaderMaterial({
    uniforms: {
      bodyTint: { value: pedestalBody },
      idleBevel: { value: pedestalBevel },
      activeBevel: { value: activePedestalBevel(accent) },
      emphasis: { value: 0 },
    },
    vertexShader: `
      attribute float bevel;
      uniform vec3 bodyTint;
      uniform vec3 idleBevel;
      uniform vec3 activeBevel;
      uniform float emphasis;
      varying vec3 tint;
      void main() {
        tint = mix(bodyTint, mix(idleBevel, activeBevel, emphasis), bevel);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 tint;
      void main() {
        gl_FragColor = vec4(tint, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
}

export const contactShadowExtent = 1.50;
export const contactShadowRadii = [1.40, 1.23] as const;

export function contactShadowTexture() {
  const size = 64;
  const pixels = new Uint8Array(size * size * 4);
  const [radiusX, radiusZ] = contactShadowRadii;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (2 * (x + 0.5) / size - 1) * (contactShadowExtent / radiusX);
      const dz = (2 * (y + 0.5) / size - 1) * (contactShadowExtent / radiusZ);
      const r = Math.min(1, Math.hypot(dx, dz));
      const alpha = 0.28 * (1 - r * r * (3 - 2 * r));
      pixels[4 * (y * size + x) + 3] = Math.round(255 * alpha);
    }
  }
  const texture = new THREE.DataTexture(pixels, size, size);
  texture.magFilter = texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}
