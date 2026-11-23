# Browser-local podcast studio

## Browser mode

1. Open the static app or run `npm run build` and `npm run preview` from a
   Node.js 24 checkout with dependencies installed. Use the same origin and
   browser profile to reopen the same Library.
2. In Settings, select a UI language and enter a browser OpenAI key. Acknowledge
   the key exposure. After setting the key, Studio can produce directly in
   the browser. Reloading or leaving the page clears the key. The Library can
   open saved episodes without a key. [Settings](../src/factory/Preferences.tsx)
3. Enter a topic in Studio and choose automatic casting or exactly two hosts.
   Review the estimate and check the consent for this run before producing.
   Studio saves research, outline, script, narration and transcription
   checkpoints to the Library. Reloading clears consent. If a saved run needs
   to continue, set the key again and review the new estimate and consent.
   [Intake and continuation](../src/factory/StudioIntake.tsx) · [Browser runner](../src/factory/browser-production.ts)
4. Review the sources, script, playable WAV and transcript comparison in the
   episode. Listen to the entire WAV before sharing. [Episode workspace](../src/factory/Episode.tsx) · [Episode sign-off](V2-PRODUCTION-CHECKLIST.md)

## Optional worker

Run `npm ci`, `npm run build:private` and `npm run start:private` on Node.js 24,
or use the [prebuilt worker](../deploy/WORKER.md). Open
[the loopback workspace](http://127.0.0.1:8787/). Configure the worker key in
Settings or inject `OPENAI_API_KEY` through the process environment. The
startup command also accepts a private, gitignored `.env.podcast`. A key
entered in worker Settings lives in worker memory until cleared or the
process stops. When both modes are ready, Studio lets you choose where the
run executes. [Mode selection](../src/factory/StudioIntake.tsx) · [Worker startup](../server/main.mjs) · [Credential handling](../server/production.mjs)

Keep the worker running for unattended schedules. In Automation, set topic
interests, languages, host and duration limits, then explicitly enable paid
discovery. A sleeping or stopped host misses scheduled work and checks once
when it resumes, subject to its rolling attempt limit. The worker can encode
MP3 when FFmpeg and `libmp3lame` are available. WAV remains available if MP3
encoding fails. [Automation](../server/production.mjs) · [MP3 support](../server/mp3.mjs)

For a private HTTPS reverse proxy, configure an exact `PODCAST_PUBLIC_ORIGIN`
and a separate random 32–128 character base64url `PODCAST_OWNER_TOKEN`.
Preserve the intended Host header and bypass proxy caching for API responses.
Sign-in uses a Secure, HttpOnly owner cookie. Local Library copies stay in the
browser profile after worker logout. [Security model](SECURITY.md#optional-trusted-worker) · [Session implementation](../server/session.mjs)

## Storage and recovery

- The Library writes episode metadata and media in one IndexedDB transaction.
  Its audio-byte fallback supports browsers that reject storing Blobs. After
  caching the shell, the same origin and profile can open saved episodes, edit
  scripts, play and download saved media, and import or export backups offline.
  [Library storage](../src/factory/library.ts) · [Worker and offline fixture](../tests/factory.browser.ts)
- Export a private `.kps` to move an episode between browsers or origins.
  Import creates a separate local copy. The backup contains episode data and
  available audio with SHA-256 checks for accidental corruption. It can include
  private text and media. Its hashes verify integrity of the audio bytes.
  [Backup format](../shared/episode-backup.ts) · [Backup tests](../tests/factory.test.mjs)
- In worker mode, keep the worker running until the receiving Library shows
  the finished audio. The browser acknowledges the exact revision only after
  committing it locally. The worker can then release the spooled files.
  Interrupted or unreceived episodes stay available on the worker. Use a
  private local `PODCAST_DATA_DIR` and run one worker per directory. The
  process-held SQLite lock enforces this, including across ports. Preserve
  the entire directory when backing up the worker. [Handoff](../src/factory/Factory.tsx) · [Worker store](../server/store.mjs) · [Process lock](../server/worker-lock.mjs)
- Browser storage can be cleared or evicted. Back up important episodes before
  changing origins or browser profiles. Review quota or save errors before
  resuming. Browser production stops when it cannot save a checkpoint.
  [Browser runner](../src/factory/browser-production.ts) · [Save-failure tests](../tests/browser-production.test.mjs)

## Costs and review

A run may send your topic, research inputs, script, or WAV to OpenAI as
needed for the stage. Browser mode presents usage estimates, and actual charges
are reported by the provider. Cancellation or a dropped connection after a request
can still incur a charge. Studio preserves the last saved browser checkpoint
and requires an explicit continuation with fresh consent for an unknown paid
outcome. Check the provider account before choosing to continue.
[Cost and continuation controls](../src/factory/StudioIntake.tsx) · [Provider adapter](../shared/pipeline/openai.ts)

Review the clipped or stitched audio, names, numbers and source attribution
against the approved script. Automatic QA compares the transcript, number
sequences and duration. See the sign-off checklist for listening and factual
review. [QA implementation](../shared/pipeline/qa.ts) · [Episode sign-off](V2-PRODUCTION-CHECKLIST.md)

## Video and publish modules

The local renderer uses waveform and caption scenes, WebCodecs and MP4
muxing. The agent tools can render a measured timeline from saved audio
and build a ZIP with publishing materials. The tools retain artifacts in a
separate IndexedDB store. Studio render preview, approval, and ZIP download
through the main interface are **UNVERIFIED**. The owner uploads manually
after checking the rendered file and its metadata. [Renderer](../src/video/render.ts) · [Agent tools](../src/agent/tools.ts) · [Artifacts](../src/agent/artifacts.ts) · [Video evidence](VIDEO-RENDER-DECISION.md)

## Independent QA

The [test matrix](TEST-MATRIX.md) records the current counts, commands and
coverage. The [provider contract](PROVIDER-CONTRACT.md) records the earlier
single-endpoint Chromium checks. The [production readiness checklist](PRODUCTION-READINESS.md)
covers candidate promotion and target-host recovery.
