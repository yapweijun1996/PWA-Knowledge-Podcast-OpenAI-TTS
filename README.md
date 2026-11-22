# Knowledge Podcast Studio

V2 is a browser-local Podcast Library with an optional trusted production worker. The worker can discover topics, cross-check citations, plan one to three hosts and an adaptive runtime, generate audio, and compare a separate audio transcript to the script. The browser stores the resulting episodes, research, scripts and playable audio for offline use.

## Start the V2 local studio

Use Node.js 24 LTS.

```sh
npm ci
npm run build:private
npm run start:private
```

Open [the loopback workspace](http://127.0.0.1:8787/) to see the Library (**资料库**). Set the worker's OpenAI API key under Settings (**设置**), enter a topic in Studio (**制作台**), or save interests and scheduling preferences in Automation (**自动化**). The worker must stay awake and running.

The **本地编辑器** link opens V1. The Pages build also offers the Library from its workspace link. Browser storage belongs to each origin, so use episode backups to transfer between origins or browsers. See the [V2 runbook](docs/V2-FACTORY.md) for storage, recovery, limits and verification.

## V2 release status and player (2026-11-22)

The V2 implementation and UI Batches 1–3 were merged into `main` at commit `559b7cf56e4877fd12c3b61d28852498df27eebe`. Independent macOS verification passed **95/95 automated tests**: 30 Node tests, 10 V2 Chromium tests and 55 V1 Chromium tests. Type checking, public/private builds and `git diff --check` passed; the production-dependency audit reported zero vulnerabilities. These are **candidate/source QA results**, not evidence of a deployed site, successful paid OpenAI calls or real-device validation. Consult the [independent verification record](docs/V2-FACTORY.md#independent-release-verification-2026-11-22).

The Library now offers local Unicode search, status/language filters, sorting and validated audio status. The V2 shell owns a single audio engine shared across pages, with a desktop bottom bar, mobile mini player, chapters, seek and speed controls. Switching V2 pages preserves the playing source; refresh can restore its position **paused**, after checking the saved WAV. The browser stores episode media in IndexedDB, while lightweight current-tab playback position is stored in session storage. No cross-device sync or guaranteed iOS background playback is provided.

For the complete local worker and offline recovery procedures, use the [V2 runbook](docs/V2-FACTORY.md). A GitHub `main` push does **not** confirm GitHub Pages deployment or worker availability; verify Actions/Pages separately.

## Run the V1 local editor and Pages demo

Use Node.js 24 LTS or newer (CI uses Node 24), then:

```sh
npm ci
npm run dev
npm test
npm run build
npm run preview
npx playwright install chromium
npm run e2e
npm audit
```

Vite is configured for `/PWA-Knowledge-Podcast-OpenAI-TTS/`. The preview command prints the complete local URL. The build creates a versioned service worker with a user-confirmed update flow. Before accepting an update it fetches cache-busted build assets and checks their hashes; a mixed release fails installation and leaves the old version active. The service worker precaches build artifacts only, not API responses or project data. Offline access requires one successful online visit and service-worker activation first.

The admin workspace provides navigation to the script, voice, generation, export and settings sections. Script segments can be moved up or down without discarding their audio. The desktop sidebar can be collapsed, and the mobile navigation opens as a drawer. The style selector reflects the saved narrator instructions and shows Custom for text that does not match a built-in preset. Appearance supports light, dark and system preferences; appearance and sidebar preferences are stored locally. The settings section shows the application version and can check for updates.

## Demo, browser BYOK and privacy

Demo mode requires no key and produces **synthetic one-second tones, not speech**. Browser BYOK mode sends a user-entered OpenAI API key and the script directly from the browser to OpenAI. Select **OpenAI · 浏览器 BYOK**, enter your own key, acknowledge the risk and possible charges, then click generate. No API request is made until generation is clicked. Cancellation or a failed request may still incur charges; requests are not retried automatically.

After the app has been cached by an online visit, demo tones can also be generated offline; OpenAI generation remains unavailable offline. Demo generation skips segments with a saved OpenAI take, including stale and alternate takes. Full WAV export skips blank segments and requires current audio for every nonempty segment, with at least one nonempty segment. If a protected segment blocks full demo export or continuous preview, the app lists the affected segments and points to per-segment downloads for available demo tones.

**Security trade-off:** OpenAI recommends keeping standard API keys on a trusted server. This experimental browser-only design was requested by the project owner and exposes the key to this page's scripts, browser extensions and potentially the device. A malicious script, compromised deployment, extension or shared device could steal it. Use a restricted, budget-limited key on a trusted device. The field is not written to application storage, backups, service-worker caches or logs; it is cleared on page exit, mode change or explicit clear. This does not protect the key against a compromised browser or frontend. The browser sends the script to OpenAI; projects and resulting audio are stored in local IndexedDB and can be lost if browser data is cleared.

Each generated segment must be saved locally before the next segment starts. If saving fails, generation stops and the current audio remains available in the open page for download or an explicit save retry; closing the page can lose that unsaved audio. Retrying the save does not make another provider request.

Before a BYOK batch, the app checks all selected segments against its 4,000-unit per-segment limit and the 2,000-unit instruction limit. Lengths use JavaScript UTF-16 code units, so some characters, including many emoji, count as two. An invalid batch is not sent to OpenAI and the text remains editable.

The owner reports that browser BYOK produced WAV speech; the implementation team has not independently verified that provider session or its audio quality. Remote audio is captured as PCM with an AudioWorklet and encoded as WAV, avoiding a second browser container-decoding step. A muted media-element sink keeps the remote WebRTC audio track active in Chromium while the worklet records it; the sink is detached after the session. After the server reports that its audio buffer is drained, capture waits for audible samples and a two-second quiet tail, with a bounded timeout; this is a heuristic and cannot guarantee that delayed audio is complete. The app checks that capture can start before opening a potentially billable session; browsers without AudioWorklet cannot use this path. A successful preflight or mocked test does not prove provider access, output completeness or narration quality. The API may change. Users must listen to generated audio and verify narration matches the script. Browser speech synthesis is separate and cannot be exported. The current WAV assembly requires compatible sample formats; MP3 is not supported. JSON backup contains scripts and settings but no audio.

OpenAI clips are marked **awaiting listening verification**, including clips saved by older versions. Listen to each clip and compare it with the script before confirming it; the full WAV export requires confirmations. Individual clips remain downloadable before confirmation. This is a human check, not proof that the transport captured all audio, and a truncated clip may need an explicitly initiated, potentially chargeable replacement.

Re-record an existing segment to keep a separate alternate take for listening and comparison. OpenAI re-recording asks for confirmation because it may incur a charge. The current take is retained on failure or cancellation; choosing the alternate swaps the takes. Resolve or explicitly remove an existing alternate before creating another. Script-only backups do not include either take.

The experimental continuity comparison prepares one single-response, one shared-session and three context-reference sessions after explicit consent, with a per-response output limit and no automatic retry. It saves each result before continuing, but the limit is not a dollar cap. Real provider audio and listener results remain unverified; see the [comparison protocol](docs/NARRATION-EVALUATION.md).

Each generation shows its fixed input snapshot. OpenAI takes retain their requested model, voice, instructions and script, plus any model or voice reported by the provider session; absent or unsupported values are shown as unknown, and a reported mismatch is flagged for review. Session metadata does not prove what a listener heard. Older audio may lack provenance. Script-only backups omit audio and provenance.

The optional audio backup is an unencrypted JSON file containing script, both WAV takes and provenance. Audio is limited to 16 MiB total; the file limit is 24 MiB. Treat it as private. Each WAV has a SHA-256 checksum for accidental corruption, not proof of authenticity: import only trusted files. Import creates a separate project, and a failed local save can be retried without changing the source backup. Older script-only backups remain supported. API keys are not included.

Continuous preview assembles current local audio from a selected segment onward without contacting OpenAI. The player supports pause and seek; changing any included segment invalidates the preview. Audio formats must be compatible. Choose no added pause, 0.2 seconds or 0.5 seconds between segments for the preview and full WAV export; original clips remain untouched. This does not smooth clicks or guarantee consistent delivery. A [listening rubric](docs/NARRATION-EVALUATION.md) supports comparison.

Updates wait until other app tabs are closed. If Web Locks are unavailable, close every app page and reopen it to activate a waiting update. Old asset caches are retained for offline recovery and may consume storage. Concurrent changes to the same project are detected on save; the affected tab keeps its local changes and can save a separate conflict copy. Back up important projects before clearing site data.

Release hardening and browser-key limitations are described in [the security notes](docs/SECURITY.md).

## V1 prototype gaps

- The owner reports successful live BYOK speech generation; independent verification of the provider session, completeness, narration continuity and Chinese pronunciation remains outstanding. The original authenticated-gateway requirement was superseded by the owner's explicit browser-only requirement.
- Individual clips use separate sessions and are joined without transition processing; the owner reports inconsistent emotion and pacing between clips. A controlled listening comparison and improvements are planned, not yet implemented.
- Cross-voice comparison, reusable user presets, audio-inclusive backup, full chunk planning, and provider retry/error behavior remain incomplete. There is no automatic retry after an ambiguous paid request.
- Firefox, iOS Safari, real-device installation and multi-tab update behavior remain unverified. Quota-failure injection exposed a batch-continuation issue; single-tab deployed updates were checked separately.

The [prioritized task backlog](TASK.md) and [six-persona review](docs/REVIEW-2026-11-04.md) describe current risks, evidence and proposed next steps.

## V1 provider migration

OpenAI's [text-to-speech guide](https://developers.openai.com/api/docs/guides/text-to-speech) states that `tts-1`, `tts-1-hd`, and `gpt-4o-mini-tts` are scheduled to shut down on 2027-01-06. OpenAI recommends `gpt-realtime-2.1-mini` with the [Realtime API](https://developers.openai.com/api/docs/guides/realtime); it is not a drop-in model for `/v1/audio/speech`. Voice availability must be checked against the model and provider. The team has not independently made a paid provider call as part of its verification.

## Deployment

CI runs on pushes and pull requests. The Pages workflow runs on pushes to `main` and can also be dispatched manually. It runs the security audit, typecheck, unit tests, build, and Chromium E2E tests before publishing. GitHub Pages must be configured to use GitHub Actions in repository settings. Never embed API secrets in source, GitHub Pages artifacts, persistent browser storage or this repository. Browser BYOK exposes a user-entered key to the page runtime as described above.
