# Test and device matrix

T30/T31 worktree on Node.js 24. The browser numbers are discovery counts
from the listed commands. The current suite uses the Factory fixture server
and synthetic provider responses. [Factory configuration](../playwright.factory.config.ts) · [Server fixture](../tests/fixtures/factory-server.mjs)

| Check | T30/T31 result | Evidence covered |
| --- | --- | --- |
| `npm run typecheck` | PASS | Application, shared pipeline and Vite types. [TypeScript configuration](../tsconfig.json) |
| `npm test` | PASS, 152 passed, 0 failed, 0 skipped | Node suites include browser key and production lifecycle, worker jobs and handoff, backup and playback, i18n, video with fake encoders, and publish ZIP structure. [Node suites](../tests/) |
| `npm run i18n:scan -- --fail-on-found` | PASS, 0 CJK fragments in 0 of 47 files | Detects CJK literals, JSX text and template fragments under `src` outside `src/i18n`. [Scan](../scripts/i18n-scan.mjs) |
| `npm run e2e:factory -- --list` | PASS, 30 cases in 5 files listed. Chromium execution `NOT_RUN`. | 4 browser rules, 1 Studio mode, 9 Library and player, 4 worker and shell, 12 locale and layout. [Browser rules](../tests/factory-rules.browser.ts) · [Studio mode](../tests/factory-browser-mode.browser.ts) · [Library](../tests/factory-library.browser.ts) · [Worker flow](../tests/factory.browser.ts) · [Locale sweep](../tests/factory-i18n-sweep.browser.ts) |
| `PLAYWRIGHT_FACTORY_BROWSER=webkit npm run e2e:factory -- --list` | PASS, 1 case in 1 file listed. WebKit execution `NOT_RUN`. | Manual worker Studio creation through Library save, offline playback and backup restore. [Selection](../playwright.factory.config.ts) · [Manual case](../tests/factory.browser.ts) |
| Audit, public/private builds and packaged worker startup | `NOT_RUN` in this worktree | Configured CI gates. [CI](../.github/workflows/ci.yml) |

## Target compatibility

| Environment | Current status and scope |
| --- | --- |
| Physical iPhone or iPad, Safari and installed PWA | `NOT_RUN`. Offline cold launch, media, rotation, key lifecycle and VoiceOver remain open. |
| Physical Android phone or tablet, Chrome and installed PWA | `NOT_RUN`. Offline cold launch, restore, media and TalkBack remain open. |
| Desktop Safari and Firefox | `NOT_RUN` for this candidate. The selected Playwright WebKit case is a separate environment. |
| Deployed Pages candidate | `NOT_RUN`. Check the served build, CSP, offline Library and update lifecycle at the deployed origin. [Release checks](PRODUCTION-READINESS.md) |
| Real OpenAI, complete Studio run | `NOT_RUN` for this candidate. Earlier Chromium loopback-origin endpoint checks and one short narrator sample are documented. Full-episode delivery, continuity and actual cost remain **UNVERIFIED**. [Provider contract](PROVIDER-CONTRACT.md) |
| Video encode and manual upload | `NOT_RUN` for this candidate. The previous desktop probe recorded codec support. Target-device memory and storage, publish file playback and upload acceptance remain **UNVERIFIED**. [Video decision](VIDEO-RENDER-DECISION.md) |
| Locale and accessibility | `NOT_RUN` for this candidate's browser checks. The prior T47 record covers Chromium sweeps. Native review of sensitive English and Malay copy, physical-device assistive technology and field performance remain **UNVERIFIED**. [T47 evidence](UIUX-EVIDENCE.md) · [Review standard](UIUX-STANDARD.md) |

The former V1 demo, editor, Firefox cases and deployed upgrade tests describe a
retired interface. See the backlog for the historical scope. [V1 task history](../TASK.md)
