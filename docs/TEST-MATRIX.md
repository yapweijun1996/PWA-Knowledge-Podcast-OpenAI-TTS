# Test and device matrix

## November 23 follow-up

| Environment | Observed result |
| --- | --- |
| Native Safari 27.2 on macOS 27.2 | A 10-second local fixture encoded as 1920×1080 H.264 and AAC, loaded bundled fonts and played and sought in the native media element. [Codec evidence](VIDEO-RENDER-DECISION.md#desktop-safari-rendering) |
| Ubuntu ARM64 Chromium 156, `af0dd0d` | Visual QA passed all seven fixtures and 62 automated points, including exact decoded frames and both fallback orientations. [Visual QA](VISUAL-QA.md) |
| macOS Chromium export and review | Studio renders on the dedicated worker, cancels without storing partial output, retains the prior approval on a rejected storage write, and exports the measured timed caption track with its approved video. [Export cases](../tests/factory-video.browser.ts) · [Portrait captions](../tests/factory-video-options.browser.ts) |
| Physical iOS and Android | Sign-off remains open in [Target compatibility](#target-compatibility). |

## Earlier checks

Evidence date 2026-11-23, Node.js 24, macOS, Playwright Chromium 156 (and Google
Chrome 158 for codec probes), `main` at `d4ebde6` plus the documentation update.
The browser suite uses the Factory fixture server (`dist-private`) and mocked
provider responses; the one real-provider run is separate. [Factory configuration](../playwright.factory.config.ts) · [Server fixture](../tests/fixtures/factory-server.mjs)

| Check | Result | Evidence covered |
| --- | --- | --- |
| `npm run typecheck` | PASS | Application, shared pipeline, Vite and tests types. |
| `npm test` | PASS: 199 tests, 198 passed, 0 failed, 1 skipped | Browser key, production lifecycle, worker jobs, backup and playback, i18n and error codes, video with fake encoders, scenes, publish ZIP, text wrapping, agent bridge and panel logic. The skipped test needs the Three.js spike's own dependencies, which CI does not install. |
| `npm run i18n:scan -- --fail-on-found` | PASS: 0 CJK fragments in 57 files | CJK literals outside `src/i18n`. |
| `npm run e2e:factory` | PASS: 38 of 38 in Chromium | 6 agent panel, 1 browser mode, 12 locale and layout sweep, 9 Library and player, 4 rules (key leak, consent, no retry), 2 video (real render, cancel), 4 worker and shell. |
| `PLAYWRIGHT_FACTORY_BROWSER=webkit npm run e2e:factory -- --list` | 1 case listed; WebKit execution `NOT_RUN` | Manual worker Studio creation. |
| `npm audit --audit-level=moderate` | PASS: 0 vulnerabilities | Production and development dependencies. |
| `npm run build` and `npm run build:private` | PASS | Public and private bundles. |
| Clean-clone `npm ci`, type check, tests and build | PASS | Run before pushes that change dependencies, because npm can prune other platforms' optional packages from the lockfile. |
| Real OpenAI, complete run | PASS once, see [trial](E2E-TRIAL-2026-11-23.md) | 14 calls, 1:53 episode, MP4, ZIP, no key found. Listening, cost and continuity are **UNVERIFIED**. |
| Three.js spike (T51) | 26.7 ms median per 1080p frame; hashes identical across runs and worker | Software WebGL2 in headless Chromium. [Animation decision](ANIMATION-DECISION.md) |
| Crucible spike (T54) | 113 ms median per frame; hashes identical | Same fixture. [Animation decision](ANIMATION-DECISION.md) |

## Target compatibility

| Environment | Current status and scope |
| --- | --- |
| Physical iPhone or iPad, Safari and installed PWA | `NOT_RUN`. Offline cold launch, media, rotation, key lifecycle and VoiceOver remain open. |
| Physical Android phone or tablet, Chrome and installed PWA | `NOT_RUN`. Offline cold launch, restore, media and TalkBack remain open. |
| Desktop Safari and Firefox | `NOT_RUN` for this candidate. The selected Playwright WebKit case is a separate environment. |
| Deployed Pages candidate | `NOT_RUN`. Check the served build, CSP, offline Library and update lifecycle at the deployed origin. [Release checks](PRODUCTION-READINESS.md) |
| Real OpenAI, complete Studio run | PASS once (see above). Earlier notes: Earlier Chromium loopback-origin endpoint checks and one short narrator sample are documented. Full-episode delivery, continuity and actual cost remain **UNVERIFIED**. [Provider contract](PROVIDER-CONTRACT.md) |
| Video encode and manual upload | Render and playback PASS in Chromium 156 and Chrome 158 on macOS (H.264 yes; AAC encoder no, Opus yes). Target-device memory, Safari, phones and upload acceptance are **UNVERIFIED**. [Video decision](VIDEO-RENDER-DECISION.md) |
| Locale and accessibility | Chromium sweeps PASS (12 cases). Native review of sensitive English and Malay copy, physical-device assistive technology and field performance are **UNVERIFIED**. [UI/UX evidence](UIUX-EVIDENCE.md) |

The former V1 demo, editor, Firefox cases and deployed upgrade tests describe a
retired interface. See the backlog for the historical scope. [V1 task history](../TASK.md)
