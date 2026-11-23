import * as THREE from "three";
import {
  WebglContextLostError,
  type VideoScene,
  type VideoSceneFrame,
} from "../types.ts";
import { audioStateAt, spectrumBins } from "./audio-state.ts";
import {
  cameraPoseAt,
  defaultStudio3dSettings,
  getPalette,
  studio3dSceneId,
  type Studio3dSettings,
} from "./presets.ts";

/** Mulberry32 with a local 32-bit seed, as in the spike. */
function createSeededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 2 ** 32;
  };
}

function buildStudio(
  renderer: THREE.WebGLRenderer,
  width: number,
  height: number,
  settings: Readonly<Studio3dSettings>,
) {
  const palette = getPalette(settings.paletteId);
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(palette.floor, 0.065);
  const aspect = width / height;
  // Keep both hosts in frame when the export is portrait.
  const fov =
    (360 / Math.PI) *
    Math.atan(Math.tan(Math.PI / 9) * Math.max(1, 1 / aspect));
  const camera = new THREE.PerspectiveCamera(fov, aspect, 0.1, 80);
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

  function addHost(x: number, color: number) {
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

  const hosts = [addHost(-1.28, palette.a), addHost(1.28, palette.b)];
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

  function renderAt({ audio, time, turn }: VideoSceneFrame) {
    const { speaker, amplitude, spectrum } = audioStateAt(audio, time, turn);
    const { position, target } = cameraPoseAt(settings.cameraPresetId, time);
    camera.position.set(...position);
    camera.lookAt(...target);

    for (const [index, { orb, halo }] of hosts.entries()) {
      const energy =
        speaker === (index === 0 ? "A" : "B")
          ? amplitude * settings.intensity
          : 0;
      orb.scale.setScalar(1 + 0.34 * energy);
      orb.rotation.y = time * (index === 0 ? 0.32 : -0.27);
      orb.material.emissiveIntensity = 0.12 + 1.15 * energy;
      halo.quaternion.copy(camera.quaternion);
      halo.material.uniforms.intensity.value = 0.19 + 0.85 * energy;
    }

    for (const [index, [x, z]] of ring.entries()) {
      const energy = spectrum[index] * settings.intensity;
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
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      geometries.add(object.geometry);
      for (const material of [object.material].flat()) materials.add(material);
    });
    bars.dispose();
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
  }

  return { renderAt, dispose };
}

export function createStudio3dScene(
  settings: Readonly<Studio3dSettings> = defaultStudio3dSettings,
): VideoScene {
  let renderer: THREE.WebGLRenderer | undefined;
  let studio: ReturnType<typeof buildStudio> | undefined;
  let gl: WebGL2RenderingContext | null = null;
  let releaseContext: WEBGL_lose_context | null = null;
  let removeListener: (() => void) | undefined;

  return {
    id: studio3dSceneId,
    kind: "webgl",
    init({ canvas, plan, signal, fail }) {
      signal.throwIfAborted();
      try {
        gl = canvas.getContext("webgl2", { antialias: true, alpha: false });
        if (!gl || gl.isContextLost()) return "webgl-unavailable";
        releaseContext = gl.getExtension("WEBGL_lose_context");
        renderer = new THREE.WebGLRenderer({ canvas, context: gl });
      } catch {
        return "webgl-unavailable";
      }
      const contextLost = () => fail(new WebglContextLostError());
      canvas.addEventListener("webglcontextlost", contextLost);
      removeListener = () =>
        canvas.removeEventListener("webglcontextlost", contextLost);
      const { width, height } = plan.resolution;
      renderer.setPixelRatio(1);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.setSize(width, height, false);
      studio = buildStudio(renderer, width, height, settings);
      if (gl.isContextLost()) contextLost();
    },
    draw(frame) {
      if (gl?.isContextLost()) throw new WebglContextLostError();
      studio?.renderAt(frame);
      if (gl?.isContextLost()) throw new WebglContextLostError();
    },
    dispose() {
      removeListener?.();
      studio?.dispose();
      // Also releases the renderer's internal textures.
      renderer?.dispose();
      if (gl && !gl.isContextLost()) releaseContext?.loseContext();
    },
  };
}
