# Three.js audio-reactive studio spike (T51)

This standalone benchmark renders a five-second synthetic audio fixture at
30 fps. It uses Three.js 0.187.0 (MIT) from this spike's `node_modules`. It
requires no API key, provider calls, or external assets.

## Run from the repository root

Use the repository's Vite and Playwright with an existing Playwright Chromium.

```sh
node spikes/three-scene/scripts/bundle.mjs && node spikes/three-scene/scripts/probe.mjs
node spikes/three-scene/scripts/probe.mjs 720p
```

The default probe resolution is 1920 × 1080. The probe serves `dist` from
`127.0.0.1` for secure-context APIs, then prints a JSON report. It runs the
main-thread canvas first and the module worker's OffscreenCanvas second. It
exits nonzero if either rendering benchmark fails to complete. VideoFrame and
H.264 capability outcomes are recorded independently under `webCodecs`.

For interactive use, serve the same build on loopback and open
`http://127.0.0.1:4173/` to select a resolution and run the benchmark.

```sh
python3 -m http.server 4173 --bind 127.0.0.1 --directory spikes/three-scene/dist
```

## What the report measures

- The fixture has two alternating hosts with distinct tones, harmonics, an
  amplitude envelope, and short gaps. `stateAt(t)` selects the current turn and
  samples its PCM using a centered 480 ms peak window, following the Canvas 2D
  waveform. The 32 DFT bins use a centered 512-sample Hann window. Output bin
  `i` represents `(i + 1) * sampleRate / 512` Hz.
- `renderAt(i / 30, state)` updates both hosts, all ring bars, and the camera
  from the supplied state and time. The seed is fixed when the scene is built.
  The `dark` and `light` scene themes are studio palettes with dark backdrops.
- `renderMs` includes the first frame, shader initialization during rendering,
  and a synchronous one-pixel `readPixels` to wait for GPU drawing. Audio
  analysis, full-frame readback, hashing, and encoding take place outside each
  timed interval. The report includes all frame samples and their summary.
- `heapBytes` samples `performance.memory` before creating the scene, after
  the timed pass, and after the WebCodecs probe. `null` means the browser did
  not expose the API in that mode. These values describe the JavaScript heap.
  `webgl` records WebGL version, context attributes, and masked and unmasked
  renderer information where available.
- `pixelSha256` hashes raw RGBA bytes from frames 0, 15, 30, 60, and 120 before
  the drawing buffer can be cleared. Run the probe twice at each resolution
  and compare all five hashes for each mode on the same browser and GPU.
  Different drivers, browser builds, or graphics backends may produce
  different pixel hashes.
- `webCodecs` first checks the dimensions and timestamp of a `VideoFrame` from
  the canvas. A separate pass attempts to encode all 150 frames with
  `avc1.420028` and validates the output count, timestamps, and byte count.
  The probe measures frame capture and video encoding. Playback, audio
  encoding, and MP4 muxing are outside its scope.

## Decision record

Vite 8.3.5 reports **539.06 kB minified / 133.82 kB gzip** for the main-thread
Three.js chunk. The bundled worker, including Three.js and its harness, is
**551.88 kB minified**. Vite flagged both chunks against its 500 kB warning
threshold. These figures describe the spike build.

If adopted, the browser video renderer can call
`await import("./three/studio-scene.js")` when the user selects the 3D scene.
That module would own the static Three.js import, keeping the renderer in a
lazy chunk. It would derive the speaker and source PCM from `TimelinePlan` at
`i / fps`, then feed `renderAt` and capture the same canvas through the existing
`VideoFrame` export path. The worker entry can also load on demand when the
worker mode is selected.

| Resolution | Mode | Render p95 | Heap | Hashes match across runs | H.264 |
| --- | --- | --- | --- | --- | --- |
| 1920 × 1080 | Main thread | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| 1920 × 1080 | Offscreen worker | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| 1280 × 720 | Main thread | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| 1280 × 720 | Offscreen worker | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED |

Record the browser version, OS, renderer string, and hardware with each run.
Use the paired runs to decide whether to keep the spike standalone or schedule
integration for the supported modes and devices.

- **UNVERIFIED — software WebGL speed.** Record the headless renderer string
  and compare render timing with a hardware-backed run.
- **UNVERIFIED — mobile GPU.** Measure the scene on supported phones at both
  resolutions and check sustained exports for thermal throttling.
- **UNVERIFIED — memory.** Check peak browser process and GPU memory during
  repeated runs and longer renders in addition to the JS heap snapshots.
- **UNVERIFIED — context loss.** Exercise loss during render and capture, and
  verify that the export can stop cleanly and a later run can start fresh.

Chromium and the probe's browser measurements are **NOT_RUN** in the coding
sandbox.
