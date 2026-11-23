import * as THREE from "three";
import { spectrumBins } from "./audio-state.js";
import { cameraPoseAt, createSeededRandom } from "./scene-logic.js";

const palettes = {
  dark: { floor: 0x101826, horizon: 0x273859, a: 0x83e2ce, b: 0xbca4ff },
  light: { floor: 0x201b2a, horizon: 0x493653, a: 0xffc58b, b: 0xf29ede },
};

export function createStudioScene({ width, height, theme = "dark", canvas }) {
  const palette = palettes[theme];
  if (!Object.hasOwn(palettes, theme))
    throw new RangeError(`Unknown theme: ${theme}`);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    preserveDrawingBuffer: false,
  });
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setSize(width, height, false);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(palette.floor, 0.065);
  const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 80);
  scene.add(new THREE.HemisphereLight(0xbad5ff, 0x352940, 2.4));
  const key = new THREE.DirectionalLight(0xe3edff, 2.1);
  key.position.set(2, 6, 4);
  scene.add(key);

  const backdrop = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      uniforms: {
        base: { value: new THREE.Color(palette.floor) },
        horizon: { value: new THREE.Color(palette.horizon) },
      },
      vertexShader: `
        varying vec2 screenUv;
        void main() {
          screenUv = uv;
          gl_Position = vec4(position.xy, 0.999, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 base;
        uniform vec3 horizon;
        varying vec2 screenUv;
        void main() {
          vec2 offset = (screenUv - vec2(0.5, 0.32)) * vec2(1.35, 1.8);
          float glow = exp(-4.0 * dot(offset, offset));
          gl_FragColor = vec4(mix(base * 0.42, horizon, glow), 1.0);
          #include <colorspace_fragment>
        }
      `,
      depthTest: false,
      depthWrite: false,
    }),
  );
  backdrop.frustumCulled = false;
  backdrop.renderOrder = -1;
  scene.add(backdrop);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 120),
    new THREE.MeshBasicMaterial({ color: palette.floor }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.05;
  scene.add(floor);

  const pedestalGeometry = new THREE.CylinderGeometry(0.72, 0.9, 0.52, 40);
  const pedestalMaterial = new THREE.MeshStandardMaterial({
    color: 0x263347,
    roughness: 0.46,
  });
  const orbGeometry = new THREE.IcosahedronGeometry(0.54, 2);
  const haloGeometry = new THREE.PlaneGeometry(2.8, 2.8);

  function addHost(x, color) {
    const pedestal = new THREE.Mesh(pedestalGeometry, pedestalMaterial);
    pedestal.position.set(x, -0.79, 0);
    scene.add(pedestal);

    const orb = new THREE.Mesh(
      orbGeometry,
      new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        roughness: 0.38,
        flatShading: true,
      }),
    );
    orb.position.set(x, 0.29, 0);
    scene.add(orb);

    const halo = new THREE.Mesh(
      haloGeometry,
      new THREE.ShaderMaterial({
        uniforms: {
          tint: { value: new THREE.Color(color) },
          intensity: { value: 0 },
        },
        vertexShader: `
          varying vec2 haloUv;
          void main() {
            haloUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 tint;
          uniform float intensity;
          varying vec2 haloUv;
          void main() {
            float falloff = max(0.0, 1.0 - 2.0 * length(haloUv - 0.5));
            gl_FragColor = vec4(tint, intensity * falloff * falloff);
            #include <colorspace_fragment>
          }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    halo.position.copy(orb.position);
    scene.add(halo);
    return { orb, halo };
  }

  const hosts = { A: addHost(-1.28, palette.a), B: addHost(1.28, palette.b) };
  const bars = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.17, 1, 0.17),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }),
    spectrumBins,
  );
  bars.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  // Bar heights change each frame, so a cached bound could clip the ring.
  bars.frustumCulled = false;
  const random = createSeededRandom(51);
  const firstColor = new THREE.Color(palette.a);
  const secondColor = new THREE.Color(palette.b);
  const barColor = new THREE.Color();
  const ring = Array.from({ length: spectrumBins }, (_, index) => {
    const angle = (2 * Math.PI * index) / spectrumBins;
    barColor.copy(firstColor).lerp(secondColor, (1 + Math.cos(angle)) / 2);
    bars.setColorAt(index, barColor.multiplyScalar(0.16 + 0.13 * random()));
    return [3.35 * Math.cos(angle), 3.35 * Math.sin(angle)];
  });
  scene.add(bars);
  const bar = new THREE.Object3D();

  function renderAt(t, { speaker, amplitude, spectrum }) {
    const { position, target } = cameraPoseAt(t);
    camera.position.set(...position);
    camera.lookAt(...target);

    for (const [id, { orb, halo }] of Object.entries(hosts)) {
      const energy =
        speaker === id ? THREE.MathUtils.clamp(amplitude, 0, 1) : 0;
      orb.scale.setScalar(1 + 0.34 * energy);
      orb.rotation.y = t * (id === "A" ? 0.32 : -0.27);
      orb.material.emissiveIntensity = 0.12 + 1.15 * energy;
      halo.quaternion.copy(camera.quaternion);
      halo.material.uniforms.intensity.value = 0.19 + 0.85 * energy;
    }

    for (const [index, [x, z]] of ring.entries()) {
      const energy = THREE.MathUtils.clamp(spectrum[index] ?? 0, 0, 1);
      const barHeight = 0.09 + 1.5 * Math.sqrt(energy);
      bar.scale.y = barHeight;
      bar.position.set(x, -1.05 + barHeight / 2, z);
      bar.updateMatrix();
      bars.setMatrixAt(index, bar.matrix);
    }
    bars.instanceMatrix.needsUpdate = true;
    renderer.render(scene, camera);
  }

  function dispose() {
    const geometries = new Set();
    const materials = new Set();
    scene.traverse((object) => {
      if (!object.isMesh) return;
      geometries.add(object.geometry);
      materials.add(object.material);
    });
    bars.dispose();
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    renderer.dispose();
  }

  return { renderAt, dispose };
}
