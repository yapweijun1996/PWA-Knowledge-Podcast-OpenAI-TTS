# Test and device matrix

## Current checks at `c22a9fe`

These results are from the manager’s Mac. Browser runs used Chromium 156–158
with software WebGL. The Factory suite uses mocked provider responses.
[Factory configuration](../playwright.factory.config.ts) · [Server fixture](../tests/fixtures/factory-server.mjs)

| Check | Result | Evidence covered |
| --- | --- | --- |
| `npm run typecheck` | PASS | TypeScript project check. |
| `npm test` | PASS. 289 total, 288 passed, 0 failed, 1 skipped. | The skipped test requires a dependency from the Crucible spike. |
| `npm run i18n:scan -- --fail-on-found` | PASS. 0 findings. | CJK text fragments in `src` outside `src/i18n`. |
| `npm run build` and `npm run build:private` | PASS | Public and private builds. |
| `npm audit` | PASS. 0 vulnerabilities. | Manager’s dependency audit. |
| `npm run e2e:factory` | PASS. 51/51 twice in a row. | A separate parallel run had one intermittent failure in `tests/factory-video-options.browser.ts`. Investigation is open. |
| Automated visual QA | PASS. 62/62 points. | The QA frame reader uses `prefer-software` because Chromium’s macOS hardware H.264 decoder failed on the first frame of a valid export during QA. [Visual QA](VISUAL-QA.md) |
| Independent image-only visual review | FAIL. 79.0% (54.5/69) against an 85% acceptance bar. | Only visible criteria from nine stills were scored. [Review status](VISUAL-QA.md#history-and-status) |

Browser execution for this documentation update was `NOT_RUN`. The Factory
and automated visual QA results above come from the manager’s runs.

## Earlier checks

Earlier codec, device and live-provider notes document their own fixtures and
revisions. Compatibility and live-provider results from those runs are
**UNVERIFIED** at `c22a9fe`.
[Video render decision](VIDEO-RENDER-DECISION.md) · [Provider contract](PROVIDER-CONTRACT.md) · [Earlier E2E trial](E2E-TRIAL-2026-11-23.md)

## Target compatibility

| Environment or check | Current status and scope |
| --- | --- |
| Real devices and Safari/iOS | **Owner-only, UNVERIFIED.** Includes physical phones and tablets, native Safari and installed PWA behavior. |
| Desktop Firefox and deployed Pages | **UNVERIFIED** at `c22a9fe`. [Release checks](PRODUCTION-READINESS.md) |
| Real TTS audio | **Owner-only, UNVERIFIED.** Listening review and USD cost accuracy remain open. |
| Manual YouTube upload | **Owner-only, UNVERIFIED.** YouTube acceptance of Opus audio remains open. |
| Render performance | **Owner-only, UNVERIFIED.** Real-GPU frame timing and long-episode memory remain open. |
| Locale copy and naming | **Owner-only, UNVERIFIED.** Malay and English consent and cost copy need native-speaker review. The Malay product name remains an owner decision. |

The former V1 demo and editor checks describe the retired interface.
[V1 task history](../TASK.md)
