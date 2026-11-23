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
   Because the owner confirmed Crucible is the library they meant, it is offered
   as an optional, lazily loaded `crucible` scene (T56) behind the same strict
   storyboard subset and the same scene interface, never as the only path. The
   owner can overturn the default.
4. The AI agent directs scenes through a strict JSON storyboard that selects
   pre-written, parameterised scenes. It never ships code to run in the page.
5. Godot stays out of the browser path; at most an optional local export.
6. A scene plugin interface (T50) comes first so these can coexist.

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

### Round 3 Studio 3D finish

The pedestal foot uses a `#53617D` rim against the floor, with a `#253247`
body and a tinted upper bevel. The narrower, beveled spectrum ticks keep
foreground openings at both bases and cap the front at .012H, with at least
.015H projected clearance. The active host gets a feathered accent ring at
up to .25 alpha in the existing contact-shadow pass. The portrait backdrop
carries the .06-alpha wash through y=.35–.52.

### Studio 3D backdrop caching

The backdrop gradient, Bayer dither and portrait wash bake once per scene.
Landscape reuses four columns, while portrait caches the full frame. Each draw
fetches the original sRGB pixel from the cache. The opaque backdrop also
replaces the color clear, while the depth clear and MSAA remain enabled.
An offline Chromium SwiftShader run with `--in-process` measured 15.8 ms
median in both orientations and 17.1 / 17.0 ms p95 in landscape / portrait.
The standard multiprocess timing is still unverified.
