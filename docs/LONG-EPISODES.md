# Long-episode video export

Keep the 210-second limit for this revision. Qualify a five-minute single-file
export as an interim step. For 30–60 minute episodes, target one local MP4
backed by the Origin Private File System (OPFS), with chapter parts for devices
that cannot finish one continuous render. The owner uploads manually to YouTube.

## Verified limits at `11f8a92`

| Gate | Code and history |
| --- | --- |
| Episode video preflight | `videoWithinLimits` checks both the source audio and the planned video before decode. `maxVideoSeconds = floor((128 MiB − 1 MiB) / ((5,000,000 + 64,000) / 8)) = 210`. `git log -S'maxVideoSeconds'` and `git blame` trace the guard to `713b3b7` (T36/T38). Its comment says the 1 MiB reserve was for mux overhead at the then-configured 5 Mb/s video and 64 kb/s mono audio. [Guard](../src/factory/useVideoRender.ts#L265) · [UI](../src/factory/VideoPanel.tsx#L914) |
| Decoded PCM | The same hook budgets 32 MiB before decode at 24 kHz mono Float32 and checks the actual channel count and sample length after decode. Mono reaches 32 MiB at 349.5 s. The optional worker path takes a second PCM copy. [Decode](../src/factory/useVideoRender.ts#L830) · [Worker dispatch](../src/video/render-client.ts) |
| Encoded chunks | The renderer aborts once audio plus video chunks exceed 128 MiB, independent of the UI guard. `git log -S'5_000_000'` shows `cd8fbd3` (T49) lowered the video target to 900 kb/s. `2f6bbe0` added adaptive targets from 900 kb/s to 2.4 Mb/s. The Episode preflight still uses its original rate. [Renderer](../src/video/render.ts) · [Render decision](VIDEO-RENDER-DECISION.md) |
| Generation and saved audio | Browser preferences allow up to 420 s (240 s default). Browser production budgets 48,000 WAV payload bytes/s against the chosen limit. Finished WAV validation allows 24,000,044 bytes, exactly 500 s with the required 44-byte header. Episode record validation also limits durations and chapter starts to 500 s. Planning and record validation cap the current script at seven chapters, 42 turns and 12,500 characters total. The private Node worker has a 500 s default when the episode has no production bound. Long generated episodes need intake, production and Library changes alongside export changes. [Preferences](../shared/preferences.ts) · [Browser production](../src/factory/browser-production.ts) · [Planning](../shared/pipeline/script.ts) · [Record](../shared/episode-record.ts) · [WAV](../shared/audio-record.ts) · [Worker](../server/jobs.mjs) |

The separate agent tool validates the same WAV and expands the Int16 samples to
Float32 before calling `renderVideo` directly. It shares the renderer’s byte
guard. The Episode guard applies to the Episode view. [Agent tools](../src/agent/tools.ts)

## Resource model

The tables model resource use. `T` is seconds of both audio and video,
`N = 30 × T` frames, and `1 MiB = 1,048,576 bytes`. Both 1920×1080 and
1080×1920 have 2,073,600 pixels. The baseline uses 900 kb/s video and 128 kb/s
audio. Studio sources are mono, so the renderer targets 64 kb/s audio for them
and 128 kb/s for multiple channels. It prefers AAC and falls back to Opus,
resampling to 48 kHz if needed. The model excludes optional end-card time and
container overhead.

| Minutes | Frames | WAV Int16, MiB | Decoded Float32 / with worker copy, MiB | Encoded baseline `B`, MiB | Mux finalization `C + B`, MiB | WAV + MP4 / WAV + two MP4s, MiB |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 3.5 | 6,300 | 9.6 | 19.2 / 38.5 | 25.7 | 57.7 | 35.3 / 61.1 |
| 10 | 18,000 | 27.5 | 54.9 / 109.9 | 73.5 | 201.5 | 101.0 / 174.5 |
| 30 | 54,000 | 82.4 | 164.8 / 329.6 | 220.6 | 476.6 | 303.0 / 523.6 |
| 60 | 108,000 | 164.8 | 329.6 / 659.2 | 441.2 | 953.2 | 606.0 / 1,047.1 |

| Resource | What grows and how to size it |
| --- | --- |
| Decode and audio encoding | WAV bytes = `44 + T × 24,000 × 1 × 2`. Decoded bytes = `T × sampleRate × channels × 4`. A 48 kHz stereo Float32 input would use 4× the Studio mono PCM. The hook reads the full WAV for SHA-256 and again for `decodeAudioData`, which consumes its input buffer. The page fallback reads channel views. Worker dispatch copies and transfers the channels. Each planar encoding block uses up to `4,096 × channels × 4` bytes plus codec memory. [Hook](../src/factory/useVideoRender.ts) · [Worker client](../src/video/render-client.ts) · [PCM renderer](../src/video/render.ts) |
| Encoder queues and surfaces | Both encoders wait at `encodeQueueSize >= 4`. Video flushes every `maxVideoFramesInFlight = 24` submissions and closes each `VideoFrame` immediately after submission. At `width × height × bytesPerPixel`, a frame is about 3.0 MiB for 8-bit 4:2:0 or 7.9 MiB for RGBA. A batch of 24 such surfaces would be 71.2 or 189.8 MiB. Queue and batch overlap. Browser codec buffers and the 2D and WebGL canvas/GPU allocations require measurement. [Renderer](../src/video/render.ts) |
| MP4 mux and hash | `B = T × (900,000 + 128,000) / 8`. The pinned mp4-muxer 5.2.2 `ArrayBufferTarget` starts at 64 KiB and doubles to capacity `C = 2^ceil(log2(max(65,536, B)))` in bytes for the baseline payload. Growing it can briefly hold both the old and new buffers. With `fastStart: false`, completed chunks write into that buffer as encoding proceeds. The muxer keeps sample and chunk tables, then slices a full-size result at `finalize()` (`C + B` above, with `B` standing in for MP4 size). The renderer hashes that complete buffer and constructs a Blob. A concurrent extra output-sized copy would put output buffers at `C + 2B`, or about 1,394 MiB at 60 minutes before PCM and browser overhead. A streaming target removes the growing payload buffer. Standard MP4 still retains sample metadata. The pinned fragmented implementation also retains finalized chunk/sample records for its index and queues samples when the tracks are out of step. [Renderer](../src/video/render.ts) · [Pinned version](../package.json) |
| ZIP and saved artifacts | Let `M` be the actual MP4 bytes. ZIP bytes = `M + thumbnail + sidecars + Σ(76 + 2 × UTF-8 filename bytes) + 22`. The ZIP stores files uncompressed, reads each entry via `Blob.stream()` for CRC32, and composes a Blob from the existing entry Blobs and headers. CRC work is linear in file size. Browser memory and disk copies during download require measurement. ZIP32 rejects an archive at or above `0xffffffff` bytes. The Episode panel downloads its ZIP. The separate agent package tool saves a ZIP artifact in IndexedDB, adding roughly another `M` bytes. [ZIP](../src/publish/zip.ts) · [Package](../src/publish/package.ts) · [Episode download](../src/factory/VideoPanel.tsx) · [Agent tools](../src/agent/tools.ts) |
| IndexedDB and quota | The Episode stores the MP4 Blob and its receipt in one strict transaction. The receipt includes digest, codecs, render settings, review, chapters and optional storyboard and captions. The Library also stores the source WAV and can retain per-turn clips. The disk columns show WAV + MP4 and a scenario with two MP4-sized payloads, such as a staged replacement or an agent ZIP. Add retained clips, receipts, caches and other episodes. Raw clip storage is approximately `48,000 × (T − 0.23 × (turns − 1)) + 44 × turns` bytes when assembly inserted the standard gaps. Library displays the origin-wide `navigator.storage.estimate()` usage/quota and offers a persistence request. The estimate can be absent and the renderer has no quota preflight. Available headroom is estimated as `quota − usage`. [Artifact store](../src/agent/artifacts.ts) · [Library](../src/factory/library.ts) · [Quota UI](../src/factory/Factory.tsx) |
| Captions and storyboard | At one cue per 3 s, there are 70 / 200 / 600 / 1,200 cues. At 150 UTF-8 bytes/cue, SRT uses 10.3 / 29.3 / 87.9 / 175.8 KiB. At 180 bytes/cue, serialized receipt JSON uses 12.3 / 35.2 / 105.5 / 210.9 KiB. Live objects add overhead. Storyboards allow three callouts per chapter and save draft/applied copies plus the applied plan in the receipt. At 1 KiB/chapter and one chapter per five minutes capped at seven, each copy uses 1 / 2 / 6 / 7 KiB. [Captions](../src/video/caption-track.ts) · [Storyboard](../src/video/storyboard.ts) · [Storyboard store](../src/video/storyboard-store.ts) |
| Scene caches | Waveform uses `N × 4 × (36 landscape or 20 portrait)` bytes plus a temporary `floor(T × 24,000 / 32) × 8` byte peak cache. Studio 3D uses `N × 36 × 4` bytes per plan/audio pair. At 60 minutes the frame caches use 14.8 MiB for landscape waveform and Studio 3D, or 8.2 MiB for portrait waveform. Window both caches for bounded media memory. [Waveform](../src/video/scenes/waveform.ts) · [3D audio](../src/video/scenes/studio3d/audio-state.ts) |
| Thumbnail | The independent 1280×720 canvas is about 3.5 MiB at 4 bytes/pixel. Each export draws and encodes a PNG, with one reduced-detail retry if needed. The PNG must be under 2,000,000 bytes. Work is fixed per thumbnail in both orientations and grows with the number of thumbnails a parts package requests. [Thumbnail code](../src/publish/thumbnail.ts) |

For the current renderer’s preferred mono settings, `videoRate =
clamp(floor(0.8 × 128 MiB × 8 / T) − 64,000, 900,000, 2,400,000)` in bits/s.
It retries at 900 kb/s if the preferred configuration is unsupported. The table
shows nominal payloads at the preferred rate before the byte guard or codec
variation. The 900 kb/s floor plus 64 kb/s reaches the 128 MiB budget at about
18.6 minutes at target average. With 128 kb/s audio it reaches it at 17.4
minutes. The 20% reserve is used up at about 14.9 and 13.9 minutes respectively
at the floor. Actual encoded chunk bytes govern the abort.

| Minutes | Preferred video, kb/s | Mono encoded payload, MiB | Studio 3D draw time at 16–30 ms/frame | Waveform draw time at assumed 3 ms/frame |
| ---: | ---: | ---: | ---: | ---: |
| 3.5 | 2,400 | 61.7 | 1.7–3.2 min | 0.3 min |
| 10 | 1,368 | 102.4 | 4.8–9.0 min | 0.9 min |
| 30 | 900 | 206.9 | 14.4–27.0 min | 2.7 min |
| 60 | 900 | 413.7 | 28.8–54.0 min | 5.4 min |

Draw time is `N × ms/frame ÷ 60,000` in minutes. The manager’s software WebGL
range and a few milliseconds per waveform frame give draw-only estimates.
Encode throughput is unknown. End-to-end wall time also depends on audio
preparation, encoder backpressure and flushes, hashing, save and download.
The earlier repo record reports a **91.5 s** render of a local ten-minute
landscape Studio 3D fixture on native Chrome 158, with **632 MiB** peak
renderer RSS and **124 MiB** peak GPU RSS. Sampling ended before storage and
hash readback checks. That fixture exercised the renderer outside the Episode
guard. Its timing describes that run, with its own browser and workload.
[Prior measurement](VIDEO-RENDER-DECISION.md#desktop-long-episode-measurement) · [Software WebGL benchmark](ANIMATION-DECISION.md#measured-threejs-scene-spike-t51)

## Failure order and device hypotheses

**Verified by inspection.** With a valid WAV over 210 s, the Episode duration
guard rejects before decode. If only that guard is raised, the 32 MiB PCM
check becomes the next export ceiling at 349.5 s. Browser-generated episodes
also hit the 420 s preference ceiling and a long finished WAV/record hits
the 500 s validators before normal Episode rendering. If those gates are
lifted while the renderer guard remains, 30–60 minute exports at the modelled
rates hit the encoded-byte budget before mux finalization.

**Hypotheses if those gates are lifted.** On a typical 8 GB laptop with a
supported codec and enough origin quota, the first likely resource bottleneck
at 30–60 minutes is renderer memory pressure during mux
growth/finalization, hashing or Blob creation. The 60-minute case alone has
659 MiB of potential worker-path PCM and 953 MiB of mux buffers at finalization
in the baseline model. The allocations’ overlap and the available process
budget are unknown. On a phone with working codecs, the first likely issue is
tab or GPU memory pressure during decode, worker copying or surface allocation,
before finalization. Low origin quota can instead cause the first failure at
save on either device. Codec availability, memory limits, background suspension,
thermal throttling and actual quota are device- and profile-specific.

## Delivery plan

Each worker package below is a proposed implementation and verification
assignment. Estimates assume the current browser-first workflow and local
fixtures. Existing test changes are prospective.

| Approach | Effort and decision | Risks and tests to extend |
| --- | --- | --- |
| Raise the cap with an estimate | **1 worker package.** Qualify up to **300 s** on the Episode path. For each proposed duration require decoded PCM ≤32 MiB, nominal encoded payload ≤102.4 MiB (80% of 128 MiB), and estimated origin headroom for the new MP4, receipt and any staging overhead. At 300 s the mono estimates are 27.5 MiB PCM and 88.1 MiB encoded. Keep 210 s on unqualified profiles. Show duration, estimated size and time, slow-export/storage warnings and the reason for a block. | VBR, changing quota and codec fallback can invalidate estimates. Extend `video-panel.test.mjs` (source and plan boundaries), `video-render.test.mjs` (bitrate and actual byte guard), `factory-video-options.browser.ts` (estimates and warnings) and `factory-video.browser.ts` (cancel and rollback). Test missing quota data and mono/stereo budgets. |
| Stream fragmented MP4 to OPFS | **3 worker packages.** Land (1) long local fixture intake, versioned audio/record handling and windowed PCM plus scene envelopes, (2) a seekable, backpressured worker writer with bounded fragments and an incremental digest of the closed file in byte order, (3) IndexedDB receipt pointers, legacy Blob playback, preview and local package/download. Stage a new file before committing the receipt, retain the last approved file until commit, and clean up orphaned files. Stream ZIP output or offer direct file download so delivery preserves the memory gains. Enable by tested capability. | The pinned muxer’s file target forwards asynchronous writes without waiting and its fragmented index grows. Bound pending writes and track skew, and spool the index or use a muxer with bounded index memory if measurements require it. Probe worker/file capabilities, fragmented seeking, upload compatibility, disk full, cancellation, reload, interrupted writes and legacy receipts. Extend `video-render.test.mjs` (queues, timestamps, digest, byte limits), `factory-video.browser.ts` (playback, quota, cancel), `publish-package.test.mjs` (ZIP), `library.test.mjs` and the backup round-trip in `factory.test.mjs`. Continue using local fixture audio while separate long AI-generation work qualifies script, narration and transcript limits in `browser-production.test.mjs`. |
| Export chapter parts | **2 worker packages.** Render one MP4 per chapter where it fits, splitting longer chapters at clean turn boundaries within a computed time budget. Start at up to five minutes per part on qualified devices. Read only that part’s PCM, release render buffers between parts, and offer sequential downloads. The publish package lists ordered filenames, chapter titles, episode offsets, durations and per-part captions. Keep optional user-side concatenation and a global chapter/caption list. | Cut seams, AAC/Opus priming, frame rounding, incompatible parameters for concatenation and partial recovery. Test gapless joins, complete unique samples and cues, part-level retry/cancel/quota, and manifest/receipt identity. Extend `video-timeline.test.mjs` (source offsets and boundaries), `video-render.test.mjs` (A/V timing), `publish-package.test.mjs` (parts and sidecars) and `factory-video.browser.ts` (reopen parts and keep prior approval). |
| Audio-first MP4 | **1 worker package after shared long-audio intake.** Offer a static image or slow storyboard at **2 fps** with 24 kHz mono audio, a caption sidecar and manual upload. At an illustrative 150 kb/s video target plus 64 kb/s audio, 60 minutes is 7,200 frames and 91.8 MiB of encoded payload. Qualify the bitrate and frame rate. Reuse windowed audio and storage work so PCM and saving remain feasible. | Device support at low frame rates, text legibility, caption timing and A/V sync. Test long silence, first/last sample, storyboard changes, sidecar timing and real playback/upload. Extend `video-render.test.mjs` (mode-specific bitrate and keyframe rules), `caption-timing.test.mjs` and `video-timeline.test.mjs` (timing at 2 fps), and `factory-video.browser.ts` (render/approval/playback). |

Qualify the interim cap and the long local fixture path first. Prioritize the
OPFS single-file path for normal 30–60 minute episodes so the owner has one
file to review and upload. Use parts where a continuous run is unreliable,
and offer audio-first when render time or scene performance is the binding
constraint. Keep the existing short MP4 path available throughout.

## Owner hardware verification

Browser execution for this analysis is **NOT_RUN**. The manager’s earlier tests
cover software WebGL and a one-byte quota rollback fixture. The owner’s target
8 GB laptop and physical iPhone/Android devices must establish codec and OPFS
support, real-GPU draw and encoder timings, peak renderer/GPU/whole-browser
memory through save and download, observed origin usage, thermal/background
behavior, and installed-PWA recovery after interruption. Run local 10-, 30-
and 60-minute fixtures in both orientations, capture per-phase timing and
memory, and check play, seek, A/V sync, captions, approval and recovery with
normal and low disk headroom. The owner must verify private YouTube upload and
playback for the resulting AAC or Opus MP4, including fragmented output.
[Test matrix](TEST-MATRIX.md) · [Owner checklist](OWNER-CHECKLIST.md)
