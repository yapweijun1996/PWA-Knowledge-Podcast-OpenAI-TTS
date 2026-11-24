# Roadmap for the browser-first podcast studio

V2 Studio is the only UI. The browser is the primary runtime and the user
brings their own key, held in page memory only. IndexedDB is the Library record
store. A private Node.js worker is optional. The owner handles YouTube uploads
manually.
[Product direction](PRODUCT-DIRECTION.md) · [Task backlog](../TASK.md)

## Current verified state

At `c22a9fe`, the video pipeline uses Canvas 2D, WebCodecs and mp4-muxer. It
exports H.264 MP4 via an OffscreenCanvas worker where supported, using AAC
audio when available and Opus as the fallback. The waveform and lazily loaded
Studio 3D scenes support chapter storyboards with consent and manual review.
The publish ZIP includes thumbnails, chapters and an SRT caption sidecar when
measured captions are available.

On the manager’s Mac, typecheck and both builds passed. Of 289 tests, 288
passed and 1 skipped because the Crucible spike dependency was absent. The
strict i18n scan reported 0 findings and `npm audit` reported 0 vulnerabilities.
Chromium 156–158 with software WebGL passed
51/51 Factory tests twice in a row and 62/62 automated visual QA points. The
latest independent still-image review scored 79.0% (54.5/69), below the 85%
acceptance bar. **Visual acceptance has not passed.**
[Test matrix](TEST-MATRIX.md) · [Visual QA](VISUAL-QA.md)

## Milestone status

| Milestone | Status | Verification still open |
| --- | --- | --- |
| M0 · Browser Studio, T24 to T31 | V2 Studio, in-memory browser BYOK and IndexedDB records. | Listening review of real TTS audio and USD cost accuracy. |
| M1 · Video, T32 to T36 and T49 | Browser MP4 export with AAC or Opus audio and an OffscreenCanvas worker. | Long-episode memory, Safari and real devices. |
| M2 · Manual publish package, T38 | Publish ZIP with video, thumbnail, chapters and timed SRT when available. T37 upload is parked. | YouTube acceptance of Opus audio. |
| M3 · Agent, T39 | Chapter storyboard generation with consent and manual review. | Real model-driven agent runs on `c22a9fe` are unverified. |
| M4 · Optional worker, T40 and T41 | Optional private Node.js worker. | Unattended production on the target host is unverified. |
| M5 · Release hardening, T42 and T43 | Release verification remains open. | Real-device and Safari/iOS checks. |
| M6 · i18n and UI/UX, T44 to T48 | Strict i18n scan passed with 0 findings. | Native-speaker review of Malay and English consent and cost copy, and the Malay product name decision. |
| M7 · Animation, T50 to T56 | Waveform and lazily loaded Studio 3D are available. Automated visual QA passed 62/62. | Independent visual acceptance and real-GPU frame timing. |

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

- **Browser QA.** One parallel run had an intermittent failure in
  `tests/factory-video-options.browser.ts`. Investigation is open.
- **Visual acceptance.** Reviewers proposed increasing the portrait chapter title
  from .041H to .047H and flagged speaking-state readability of waveform active bars and the
  active chip outline, Studio 3D materials and grounding, and minor gradient
  steps. Reviewers disagreed on the Mandarin portrait caption break, which is
  subjective. [Visual QA](VISUAL-QA.md#history-and-status)
- **Owner-only and unverified.** Real-device and Safari/iOS checks, listening
  review of real TTS audio, YouTube acceptance of Opus audio, native-speaker
  review of Malay and English consent and cost copy, real-GPU frame timing,
  long-episode memory and USD cost accuracy. The Malay product name remains an
  owner decision.

[Production readiness](PRODUCTION-READINESS.md) · [Episode sign-off](V2-PRODUCTION-CHECKLIST.md)

Multi-user accounts, cloud sync, payments, a required hosted server and a
native mobile app remain outside this roadmap.
