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
import { bakeBackdrop } from "./backdrop.ts";
import {
  foregroundSpectrumScale,
  groundRingOpacityAt,
  groundRingWidthH,
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
        float alpha = 1.0 - smoothstep(0.0, 1.0, radius);
        gl_FragColor = vec4(tint, alpha * strength);
      }
    `,
    transparent: true,
    depthWrite: false,
  });
}

function contactMaterial(
  color: THREE.Color,
  pedestalRadius: number,
  ringRadius: number,
  extent: number,
  frameHeight: number,
) {
  return new THREE.ShaderMaterial({
    uniforms: {
      tint: { value: color.clone().convertLinearToSRGB() },
      shadowScale: { value: new THREE.Vector2(
        extent / (1.40 * pedestalRadius), extent / (1.32 * pedestalRadius),
      ) },
      ringRadius: { value: ringRadius / extent },
      ringOpacity: { value: 0 },
      halfWidthPx: { value: (groundRingWidthH * frameHeight) / 2 },
    },
    vertexShader: stagePlaneVertexShader,
    fragmentShader: `
      uniform vec3 tint;
      uniform vec2 shadowScale;
      uniform float ringRadius;
      uniform float ringOpacity;
      uniform float halfWidthPx;
      varying vec2 planeUv;
      void main() {
        vec2 point = planeUv * 2.0 - 1.0;
        float shadow = 0.28 * (1.0 - smoothstep(0.0, 1.0, length(point * shadowScale)));
        float ring = 0.0;
        if (ringOpacity > 0.0) {
          // Convert the annulus distance to pixels for a crisp, antialiased
          // stroke of consistent width on the foreshortened floor.
          float radius = length(point);
          float slope = length(vec2(dFdx(radius), dFdy(radius)));
          float distancePx = abs(radius - ringRadius) / max(slope, 0.00001);
          float coverage = clamp(halfWidthPx + 0.5 - distancePx, 0.0, min(1.0, 2.0 * halfWidthPx));
          ring = ringOpacity * coverage;
        }
        // Composite the accent over the black contact shadow in one pass.
        gl_FragColor = vec4(tint * ring, ring + shadow * (1.0 - ring));
      }
    `,
    transparent: true,
    premultipliedAlpha: true,
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

const rimFlareGain = 0.12;

function orbMaterial(color: THREE.Color, faceted: boolean, keyPosition: THREE.Vector3) {
  const material = new THREE.MeshStandardMaterial({
    color: color.clone().multiplyScalar(0.47),
    emissive: color,
    emissiveIntensity: 0.047,
    roughness: faceted ? 0.72 : 0.50,
    flatShading: faceted,
    fog: false,
  });
  const rim = { value: 0 };
  const idleRim = color.clone().multiplyScalar(0.58 * 0.8);
  const activeRim = color.clone().lerp(new THREE.Color(1, 1, 1), 0.38);
  // Leave room for the full flare in highlight channels near white.
  const peak = Math.max(activeRim.r, activeRim.g, activeRim.b);
  activeRim.multiplyScalar(1 / Math.max(1, peak * (1 + rimFlareGain)));
  material.onBeforeCompile = (shader) => {
    shader.uniforms.studioRimEmphasis = rim;
    shader.uniforms.studioIdleRim = { value: idleRim };
    shader.uniforms.studioActiveRim = { value: activeRim };
    shader.uniforms.studioKeyPosition = { value: keyPosition };
    // Use the radial normal for rim placement so B keeps its shaded facets
    // and still has a continuous silhouette accent.
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `
        #include <common>
        uniform vec3 studioKeyPosition;
        varying vec3 studioRadial;
        varying vec2 studioLitSide;
      `)
      .replace("#include <begin_vertex>", `
        #include <begin_vertex>
        studioRadial = normalMatrix * normalize(position);
        studioLitSide = normalize((mat3(viewMatrix) * studioKeyPosition).xy);
      `);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `
        #include <common>
        varying vec3 studioRadial;
        varying vec2 studioLitSide;
        uniform float studioRimEmphasis;
        uniform vec3 studioIdleRim;
        uniform vec3 studioActiveRim;
      `)
      .replace("#include <opaque_fragment>", `
        vec3 radial = normalize(studioRadial);
        float facing = max(0.0, dot(radial, normalize(vViewPosition)));
        float rimMask = smoothstep(0.45, 0.72, 1.0 - facing);
        float litArc = smoothstep(0.88, 0.98, dot(radial.xy, studioLitSide));
        vec3 activeRim = studioActiveRim * (1.0 + ${rimFlareGain} * litArc);
        vec3 rimColor = mix(studioIdleRim, activeRim, studioRimEmphasis);
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

  const { backdrop, pixels: backdropPixels } = bakeBackdrop(
    renderer, width, height, orientation, palette,
  );
  scene.add(backdrop);
  // The opaque backdrop covers the color buffer before the stage draws.
  renderer.autoClearColor = false;

  const plane = radialPlaneGeometry();
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
  const { pedestalRadius, pedestalHeight, groundRingRadius } = layout;
  const contactExtent = pedestalRadius * (orientation === "portrait" ? 1.80 : 1.42);
  function addHost(x: number, color: THREE.Color, faceted: boolean) {
    const contact = new THREE.Mesh(
      plane,
      contactMaterial(color, pedestalRadius, groundRingRadius, contactExtent, height),
    );
    contact.rotation.x = -Math.PI / 2;
    contact.position.set(x, floorY + 0.001, 0);
    contact.scale.set(contactExtent, contactExtent, 1);
    contact.renderOrder = 2;
    scene.add(contact);

    const pedestal = new THREE.Mesh(
      pedestalGeometry(pedestalRadius, pedestalHeight, color),
      pedestalMaterial,
    );
    pedestal.position.set(x, floorY, 0);
    scene.add(pedestal);

    const { material, rim } = orbMaterial(color, faceted, key.position);
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
    return { orb, halo, rim, bandMaterial, contact };
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

    for (const [host, { orb, halo, rim, bandMaterial, contact }] of hosts.entries()) {
      const energy = (envelopes[offset + host] ?? 0) * motion.audio;
      const emphasis = envelopes[offset + speakerEmphasisOffset + host] ?? 0;
      orb.scale.setScalar(orbScaleAt(energy, emphasis, settings.reducedMotion));
      orb.material.emissiveIntensity = 0.047 + 0.052 * emphasis;
      rim.value = emphasis;
      contact.material.uniforms.ringOpacity.value = groundRingOpacityAt(emphasis);
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
    backdropPixels.dispose();
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
