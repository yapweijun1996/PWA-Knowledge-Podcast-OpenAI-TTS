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

| Capability | Status and evidence |
| --- | --- |
| M0 · Browser Studio and Library | **Implemented.** Direct BYOK generation, checkpoint recovery, playback and `.kps` transfer. T30/T31 browser execution and live full-episode quality are **UNVERIFIED**. [Browser runner](../src/factory/browser-production.ts) · [Test matrix](TEST-MATRIX.md) |
| M1 · Render | **Core module implemented.** Canvas waveform and captions, WebCodecs and MP4 hashing. Target-device performance and Studio review are **UNVERIFIED**. [Render tests](../tests/video-render.test.mjs) · [Video evidence](VIDEO-RENDER-DECISION.md) |
| M2 · Manual publish | **Core module implemented.** Local ZIP packaging and agent export. Studio UI download and upload acceptance remain **UNVERIFIED**. [Package tests](../tests/publish-package.test.mjs) · [Agent tools](../src/agent/tools.ts) |
| M3 · Agent and pi | **In-page loop and tools implemented.** The optional pi loopback spike has limited evidence. Model-driven bridge use remains **UNVERIFIED**. [Agent tests](../tests/agent.test.mjs) · [Bridge evidence](PI-BRIDGE.md) |
| M6 · i18n | **Implemented.** Three catalogues, runtime locale switch, Intl formatting, catalogue checks and browser sweep. Sensitive-copy native review remains **UNVERIFIED**. [i18n tests](../tests/i18n.test.mjs) · [UI/UX evidence](UIUX-EVIDENCE.md) |

## Run modes

| Mode | Key location while configured | Worker process |
| --- | --- | --- |
| Browser BYOK | Current tab memory | Optional |
| Worker production | Trusted worker memory, with optional environment provisioning | Required |
| Library playback and backup | No key required | Optional |

The V1 editor, demo tones and V1 backup formats describe the earlier prototype.
[Historical review](REVIEW-2026-11-04.md)
