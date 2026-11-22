# Production readiness checklist

Use this checklist to decide which parts of Knowledge Podcast Studio to release. The public Pages demo, a single-owner V2 worker and a finished episode have different acceptance tests.

## Release decision on 2026-11-22

| Scope | Decision | Evidence and next gate |
| --- | --- | --- |
| Public Pages demo, desktop Chromium | **Ready for the tested keyless workflow.** | On the live site, a disposable draft survived an offline reload. The editor generated a demo tone offline and exported a RIFF WAV with zero provider requests in the export test. An installed Linux Chromium app also cold-started from its desktop entry offline and recovered the draft. [Live demo](https://yapweijun1996.github.io/PWA-Knowledge-Podcast-OpenAI-TTS/) · [Export test](../tests/offline-demo.spec.ts) · [Draft test](../tests/studio.spec.ts) |
| V2 worker, trusted loopback | **Ready for supervised single-owner use. Unattended paid operation still needs a target-host trial.** | The actual Node worker started against an empty directory with no key. The session reported local production and no configured credential. A synthetic tone passed through the worker's FFmpeg MP3 encoder and decoded locally. The dated Mandarin sample has a recorded render. Its listening review, export playback, cost and backup restore are still open. [Worker runbook](V2-FACTORY.md) · [Sample review](V2-PRODUCTION-CHECKLIST.md#singapore-hdb-sample-review) |
| Private HTTPS access | **Owner-session behavior verified through a local TLS proxy.** | Sign-in opened the protected episode list, API responses used `no-store`, logout closed access, and a cold restart invalidated the previous cookie. Repeat the access test against the configured deployment origin. [Session implementation](../server/session.mjs) |
| Mobile | **Android browser mode verified on an emulator. Physical-device and installed mobile claims remain open.** | Chrome on Android 16 cold-started offline, restored the draft and generated a demo tone. The account-free Play Store image offered Install and could not issue the WebAPK. [Device matrix](TEST-MATRIX.md) |

**Prior release evidence.** Application revision `359501f` passed Node 24 type checking, both builds, 45 Node tests and the dependency audit. GitHub CI passed 62 V1 Chromium, 11 V2 Chromium, one V2 WebKit manual Studio case and seven selected V1 Firefox cases. A local Node 24 build matched the live `sw.js` SHA-256 (`6f4c13ceb5f2e4af047a51b5c669c6fc40fc1775edd6c0d881ea40216be7c318`). The subsequent documentation revision `15f94d8` added the sample review. These counts describe the linked runs. [CI run](https://github.com/yapweijun1996/PWA-Knowledge-Podcast-OpenAI-TTS/actions/runs/45031108288) · [Pages deployment](https://github.com/yapweijun1996/PWA-Knowledge-Podcast-OpenAI-TTS/actions/runs/45031108286)

The 2026-11-22 release candidate passed 50 Node tests, 63 public Chromium cases, 13 private Chromium cases, a public offline WAV case and a private Studio case in WebKit, and seven public Firefox cases locally. A clean extracted worker answered the keyless session and served the private app. The release workflow repeats these checks before publishing. [CI workflow](../.github/workflows/ci.yml)

The recovery tests exercise original-WAV transcription after backup import, repeated and outdated paid requests, recovery after a worker loses a checkpoint, a slow audio download, and exclusive ownership of the spool after a crash. Release automation also extracts and starts the private worker as a standalone distribution. [Worker tests](../tests/factory.test.mjs) · [Browser recovery](../tests/factory.browser.ts) · [Process recovery](../tests/worker-lock.test.mjs) · [Packaged runtime check](../scripts/verify-worker.mjs)

## Verify a release candidate

Start from a clean checkout of the candidate on Node 24. Run the following in order. Browser tests use the built artifacts and free fixtures. Run the preview suites with ports 4173 and 8797 available so they exercise this checkout. [CI workflow](../.github/workflows/ci.yml) · [Factory browser selection](../playwright.factory.config.ts) · [Firefox selection](../playwright.firefox.config.ts)

```sh
npm ci
npm audit --audit-level=moderate
npm run typecheck
npm test
npm run build
npm run build:private
npx playwright install --with-deps chromium firefox webkit
npm run e2e
npx playwright test tests/offline-demo.spec.ts --browser=webkit
npm run e2e:factory
PLAYWRIGHT_FACTORY_BROWSER=webkit npm run e2e:factory
npx playwright test --config playwright.firefox.config.ts
```

### Public Pages demo

- [ ] **Release owner — verify the tested deployment.** Record the candidate SHA and the Pages run showing successful verification and deployment for that SHA. The release calls the reusable CI workflow and publishes the tested `dist` directory to Pages. The same run provides a separate downloadable private worker. Confirm the live project URL serves the expected shell, manifest and service worker. Compare the served worker digest with the candidate artifact. A documentation-only change can produce identical assets. [Pages workflow](../.github/workflows/pages.yml) · [Service worker builder](../scripts/build-sw.mjs) · [GitHub Pages hosting](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
- [ ] **Tester — repeat the live offline smoke.** In a fresh profile, create a disposable V1 draft. Wait for its save and service-worker activation, reload offline, generate a demo tone and download the WAV. Check the draft text, the RIFF file and the absence of provider traffic. For a changed app build, open two different drafts on the prior release. Confirm the update waits while both tabs are open. Save both drafts, close one tab, accept the update from the other, then reopen and check both drafts. Preserve a known-good SHA for rollback. [Update and conflict tests](../tests/multitab-update.spec.ts)
- [ ] **Release owner — confirm the key boundary.** Keep the public demo usable without a key. Review the built CSP and the policy tests. V1 browser BYOK is an explicit experimental mode where page code can read a user-entered key. Keep operator credentials on the trusted V2 worker. [Security notes](SECURITY.md) · [OpenAI key guidance](https://help.openai.com/en/articles/5112595-best-practices-for-api-key-safety)

### V2 private worker

- [ ] **Operator — prove startup and access on the target host.** Build `dist-private`, set a private, durable `PODCAST_DATA_DIR`, and run one worker per directory. Verify the loopback Library and `GET /api/studio/session` before adding a key. For a private proxy, use the exact HTTPS origin and owner token from the runbook. From a fresh profile, verify `GET /api/studio/episodes` requires sign-in (401), the signed-in owner can open it, API responses have `Cache-Control: no-store`, and logout restores the 401. The session endpoint itself is readable before login. Local Library copies persist after logout. [Worker setup](V2-FACTORY.md) · [Session](../server/session.mjs) · [HTTP routes](../server/http.mjs)
- [ ] **Operator — establish spending controls.** Start with Automation disabled. For a paid pilot, record the approved project, languages, budget and reviewer privately. Check model access, usage visibility, alert recipient and whether hard-limit enforcement is enabled. Allow for enforcement delay. The worker reserves discovery attempts before calling OpenAI and limits their frequency. Manual topics and explicit retries can add charges. Reconcile the pilot's actual usage before enabling a schedule. [Scheduler](../server/production.mjs) · [OpenAI project spend controls](https://help.openai.com/en/articles/9186755-managing-projects-in-the-api-platform)
- [ ] **Editor — approve the production result.** Run the per-episode checklist for each language and delivery format being offered. Record source checks, a fluent listener's sign-off, export playback and a successful restore. Provide a clear AI-voice disclosure where the listener receives the episode. [Episode sign-off](V2-PRODUCTION-CHECKLIST.md) · [OpenAI voice guidance](https://developers.openai.com/api/docs/guides/text-to-speech)
- [ ] **Operator — demonstrate recovery of both data stores.** After handoff, export a private `.kps` from the receiving browser. Open the intended origin online in a second profile and wait for service-worker activation. Import the backup, reload offline and play it. Separately, stop the worker and take a consistent copy of its entire data directory, including pending episodes, `production.json` and hidden `.receipts`. Start one isolated worker on a different port against the copied directory. Use a clean checkout without `.env.podcast` and unset `OPENAI_API_KEY` for that process. Confirm `configured: false` in the session response and disable Automation on the copy before restoring credentials. Verify pending stages, schedule history and handoff receipts. Record recovery time and how much work could be lost since the last backup. V1 has distinct script-only and audio-inclusive JSON exports. [Storage and recovery](V2-FACTORY.md#storage-and-recovery) · [Worker store](../server/store.mjs) · [Browser storage and eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)
- [ ] **Operator — observe one scheduled window before unattended use.** On the intended always-on host, verify startup after reboot and what happens after sleep, interruption and a full spool (30 episodes). Use fixtures or a disposable data directory for fault drills. Record next check, last attempt, failed/interrupted jobs, free disk space and provider usage. Name who checks these signals, when they intervene and how they are contacted. Verify notification delivery if the host supplies alerts. [Worker startup](../server/main.mjs) · [Checkpoint and retry behavior](../server/jobs.mjs)

### Target devices

- [ ] **Device tester — check each advertised platform.** On a physical iPhone/iPad and Android device as applicable, install from the intended origin, save a disposable episode, cold-start offline, play, seek, export and restore. Check interruption and lock-screen playback if offered. Exercise the player and update prompt with VoiceOver or TalkBack. Record OS/browser versions, installed mode and failures. For performance claims, agree on a device and loading/playback target, then record measurements on that device. [Device matrix](TEST-MATRIX.md)

## When a release fails

| Trigger | Immediate action | Evidence before resuming |
| --- | --- | --- |
| Pages serves a mixed build or an update loses a draft | Pause promotion. Preserve browser data. Revert the offending application change through a new commit and run the normal Pages workflow for the known-good application version. | Match the live assets to the rollback build, then repeat the draft and offline WAV checks with an existing profile and a fresh one. |
| Worker loses a checkpoint, fails after upgrade or cannot save audio | Disable Automation and stop the worker. Preserve the current spool and export available Library records. Test the prior worker build against an isolated, compatible copy before restoring service. | Verify the saved script revision and playable audio. Compare receipts and recent attempts with the pre-incident state before enabling production. Restoring an older schedule can repeat paid work. |
| Unexpected spend or suspected key exposure | Disable Automation, cancel any active episode separately and stop the worker if necessary. Revoke an exposed key at the provider. Check for an environment key as well as a session key. | Reconcile usage and in-flight requests, rotate credentials, confirm the worker's key mode and obtain approval for another paid run. Keep keys, scripts, audio and private backups out of the incident record shared publicly. |

For each applicable gate, record **candidate SHA, environment, owner, date, pass/fail/open and evidence link** in the release notes. Keep sensitive evidence private. A failed or open gate holds the feature or deployment mode it covers. Document the narrower scope when releasing a verified subset.
