# Browser-local podcast studio

## Start and make a show

1. With Node.js 24 LTS, run `npm ci`, `npm run build:private` and `npm run start:private`. Open [127.0.0.1:8787](http://127.0.0.1:8787/) and install via your browser where supported. Keep using the same address and browser profile to see the same Library.
2. In Settings (**设置**), enter one OpenAI API key. A key entered in the app lives in worker memory until process exit or until you clear it. For trusted startup automation you can instead inject `OPENAI_API_KEY` via the process environment or a user-only, gitignored `.env.podcast` (mode 600). Provider access and quota are confirmed on use. The browser never saves the key to IndexedDB, settings or backups.
3. Enter a topic in Studio (**制作台**) and choose automatic casting or exactly two speakers (**恰好两位主持人**). The two-speaker option requires both voices to appear in the script. Check the worker status next to the form. If the worker needs a sign-in or key, follow **前往设置** and return to your draft. The current tab remembers the topic, host selection and pending request ID across a refresh when session storage is available. Reloading clears paid consent. Review the paid request consent and choose **制作整集播客**. In Automation (**自动化**), save interests, allowed languages, host and duration limits, and explicitly enable paid discovery. The worker stays running with the tab closed. Sleeping or stopped machines miss the window and check once when they resume, subject to the rolling quota. There is no background browser timetable.
4. Follow the saved stages in the episode overview. After narration is available, review the finished audio and transcript comparison before opening the research, outline or editable script. Check the citations and listen for accuracy and delivery before sharing. Download WAV directly. If the worker starts with FFmpeg and `libmp3lame` on its PATH it also encodes MP3 locally. Encoding can fail independently; WAV stays available.

For editorial sign-off, follow the [V2 production checklist](V2-PRODUCTION-CHECKLIST.md). It includes the listening and recovery checks still open for the Singapore HDB sample.

## Storage and recovery

- IndexedDB keeps the episode and available audio in one transaction. If WebKit rejects Blob storage, the Library saves the audio bytes and MIME type in the same transaction and restores them as playable Blobs on read. Previously saved Blob records still open as before. The browser downloads each changed checkpoint. When a completed episode with a transcript is committed locally, the browser acknowledges the exact worker revision and the worker releases the spool files. Pending, interrupted, failed and unreceived episodes stay on the worker for recovery. Wait for the browser Library to show the audio before switching machines.
- The Library works offline after the PWA shell has been cached, including playback, script edits, WAV/MP3 downloads, and backup/restore. Export **备份本期节目** for each episode you want to keep. The `.kps` file contains research, script snapshots, transcript and available media, with SHA-256 checks for accidental audio damage. Import creates a separate copy and never submits a paid request. Keep backups private. The existing V1 editor retains its own database and backup formats.
- The browser reports its storage estimate, quota failures and persistent-storage permission. Browser eviction, clearing site data and profile/origin changes can remove or hide episodes even with persistent storage. Tabs on the same origin see changes through IndexedDB and broadcasts; editing checks the revision. Devices and origins do not sync. A second browser can miss a worker item that the first browser has already accepted. Transfer with a backup.
- Keep the worker's data folder private on a local filesystem. Node 24 uses a process-held SQLite lock to enforce one worker per folder, including across different ports. The operating system releases the lock if the worker crashes. Leave the lock file in place while a worker is running. `PODCAST_DATA_DIR` defaults to `~/Library/Application Support/Knowledge Podcast Studio`; it contains pending work, worker schedule settings, and attempt/topic history. The 30-episode spool cap protects disk space. Open the Library to receive finished work and remove unwanted stalled work. Legacy candidate episodes in the folder are also downloaded to the Library; completed episodes without transcripts remain on the worker until verified or removed.
- Failed or cancelled jobs keep matching checkpoints. Allow an explicit retry from the episode panel. A speech or transcription request that already reached OpenAI may incur a charge even when cancelled. An incomplete job still in the spool can reuse matching speech clips. A new render from a changed script keeps the older finished audio available while it renders. When only the transcript is missing, retrying transcription sends the locally verified episode archive to the trusted worker and transcribes its original WAV. Accepted local requests keep replay receipts across later handoffs and deletions.
- Script generation requires the outline's chapter count and receives the allowed claim IDs and supporting claims for each chapter. If a generated script fails validation, the job panel reports the first failed rule, including the chapter or turn and observed limits where applicable. The saved research and outline remain available for an explicit retry.
- Narration sends each turn as quoted script data, with an explicit instruction to read questions aloud. A finished episode still needs listening review because Realtime can depart from the requested wording.

If another browser has already received a finished episode, the first browser can still hold a running checkpoint. After the worker confirms that the episode is absent, the Library unlocks that checkpoint for editing, deletion or explicit continuation. Slow media transfers keep progressing while data arrives. A stalled or incomplete transfer leaves the worker copy available for the next sync.

## Costs, quality and trust

- Scheduled discovery uses at most three search calls per check. There is a rolling 24-hour minimum interval and a user-selected rolling seven-day cap on checks, including skips, cancellations and failures. Adaptive mode checks sooner for time-sensitive, higher-value finds. It can skip duplicate and low-value topics. Manually entered topics and explicit retries are separately authorized. There is no provider-side dollar cap enforced by the app.
- Per episode, research has up to five original and six verification searches, then a plan and script, at most 42 Realtime turns and one automatic transcription attempt. The plan limits the cast to one, two or three voices and caps the result at the configured one to seven minutes. Thin evidence lowers the target. Parts of the episode are kept when limits are exceeded. OpenAI claims and date annotations remain visible. A different URL domain is a corroboration signal and can still cite the same original work. Automatic audio QA checks literal text similarity, some numeric differences and actual duration. Listen for delivery, pronunciation, language switching and factual attribution before sharing.
- Direct loopback trusts the user and other programs on that machine. The worker binds to 127.0.0.1, checks the exact Host and origin for writes, and does not expose credential-bearing routes to other origins. V2 never sends a long-lived key directly from the browser to OpenAI. On a static build or when the worker is unreachable, the Library and V1 editor work with no key, including V1 device speech where the browser supports it.
- For a separately managed private HTTPS access point, set `PODCAST_PUBLIC_ORIGIN` to its exact origin and `PODCAST_OWNER_TOKEN` to a random 32–128 character base64url value. Preserve the public Host header, disable API caching, and keep the proxy and route private. Login uses an expiring, Secure, HttpOnly owner cookie. Browser-local episode copies remain accessible on the same profile after logging out of the worker.
- Worker overrides: `PODCAST_PORT` (8787), `PODCAST_RESEARCH_MODEL` and `PODCAST_SCRIPT_MODEL` (`gpt-5.4-mini`), `PODCAST_AUDIO_MODEL` (`gpt-realtime-2.1-mini`), `PODCAST_TRANSCRIPT_MODEL` (`gpt-transcribe`). See OpenAI's [web search](https://developers.openai.com/api/docs/guides/tools-web-search?api-mode=responses), [Realtime](https://developers.openai.com/api/docs/guides/realtime-conversations) and [file transcription](https://developers.openai.com/api/docs/guides/speech-to-text) documentation.

## Independent QA

```sh
npm run typecheck
npm test
npm run build
npm run build:private
npx playwright install chromium webkit
npm run e2e
npm run e2e:factory
PLAYWRIGHT_FACTORY_BROWSER=webkit npm run e2e:factory
```

Chromium and WebKit share the manual Studio creation test. It selects exactly two speakers, waits for the worker to release the completed episode, reloads the Library offline and exports the WAV and backup. A fresh browser profile imports the backup offline, verifies both scripted speakers and their voices, compares the downloaded WAV with the original bytes, and plays the restored audio. This test uses the fixture provider.

The Node fixture exercises scheduling without a browser, host selection, cross-checks, retry/cancel, transfers, offline-edit rules and backup validation. The Chromium spec exercises the full Library handoff and offline workflow. In this sandbox both browser runs stopped before navigation with `listen EPERM`; run them on a host that can listen on loopback. No live OpenAI requests or real FFmpeg encoding were performed. Verify one short live episode per language, fail/retry behavior with the account in use, real MP3 seek/playback, mobile PWA installation and low-storage recovery on target browsers.

## Independent release verification (2026-11-22)

**Scope:** Podcast Studio V2 plus UI Batches 1–3, committed and fast-forward merged into GitHub `main` as `559b7cf56e4877fd12c3b61d28852498df27eebe`. The remote `refs/heads/main` SHA was read back and matched the local SHA. The main worktree was clean after the push.

| Independent macOS release gate | Observed result |
| --- | --- |
| `npm test` | **30/30 passed** |
| V2 Chromium (`npx playwright test --config playwright.factory.config.ts --reporter=line --workers=1`) | **10/10 passed** |
| V1 Chromium (`npm run e2e -- --reporter=line --workers=1`) | **55/55 passed** |
| TypeScript, public build, private build, Git diff whitespace check | **Passed** |
| `npm audit --omit=dev --audit-level=high` | **0 reported vulnerabilities** |
| GitHub `main` push and remote SHA readback | **Verified** |

These independent runs occurred outside the coding agent's restricted sandbox, which had reported `listen EPERM`. The earlier Batch 2/3 tables below are retained as **coding-agent environment evidence**, not the final release result. An initial V2 Playwright failure used a non-unique `配音预览` text locator; the locator was scoped to one element and the complete 10-test suite passed on rerun. No production player change was needed for that test failure.

**Release boundary:** The source and candidate browser QA are verified. Live OpenAI model access, paid multilingual voice quality, actual FFmpeg/MP3 playback, iOS/Android PWA installation, long-running worker scheduling, private HTTPS access, dollar-denominated cost cutoff and live Pages deployment remain **NOT VERIFIED**. The private worker is not hosted by GitHub Pages. A successful source push must not be described as a production rollout.

**Operational checks before relying on the system:** Confirm the correct browser origin and profile, request persistent storage where supported, export `.kps` backups, verify the worker stays awake for scheduled production, obtain explicit consent before paid calls, and test recovery on the target device. On refresh, playback position may return but audio remains paused until a user gesture. Browser background and lock-screen audio behavior varies by platform.

## Library UI Batch 2

The Library shows locally saved records in an adaptive grid or compact list. Search matches title, topic and language with case-insensitive Unicode normalization. Production status, language and sort order apply together. Reset restores all defaults. The detail stays open when a filter excludes it, and opening another episode or starting a new one still checks for unsaved edits. The card's audio action focuses the existing audio section.

Job status takes precedence on cards. A saved running job without a matching live worker checkpoint appears as last saved progress. The audio indicator separately shows missing or invalid WAV, an earlier revision, or pending review where applicable. The offline-ready indicator requires WAV validation, the current revision, a saved transcript and a matched automatic comparison. Duration comes from the verified WAV bytes. The fallback uses the saved language code. The Library uses the existing IndexedDB records, subscription, and backup and worker handoff paths.

| Check | Result in this worktree |
| --- | --- |
| `npm test` | 25 passed, including three Library model tests. |
| `npm run typecheck`, `npm run build`, `npm run build:private` | All exited successfully. |
| V2 Chromium, `npm run e2e:factory` | Six tests discovered. The server failed before navigation with `listen EPERM` on `127.0.0.1:8797`. |
| V1 Chromium, `npm run e2e` | 55 tests discovered. The server failed before navigation with `listen EPERM` on `127.0.0.1:4173`. |

The added Chromium cases cover keyboard and accessible names, 320/390/768/1200/1440 px at 100% and 200% text size, theme and reduced motion, offline reload, cross-tab edits and deletion, backup restore, and unexpected paid requests. These cases and the visual layout still need browser verification. The macOS test runner required approval under the current policy. The reference mockups were unavailable in the worktree, so the design uses the Batch 1 purple and white tokens.

Checking the saved WAV avoids treating worker metadata as playable on the device, and distinguishing earlier audio from the current script makes the offline state actionable. Search and sort change only what is visible in the Library, which keeps unsaved edits and deep links stable during browsing.

## Persistent player UI Batch 3

The V2 shell hosts one audio element for saved episode WAVs and segment previews. Opening an episode or following **前往音频** leaves the current selection and position in place. **播放本期音频**, an episode chapter button, or **播放片段** explicitly selects verified audio. The desktop bar has a seek control. The mobile bar shows progress, and **展开正在播放** opens the full title, seek control, chapter list and playback speed. Chapter buttons in this panel seek without changing the play or pause state. The Library, Studio, Automation and Settings share the transport. Entering V1 keeps playback running where the browser permits it. Starting V1 playback or device speech pauses V2.

An active WAV is pinned to its episode ID, saved audio revision and asset ID. A script edit can leave the same WAV loaded and mark it as the previous version. An observed replacement, deletion or failed validation releases the source and asks for an explicit selection. The player owns its Blob URL and detaches the element before revoking it. WAV and MP3 download buttons use their own short-lived URLs. IndexedDB and PWA update guards use the existing implementations.

The current tab stores the finished audio identity and playback position in session storage. Refresh revalidates the matching IndexedDB WAV and loads it paused, including offline when the service worker has cached the shell. Segment previews last for the page lifetime. The same-origin tabs receive Library updates independently and maintain their own play positions.

| Check | Batch 3 result in this worktree |
| --- | --- |
| `npm test` | 30 passed, including five playback tests for identity, seek and rate, URL lifecycle, superseded play requests and browser autoplay denial. |
| `npm run typecheck -- --force` | Passed. |
| `npm run build` and `npm run build:private` | Both passed and generated their service workers. |
| `npm run e2e:factory` | 10 discovered with `--list`. Execution stopped before navigation with `listen EPERM` on `127.0.0.1:8797`. |
| `npm run e2e` | 55 discovered with `--list`. Execution stopped before navigation with `listen EPERM` on `127.0.0.1:4173`. |

The macOS test runner required approval, which this session could not grant. A direct Chromium launch also failed with a macOS Mach port permission error. The four new Playwright cases cover continuous navigation and V1 audio arbitration, cross-tab asset changes, offline refresh without autoplay, and the keyboard and layout at 320, 390, 768 and 1280 px with up to 200% text size. Their runtime results and visual fit still need independent browser QA. The worktree and scoped KB-MCP retrieval did not provide the approved images, so the UI follows the supplied concept and the existing V2 tokens. Background or lock-screen behavior on iOS remains device-dependent and unverified here.

The main implementation lesson is that record selection, saved audio identity and transport lifetime change independently. IndexedDB can return fresh Blob wrappers after a metadata edit. Maintaining the loaded source by identity allows those edits to preserve playback while still checking the replacement wrapper and releasing invalidated audio. Node verified the lifecycle with a simulated media element and real Blob URLs. Browser media events, PWA behavior, keyboard focus and layout require browser evidence.

## Reflection

- **Verified knowledge** — The fixture exercised the worker's durable reservation and checkpoint states, independent transcript, versioned handoff, and WAV bytes. Backup recovery rejected a corrupted audio payload and an unsafe citation URL. Browser behavior and provider quality still need their own evidence.
- **Experience** — Snapshot transfer must commit media and metadata together before deleting worker files. Retrying the transcript independently conserves paid work and gives a playable interim result. Closed-tab scheduling had to be tested independently of the PWA shell.
- **KB-MCP candidate** — A reusable workflow for local-first, paid media production with a bounded worker spool, versioned handoff and an offline recovery test. Reassess after independent browser QA. No KB item was written.
