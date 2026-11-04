# Knowledge Podcast Studio — work in progress

A Mandarin-first local podcast script workspace and keyless simulation for GitHub Pages. This is an **incomplete prototype**, not a production release. The included weather script describes a research question; it contains no claimed five-kilometre rainfall measurements.

## Run locally

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

Vite is configured for `/PWA-Knowledge-Podcast-OpenAI-TTS/`. The preview command prints the complete local URL. The build creates a versioned service worker with a user-confirmed update flow. The service worker precaches build artifacts only, not API responses or project data. Offline access requires one successful online visit and service-worker activation first.

## Demo and privacy

Projects and simulated segment audio stay in IndexedDB on the device and may be deleted if browser data is cleared. The browser's own speech synthesis can read the script aloud; voice and availability depend on the device. The generated WAV files are **synthetic one-second tones, not speech**, and are not representations of OpenAI voices. This demo makes no paid requests and has no API key field. Text transcripts and full-program simulated tone WAVs can be downloaded. JSON backup and restore include scripts and settings, not audio. A script, voice or instructions change marks an existing segment stale. Cancelling preserves completed segments. Existing stale audio is not offered as current.

## Important gaps

- No real OpenAI integration or hosted BYOK gateway exists; `DisabledGatewayProvider` fails closed. A disconnected `GatewayProvider` implements a bounded HTTPS transport contract for a short-lived gateway session, but it is not wired into the UI or validated against a real backend. A real backend needs authenticated sessions, strict origins and CSRF protection, quotas and rate limits, request limits, abuse controls, TLS, cancellation and idempotency policy, sanitized errors, and an explicit cost consent flow. It must keep provider keys out of browser persistence, logs and public assets. A production security review and owner approval are required before activation or hosting.
- This is not yet a complete podcast production flow: real voice comparison, reusable user presets, audio assembly, MP3 encoding, full-program speech WAV, audio-inclusive backup, robust chunk planning, and provider retry/error behavior remain unimplemented. The demo tones are not a replacement for a narrated sample.
- Offline shell, persistence and update were tested in local Chromium only. Firefox, iOS Safari, install prompts, real devices, and quota failures remain unverified.
- The service-worker update test changes a local built worker; it is not proof of a two-release GitHub Pages deployment. Verify deployed behavior separately.

## Provider migration

OpenAI's [text-to-speech guide](https://developers.openai.com/api/docs/guides/text-to-speech) states that `tts-1`, `tts-1-hd`, and `gpt-4o-mini-tts` are scheduled to shut down on 2027-01-06. OpenAI recommends `gpt-realtime-2.1-mini` with the [Realtime API](https://developers.openai.com/api/docs/guides/realtime); it is not a drop-in model for `/v1/audio/speech`. Voice availability must be checked against the model and provider. No real API call has been made by this project.

## Deployment

CI runs on pushes and pull requests. The Pages workflow runs on pushes to `main` and can also be dispatched manually. It runs the security audit, typecheck, unit tests, build, and Chromium E2E tests before publishing. GitHub Pages must be configured to use GitHub Actions in repository settings. Never put API secrets in the frontend, GitHub Pages artifacts, browser storage or this repository.
