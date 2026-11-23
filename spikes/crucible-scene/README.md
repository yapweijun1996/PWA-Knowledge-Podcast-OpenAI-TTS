# Crucible audio-reactive studio spike (T54)

**VERIFIED by source and CPU tests.** The spike uses Crucible 0.22.0's
`createAgentScene` to compile a plain JSON recipe. The fixture copies T51's
five seconds of synthetic PCM, 30 fps clock, 480 ms peak window, 32-bin
Hann-windowed DFT, seeded ring colors, and camera drift. The recipe specifies
two emissive icosphere hosts on tapered pedestals, the spectrum ring, floor,
fog, and gradient sky. The adapter submits absolute transforms and host
emission through `updateParts`. The frame inputs are timeline time and PCM
state. The scene adapter has no animation loop. [Three.js fixture](../three-scene/README.md)

**VERIFIED by source.** Crucible uses its native bloom, sky gradient, and
distance fog in this fixture. T51 uses an additive billboard halo, a
screen-space radial gradient, and exponential-squared fog. Crucible uses
the same set layout and camera lens with its own lighting and shading.
Rendered appearance and glow strength are **UNVERIFIED**.

## Browser probe

Run from the repository root with the existing spike dependencies, Vite,
Playwright, and Chromium.

```sh
node spikes/crucible-scene/scripts/bundle.mjs && node spikes/crucible-scene/scripts/probe.mjs
node spikes/crucible-scene/scripts/probe.mjs 720p
```

**VERIFIED by source.** The probe serves the build on loopback, blocks
cross-origin requests and service workers, and uses two fresh browser
contexts. In each run it measures 150 frames at 1920 × 1080 by default,
first on the main thread and then in a module worker. Its JSON reports
Chromium and WebGL version, renderer, vendor, context attributes, setup time,
per-frame time and timing summary, and JS heap snapshots when exposed.
Setup includes renderer construction, which in Crucible links initial
shaders. Each timed frame includes a synchronous one-pixel readback.
Fixture sampling, full-frame hashing, and encoding happen outside that interval.

**VERIFIED by source.** The probe checks SHA-256 of raw RGBA frames 0, 15,
30, 60, and 120 across the two runs and across modes in each run. It exits
nonzero on a render failure or incomplete or unequal hash comparisons.
A separate pass checks `VideoFrame` and attempts to encode all 150 frames
with WebCodecs H.264 (`avc1.420028`), checking output count, timestamps, and
byte count. Codec outcomes are recorded separately. The probe stops at
encoded video chunks, before audio encoding and MP4 muxing.

**VERIFIED by source and a Node size-planner check.** Crucible passes
`getContext("webgl2")` directly to the supplied canvas. Its constructor and
`resize()` read `clientWidth` and `clientHeight`. A raw OffscreenCanvas lacks
both, so the planner receives `NaN` and throws
`Error: Render dimensions, sample count and budget must be positive finite numbers.`
The adapter supplies those dimensions at pixel ratio 1 and forwards context
and backing-buffer access to the real canvas. The harness rejects mismatched
drawing-buffer sizes and records worker errors verbatim.

| Resolution | Main thread | OffscreenCanvas worker | Pixel parity and H.264 |
| --- | --- | --- | --- |
| 1920 × 1080 | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| 1280 × 720 | UNVERIFIED | UNVERIFIED | UNVERIFIED |

**NOT_RUN.** Chromium launch was outside this task's execution scope. WebGL
timings, renderer identity, memory, visual parity, hash parity, and codec
outcomes await the browser run. Record OS, Chromium, and the reported graphics
backend with the results. Hardware GPUs, Safari, phones, and longer exports
remain **UNVERIFIED**.

## Bundle evidence

**VERIFIED by Vite 8.3.5 build.** Byte counts below use the emitted JS files.
Gzip is the sum of Node gzip sizes for those files, measured individually.
Startup counts follow static imports from each entry. Crucible counts cover
vendor chunks whose source modules come from the installed Crucible package,
including its vendored math and build helpers.

| Scope | Minified bytes | Gzip bytes |
| --- | ---: | ---: |
| Main thread startup, Crucible | 436,421 | 138,523 |
| Main thread startup, all JS | 448,850 | 144,129 |
| Worker startup, Crucible | 451,142 | 140,053 |
| Worker startup, all JS | 460,229 | 144,224 |
| Full output, unique JS files | 2,950,854 | 980,543 |

**VERIFIED by build and asset inspection.** Both graphs reported zero Three.js
modules and zero Three.js addons. The loader source contains a vendored Three.js
meshopt decoder. This build excludes it. The full output includes lazy
Crucible code for optional features such as mesh editing, physics, terrain and
vegetation, plus a kernel worker. The fixture uses primitives and does not
request those features. The upstream ~59 kB gzip figure was for a lit box.
This fixture includes the agent-scene compiler and has its own measured payload.

## Safety review

| Area | Evidence and implications |
| --- | --- |
| JSON and scripts | **VERIFIED** from `docs/agent-scene.md`, the installed validator, and the CPU test. Recipes support geometry, hierarchy, transforms, materials, camera, lights, effects, and optional motion and game rules. Validation rejects unknown keys and executable JS values. The test passes a top-level `script` field and checks that the validator rejects it. |
| Expressions and shaders | **VERIFIED** from `docs/agent-scene.md`, `docs/game-rules.md`, `docs/user-passes.md`, and the expression, user-pass and material-snippet source. The recipe format supports interpreted field expressions, material graphs, and rule expressions with bounded operators. `postPasses[].fragment` and `material.snippet.fragment` can contain GLSL that addons validate and compile. This fixture uses built-in shading. |
| URLs and assets | **VERIFIED** from `docs/agent-scene.md`, `docs/agent-look.md`, `docs/gltf.md`, and loader source. Recipes can reference GLB, image, HDRI, and LUT assets by catalog ID or supported preset. The agent-scene adapter resolves these through host-supplied data. The separate `loadGltf` addon and `<crucible-scene src>` loader can fetch URLs, and the glTF loader can resolve external resource URIs when allowed. The fixture supplies no assets or URLs. |
| Network | **VERIFIED** for static analysis and Node import/CPU recipe creation with fetch, XHR, and WebSocket trapped. The fixture's render path submits local geometry, material and camera data to WebGL. Source searches found fetch paths in optional loaders for scenes, glTF, texture sets, spume, game assets, and streaming. Browser network behavior is **UNVERIFIED** pending the loopback probe. |
| Dynamic JS execution | **VERIFIED** by scanning the installed package's `build/` and `bin/` JS/MJS files for calls to `eval(`, `new Function`, and `Function(`. The two matches were in `build/mcp/server.mjs`, a `Function("")` capability check and the Basis transcoder loader's `Function(...)` call. The browser bundle uses neither entry. This lexical check and source review leave comprehensive security behavior **UNVERIFIED**. |
| Dependencies | **VERIFIED** from package metadata, lazy loader source, the Vite build, and CPU recipe tests. `draco3d` (MCP Draco decoding), `manifold-3d` (mesh booleans), `jolt-physics` (Jolt runtime), and `@dimforge/rapier3d-compat` (Rapier physics) are optional peers. They are absent from this install and unused by the plain render path. The package also lists Three.js as an optional peer and `playwright-core` as a dependency for browser tooling. The fixture bundle uses neither. WebGL runtime behavior with this dependency set is **UNVERIFIED**. |
| Licences | **VERIFIED** from installed notices. Crucible (CodePawl), bundled gl-matrix, and the installed Three.js peer are MIT. Playwright Core is Apache-2.0 and stays outside this browser build. The bundle script copies Crucible's `LICENSE` and `THIRD-PARTY-NOTICES.md` to `dist/` for redistribution with its JS. The fixture uses procedural shapes and colors. |

**VERIFIED by source.** The spike accepts trusted palette names and generates
its own recipe. Before exposing a storyboard to the model, use a separate
strict schema for allowlisted preset, palette, camera, primitive, material,
and local asset IDs. Reject unknown fields, raw code, GLSL, expressions,
URLs and paths. Check references, frame ranges, finite numbers and bounded
transforms. Enforce size and work budgets for nodes, vertices, textures and
keyframes before constructing the scene. Generate the recipe from verified
IDs and pass only host-resolved, approved local assets. A production storyboard
validator and adversarial tests are **UNVERIFIED**.

## Decision

Source line counts include `scene-logic.js` and exclude the shared-in-design
audio algorithms and harness. T51 runtime evidence comes from the repository's
decision record. [T51 results](../../docs/ANIMATION-DECISION.md)

| Criterion | Crucible T54 | Hand-written Three.js T51 |
| --- | --- | --- |
| Source lines | **VERIFIED** 272, including the 133-line JSON recipe builder. | **VERIFIED** 217. |
| Main startup vendor size | **VERIFIED** 436,421 bytes minified / 138,523 bytes gzip. | **VERIFIED** in T51, 539.06 kB minified / 133.82 kB gzip. |
| AI storyboard | **VERIFIED** recipe supports primitives, lighting, camera and motion. A strict app-owned subset would provide editable scene data. | **VERIFIED** the existing fixture exposes a hand-written scene with numeric inputs. A storyboard can select vetted presets and tracks through a future adapter. |
| Determinism and export | **UNVERIFIED** pixel parity, performance, and browser capture. The host supplies fixed frame time and seed. | **VERIFIED** in T51 on SwiftShader at 1080p, median 26.7 ms and p95 28.1 ms. Five sampled frame hashes matched across runs and modes. H.264 encoded all 150 frames. |
| Risks | **VERIFIED** pre-1.0 API, renderer sizing tied to DOM layout, optional code increases distribution size, and the full recipe permits shaders and asset references. | **VERIFIED** larger minified vendor chunk and developer-owned scene code. Mobile GPU, memory, and long export behavior remain **UNVERIFIED**. |
| Recommendation | Keep Crucible in the spike. Revisit after the browser probe and a production storyboard validation review. | Keep Three.js as the first 3D integration candidate on the strength of its recorded browser and export evidence. |
