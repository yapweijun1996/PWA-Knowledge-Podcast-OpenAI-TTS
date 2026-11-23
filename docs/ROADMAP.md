# Roadmap: browser-first BYOK podcast studio to YouTube

Owner rule (2026-11-23): **browser first, bring your own key (BYOK), no server
required.** IndexedDB is the system of record. A worker is an optional
upgrade. See [Product direction](PRODUCT-DIRECTION.md) for the decisions and
[TASK.md](../TASK.md) for the task list (T24 onward). The older
[content roadmap](CONTENT-ROADMAP.md) covers editorial topics, not engineering.

Status words: **implemented** (code and tests in `main`), **planned**,
**UNVERIFIED** (a claim nobody has checked in this repository).

## Where the project stands (audited 2026-11-23, source read only)

| Area | State |
| --- | --- |
| Library in IndexedDB (`idb`, db `knowledge-podcast-library`), offline playback, `.kps` backup and restore | implemented |
| Research, outline, script, audio, transcript QA through the Node worker (`server/*.mjs`, about 2,500 lines) | implemented, **requires the worker** |
| Browser-direct generation | **missing**: removed with V1 (`71a53da`); old code at `636fae0` (`src/browser-tts.ts`) |
| Studio without a worker | blocked: `StudioIntake` offers only `no-worker`, `locked`, `no-key`, `working`, `ready` |
| Private build CSP | `connect-src 'self' blob:` blocks `api.openai.com` (`vite.config.ts`); only the public build allows it |
| Video, YouTube upload, agent adapter | not started |

### What can move to the browser

The worker pipeline is mostly pure JavaScript with an injected `openai`
function, so it can be shared instead of rewritten:

- Portable as is: `openai.mjs` (fetch only), `script.mjs`, `research.mjs`,
  `research-audit.mjs`, `claims.mjs`, `transcript.mjs`, `qa.mjs`,
  `languages.mjs`, `errors.mjs`.
- Needs a browser replacement: `audio.mjs` and `mp3.mjs` (use Node `Buffer`;
  the narrator opens `wss://api.openai.com/v1/realtime` with an
  `Authorization` header, which browsers cannot set; V1 used WebRTC
  `/v1/realtime/calls` instead), `jobs.mjs` (filesystem spool), `store.mjs`,
  `production.mjs` (scheduling and filesystem), `http.mjs`, `session.mjs`.
- Worker only, by nature: unattended scheduling (Automation), long runs while
  the page is closed, server-held keys.

### Rules every milestone must keep

1. A key lives in page memory only. Never in IndexedDB, backups, caches, logs,
   URLs or source. Cleared on page exit. The UI says plainly that page code and
   extensions can read it.
2. No paid call without per-run consent and a cost disclosure; estimates are
   labelled as estimates. No automatic retry of an ambiguous paid request.
3. Tests intercept every provider request by default. A real-provider run needs
   the owner's explicit approval, a dollar ceiling and a named operator.
4. Save each result before starting the next paid step; stop the batch when a
   save fails.
5. Nothing uploads to YouTube without an explicit approval; uploads are
   private by default.
6. The Library, playback and backup keep working offline and with no server.

## Milestones

### M0. Restore the owner's rule (T24 to T31) , highest priority

Goal: topic in, finished episode in IndexedDB, with no worker.

Exit criteria:
- A browser-only run (no worker process) creates an episode from a topic and
  saves script and audio to the Library.
- The provider contract is verified once with a small owner-approved call:
  browser CORS and WebRTC behavior for `/v1/responses` (with web search),
  `/v1/audio/transcriptions` and `/v1/realtime/calls` are **UNVERIFIED** today.
- A leak test proves the key is absent from IndexedDB, backups, caches and logs.
- Worker mode still passes its existing tests using the same shared code.

Risks: browser CORS may block an endpoint (fallback: that stage stays
worker-only and the UI says so); a long run can lose the page (mitigation:
stage checkpoints in IndexedDB and resume, never auto-retry paid stages);
realtime audio capture quality (V1 reported WAV output; quality was never
independently verified).

### M1. Video in the browser (T32 to T36)

Goal: an MP4 rendered from an episode, entirely client side.

Approach to prove first (T32): Three.js on a canvas, frames stepped
deterministically, encoded with WebCodecs and muxed with the episode audio.
Fallbacks: ffmpeg.wasm, or a worker-side ffmpeg. Godot is **not** browser
first; keep it as an optional worker or export path (T40), not on the critical
path. Browser support for WebCodecs H.264 and AAC is **UNVERIFIED** on the
owner's devices; T32 tests it.

Exit criteria: deterministic fixture render, cancellation, memory and storage
limits documented, MP4 saved in IndexedDB with a SHA-256 receipt, preview and
approve or reject in the Studio.

Risks: mobile memory limits, large IndexedDB blobs and eviction, Safari codec
gaps.

### M2. YouTube upload (T37, T38)

Goal: approved video published privately, then made public by the owner.

Approach: Google Identity Services token flow in the browser with the minimum
upload scope, tokens in memory only, resumable upload. Facts to **verify before
building**: whether an unaudited Google Cloud project is restricted to private
uploads (documented for projects created after July 2020), the daily quota
cost of an upload, and YouTube's disclosure setting for AI-generated content.

Exit criteria: mocked-API tests; one real private upload only with the owner's
approval; audit log; failure recovery for an interrupted upload.

### M3. Agent integration (T39)

Goal: the pi coding agent in the browser can drive research, script and scene
generation through one narrow interface, with the owner's OpenAI key.

The pi agent's browser integration surface is **UNVERIFIED** here; T39 starts
with the owner showing what pi exposes (extension API, page embedding or
message protocol). Until then the interface stays provider-neutral.

### M4. Optional worker and Godot (T40, T41)

Automation scheduling and long unattended runs stay worker features, clearly
labelled optional. Godot rendering is evaluated as a worker or export path.

### M5. Release hardening (T42, T43)

Release gates, real-device and offline checks, storage quota handling for video,
documentation, and a rollback note. Update
[the production checklist](V2-PRODUCTION-CHECKLIST.md) for video and upload.

## Suggested order

M0 (T24, T25, T26, T27, T28, T29, T30, T31) then M1 (T32 to T36), then M2, then
M3. M4 and M5 run alongside once M1 exists. T32 (render spike) may run in
parallel with M0 because it needs no provider key.

## Owner decisions needed

1. Approve a small provider contract check for T24 (which calls, dollar
   ceiling, who runs it).
2. What the pi coding agent exposes in the browser (for T39).
3. A Google Cloud project for YouTube, and whether it may stay unaudited and
   private for the first release.
4. The first video style (waveform and captions, or avatars) for T34.

## Non-goals for now

Multi-user accounts, cloud sync, payment, a hosted server, and a mobile native
app.
