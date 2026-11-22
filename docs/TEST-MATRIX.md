# Browser, device and lifecycle evidence

This matrix separates automated evidence from real-world claims. The latest CI
run is authoritative for the exact revision tested; a green check does not
prove provider voice quality or coverage outside the listed cases.

| Environment                                         | Coverage or status                                                                                                                                                                    |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Playwright Chromium in GitHub CI                    | Full free suite: local editing, persistence, demo audio, simulated provider errors, real WebRTC loopback with a mock provider, responsive widths, offline and local update scenarios. |
| Playwright Firefox in GitHub CI                     | Selected free cases: save/reload and stale handling, offline demo and WAV export, and 360/390/768/1280/1440px layout. See the CI result for the specific commit.                      |
| Playwright WebKit in GitHub CI | V1 saves generated audio, reloads offline and exports a WAV. V2 follows a manual Studio fixture through Library persistence and restore. [Factory browser config](../playwright.factory.config.ts) |
| macOS Playwright Firefox in this workspace          | All seven selected V1 Firefox cases passed locally on 2026-11-22, including offline WAV export and responsive layouts.                                                          |
| Deployed GitHub Pages in Chromium                   | Previous releases have been smoke tested for demo flows, mocked provider flows and update/draft preservation; see project status and release history for the exact release.           |
| OpenAI real provider and listening                  | Owner reports speech works, but an independent real-provider completeness and continuity comparison is NOT VERIFIED. Mock responses are not evidence of audible quality.              |
| Installed desktop PWA on Linux ARM64, Chromium 142.0.7444.59 | Installed the public Pages app from Chromium, closed it, disconnected the container network and cold-launched its registered desktop entry. The window reported standalone mode and offline status, restored the saved draft and generated the demo tone. |
| Android 16 emulator, Chrome 133.0.6943.137 | Public Pages opened from a cold browser start in airplane mode, restored the saved draft and generated a demo tone. Chrome offered installation. The account-free Google Play emulator could not complete WebAPK installation. Browser mode was verified. |
| iOS Safari and installed PWA on an iPhone/iPad      | NOT VERIFIED on physical hardware. Desktop viewport emulation is not a device test.                                                                                                   |
| Android Chrome and installed PWA on a phone/tablet  | NOT VERIFIED on physical hardware. Desktop viewport emulation is not a device test.                                                                                                   |
| Firefox real OpenAI WebRTC and interrupted sessions | NOT VERIFIED by the free Firefox cases.                                                                                                                                               |
| Multiple tabs during an update and offline recovery | Chromium automation covers a pending save, interrupted mocked generation, legacy activation rejection, offline recovery and a same-project conflict copy. Physical-device multi-tab behavior remains NOT VERIFIED.                                                                                                                         |
| Screen reader and hardware audio output             | NOT VERIFIED on real devices.                                                                                                                                                         |

For a device check, open the deployed HTTPS URL, create a disposable project,
edit and reload it, generate the keyless demo tone, check playback and download,
install the app where supported, reload offline, and record device/OS/browser
versions and observed results. Do not enter an API key during these free checks.
For a paid test, obtain and record owner budget authorization first, use a
short disclosed fixture with no automatic retry, and record actual charges and
listening results without saving credentials or private audio to documentation.
The owner has authorized up to US$5 for the planned small continuity comparison;
that authorization is not proof that a call or charge occurred.

The deployed two-tab upgrade preserved both drafts offline. A live export check also caught a click during active generation. The full WAV download stays disabled until the operation finishes. The editor reads existing Blob recordings and stores WAV bytes with their media type when WebKit rejects Blob storage. [Offline export regression](../tests/offline-demo.spec.ts)

## V1 recording protection and recovery (2026-11-22)

- At `f08d2a5`, the public build and all five cases in
  [demo-protection.spec.ts](../tests/demo-protection.spec.ts) passed on local
  Chromium. Single and batch demo generation preserve saved OpenAI takes,
  including stale and alternate takes. An all-protected batch makes zero
  project writes, and a stale tab cannot overwrite a take saved by another
  tab. The mixed-project test also checks the protected segment numbers in
  export and preview messages and downloads a demo WAV by segment.
- At `a3e6c60`, the public build and both targeted cases in
  [save-recovery.spec.ts](../tests/save-recovery.spec.ts) passed on local
  Chromium. After downloading the pending WAV, confirming segment deletion
  and saving it, another project can generate without a reload. The cases
  cover a successful save and an injected IndexedDB failure followed by a
  successful retry. The pending WAV remains downloadable during the failure.

These checks used synthetic audio and intercepted OpenAI requests. They
establish local Chromium behavior for the tested revisions.

## Deployed upgrade evidence (2026-11-04)

For the [T12 Pages deployment](https://github.com/yapweijun1996/PWA-Knowledge-Podcast-OpenAI-TTS/actions/runs/41815020765),
Chromium opened two isolated tabs on the previous live release and saved a
different disposable draft in each. After the new worker was deployed, the old
client's update request did not activate it while both tabs remained open, and
an offline reload preserved both drafts. That check did not establish that the
second update request had activated the new worker. A subsequent test requiring
an actual reload exposed a lock handoff bug; the local regression now covers the
corrected handoff. A separate deployed Chromium test exercised same-project
conflict recovery and a simulated quota failure with synthetic audio. These checks made no paid requests
and do not establish real-device behavior.
