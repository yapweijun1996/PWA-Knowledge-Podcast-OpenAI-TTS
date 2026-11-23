# Animation decision (2026-11-23)

Question from the owner: how does the animation work, and what about Three.js,
"67JS" and Godot? Full source-cited research by Codex (read-only, live web
search): [ANIMATION-RESEARCH-2026-11-23.md](ANIMATION-RESEARCH-2026-11-23.md).
That report's external claims are the researcher's and were checked only where
this page says so.

## What exists today

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
(pre-1.0). Which library the owner meant is still the owner's to confirm.

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

## Decision

1. Canvas 2D stays the baseline scene.
2. Three.js is the first 3D scene, lazy loaded, driven by our own clock.
3. Crucible ("67JS") is evaluated on the same fixture (T54) because it already
   defines JSON scenes for agents; adopt only if it beats hand-written Three.js
   scenes on size, determinism and safety.
4. The AI agent directs scenes through a strict JSON storyboard that selects
   pre-written, parameterised scenes. It never ships code to run in the page.
5. Godot stays out of the browser path; at most an optional local export.
6. A scene plugin interface (T50) comes first so these can coexist.
