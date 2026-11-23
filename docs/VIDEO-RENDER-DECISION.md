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
- T33 creates a deterministic scene plan at 30 fps and 1920×1080 by default,
  with a 1080×1920 preset. The intro adds two seconds and each spoken chapter
  adds a 1.5-second card. The renderer can hold the preceding visual over the
  existing inter-turn pauses. Turn `audioStart` values refer to the original
  assembly clock. A renderer can use the current clips, or use these offsets to
  splice the assembled WAV when timing is fully measured. Chapter markers use
  the video clock, with the opening chapter at `0:00`.
  [Timeline builder](../src/video/timeline.ts)
- Current-revision clip durations provide measured turn intervals. Missing,
  stale, or unusable durations are estimated at four CJK characters or 15 other
  characters per second, with a 750 ms minimum. Episode-level duration and
  chapter starts cannot establish individual turn boundaries on their own.
  `estimated: true` denotes a preview plan with estimated turn times and
  potentially estimated source offsets. Caption cues divide each turn
  proportionally by character count, with up to two lines and double width
  assigned to CJK characters.
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

## UNVERIFIED — real-browser spike

- Probe actual Chromium and Safari on the owner's target devices. Record OS,
  browser version, origin, and window or worker context. Check availability of
  `VideoEncoder`, `VideoFrame`, `OffscreenCanvas`, and `AudioEncoder`. Test the
  exact configurations again for portrait output and any alternate audio rate.
- Render a 10-second fixture from locally generated frames and audio, using no
  provider calls. Encode and flush both tracks, mux a sample MP4, and play it in
  both browsers. Check dimensions, frame cadence, duration, and A/V sync after
  inserting cards. Compare repeated renders and record which output properties
  are repeatable.
- Measure elapsed time, peak memory, output size, and cancellation behavior on
  target desktop and mobile devices. Exercise saving, reloading, and replaying
  the MP4 from IndexedDB, including quota failures on longer episodes.
- If testing ffmpeg.wasm, confirm the selected build can load offline and run
  under the deployed CSP. Measure the same fixture and check cross-origin
  isolation requirements if using a threaded build. If testing local worker
  ffmpeg, confirm installation and media handoff with the same fixture.

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
