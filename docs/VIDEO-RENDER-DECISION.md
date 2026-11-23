# Video render path (DRAFT)

T32 will evaluate WebCodecs with a local MP4 muxer first. The goal is to render
and save an episode entirely in the browser. Keep the timeline renderer-agnostic
so a local fallback can consume the same plan. A final choice depends on the
Chromium and Safari fixture runs below.

## Candidate render paths

| Path                      | Role and tradeoffs                                                                                                                                                                                                                       |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WebCodecs with MP4 muxing | Step a Three.js canvas at fixed frame times, encode video and audio locally, and mux the encoded tracks into MP4. The candidate output is H.264 with AAC. The muxer must handle timestamps, encoder metadata, and audio synchronization. |
| ffmpeg.wasm               | Evaluate as a browser fallback if native encoding or muxing fails on target devices. Measure download size, offline loading, peak memory, encode time, and the deployment requirements of the selected build.                            |
| Worker-side ffmpeg        | Optional export through the existing local Node worker when the device cannot complete a browser render. This would require a local ffmpeg installation and explicit transfer of the episode media to the worker.                        |
| Godot                     | Optional worker renderer or export path for T40. It can consume the same scene timing data if that path is developed.                                                                                                                    |

## What the repository establishes

- The Library stores audio in IndexedDB and plays and backs up episode assets.
  The existing worker assembles 24 kHz mono PCM into WAV, inserting 230 ms of
  silence between turns. The episode holds checkpoint durations by turn ID and
  finished audio metadata with total duration and chapter starts.
  [Library](../src/factory/library.ts), [audio assembly](../server/audio.mjs),
  [audio validation](../shared/audio-record.ts), [record types](../shared/factory.ts)
- T59 plans 30 fps at 1920×1080 by default and also supports 1080×1920.
  The first turn and its caption start at frame 0. Later chapters replace the
  stage on their first voiced frame, for 1.6 s landscape or about 1.33 s portrait
  at 30 fps, capped by the chapter length. Cards leave audio and captions on the
  assembly clock. The chapter markers retain the opening at `0:00` and use the
  same starts as the progress HUD. An optional end card extends the plan by
  2.0 s landscape or 1.5 s portrait.
  [Timeline builder](../src/video/timeline.ts)
- Current-revision clip durations provide measured turn intervals. Missing,
  stale, or unusable durations are estimated at four CJK graphemes or 15 other
  graphemes per second, with a 750 ms minimum. The planner uses nominal glyph
  widths and reflows once with measured font widths before encoding. It
  allocates estimated phrase timings within each turn, snaps internal cue cuts
  to the frame grid, and can use up to 200 ms of following same-host silence.
  A timing breach sets `needsReview` on the cue. The render receipt reports
  `captionReviewCount` after measured reflow.
  [Timeline builder](../src/video/timeline.ts)
- The injected capability probe checks three 1080p30 video configurations
  (`avc1.420028`, `vp09.00.40.08`, `av01.0.08M.08`) and two mono audio
  configurations (`mp4a.40.2` at 24 kHz and `opus` at 48 kHz). Codec results
  describe those configurations only. Node tests use fake encoders.
  [Capability probe](../src/video/capabilities.ts), [tests](../tests/video-timeline.test.mjs)
- Browser rendering uses local media. It needs no provider key or paid call.
  Upstream generation remains subject to the page-memory key rule, per-run
  consent, estimate-labelled cost disclosure, and saving each result before the
  next paid step. An ambiguous paid request requires a user decision before a
  retry. [Product direction](PRODUCT-DIRECTION.md), [roadmap](ROADMAP.md)

## Scene interface

The renderer steps registered scenes at `time = index / fps`. A scene draws
from the timeline plan, source PCM and frame time. It must ignore wall-clock
time, unseeded randomness and previous frame state. The registry creates an
independent scene instance per render and disposes it on completion, error or
cancellation.

Waveform is the default and draws directly into the export canvas in 2D.
WebGL scenes draw into a private canvas that the renderer composites under the
shared overlay. `VideoSceneEnvironment` and `VideoSceneFrame` receive the
orientation, active palette ID, and mood. These fields are optional for
existing scene callers. The waveform keeps a fixed idle tick on each rail
and precomputes the amplitude envelope with 67 ms attack and 220 ms release
against the clipped 480 ms PCM window. Draws look up the envelope by frame
index. The overlay uses the matching palette and orientation tokens.

Set `chapterSceneIds` on the builder for scene overrides, including the
opening chapter. A legacy plan can carry its override on a chapter scene.
Unknown IDs resolve to waveform with a receipt notice. The receipt records
the default scene and palette after fallback, the scene used for each rendered
chapter, the orientation, and font notices. The renderer calls the font
loader once with its export copy before measuring text. The loader owns
bundled-face coverage and fallback notices.

`TimelineOptions` can also supply a show name, host names, a dark palette,
a mood, an end card, or a stage transition. Callout requests use episode time
in seconds and a chapter ID. The planner schedules them on estimated turn or
clause boundaries, keeps 3-second slots clear of chapter cards, and caps each
chapter at three annotations. The default scene transition is a cut.
The optional dip fades stage art through the palette plate while the shared
text remains opaque.

Studio 3D uses a lazy factory and loads Three.js when a render first needs the
scene. It probes WebGL2 on a disposable canvas before initializing the scene.
It uses a regular canvas on the page and supports OffscreenCanvas when a DOM
canvas cannot be created. A failed probe or context startup uses waveform for
the affected selection and records a notice. A lost rendering context aborts
the export with a localized error before any new artifact is saved.

Pass `studio3d` options alongside `sceneId` in the render request. The
supported palettes are `aurora`, `sunset`, `mono`, and `ocean`. Camera
presets are `drift`, `orbit`, `static`, and `push-in`. An unknown ID uses
the first preset in its list and records a notice. Intensity is clamped to
0–1 and controls the audio response. The receipt stores the effective
settings and scene notices. The Video panel restores those settings on reload
and marks the saved preview out of date when the scene or its presets change.
The 3D scene uses a dark palette and the light theme uses the light waveform
palette. Host C has a separate label in the overlay when speaking. The 2D
stage retains its A and B rails and the 3D scene can use C's PCM for its
spectrum.

## UNVERIFIED — real-browser spike

- Probe actual Chromium and Safari on the owner's target devices. Record OS,
  browser version, origin, and window or worker context. Check availability of
  `VideoEncoder`, `VideoFrame`, `OffscreenCanvas`, and `AudioEncoder`. Test the
  exact configurations again for portrait output and any alternate audio rate.
- Render a 10-second fixture from locally generated frames and audio, using no
  provider calls. Encode and flush both tracks, mux a sample MP4, and play it in
  both browsers. Check dimensions, frame cadence, duration, and A/V sync across
  the chapter overlays. Compare repeated renders and record which output properties
  are repeatable.
- Measure elapsed time, peak memory, output size, and cancellation behavior on
  target desktop and mobile devices. Exercise saving, reloading, and replaying
  the MP4 from IndexedDB, including quota failures on longer episodes.
- If testing ffmpeg.wasm, confirm the selected build can load offline and run
  under the deployed CSP. Measure the same fixture and check cross-origin
  isolation requirements if using a threaded build. If testing local worker
  ffmpeg, confirm installation and media handoff with the same fixture.

## Desktop long-episode measurement

On macOS 27.2, native Chrome 158 rendered a local ten-minute Studio 3D
fixture at 1920×1080 and 30 fps in 91.5 seconds. The MP4 contained H.264
video and mono Opus audio generated from a local signal. Chrome played the
opening and sought to three seconds. With network access disabled, the
probe saved the 107,258,112-byte Blob to IndexedDB, closed the database,
reopened it and read back the same SHA-256 as the render receipt
(`2cb08f637509089c8a7a942984b8880b604623deba2162e7c35e65334178eba0`).

Across 734 process samples during rendering and the playback check, the
largest renderer RSS rose from 110 MiB to an observed peak of 632 MiB. GPU
process RSS rose from 90 to 124 MiB. Sampling ended before the storage and
hash checks. These measurements cover a desktop page-context render. Physical
phone export, mobile memory pressure and offline installed-app recovery on
those devices still require field verification.

A separate Chromium Studio test saves and approves a video, then reopens the
same browser profile with a one-byte origin quota before opening IndexedDB.
It attempts to render and save another palette, checks the visible save error,
and reloads the episode. The approved export remains available and its MP4
digest matches the original. [Studio storage regression](../tests/factory-video.browser.ts)

## Desktop Safari rendering

Safari 27.2 on macOS 27.2 rendered the local 10-second 1920×1080 fixture at
30 fps to H.264 and AAC. The bundled fonts loaded, the native media element
played and sought to 3 seconds, and the render took about 1.8 seconds on
that Mac. The fixture used no production service or provider key. The
original Safari encoder could return a timestamp one microsecond earlier
than requested. The muxer preserves the source frame clock and rejects
larger discrepancies. Safari can also return a wrapped AAC configuration.
The muxer extracts the AudioSpecificConfig expected by MP4 and WebCodecs.
FFmpeg decoded the full export without errors and measured a non-silent
24 kHz mono AAC-LC track. [Muxing tests](../tests/video-render.test.mjs)
[W3C AAC WebCodecs registration](https://www.w3.org/TR/webcodecs-aac-codec-registration/#audio-decoder-config-description)

The renderer drains video encoding every 24 submitted frames to bound retained
frames. Fixed batch boundaries keep output callback timing from changing where
the renderer requests keyframes. Cards and the four-second interval drive
those requests. [Queue timing regression test](../tests/video-render.test.mjs)

Short exports target 2.4 Mbps for video. The renderer budgets 80% of the
128 MiB encoded chunk limit across the planned duration, subtracts the audio
target (64 kbps mono or 128 kbps for multiple channels), and clamps the video
target between 900 kbps and 2.4 Mbps. The other 20% is headroom for variable
bitrate output. The 900 kbps floor preserves the previous quality setting for
long exports, where the estimate can consume the reserve. Actual audio and
video chunk bytes are checked against the 128 MiB limit throughout encoding.
If the preferred video target is unsupported, the renderer probes the same
codec at 900 kbps before considering the optional VP9 fallback.

The Studio prefers a dedicated OffscreenCanvas worker when the browser
supports its drawing, encoding and font APIs. The existing renderer on the
page is the fallback for browsers without that combination. Browser tests
cover MP4 playback, cancellation, and a rejected storage transaction that
preserves the last approved export. [Browser checks](../tests/factory-video.browser.ts)

## Real browser findings 2026-11-23

On the owner's Mac, Chrome 158 (headed and headless) and Playwright Chromium
156 reported H.264, VP9, and AV1 video encoding and Opus audio encoding. The
AAC-LC (`mp4a.40.2`) and FLAC encoding checks were unsupported. The renderer
prefers AAC-LC when available and falls back to Opus in MP4. It keeps the source
PCM rate if Opus accepts it and resamples to 48 kHz otherwise.

**UNVERIFIED:** YouTube Studio acceptance of Opus-in-MP4 uploads. If Studio
rejects the audio, transcode it to AAC-LC locally and copy the video stream:

```sh
ffmpeg -i input.mp4 -map 0:v:0 -map 0:a:0 -c:v copy -c:a aac -profile:a aac_low -b:a 128k -movflags +faststart output-aac.mp4
```
