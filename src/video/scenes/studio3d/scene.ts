import * as THREE from "three";
import {
  WebglContextLostError,
  type VideoSceneEnvironment,
} from "../types.ts";
import type { WindowedVideoScene } from "../../pcm.ts";
import {
  prepareAudioEnvelopes,
  speakerEmphasisOffset,
  spectrumBins,
} from "./audio-state.ts";
import { bakeBackdrop } from "./backdrop.ts";
import {
  haloOpacityAt,
  orbScaleAt,
  prepareForegroundSpectrum,
  spectrumBarHeight,
  studioLayout,
  studioParticles,
} from "./layout.ts";
import { orbMaterial } from "./orb.ts";
import {
  contactShadowExtent,
  contactShadowTexture,
  pedestalGeometry,
  pedestalMaterial,
} from "./pedestal.ts";
import {
  cameraFov,
  cameraPoseAt,
  defaultStudio3dMood,
  getPalette,
  motionMultipliers,
  resolveStudio3dOptions,
  studio3dSceneId,
  type Studio3dOptions,
  type Studio3dSettings,
} from "./presets.ts";

const stagePlaneVertexShader = `
  varying vec2 planeUv;
  void main() {
    planeUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

function radialPlaneGeometry() {
  // Trim the corners outside the unit disc without clipping its falloff.
  const corner = Math.SQRT2 - 1;
  const points = [
    [-corner, -1], [corner, -1], [1, -corner], [1, corner],
    [corner, 1], [-corner, 1], [-1, corner], [-1, -corner],
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(
    points.flatMap(([x, y]) => [x, y, 0]), 3,
  ));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(
    points.flatMap(([x, y]) => [0.5 + x / 2, 0.5 + y / 2]), 2,
  ));
  geometry.setIndex([0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 5, 0, 5, 6, 0, 6, 7]);
  return geometry;
}

function radialMaterial(color: THREE.Color, opacity: number) {
  return new THREE.ShaderMaterial({
    uniforms: {
      tint: { value: color.clone().convertLinearToSRGB() },
      strength: { value: opacity },
    },
    vertexShader: stagePlaneVertexShader,
    fragmentShader: `
      uniform vec3 tint;
      uniform float strength;
      varying vec2 planeUv;
      void main() {
        float radius = length(planeUv * 2.0 - 1.0);
        float alpha = 1.0 - smoothstep(0.45, 1.0, radius);
        gl_FragColor = vec4(tint, alpha * strength);
      }
    `,
    transparent: true,
    depthWrite: false,
  });
}

function spectrumMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: `
      attribute float barOpacity;
      varying vec4 spectrumColor;
      void main() {
        spectrumColor = vec4(instanceColor, barOpacity);
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec4 spectrumColor;
      void main() {
        gl_FragColor = spectrumColor;
      }
    `,
    transparent: true,
    depthWrite: false,
  });
}

function buildStudio(
  renderer: THREE.WebGLRenderer,
  width: number,
  height: number,
  settings: Readonly<Studio3dSettings>,
) {
  const palette = getPalette(settings.paletteId);
  const [hostA, hostB] = [
    new THREE.Color(palette.hostA),
    new THREE.Color(palette.hostB),
  ];
  const layout = studioLayout(width, height);
  const { aspect, orientation, centerX, centerY, floorY, hostX, orbRadius } =
    layout;
  const mood = settings.moodId ?? defaultStudio3dMood;
  const motion = motionMultipliers(mood, settings.intensity);
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(palette.stops[2], 0.045);
  const camera = new THREE.PerspectiveCamera(cameraFov, aspect, 0.1, 80);
  camera.setViewOffset(
    width,
    height,
    (0.5 - centerX) * width,
    (0.5 - centerY) * height,
    width,
    height,
  );

  const { backdrop, pixels: backdropPixels } = bakeBackdrop(
    renderer, width, height, layout, palette,
  );
  scene.add(backdrop);
  // The opaque backdrop covers the color buffer before the stage draws.
  renderer.autoClearColor = false;

  const plane = radialPlaneGeometry();
  const shadowTexture = contactShadowTexture();
  const shadowMaterial = new THREE.MeshBasicMaterial({
    color: "#000000",
    map: shadowTexture,
    transparent: true,
    depthWrite: false,
    fog: false,
  });
  const { pedestalRadius, pedestalHeight, pedestalBevelStart } = layout;
  const base = pedestalGeometry(pedestalRadius, pedestalHeight, pedestalBevelStart);
  const contactExtent = pedestalRadius * contactShadowExtent;
  function addHost(x: number, color: THREE.Color, otherHostColor: THREE.Color, faceted: boolean) {
    const contact = new THREE.Mesh(plane, shadowMaterial);
    contact.rotation.x = -Math.PI / 2;
    contact.position.set(x, floorY + 0.001, 0);
    contact.scale.set(contactExtent, contactExtent, 1);
    contact.renderOrder = 2;
    scene.add(contact);

    const pedestal = new THREE.Mesh(base, pedestalMaterial(color));
    pedestal.position.set(x, floorY, 0);
    scene.add(pedestal);

    const orbGeometry = faceted
      ? new THREE.IcosahedronGeometry(orbRadius, 2)
      : new THREE.SphereGeometry(orbRadius, 36, 24);
    if (faceted) orbGeometry.computeVertexNormals();
    const { material, setEmphasis } = orbMaterial(color, otherHostColor);
    const orb = new THREE.Mesh(orbGeometry, material);
    orb.position.set(x, 0, 0);
    const bandMaterial = new THREE.MeshBasicMaterial({ color, fog: false });
    for (const offset of faceted ? [-0.25, 0.25] : [0]) {
      const band = new THREE.Mesh(
        new THREE.TorusGeometry(
          orbRadius * (Math.sqrt(1 - offset ** 2) + 0.004),
          orbRadius * 0.023,
          6,
          faceted ? 30 : 52,
        ),
        bandMaterial,
      );
      band.position.y = orbRadius * offset;
      band.rotation.x = Math.PI / 2;
      orb.add(band);
    }
    scene.add(orb);

    const halo = new THREE.Mesh(
      plane,
      radialMaterial(color, haloOpacityAt(0)),
    );
    halo.scale.setScalar(orbRadius * 1.36);
    halo.renderOrder = 3;
    scene.add(halo);
    return { color, orb, halo, bandMaterial, pedestal, setEmphasis };
  }
  const hosts = [addHost(-hostX, hostA, hostB, false), addHost(hostX, hostB, hostA, true)];

  const points = new THREE.BufferGeometry();
  points.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(studioParticles(layout, 51).flat(), 3),
  );
  scene.add(
    new THREE.Points(
      points,
      new THREE.PointsMaterial({
        color: palette.secondaryInk,
        opacity: 0.1,
        transparent: true,
        depthWrite: false,
        size: Math.max(1, height * 0.0013),
        sizeAttenuation: false,
      }),
    ),
  );

  const bars = new THREE.InstancedMesh(
    new THREE.BoxGeometry(layout.barWidth, 1, layout.barWidth),
    spectrumMaterial(),
    spectrumBins,
  );
  bars.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  bars.frustumCulled = false;
  bars.renderOrder = 1;
  const barOpacity = new Float32Array(spectrumBins);
  const barColor = new THREE.Color();
  for (const [index, { bias, near }] of layout.ring.entries()) {
    barOpacity[index] = near ? 0.10 : 0.34;
    bars.setColorAt(
      index,
      barColor.copy(hostA).lerp(hostB, bias).convertLinearToSRGB(),
    );
  }
  bars.geometry.setAttribute("barOpacity", new THREE.InstancedBufferAttribute(barOpacity, 1));
  scene.add(bars);

  const bar = new THREE.Object3D();
  const pose = cameraPoseAt("static", 0);
  const foreground = prepareForegroundSpectrum(layout, pose);
  const fixedCamera = settings.cameraPresetId === "static" || settings.reducedMotion;
  const haloDepth = orbRadius * 0.3;
  function applyPose() {
    camera.position.set(pose.position[0], pose.position[1], pose.position[2]);
    camera.lookAt(0, 0, 0);
    for (let host = 0; host < hosts.length; host++) {
      const { orb, halo } = hosts[host];
      halo.quaternion.copy(camera.quaternion);
      halo.position.set(
        orb.position.x - pose.back[0] * haloDepth,
        -pose.back[1] * haloDepth,
        -pose.back[2] * haloDepth,
      );
    }
    foreground.update();
  }
  if (fixedCamera) applyPose();
  function renderAt(envelope: Float32Array, sceneTime: number) {
    if (!fixedCamera) {
      cameraPoseAt(settings.cameraPresetId, sceneTime, mood, orientation, false, pose);
      applyPose();
    }

    for (let host = 0; host < hosts.length; host++) {
      const { color, orb, halo, bandMaterial, pedestal, setEmphasis } = hosts[host];
      const energy = (envelope[host] ?? 0) * motion.audio;
      const emphasis = envelope[speakerEmphasisOffset + host] ?? 0;
      orb.scale.setScalar(orbScaleAt(energy, emphasis, settings.reducedMotion));
      setEmphasis(emphasis);
      pedestal.material.uniforms.emphasis.value = emphasis;
      bandMaterial.color
        .copy(color)
        .multiplyScalar(0.57 + 0.30 * emphasis);
      halo.material.uniforms.strength.value = haloOpacityAt(emphasis);
    }

    for (let bin = 0; bin < layout.ring.length; bin++) {
      const block = layout.ring[bin];
      const energy = (envelope[2 + bin] ?? 0) * motion.audio;
      // Keep the rear ticks as a continuous rail. The near arc appears only
      // when there is enough energy to read as a bar above the floor.
      const activity = block.near ? Math.max(0, (energy - 0.12) / 0.88) : 1;
      const maximum = activity > 0 ? spectrumBarHeight(pose, block, energy) : 0;
      const scale = activity > 0 ? activity * foreground.scale(block, maximum) : 0;
      const height = maximum * scale;
      bar.scale.set(scale, height, scale);
      bar.position.set(block.x, block.baseY + height / 2, block.z);
      bar.updateMatrix();
      bars.setMatrixAt(bin, bar.matrix);
    }
    bars.instanceMatrix.needsUpdate = true;
    renderer.render(scene, camera);
  }

  function dispose() {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh || object instanceof THREE.Points))
        return;
      geometries.add(object.geometry);
      for (const material of [object.material].flat()) materials.add(material);
    });
    bars.dispose();
    backdropPixels.dispose();
    shadowTexture.dispose();
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
  }

  return { renderAt, dispose };
}

// Per-chapter looks use the same PCM and clock as the rest of the episode.
const envelopesByPlan = new WeakMap<
  VideoSceneEnvironment["plan"],
  WeakMap<VideoSceneEnvironment["audio"], ReturnType<typeof prepareAudioEnvelopes>>
>();

function audioEnvelopes({ plan, audio }: VideoSceneEnvironment) {
  let byAudio = envelopesByPlan.get(plan);
  if (!byAudio) {
    byAudio = new WeakMap();
    envelopesByPlan.set(plan, byAudio);
  }
  const saved = byAudio.get(audio);
  if (saved) return saved;
  const envelopes = prepareAudioEnvelopes(audio, plan);
  byAudio.set(audio, envelopes);
  return envelopes;
}

export function createStudio3dScene(options?: Studio3dOptions): WindowedVideoScene & {
  getRenderStats(): { calls: number; triangles: number } | undefined;
} {
  const { settings } = resolveStudio3dOptions(options);
  let renderer: THREE.WebGLRenderer | undefined;
  let studio: ReturnType<typeof buildStudio> | undefined;
  let envelopes: ReturnType<typeof audioEnvelopes> | undefined;
  let gl: WebGL2RenderingContext | null = null;
  let releaseContext: WEBGL_lose_context | null = null;
  let removeListener: (() => void) | undefined;

  return {
    id: studio3dSceneId,
    kind: "webgl",
    async init(env: VideoSceneEnvironment) {
      const { canvas, plan, signal, fail } = env;
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
      envelopes = audioEnvelopes(env);
      signal.throwIfAborted();
      if (gl.isContextLost()) {
        contextLost();
        return;
      }
      studio = buildStudio(renderer, width, height, settings);
    },
    prepareFrame(index, signal) {
      return envelopes?.prepareFrame(index, signal);
    },
    draw({ index, plan, sceneTime }) {
      if (gl?.isContextLost()) throw new WebglContextLostError();
      if (envelopes)
        studio?.renderAt(envelopes.frame(index), sceneTime ?? index / plan.fps);
      if (gl?.isContextLost()) throw new WebglContextLostError();
    },
    getRenderStats() {
      if (!renderer) return;
      const { calls, triangles } = renderer.info.render;
      return { calls, triangles };
    },
    dispose() {
      removeListener?.();
      studio?.dispose();
      renderer?.dispose();
      if (gl && !gl.isContextLost()) releaseContext?.loseContext();
      removeListener = studio = renderer = undefined;
      envelopes = undefined;
      releaseContext = gl = null;
    },
  };
}
