import * as THREE from "three";
import {
  WebglContextLostError,
  type VideoScene,
  type VideoSceneEnvironment,
} from "../types.ts";
import {
  envelopeStride,
  prepareAudioEnvelopes,
  spectrumBins,
} from "./audio-state.ts";
import {
  haloOpacityAt,
  orbScaleAt,
  spectrumBarHeight,
  studioLayout,
  studioParticles,
} from "./layout.ts";
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

function radialGeometry() {
  const geometry = new THREE.RingGeometry(0, 1, 40, 12);
  const positions = geometry.getAttribute("position");
  const colors = new Float32Array(positions.count * 4).fill(1);
  for (let index = 0; index < positions.count; index++) {
    const radius = Math.min(
      1,
      Math.hypot(positions.getX(index), positions.getY(index)),
    );
    colors[index * 4 + 3] = 1 - radius ** 2 * (3 - 2 * radius);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 4));
  return geometry;
}

function pedestalGeometry(radius: number, height: number, accent: THREE.Color) {
  const body = new THREE.Color("#253247");
  const rim = new THREE.Color("#53617D");
  const pinstripe = rim.clone().lerp(accent, 0.62);
  // Each contour point supplies the colour of one horizontal strip.
  const profile = [
    { radius: 0, height: 0, color: body },
    { radius: 0.9, height: 0, color: body },
    { radius: 1, height: 0.13, color: body },
    { radius: 0.89, height: 0.75, color: body },
    { radius: 0.88, height: 0.78, color: rim },
    { radius: 0.87, height: 0.87, color: rim },
    { radius: 0.86, height: 0.89, color: pinstripe },
    { radius: 0.85, height: 0.92, color: pinstripe },
    { radius: 0.79, height: 1, color: rim },
    { radius: 0, height: 1, color: body },
  ];
  const geometry = new THREE.LatheGeometry(
    profile.map(
      (point) =>
        new THREE.Vector2(point.radius * radius, point.height * height),
    ),
    40,
  );
  const positions = geometry.getAttribute("position");
  const colors = new Float32Array(positions.count * 3);
  for (let index = 0; index < positions.count; index++)
    profile[index % profile.length].color.toArray(colors, index * 3);
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geometry;
}

function buildStudio(
  renderer: THREE.WebGLRenderer,
  width: number,
  height: number,
  fps: number,
  envelopes: Float32Array,
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
  scene.add(new THREE.HemisphereLight("#C4CDDE", "#253247", 1.15));
  const key = new THREE.DirectionalLight("#F5F7FC", 1.75);
  key.position.set(-3, 5, 6);
  scene.add(key);

  const backdrop = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      uniforms: {
        inner: { value: new THREE.Color(palette.stops[0]) },
        middle: { value: new THREE.Color(palette.stops[1]) },
        outer: { value: new THREE.Color(palette.stops[2]) },
        center: { value: new THREE.Vector2(centerX, 1 - centerY) },
      },
      vertexShader: `
        varying vec2 screenUv;
        void main() {
          screenUv = uv;
          gl_Position = vec4(position.xy, 0.999, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 inner;
        uniform vec3 middle;
        uniform vec3 outer;
        uniform vec2 center;
        varying vec2 screenUv;
        void main() {
          float radius = length((screenUv - center) * vec2(1.4, 1.02));
          vec3 tint = radius < 0.55
            ? mix(inner, middle, radius / 0.55)
            : mix(middle, outer, clamp((radius - 0.55) / 0.45, 0.0, 1.0));
          gl_FragColor = vec4(tint, 1.0);
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

  const radial = radialGeometry();
  const radialMaterial = (color: THREE.ColorRepresentation, opacity: number) =>
    new THREE.MeshBasicMaterial({
      color,
      opacity,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      fog: false,
    });
  const shadowMaterial = radialMaterial("#000000", 0.28);
  const wash = new THREE.Mesh(
    radial,
    radialMaterial(hostA.clone().lerp(hostB, 0.5), 0.06),
  );
  wash.rotation.x = -Math.PI / 2;
  wash.position.set(0, floorY, 0);
  wash.scale.set(layout.ringWidth * 1.03, layout.ringDepth * 1.32, 1);
  wash.renderOrder = 1;
  scene.add(wash);

  const pedestalMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.96,
  });
  const { pedestalRadius, pedestalHeight } = layout;
  function addHost(x: number, color: THREE.Color, faceted: boolean) {
    const shadow = new THREE.Mesh(radial, shadowMaterial);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(x, floorY + 0.001, 0);
    shadow.scale.set(pedestalRadius * 1.7, pedestalRadius * 1.56, 1);
    shadow.renderOrder = 2;
    scene.add(shadow);

    const pedestal = new THREE.Mesh(
      pedestalGeometry(pedestalRadius, pedestalHeight, color),
      pedestalMaterial,
    );
    pedestal.position.set(x, floorY, 0);
    scene.add(pedestal);

    const orb = new THREE.Mesh(
      faceted
        ? new THREE.IcosahedronGeometry(orbRadius, 2)
        : new THREE.SphereGeometry(orbRadius, 36, 24),
      new THREE.MeshStandardMaterial({
        color: color.clone().multiplyScalar(0.38),
        emissive: color,
        emissiveIntensity: 0.055,
        roughness: 0.86,
        flatShading: faceted,
      }),
    );
    orb.position.set(x, 0, 0);
    const bandMaterial = new THREE.MeshBasicMaterial({ color, fog: true });
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
      radial,
      radialMaterial(color, haloOpacityAt(0)),
    );
    halo.scale.setScalar(orbRadius * 1.48);
    halo.renderOrder = 3;
    scene.add(halo);
    return { orb, halo };
  }
  const hosts = [addHost(-hostX, hostA, false), addHost(hostX, hostB, true)];

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
    new THREE.MeshBasicMaterial({ color: "#ffffff" }),
    spectrumBins,
  );
  bars.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  bars.frustumCulled = false;
  const barColor = new THREE.Color();
  for (const [index, { bias, z }] of layout.ring.entries()) {
    const tint = 0.34 - 0.13 * Math.max(0, z / layout.ringDepth);
    bars.setColorAt(
      index,
      barColor.copy(hostA).lerp(hostB, bias).multiplyScalar(tint),
    );
  }
  scene.add(bars);

  const bar = new THREE.Object3D();
  function renderAt(index: number) {
    const offset = index * envelopeStride;
    const pose = cameraPoseAt(
      settings.cameraPresetId,
      index / fps,
      mood,
      orientation,
      settings.reducedMotion,
    );
    camera.position.set(...pose.position);
    camera.lookAt(...pose.target);

    for (const [host, { orb, halo }] of hosts.entries()) {
      const energy = (envelopes[offset + host] ?? 0) * motion.audio;
      orb.scale.setScalar(orbScaleAt(energy));
      halo.quaternion.copy(camera.quaternion);
      halo.position.set(
        orb.position.x - pose.back[0] * orbRadius * 0.3,
        -pose.back[1] * orbRadius * 0.3,
        -pose.back[2] * orbRadius * 0.3,
      );
      halo.material.opacity = haloOpacityAt(energy, settings.reducedMotion);
    }

    for (const [bin, block] of layout.ring.entries()) {
      const energy = (envelopes[offset + 2 + bin] ?? 0) * motion.audio;
      const height = spectrumBarHeight(pose, block, energy);
      bar.scale.y = height;
      bar.position.set(block.x, floorY + height / 2, block.z);
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
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
  }

  return { renderAt, dispose };
}

export function createStudio3dScene(options?: Studio3dOptions): VideoScene & {
  getRenderStats(): { calls: number; triangles: number } | undefined;
} {
  const { settings } = resolveStudio3dOptions(options);
  let renderer: THREE.WebGLRenderer | undefined;
  let studio: ReturnType<typeof buildStudio> | undefined;
  let gl: WebGL2RenderingContext | null = null;
  let releaseContext: WEBGL_lose_context | null = null;
  let removeListener: (() => void) | undefined;

  return {
    id: studio3dSceneId,
    kind: "webgl",
    async init({ canvas, plan, audio, signal, fail }: VideoSceneEnvironment) {
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
      const precompute = prepareAudioEnvelopes(audio, plan);
      let result = precompute.next();
      while (!result.done) {
        await new Promise<void>((resume) => setTimeout(resume, 0));
        signal.throwIfAborted();
        result = precompute.next();
      }
      if (gl.isContextLost()) {
        contextLost();
        return;
      }
      studio = buildStudio(
        renderer,
        width,
        height,
        plan.fps,
        result.value,
        settings,
      );
    },
    draw({ index }) {
      if (gl?.isContextLost()) throw new WebglContextLostError();
      studio?.renderAt(index);
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
      releaseContext = gl = null;
    },
  };
}
