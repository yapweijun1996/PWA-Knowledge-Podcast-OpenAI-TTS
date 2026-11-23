# Roadmap for the browser-first podcast studio

The browser is the primary runtime and the user brings their own key.
IndexedDB holds the Library. The optional worker adds unattended runs and
scheduling. The owner handles YouTube uploads manually.
[Product direction](PRODUCT-DIRECTION.md) · [Task backlog](../TASK.md)

## Milestone status

Evidence date 2026-11-23. Counts and commands are in [TEST-MATRIX](TEST-MATRIX.md).

| Milestone | Status | Verification still open |
| --- | --- | --- |
| M0 · Browser Studio, T24 to T31 | **Done.** Browser BYOK production, checkpoints, rule gates with default-deny provider guard and key-leak scanner, CI gates. One real end-to-end run: [trial record](E2E-TRIAL-2026-11-23.md). | Listening quality, actual dollar cost, Safari and phones, long episodes. |
| M1 · Video, T32 to T36 and T49 | **Done.** Timeline, renderer with Opus fallback, Episode video panel (render, preview, review, approve, download), smaller MP4, balanced CJK wrapping. | Memory limits, other browsers and devices. |
| M2 · Manual publish package, T38 | **Done.** ZIP with video, metadata, thumbnail and checklist; tracking parameters stripped. T37 upload parked. | YouTube acceptance of Opus-in-MP4 and the disclosure wording (owner at upload time). |
| M3 · Agent, T39 | **Done in the page.** Agent panel with consent dialog, log and cancel. pi bridge is a spike. | Real model-driven runs; pi model-initiated tool calls. |
| M4 · Optional worker, T40 and T41 | **Worker done and optional; Godot not started.** | Unattended production on the target host. |
| M5 · Release hardening, T42 and T43 | **Partly done.** CI gates, checklists updated; clean-clone verification used before pushes. | Real devices, installed PWA, VoiceOver, field Web Vitals (`NOT_RUN`). |
| M6 · i18n and UI/UX, T44 to T48 | **Done.** 0 hard-coded CJK fragments, 121 backend error codes, 12-case sweep. | Native review of sensitive English and Malay copy. |
| M7 · Animation, T50 to T56 | **In progress.** T50 scene interface, T51 and T54 spikes done. T55 Three.js scene, visual design system, T52 AI storyboard and T56 optional Crucible scene are open. | Memory, real GPUs, Safari, phones. |

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

## Open release work

Run the current guarded Chromium and selected WebKit cases, then record the
candidate's live-origin and real-device evidence. Review measured video
renders and ZIP contents on the intended devices. Record fluent listening
and native review of sensitive UI copy with the release evidence.
[Production readiness](PRODUCTION-READINESS.md) · [Episode sign-off](V2-PRODUCTION-CHECKLIST.md)

Multi-user accounts, cloud sync, payments, a required hosted server and a
native mobile app remain outside this roadmap.
