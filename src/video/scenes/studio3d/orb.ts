import * as THREE from "three";

const luminance = ({ r, g, b }: THREE.Color) =>
  0.2126 * r + 0.7152 * g + 0.0722 * b;

const keyDirection = new THREE.Vector3(-3, 5, 6).normalize();
const fillDirection = new THREE.Vector3(2, 3, -5).normalize();
const keyTint = new THREE.Color("#F5F7FC");

function idleBodyTint(color: THREE.Color) {
  const gray = luminance(color);
  return color.clone()
    .lerp(new THREE.Color(gray, gray, gray), 0.12)
    .multiplyScalar(0.915);
}

export function orbMaterial(color: THREE.Color, otherHostColor: THREE.Color) {
  const lightness = luminance(color);
  // Balance the hosts in linear light while keeping both palette hues.
  const bodyLuminance = 0.49;
  const bodyTint = color.clone().multiplyScalar(bodyLuminance / lightness);
  const rimTint = color.clone().multiplyScalar(
    Math.min(1, luminance(otherHostColor) / lightness),
  );
  const specularTint = keyTint.clone().lerp(bodyTint, 0.45);
  const idleBody = idleBodyTint(bodyTint);
  const idleSpecular = idleBodyTint(specularTint);
  const idleRim = rimTint.clone().multiplyScalar(0.62);
  const uniforms = {
    bodyTint: { value: idleBody.clone() },
    bodyLift: { value: 0.031 / bodyLuminance },
    specularTint: { value: idleSpecular.clone() },
    rimTint: { value: idleRim.clone() },
    keyDirection: { value: keyDirection },
    fillDirection: { value: fillDirection },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `
      uniform vec3 keyDirection;
      uniform vec3 fillDirection;
      varying float diffuse;
      varying vec3 radialNormal;
      varying vec3 towardCamera;
      varying vec3 keyHalfway;
      void main() {
        // The hosts have fixed orientation and use only uniform scaling.
        diffuse = 0.16 + 0.39 * max(dot(normal, keyDirection), 0.0)
          + 0.09 * max(dot(normal, fillDirection), 0.0);
        radialNormal = normalize(position);
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        towardCamera = cameraPosition - worldPosition.xyz;
        keyHalfway = normalize(keyDirection + normalize(towardCamera));
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 bodyTint;
      uniform float bodyLift;
      uniform vec3 specularTint;
      uniform vec3 rimTint;
      varying float diffuse;
      varying vec3 radialNormal;
      varying vec3 towardCamera;
      varying vec3 keyHalfway;
      void main() {
        vec3 radial = normalize(radialNormal);
        vec3 view = normalize(towardCamera);
        float facing = clamp(dot(radial, view), 0.0, 1.0);
        float reflection = max(dot(radial, keyHalfway), 0.0);
        float broad = reflection * reflection;
        broad *= broad;
        broad *= broad;
        float glint = broad * broad;
        glint *= glint;
        vec3 specular = specularTint * (0.085 * broad + 0.075 * glint);
        vec3 body = bodyTint * (diffuse + bodyLift) + specular;
        // Start the Fresnel rolloff farther inside the silhouette so the
        // palette-colored rim stays visible at preview sizes.
        float rim = smoothstep(0.25, 0.66, 1.0 - facing);
        // 0.8275 in linear light bounds the displayed channels at 0.92 sRGB.
        gl_FragColor = vec4(min(mix(body, rimTint, rim), vec3(0.8275)), 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
  return {
    material,
    setEmphasis(emphasis: number) {
      uniforms.bodyTint.value.lerpColors(idleBody, bodyTint, emphasis);
      uniforms.specularTint.value.lerpColors(idleSpecular, specularTint, emphasis);
      uniforms.rimTint.value.lerpColors(idleRim, rimTint, emphasis);
    },
  };
}
