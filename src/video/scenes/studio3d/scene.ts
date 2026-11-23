import * as THREE from "three";
import {
  WebglContextLostError,
  type VideoScene,
  type VideoSceneEnvironment,
} from "../types.ts";
import {
  envelopeStride,
  prepareAudioEnvelopes,
  speakerEmphasisOffset,
  spectrumBins,
} from "./audio-state.ts";
import {
  foregroundSpectrumScale,
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

function radialMaterial(color: THREE.ColorRepresentation, opacity: number) {
  return new THREE.ShaderMaterial({
    uniforms: {
      tint: { value: new THREE.Color(color) },
      strength: { value: opacity },
    },
    vertexShader: `
      varying vec2 planeUv;
      void main() {
        planeUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 tint;
      uniform float strength;
      varying vec2 planeUv;
      void main() {
        float radius = length(planeUv * 2.0 - 1.0);
        float alpha = 1.0 - smoothstep(0.0, 1.0, radius);
        gl_FragColor = vec4(tint, alpha * strength);
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
  });
}

function pedestalGeometry(radius: number, height: number, accent: THREE.Color) {
  const body = new THREE.Color("#253247");
  const rim = new THREE.Color("#53617D");
  const pinstripe = rim.clone().lerp(accent, 0.38);
  // Each contour point supplies the colour of one horizontal strip.
  const profile = [
    { radius: 0, height: 0, color: body },
    { radius: 0.9, height: 0, color: body },
    { radius: 1, height: 0.13, color: body },
    { radius: 0.89, height: 0.70, color: body },
    { radius: 0.88, height: 0.74, color: rim },
    { radius: 0.87, height: 0.83, color: rim },
    { radius: 0.86, height: 0.86, color: pinstripe },
    { radius: 0.81, height: 1, color: rim },
    { radius: 0.69, height: 1, color: rim },
    { radius: 0.67, height: 1, color: body },
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
  const shaded = new THREE.Color();
  for (let index = 0; index < positions.count; index++) {
    const color = profile[index % profile.length].color;
    const azimuth = Math.floor(index / profile.length) / 40 * 2 * Math.PI;
    const light = 1 + 0.14 * Math.cos(azimuth + 0.8);
    shaded.copy(color).multiplyScalar(light).toArray(colors, index * 3);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geometry;
}

function orbMaterial(color: THREE.Color, faceted: boolean) {
  const material = new THREE.MeshStandardMaterial({
    color: color.clone().multiplyScalar(0.47),
    emissive: color,
    emissiveIntensity: 0.047,
    roughness: faceted ? 0.72 : 0.50,
    flatShading: faceted,
    fog: false,
  });
  const rim = { value: 0 };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.studioRimEmphasis = rim;
    shader.uniforms.studioRimAccent = { value: color };
    // Use the radial normal for rim placement so B keeps its shaded facets
    // and still has a continuous silhouette accent.
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `
        #include <common>
        varying vec3 studioRadial;
      `)
      .replace("#include <begin_vertex>", `
        #include <begin_vertex>
        studioRadial = normalMatrix * normalize(position);
      `);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `
        #include <common>
        varying vec3 studioRadial;
        uniform float studioRimEmphasis;
        uniform vec3 studioRimAccent;
      `)
      .replace("#include <opaque_fragment>", `
        float facing = max(0.0, dot(normalize(studioRadial), normalize(vViewPosition)));
        float rimMask = smoothstep(0.45, 0.72, 1.0 - facing);
        vec3 idleRim = 0.58 * studioRimAccent;
        vec3 activeRim = mix(studioRimAccent, vec3(1.0), 0.38);
        vec3 rimColor = mix(idleRim, activeRim, studioRimEmphasis);
        outgoingLight = mix(outgoingLight, rimColor, rimMask);
        #include <opaque_fragment>
      `);
  };
  return { material, rim };
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
  const key = new THREE.DirectionalLight("#F5F7FC", 1.55);
  key.position.set(-3, 5, 6);
  scene.add(key);
  const backlight = new THREE.DirectionalLight("#C4CDDE", 0.65);
  backlight.position.set(2, 3, -5);
  scene.add(backlight);

  const plane = new THREE.PlaneGeometry(2, 2);
  const backdrop = new THREE.Mesh(
    plane,
    new THREE.ShaderMaterial({
      uniforms: {
        stageWash: { value: new THREE.Color(palette.hostA) },
        portrait: { value: orientation === "portrait" ? 1 : 0 },
        top: { value: new THREE.Color(palette.stops[0]) },
        middle: { value: new THREE.Color(palette.stops[1]) },
        bottom: { value: new THREE.Color(palette.stops[2]) },
      },
      vertexShader: `
        varying vec2 screenUv;
        void main() {
          screenUv = uv;
          gl_Position = vec4(position.xy, 0.999, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 stageWash;
        uniform float portrait;
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
          float wash = smoothstep(0.35, 0.44, y) * (1.0 - smoothstep(0.44, 0.52, y));
          wash *= 1.0 - smoothstep(0.08, 0.36, abs(screenUv.x - 0.43));
          gl_FragColor = vec4(mix(tint, stageWash, portrait * 0.035 * wash), 1.0);
          #include <colorspace_fragment>
          // Repeat a 4px Bayer matrix at fixed screen coordinates. Apply the
          // bias in sRGB so it spans one 8-bit quantization interval.
          vec2 pixel = floor(gl_FragCoord.xy);
          float rank = 4.0 * bayer2(mod(pixel, 2.0)) + bayer2(mod(floor(pixel * 0.5), 2.0));
          gl_FragColor.rgb += ((rank + 0.5) / 16.0 - 0.5) / 255.0;
        }
      `,
      depthTest: false,
      depthWrite: false,
    }),
  );
  backdrop.frustumCulled = false;
  backdrop.renderOrder = -1;
  scene.add(backdrop);

  const shadowMaterial = radialMaterial("#000000", 0.28);
  const wash = new THREE.Mesh(
    plane,
    radialMaterial(hostA.clone().lerp(hostB, 0.5), 0.06),
  );
  wash.rotation.x = -Math.PI / 2;
  wash.position.set(0, floorY, 0);
  wash.scale.set(layout.ringWidth * 1.03, layout.ringDepth * 1.32, 1);
  wash.renderOrder = 1;
  scene.add(wash);

  // Bake the shallow side shading into the geometry so the palette's slate
  // body and rim stay legible outside the scene's key light.
  const pedestalMaterial = new THREE.MeshBasicMaterial({
    vertexColors: true,
    fog: false,
  });
  const { pedestalRadius, pedestalHeight } = layout;
  function addHost(x: number, color: THREE.Color, faceted: boolean) {
    const shadow = new THREE.Mesh(plane, shadowMaterial);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(x, floorY + 0.001, 0);
    shadow.scale.set(pedestalRadius * 1.40, pedestalRadius * 1.32, 1);
    shadow.renderOrder = 2;
    scene.add(shadow);

    const pedestal = new THREE.Mesh(
      pedestalGeometry(pedestalRadius, pedestalHeight, color),
      pedestalMaterial,
    );
    pedestal.position.set(x, floorY, 0);
    scene.add(pedestal);

    const { material, rim } = orbMaterial(color, faceted);
    const orb = new THREE.Mesh(
      faceted
        ? new THREE.IcosahedronGeometry(orbRadius, 2)
        : new THREE.SphereGeometry(orbRadius, 36, 24),
      material,
    );
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
    return { orb, halo, rim, bandMaterial };
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
  function renderAt(index: number, sceneTime = index / fps) {
    const offset = index * envelopeStride;
    const pose = cameraPoseAt(
      settings.cameraPresetId,
      sceneTime,
      mood,
      orientation,
      settings.reducedMotion,
    );
    camera.position.set(...pose.position);
    camera.lookAt(...pose.target);

    for (const [host, { orb, halo, rim, bandMaterial }] of hosts.entries()) {
      const energy = (envelopes[offset + host] ?? 0) * motion.audio;
      const emphasis = envelopes[offset + speakerEmphasisOffset + host] ?? 0;
      orb.scale.setScalar(orbScaleAt(energy, emphasis, settings.reducedMotion));
      orb.material.emissiveIntensity = 0.047 + 0.052 * emphasis;
      rim.value = emphasis;
      bandMaterial.color
        .copy(orb.material.emissive)
        .multiplyScalar(0.57 + 0.33 * emphasis);
      halo.quaternion.copy(camera.quaternion);
      halo.position.set(
        orb.position.x - pose.back[0] * orbRadius * 0.3,
        -pose.back[1] * orbRadius * 0.3,
        -pose.back[2] * orbRadius * 0.3,
      );
      halo.material.uniforms.strength.value = haloOpacityAt(
        energy,
        settings.reducedMotion,
      );
    }

    const nearBarScale = foregroundSpectrumScale(layout, pose);
    for (const [bin, block] of layout.ring.entries()) {
      const energy = (envelopes[offset + 2 + bin] ?? 0) * motion.audio;
      const maximum = spectrumBarHeight(pose, block, energy);
      const scale = nearBarScale(block, maximum);
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
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
  }

  return { renderAt, dispose };
}

// Per-chapter looks use the same PCM and clock as the rest of the episode.
const envelopesByPlan = new WeakMap<
  VideoSceneEnvironment["plan"],
  WeakMap<VideoSceneEnvironment["audio"], Float32Array>
>();

async function audioEnvelopes({ plan, audio, signal }: VideoSceneEnvironment) {
  let byAudio = envelopesByPlan.get(plan);
  if (!byAudio) {
    byAudio = new WeakMap();
    envelopesByPlan.set(plan, byAudio);
  }
  const saved = byAudio.get(audio);
  if (saved) return saved;
  const precompute = prepareAudioEnvelopes(audio, plan);
  let result = precompute.next();
  while (!result.done) {
    await new Promise<void>((resume) => setTimeout(resume, 0));
    signal.throwIfAborted();
    result = precompute.next();
  }
  byAudio.set(audio, result.value);
  return result.value;
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
      const envelopes = await audioEnvelopes(env);
      signal.throwIfAborted();
      if (gl.isContextLost()) {
        contextLost();
        return;
      }
      studio = buildStudio(
        renderer,
        width,
        height,
        plan.fps,
        envelopes,
        settings,
      );
    },
    draw({ index, sceneTime }) {
      if (gl?.isContextLost()) throw new WebglContextLostError();
      studio?.renderAt(index, sceneTime);
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
