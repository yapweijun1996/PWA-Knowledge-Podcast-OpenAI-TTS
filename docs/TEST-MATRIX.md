# Test and device matrix

## Current checks at `dd6e2f5` on `main`

These results are from the manager’s Mac. Browser runs used Chromium 156–158
with software WebGL. The Factory suite uses mocked provider responses.
[Factory configuration](../playwright.factory.config.ts) · [Server fixture](../tests/fixtures/factory-server.mjs)

| Check | Result | Evidence covered |
| --- | --- | --- |
| `npm run typecheck` | PASS | TypeScript project check. |
| `npm test` | PASS. 306 total, 305 passed, 0 failed, 1 skipped. | The Crucible spike dependency was absent. |
| `npm run i18n:scan -- --fail-on-found` | PASS. 0 findings across 84 files. | CJK text fragments in `src` outside `src/i18n`. Catalogue tests in `npm test` cover zh-CN, en and ms. |
| `npm run build` and `npm run build:private` | PASS | Public and private builds. |
| `npm audit` | PASS. 0 vulnerabilities. | Manager’s dependency audit. |
| `npm run e2e:factory` | PASS. 53/53 tests in two consecutive runs. | Projects `factory`, `render` and `perf`. See the intermittent failure follow-up below. |
| Automated visual QA | PASS. 62/62 points. | The QA frame reader uses `prefer-software` because Chromium’s hardware H.264 decoder failed on the first frame of valid exports on the manager’s Mac. [Visual QA](VISUAL-QA.md) |
| Independent image-only visual reviews | All six scores below the 85% bar. **VISUAL ACCEPTANCE NOT PASSED.** | The reviews scored the same nine stills with the same prompt. The owner decides by viewing real exports. [Review results](VISUAL-QA.md#review-reliability-and-acceptance-policy) |

Browser execution for this documentation update was `NOT_RUN`. The Factory
and automated visual QA results above come from the manager’s runs.

## R1 five-minute Episode export

The Node tests cover the 300 s bounds for source and fitted video, mono and
stereo PCM, both orientations, encoding rates, modeled memory and draw
estimates, and quota boundaries. The manager’s Chromium runs cover an over-limit
WAV, a short-fixture estimate, the accessible disabled reason, a free-space
recheck and IndexedDB quota rollback. Real-device memory at 300 s is
**owner-only, UNVERIFIED**.
[Model tests](../tests/video-limits.test.mjs) · [Options browser cases](../tests/factory-video-options.browser.ts) · [Quota browser cases](../tests/factory-video.browser.ts) · [Owner checklist](OWNER-CHECKLIST.md)

## T1 Episode export at `6c7acfa` on `main`

T1 windowed PCM — typecheck and build PASS. Node tests 313 passed, 0 failed,
1 skipped. i18n scan 0 findings across 85 files. The 30- and 60-minute synthetic
scans read 86,400,044 and 172,800,044 bytes respectively, with a 46,080-byte peak
Float32 request. Browser and real-device memory checks NOT_RUN.

## Intermittent failure follow-up

- The `offline filters…` failure in `tests/factory-library.browser.ts` was
  reproduced in 1 of 60 runs under load on the previous version and in 0 of 60
  on the fixed version. Commit `e0e3c5f` waits for service-worker readiness.
  `src/App.tsx` rereads `navigator.onLine` after subscribing to online and
  offline events.
- `tests/factory-video-options.browser.ts` failed once. The failure was never
  reproduced in follow-up batches, which passed 20/20 and 60/60. Waiting for the
  caption track to be ready is a hardening change based on a hypothesis. Root
  cause is **UNVERIFIED**.

## Earlier checks

Earlier codec, device and live-provider notes document their own fixtures and
revisions. Compatibility and live-provider results from those runs are
**UNVERIFIED** at `dd6e2f5`.
[Video render decision](VIDEO-RENDER-DECISION.md) · [Provider contract](PROVIDER-CONTRACT.md) · [Earlier E2E trial](E2E-TRIAL-2026-11-23.md)

## Target compatibility

| Environment or check | Current status and scope |
| --- | --- |
| Real devices and Safari/iOS | **Owner-only, UNVERIFIED.** Includes physical phones and tablets, native Safari and installed PWA behavior. |
| Desktop Firefox and deployed Pages | **UNVERIFIED** at `dd6e2f5`. [Release checks](PRODUCTION-READINESS.md) |
| Real TTS audio | **Owner-only, UNVERIFIED.** Listening review and USD cost accuracy remain open. |
| Manual YouTube upload | **Owner-only, UNVERIFIED.** YouTube acceptance of Opus audio remains open. |
| Render performance | **Owner-only, UNVERIFIED.** Real-GPU frame timing and export memory at 300 s remain open. |
| Locale copy and naming | **Owner-only, UNVERIFIED.** Malay and English consent and cost copy need native-speaker review. The Malay product name remains an owner decision. |
| Default scene | **Owner-only, UNVERIFIED.** Waveform is the current default pending the owner’s decision. |

The former V1 demo and editor checks describe the retired interface.
[V1 task history](../TASK.md)
