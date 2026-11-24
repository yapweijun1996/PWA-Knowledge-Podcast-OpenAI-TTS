import * as THREE from "three";

const pedestalBody = new THREE.Color("#253247");
export const pedestalBevel = new THREE.Color("#53617D");

export function activePedestalBevel(accent: THREE.Color) {
  return pedestalBevel.clone().lerp(accent, 0.55);
}

export function pedestalGeometry(radius: number, height: number, bevelStart: number) {
  // Duplicate the bevel endpoints for crisp seams. The top rings bake a
  // shallow highlight and the orb's contact shadow into the same mesh.
  const topTint = 0.42;
  const contactShade = 0.26;
  const profile = [
    [0, 0, 0, 0.82],
    [0.96, 0, 0, 0.82],
    [1, 0.10, 0, 0.92],
    [1, bevelStart, 0, 1.08],
    [1, bevelStart, 1, 1],
    [0.84, 1, 1, 1],
    [0.84, 1, topTint, 1.03],
    [0.62, 1, topTint, 1],
    [0.32, 1, topTint, 1 - contactShade / 2],
    [0, 1, topTint, 1 - contactShade],
  ] as const;
  const geometry = new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r * radius, y * height)),
    40,
  );
  const finish = new Float32Array(2 * geometry.getAttribute("position").count);
  for (let index = 0; index < finish.length / 2; index++) {
    const [, , tint, shade] = profile[index % profile.length];
    finish[2 * index] = tint;
    finish[2 * index + 1] = shade;
  }
  geometry.setAttribute("finish", new THREE.BufferAttribute(finish, 2));
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
      attribute vec2 finish;
      uniform vec3 bodyTint;
      uniform vec3 idleBevel;
      uniform vec3 activeBevel;
      uniform float emphasis;
      varying vec3 tint;
      void main() {
        vec3 bevelTint = mix(idleBevel, activeBevel, emphasis);
        // The top face keeps its neutral finish through the turn cue.
        vec3 topOrSide = mix(bodyTint, idleBevel, finish.x) * finish.y;
        tint = finish.x == 1.0 ? bevelTint : topOrSide;
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
