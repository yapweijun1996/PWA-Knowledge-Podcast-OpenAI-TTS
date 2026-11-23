# Product direction

Knowledge Podcast Studio turns a topic into a reviewed podcast. The browser
can reach OpenAI directly using the owner's key and saves episode progress in
IndexedDB. The optional Node worker supports unattended production. The owner
reviews the output and handles any YouTube upload manually.
[Roadmap](ROADMAP.md) · [Studio runbook](V2-FACTORY.md)

## Product decisions

1. **Browser first.** The static app supports browser BYOK and an offline
   Library after caching. Each browser profile and origin has its own data.
   Use private episode backups for transfers. [Library](../src/factory/library.ts) · [Backup format](../shared/episode-backup.ts)
2. **Browser key boundary.** The key lives in page memory and is readable by
   page code, permitted extensions and a compromised device while present. It
   clears on page exit or reload. [Key lifecycle](../src/factory/browser-key.ts) · [Security](SECURITY.md)
3. **Consent and checkpoints.** Show labelled usage estimates, require
   permission for each manual paid run, and save results before starting the
   next paid step. Ambiguous paid requests require an explicit decision before
   resuming. [Studio intake](../src/factory/StudioIntake.tsx) · [Browser runner](../src/factory/browser-production.ts)
4. **Optional worker.** The trusted worker holds its provider key and handles
   unattended runs and configured schedules. The browser receives episode
   checkpoints for the Library. [Worker](../server/main.mjs) · [Scheduler](../server/production.mjs)
5. **Local outputs.** Use a waveform and caption MP4 and a publish package
   for manual review and upload. The render and package operate on episode
   assets and metadata. [Renderer](../src/video/render.ts) · [Publish package](../src/publish/package.ts)
6. **Localized interface.** Simplified Chinese is the source locale. English
   and Malay are available from Settings. Episode language is independent of
   the interface. [i18n guide](I18N.md)

## Implementation status

Evidence date 2026-11-23, `main` at the commit named in [TEST-MATRIX](TEST-MATRIX.md).

| Capability | Status and evidence |
| --- | --- |
| M0 · Browser Studio and Library | **Implemented and run once end to end.** Direct BYOK production with checkpoint recovery, playback and `.kps` transfer, with no worker. One real run produced a 1:53 episode in about 3 minutes with the owner's key and 14 provider calls; no key was found in storage, DOM or IndexedDB records. [E2E trial](E2E-TRIAL-2026-11-23.md) · [Browser runner](../src/factory/browser-production.ts) |
| M1 · Video | **Implemented and run in real Chromium.** Episode view renders an MP4 locally (H.264 plus AAC or the Opus fallback), previews it, supports review and approval. 13.8 MiB for a 2 minute test episode after T49. Safari, phones and memory limits are **UNVERIFIED**. [Video decision](VIDEO-RENDER-DECISION.md) · [Video tests](../tests/factory-video.browser.ts) |
| M2 · Manual publish | **Implemented.** The approved video plus title, description with chapters and sources, tags, thumbnail and a manual-upload checklist download as one ZIP. YouTube acceptance of Opus audio and the AI-content disclosure wording are **UNVERIFIED**; the owner uploads by hand. |
| M3 · Agent | **Implemented in the Studio.** A collapsed Agent panel runs the in-page tool loop with consent for the run and for each paid tool, a live log and cancellation. Covered by mocked provider tests only; a real model-driven run is **UNVERIFIED**. The pi bridge is a no-model spike. [Agent](AGENT.md) · [pi bridge](PI-BRIDGE.md) |
| M6 · i18n and UI/UX | **Implemented.** Three catalogues, runtime locale switch, Intl formatting, catalogue checks and a 12-case Chromium sweep. Native review of English and Malay consent, cost and key-risk copy is **UNVERIFIED**. [I18N](I18N.md) · [UI/UX evidence](UIUX-EVIDENCE.md) |
| M7 · Animation | **Scene interface implemented; first 3D scene in progress.** Waveform is the first scene. A Three.js studio scene was measured in a spike (26.7 ms per 1080p frame on software WebGL, identical frame hashes across runs and worker). Crucible ("67JS", confirmed by the owner) was measured at 113 ms per frame. Visual design and AI storyboard are in progress. [Animation decision](ANIMATION-DECISION.md) |

## Run modes

| Mode | Key location while configured | Worker process |
| --- | --- | --- |
| Browser BYOK | Current tab memory | Optional |
| Worker production | Trusted worker memory, with optional environment provisioning | Required |
| Library playback and backup | No key required | Optional |

The V1 editor, demo tones and V1 backup formats describe the earlier prototype.
[Historical review](REVIEW-2026-11-04.md)
