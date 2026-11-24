import * as THREE from "three";

const luminance = ({ r, g, b }: THREE.Color) =>
  0.2126 * r + 0.7152 * g + 0.0722 * b;

const lavenderLuminance = luminance(new THREE.Color("#B29AF0"));
const keyDirection = new THREE.Vector3(-3, 5, 6).normalize();
const fillDirection = new THREE.Vector3(2, 3, -5).normalize();
const keyTint = new THREE.Color("#F5F7FC");

export function orbMaterial(color: THREE.Color, matchLavenderLuminance: boolean) {
  const lightness = luminance(color);
  // Lower the brighter aurora rim in linear light to preserve its teal hue.
  const rimTint = color.clone().multiplyScalar(
    Math.min(1, (matchLavenderLuminance ? lavenderLuminance : 0.48) / lightness),
  );
  return new THREE.ShaderMaterial({
    uniforms: {
      bodyTint: { value: color },
      bodyLift: { value: color.clone().multiplyScalar(0.031 / lightness) },
      rimTint: { value: rimTint },
      keyDirection: { value: keyDirection },
      keyTint: { value: keyTint },
      fillDirection: { value: fillDirection },
      emphasis: { value: 0 },
    },
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
      uniform vec3 bodyLift;
      uniform vec3 rimTint;
      uniform vec3 keyTint;
      uniform float emphasis;
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
        vec3 specular = mix(keyTint, bodyTint, 0.45) * (0.085 * broad + 0.075 * glint);
        vec3 body = bodyTint * diffuse + emphasis * bodyLift + specular;
        // The radial Fresnel rolloff stays continuous over the shaded facets.
        float rim = smoothstep(0.36, 0.77, 1.0 - facing);
        vec3 edge = rimTint * mix(0.62, 1.0, emphasis);
        // 0.8275 in linear light bounds the displayed channels at 0.92 sRGB.
        gl_FragColor = vec4(min(mix(body, edge, rim), vec3(0.8275)), 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
}
