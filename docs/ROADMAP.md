# Roadmap for the browser-first podcast studio

The browser is the primary runtime and the user brings their own key.
IndexedDB holds the Library. The optional worker adds unattended runs and
scheduling. The owner handles YouTube uploads manually.
[Product direction](PRODUCT-DIRECTION.md) · [Task backlog](../TASK.md)

## Milestone status

| Milestone | Implementation status | Verification still open |
| --- | --- | --- |
| M0 · Browser Studio, T24–T31 | **Implemented.** Settings holds a browser key in memory and Studio runs research through transcription with saved checkpoints. T30 adds guarded regression cases and CI enforcement. T31 updates the runbook and release checks. [Key code](../src/factory/browser-key.ts) · [Browser runner](../src/factory/browser-production.ts) · [Browser rules](../tests/factory-rules.browser.ts) | T30 Chromium runtime, live Pages, full paid episode listening and costs, and target-browser provider behavior remain **UNVERIFIED**. The earlier Chromium endpoint and short narration checks have a limited scope. [Test matrix](TEST-MATRIX.md) · [Provider contract](PROVIDER-CONTRACT.md) |
| M1 · Browser video, T32–T36 | **Render and timeline modules implemented.** The renderer draws local waveform and caption scenes, uses WebCodecs and produces an MP4 with a SHA-256 digest. Agent tools persist artifacts in IndexedDB. [Timeline](../src/video/timeline.ts) · [Renderer](../src/video/render.ts) · [Artifact store](../src/agent/artifacts.ts) | Studio preview and approval, end-to-end persistence and quota recovery, and target-device codec and performance claims remain **UNVERIFIED**. [Video evidence](VIDEO-RENDER-DECISION.md) |
| M2 · Manual publish package, T38 | **Package module implemented.** A ZIP can contain an MP4, thumbnail, title, description, tags, chapter list and disclosure checklist. The agent export tool uses the saved render for the current episode revision. T37 in-app upload remains parked. [Package builder](../src/publish/package.ts) · [Export tool](../src/agent/tools.ts) · [Task backlog](../TASK.md) | Main Studio download and manual upload compatibility remain **UNVERIFIED**. Verify the actual delivery ZIP and codecs before release. [Episode checklist](V2-PRODUCTION-CHECKLIST.md) |
| M3 · Agent, T39 | **In-page agent loop and tools implemented.** The optional pi loopback is a spike. [Agent](../src/agent/agent.ts) · [Node fixtures](../tests/agent.test.mjs) · [pi spike](PI-BRIDGE.md) | Model-initiated calls over the pi bridge and interactive release integration remain **UNVERIFIED**. |
| M4 · Optional worker and render options, T40–T41 | **Optional worker implemented.** Shared pipeline stages serve both run modes. Godot remains a candidate renderer. [Worker](../server/main.mjs) · [Shared pipeline](../shared/pipeline/) · [Render decision](VIDEO-RENDER-DECISION.md) | Unattended production on the target host remains **UNVERIFIED** for this candidate. |
| M5 · Release hardening, T42–T43 | **Release checklist updated.** CI runs the audit, type check, Node tests, strict scan, builds, browser suites and worker startup check. [CI](../.github/workflows/ci.yml) · [Release checklist](PRODUCTION-READINESS.md) | Physical iOS and Android, installed offline use and device accessibility remain `NOT_RUN`. [Test matrix](TEST-MATRIX.md) |
| M6 · i18n and UI/UX, T44–T48 | **Implemented.** The Chinese source catalogue, English and Malay translations, locale controls, parity checks and Chromium sweep are in place. T47 records earlier browser and layout evidence. [Catalogues](../src/i18n/) · [Node i18n tests](../tests/i18n.test.mjs) · [T47 evidence](UIUX-EVIDENCE.md) | Sensitive English and Malay copy needs native review. Current device and assistive-technology coverage remains `NOT_RUN`. [Review standard](UIUX-STANDARD.md) |

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
