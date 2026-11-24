# Animation decision (2026-11-23)

Question from the owner: how does the animation work, and what about Three.js,
"67JS" and Godot? Full source-cited research by Codex (read-only, live web
search): [ANIMATION-RESEARCH-2026-11-23.md](ANIMATION-RESEARCH-2026-11-23.md).
That report's external claims are the researcher's and were checked only where
this page says so.

## Before Studio 3D

`src/video/draw.ts` draws every frame with Canvas 2D at `t = i / fps` (speaker
label, waveform from real PCM, captions, title cards). WebCodecs encodes and
mp4-muxer writes the MP4. No Three.js, p5 or Godot code ships in the app.

## What "67JS" is

Very probably CodePawl's **67.js**, now renamed **Crucible**: an agent-oriented
browser 3D renderer built on Three.js with JSON scenes and still and MP4
tooling. Checked by the manager on 2026-11-23 against the npm registry:
`@codepawlhq/67js` 0.19.0 is deprecated with the message "Renamed to
@codepawlhq/crucible"; `@codepawlhq/crucible` 0.22.0 is MIT, peer-depends on
`three` 0.187.0, has no install scripts, and was published two days earlier
(pre-1.0). **Confirmed by the owner on 2026-11-23: "67JS" is Crucible.**

## Measured: Three.js scene spike (T51)

Real Chromium 156 on the owner's Mac, headless, **software WebGL2 (SwiftShader)**,
1920x1080, 150 frames (5 s at 30 fps), Three.js 0.187.0.

| Measure | Result |
| --- | --- |
| Frame time (render plus 1-pixel readback) | median 26.7 ms, p95 28.1 ms (first frame about 400 ms warm-up) on software rendering |
| Determinism | SHA-256 of frames 0, 15, 30, 60 and 120 **identical in two runs** and **identical between main thread and OffscreenCanvas worker** |
| WebCodecs | `VideoFrame` from the WebGL canvas works; 150 frames encoded as H.264 (`avc1.420028`), 1.37 MB |
| Bundle | Three.js chunk 539 kB minified, 134 kB gzip; can be lazy loaded |
| Look | two glowing host orbs on pedestals, 32 audio-reactive spectrum blocks, fog and gradient backdrop (viewed by the manager) |

Not established (**UNVERIFIED**): memory (the headless heap numbers are rounded
placeholders), real GPUs and other driver stacks (pixel hashes may differ across
GPUs), Safari, phones, long episodes, context loss, and cancellation mid render.

## Measured: Crucible ("67JS") spike (T54)

Same fixture, same machine and browser as the Three.js spike; Crucible 0.22.0
with the same scene described as a JSON recipe (`spikes/crucible-scene`).

| Measure | Crucible | Hand-written Three.js |
| --- | --- | --- |
| Frame time at 1080p, software WebGL2 | median **113 ms**, p95 118 ms | median **26.7 ms**, p95 28.1 ms (Crucible about 4x slower) |
| Determinism | hashes of frames 0, 15, 30, 60, 120 identical across two runs and between main thread and worker | identical across two runs and between main thread and worker |
| WebCodecs | works; 150 frames H.264, 1.0 MB | works; 150 frames H.264, 1.37 MB |
| Startup vendor size | 438 kB minified, 139 kB gzip | 539 kB minified, 134 kB gzip |
| Whole bundle with optional addons | 2.95 MB minified, 981 kB gzip | not applicable |
| Source lines | 272, of which 133 build the JSON recipe | 217 |
| Look (viewed by the manager) | same composition, smoother and darker spheres, no glow | faceted spheres with glow and fog, more atmospheric |
| Maturity and safety | 0.x, published two days before the test; the recipe format also permits shaders and asset references, so an AI-written storyboard would need a strict app-owned subset | our own code, no external scene format |

Not established (**UNVERIFIED**): Crucible's own MP4 and character-motion tooling
(not used here), memory, real GPUs, Safari and phones.

## Decision

1. Canvas 2D stays the baseline scene.
2. Three.js is the first 3D scene, lazy loaded, driven by our own clock.
3. Crucible ("67JS") was evaluated on the same fixture (T54). It is deterministic
   but about four times slower per frame, very new, and its JSON format permits
   shaders and external assets. **Decision (manager, before the owner's confirmation):
   production scenes are hand-written Three.js and Crucible stays a reference.**
   T56 remains behind the production quality gate. Confirming the library
   identity established which adapter to qualify. The frame-time results
   below govern whether it becomes an available scene.
4. The AI agent directs scenes through a strict JSON storyboard that selects
   pre-written, parameterised scenes. It never ships code to run in the page.
5. Godot stays out of the browser path; at most an optional local export.
6. A scene plugin interface (T50) comes first so these can coexist.

## Crucible qualification (T56)

The 2026-11-23 qualification used Crucible 0.22.0, Chromium 156 and ANGLE
Vulkan SwiftShader on macOS 27.2 with other render tests active. Each
orientation used native 1080p, 10 warm-up frames and 36 timed draws with
2D compositing and a synchronous one-pixel readback. The lean LDR recipe
with one sample and no bloom reached **566.6 / 811.6 ms** median / p95 in
landscape and **793.4 / 1047.9 ms** in portrait. A modified light-shading
profile also missed the budget in two runs. Its frame hashes at 0, 15 and 30
matched between repeats in each orientation, with zero external requests.

Keep the spike outside the production scene list. A production candidate
must meet the 40 ms median and 60 ms p95 budgets in both orientations,
retain deterministic frame output and pass the visual review. The earlier
T54 measurements timed a different workload. [Design and performance gates](VISUAL-DESIGN-SPEC.md#5-studio-3d-art-direction-and-motion)

## Godot export decision (T40)

Keep WebCodecs as the app's exporter. It already produces the MP4 and its
review package directly from the Library. The Godot Web export requires
WebAssembly and WebGL 2. Godot's native Movie Maker can record fixed-rate video
and audio to a file, which would add a separate editor and file handoff to
this workflow. A future episode authored in Godot can use Movie Maker as a
local production tool and deliver an MP4 for human review. [Godot Web export](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html) · [Godot Movie Maker](https://docs.godotengine.org/en/stable/tutorials/animation/creating_movies.html)

## Integrated (T55)

Studio 3D is available in the Video panel. The registered scene dynamically
loads Three.js, drives the orbs and 32 spectrum blocks from turn PCM, and
steps the camera on the same frame clock as waveform and the shared overlay.
The palette, camera preset, and audio response intensity are recorded in the
render receipt. Browsers that cannot initialize WebGL2 use waveform and show
the substitution in the receipt. The spike measurements above describe the
standalone harness. Integrated render timing and decoded-frame hashes need a
Chromium run. [Scene interface](VIDEO-RENDER-DECISION.md#scene-interface)

## Art direction (T60)

Studio 3D uses the shared design palettes and a 38° camera. Its smooth,
single-band host and faceted, double-band host sit above beveled pedestals
with radial contact shadows. The portrait camera centers the stage at x=.43
and uses .55× ring depth and .65× camera excursion.

The scene analyzes centered 40 ms PCM windows and precomputes per-frame
envelopes before drawing. Each draw reads its envelope by frame index.
The default profile is aurora, drift, calm, and .55 intensity. Reduced motion
selects the static camera and holds halo opacity. The [visual design spec](VISUAL-DESIGN-SPEC.md#5-studio-3d-art-direction-and-motion)
defines the motion limits. Run `node scripts/studio3d-bench.mjs` on the
pinned Chromium and SwiftShader profile to qualify both aspects.

### Round 2 Studio 3D polish

The stage uses a full-frame vertical palette gradient with a fixed 4×4 Bayer
dither in sRGB. Orb halos peak at .12 and the ground wash at .06. An eased turn
cue controls the rim and adds 3.5% to the speaking orb. PCM can add up to 1.3%.
Reduced motion holds the camera and halos and omits the turn-driven scale accent.
Portrait centers are at .30H with .118H rest diameters and near bars capped at
.022H. Both orientations reserve .02H above the speaker chips. The browser
pixel checks and SwiftShader benchmark qualify the rendered result.

### Studio 3D frame-time and speaker cues

The gradient, 4×4 dither and portrait wash bake once per scene. Landscape
reuses four texture columns. The opaque backdrop replaces the per-frame color
clear and the stage retains its depth clear and antialiasing. Tight radial meshes
reduce glow overdraw. The existing contact pass draws the active host's .003H
floor ring at up to .18 alpha.

The turn cue adds 4% to the active orb, with a combined PCM and turn cap of
5.3%. Reduced motion omits the turn scale accent and keeps the color cues.
The key-facing arc gains up to 12% in linear light and the idle rim uses 80%
of its previous strength. The `perf` Playwright project follows `render` and
checks both aspects in a fresh browser process. Current Chromium timing and
pixel checks are `NOT_RUN` in the K2 worktree.

### Studio 3D backdrop and pedestal polish (L2)

Bake the card's full-bleed diagonal palette ramp and screen-aligned Bayer
dither with a soft floor wash at .024 peak alpha in both orientations. Bake
the contact shadows once at up to .28 alpha and keep their fade above the
host chips. Use a #253247 pedestal with one #53617D bevel. The bevel shifts
toward the speaking host's accent over the existing turn easing and keeps
the cue in reduced motion. The foreground bars retain the .012H cap and use
a more muted tint toward the camera.

The projected layout assertions now track the contact-shadow extent and check
its clearance above the chips. The browser pixel checks compare against the card
gradient and require 3:1 active-bevel contrast. Chromium and the 30 ms median
frame-time target are `NOT_RUN` in this worktree.
