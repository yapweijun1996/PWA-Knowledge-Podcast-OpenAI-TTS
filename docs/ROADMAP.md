# Roadmap for the browser-first podcast studio

V2 Studio is the only UI. The browser is the primary runtime and the user
brings their own key, held in page memory only. IndexedDB is the Library record
store. A private Node.js worker is optional. The owner handles YouTube uploads
manually.
[Product direction](PRODUCT-DIRECTION.md) · [Task backlog](../TASK.md)

## Current verified state

At `dd6e2f5` on `main`, the video pipeline uses Canvas 2D, WebCodecs and
mp4-muxer. It exports H.264 MP4 via an OffscreenCanvas worker where supported,
using AAC audio when available and Opus as the fallback. The waveform and lazily loaded
Studio 3D scenes support chapter storyboards with consent and manual review.
The publish ZIP includes thumbnails, chapters and an SRT caption sidecar when
measured captions are available.

On the manager’s Mac, typecheck and both builds passed. `npm test` reported
306 tests, 305 passed, 0 failed and 1 skipped because the Crucible spike
dependency was absent. The strict i18n scan reported 0 findings across 84
files and `npm audit` reported 0 vulnerabilities. In Chromium 156–158 with
software WebGL, `npm run e2e:factory` passed 53/53 tests in two consecutive
runs across `factory`, `render` and `perf`, with automated visual QA at 62/62.
**VISUAL ACCEPTANCE NOT PASSED.**
[Test matrix](TEST-MATRIX.md) · [Visual QA](VISUAL-QA.md)

## Milestone status

| Milestone | Status | Verification still open |
| --- | --- | --- |
| M0 · Browser Studio, T24 to T31 | V2 Studio, in-memory browser BYOK and IndexedDB records. | Listening review of real TTS audio and USD cost accuracy. |
| M1 · Video, T32 to T36, T49 and R1 | Browser MP4 export with AAC or Opus audio and an OffscreenCanvas worker. R1 caps single-file export at 300 s with a localized estimate and warning. The manager’s Factory runs covered the R1 browser cases. | Real-device memory at 300 s and Safari/iOS compatibility are owner-only and **UNVERIFIED**. |
| M2 · Manual publish package, T38 | Publish ZIP with video, thumbnail, chapters and timed SRT when available. T37 upload is parked. | YouTube acceptance of Opus audio. |
| M3 · Agent, T39 | Chapter storyboard generation with consent and manual review. | Real model-driven agent runs on `dd6e2f5` are **UNVERIFIED**. |
| M4 · Optional worker, T40 and T41 | Optional private Node.js worker. | Unattended production on the target host is unverified. |
| M5 · Release hardening, T42 and T43 | Release verification remains open. | Real-device and Safari/iOS checks. |
| M6 · i18n and UI/UX, T44 to T48 | Strict i18n scan passed with 0 findings across 84 files. | Native-speaker review of Malay and English consent and cost copy, and the Malay product name decision. |
| M7 · Animation, T50 to T56 | Waveform and lazily loaded Studio 3D are available. | Owner visual acceptance, real-GPU frame timing and the default scene decision. |

## Rules every milestone keeps

1. The browser key lives in page memory, clears on page exit or reload, and
   stays out of persistent storage, exports, logs and URLs.
2. Paid browser runs require explicit consent and a labelled estimate.
   An ambiguous paid request never retries automatically.
3. Automated tests intercept provider requests. A live trial has an
   owner-approved scope and an operator who reports actual usage.
4. Save each result before starting the next paid step. Stop on save failure.
5. Keep local Library playback and backup workflows available offline once
   the app shell has been cached.
6. Prepare a local package for a human to review and upload manually.

[Security boundaries](SECURITY.md) · [Checks and evidence](TEST-MATRIX.md)

## Open items

- **Browser QA.** After the service-worker readiness fix, the offline filters
  failure occurred in 0 of 60 runs. The caption readiness change hardens the
  video options test. The cause of that one-off failure is **UNVERIFIED**.
  [Intermittent failure follow-up](TEST-MATRIX.md#intermittent-failure-follow-up)
- **Visual acceptance.** Review both scenes in both orientations and the
  thumbnails alongside the automated gates. Recheck the weak speaking-state cue
  on the Studio 3D stage, its prototype appearance, the sparse portrait chapter
  card and faint gradient steps. [Acceptance policy](VISUAL-QA.md#review-reliability-and-acceptance-policy)
- **Long-episode export.** Browser generation preferences still allow up to 420 s
  and finished WAV validation allows up to 500 s. Studio’s 300 s cap blocks
  export of 30–60 minute episodes. T1 windowed PCM and scene envelopes are
  implemented. Long Episode intake, the T2 OPFS writer and T3 receipts and
  cap work remain pending. Chapter parts remain later, owner-gated work.
  [Long-episode plan](LONG-EPISODES.md)
- **Owner-only checks and decisions are UNVERIFIED.** Real-device and Safari/iOS
  checks, YouTube acceptance of Opus, listening review of real TTS, native-speaker
  review of Malay and English consent and cost copy, real-GPU frame timing,
  memory at 300 s, USD cost accuracy, the Malay product name and the default
  scene. [Owner checklist](OWNER-CHECKLIST.md)

[Production readiness](PRODUCTION-READINESS.md) · [Episode sign-off](V2-PRODUCTION-CHECKLIST.md)

Multi-user accounts, cloud sync, payments, a required hosted server and a
native mobile app remain outside this roadmap.
