# Production readiness checklist

Record the candidate SHA and CI run before promotion. The standard browser
app, optional worker and episode delivery have distinct checks. Current
execution and compatibility evidence is in the [test matrix](TEST-MATRIX.md).

## Verify a release candidate

Run the reusable CI workflow on Node.js 24 from a clean checkout. The browser
suites use the private build with the Factory fixture server. [CI workflow](../.github/workflows/ci.yml) · [Browser config](../playwright.factory.config.ts)

| Gate | What it checks |
| --- | --- |
| `npm ci` and `npm audit --audit-level=moderate` | Installs from the lockfile and fails the dependency audit for known advisories at moderate severity or higher. |
| `npm run typecheck` and `npm test` | Checks application types and executes the Node suite, including checkpoint and consent logic, app data and worker paths, catalogue parity, and render and package tests with fixtures. |
| `npm run i18n:scan -- --fail-on-found` | Requires zero CJK fragments in the scanned TypeScript and TSX outside the catalogues. Runtime locale behavior is covered by the Chromium sweep. |
| `npm run build` and `npm run build:private` | Creates both distributable app shells and their service workers. |
| `npm run e2e:factory` | Runs the full Chromium suite including Library and playback, worker flows, locale and layout checks, and browser BYOK consent, unknown-outcome and key-surface tests. Guarded contexts require explicit provider mocks. |
| `PLAYWRIGHT_FACTORY_BROWSER=webkit npm run e2e:factory` | Checks the manual worker Studio path, Library handoff and offline recovery in Playwright WebKit. |
| `node scripts/package-worker.mjs` and `node scripts/verify-worker.mjs` | Packages and starts the standalone worker in a separate directory, then verifies its keyless local service. |

The audit and browser tests have distinct evidence scopes. Release approval
also needs the checks below for the modes and formats being promoted.
[Audit and release steps](../.github/workflows/ci.yml) · [Key guard](../tests/fixtures/guards.ts) · [Worker artifact verification](../scripts/verify-worker.mjs)

## Public Pages app and browser BYOK

- [ ] **Release owner — confirm the deployed revision.** Record the tested candidate SHA and its Pages run. Check the live shell, manifest, service worker and built CSP. Compare the served worker digest with the release artifact and keep a known-good SHA for rollback. [Pages workflow](../.github/workflows/pages.yml) · [CSP](../config/csp.ts)
- [ ] **Release owner — check offline recovery and updates.** Import a disposable `.kps` in the live browser Library. Wait for the service worker, reload offline, then play and export it. Repeat after updating an existing profile while keeping a prior backup. [Library fixture](../tests/factory-library.browser.ts) · [Service worker builder](../scripts/build-sw.mjs)
- [ ] **Release owner — check the browser key boundary.** Confirm Studio works with no worker, the estimate appears before consent, and an ambiguous request requires an explicit decision before further paid work. Use fake keys and mocks for leak checks. For a separately authorized paid pilot, record scope and operator and reconcile actual usage. [Rules tests](../tests/factory-rules.browser.ts) · [Security](SECURITY.md)
- [ ] **Release owner — check all three locales.** Verify the live switch, document and episode language, consent, estimate and unknown-outcome states, keyboard focus and layouts. Record device and locale coverage and the native reviewer and date for sensitive English and Malay copy. [i18n guide](I18N.md) · [UI/UX standard](UIUX-STANDARD.md)

## Optional worker

- [ ] **Operator — verify startup and access.** Build the private app, set a private and durable `PODCAST_DATA_DIR` and use one worker per directory. Verify the keyless session endpoint and Library. When using a private HTTPS proxy, check that the protected episode endpoint returns 401 before login and after logout, and that API responses use `Cache-Control: no-store`. [Worker setup](V2-FACTORY.md#optional-worker) · [Worker access tests](../tests/factory.test.mjs)
- [ ] **Operator — verify scheduling and usage.** Start with Automation disabled. For the intended host, verify startup after reboot, behavior after sleep and interruption, provider access, usage visibility and the schedule's attempt limits. Record how failures are monitored. [Scheduler](../server/production.mjs)
- [ ] **Operator — demonstrate recovery.** Export a browser `.kps`. With the worker stopped, copy the complete private data directory including schedule state and handoff receipts. Restore to an isolated origin, port and profile using a clean environment without provider credentials. Verify pending stages and handoff receipts before re-enabling Automation. [Storage and recovery](V2-FACTORY.md#storage-and-recovery) · [Worker store](../server/store.mjs)

## Episode delivery and target devices

- [ ] **Release owner — verify real video rendering.** Render a representative episode and check intended dimensions, waveform and captions, A/V sync, cancellation, reload recovery and low-storage behavior. Record codec, memory and elapsed time on each supported target. [Renderer](../src/video/render.ts) · [Video evidence](VIDEO-RENDER-DECISION.md)
- [ ] **Release owner — verify the publish package.** Unzip the delivery package, play the MP4 independently, check chapter offsets, metadata, thumbnail, sources and disclosure, and record compatibility with the intended manual upload. [Package builder](../src/publish/package.ts) · [Episode sign-off](V2-PRODUCTION-CHECKLIST.md)
- [ ] **Release owner — check physical devices.** Run the offline Library, playback, seek, export and restore from a fresh and installed profile on the intended iOS and Android devices. Exercise VoiceOver or TalkBack and record OS, browser, installed mode and observed behavior. [Device matrix](TEST-MATRIX.md)
- [ ] **Editor — sign off the episode.** Record a fluent listening review, source and script checks, cost reconciliation and recovery before distributing the approved files. [Episode sign-off](V2-PRODUCTION-CHECKLIST.md)

## When a release fails

| Trigger | Immediate action and evidence before resuming |
| --- | --- |
| Mixed Pages build, lost draft or broken offline shell | Pause promotion, preserve browser data and restore the known-good build through the Pages workflow. Verify live artifacts, offline restore and existing profiles before resuming. |
| Worker checkpoint or handoff failure | Pause Automation and preserve the spool and browser backups. Verify the prior build against an isolated copy. Compare saved checkpoints, receipts and attempts before restoring production. |
| Unexpected spend or suspected key exposure | Cancel any active run and pause worker scheduling as applicable. Revoke exposed credentials, reconcile provider usage and check both browser and worker key paths before resuming. |
