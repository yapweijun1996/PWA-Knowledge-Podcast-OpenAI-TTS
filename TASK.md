# Improvement backlog

Baseline: reviewed `main` at `c18280e` on 2026-11-04. This is a planning
backlog, not a list of completed features. See the [six-persona review](docs/REVIEW-2026-11-04.md)
for evidence, assumptions, and review limits. The owner reported that real
browser BYOK can now produce WAVs, but that the same narrator sounds
discontinuous across segments. The reviewers did not independently listen to
those WAVs or make paid OpenAI calls.

## Constraints and priority

- Preserve the owner's explicit **browser-only BYOK, no required server**
  decision. A user-supplied standard API key remains exposed to the browser
  runtime; never imply a browser-only key can be made fully secure. Do not store
  keys in browser persistence, logs, exports, or source.
- No paid provider generation without a separate explicit owner opt-in. Tests
  must intercept provider requests by default. Do not automatically retry an
  ambiguous paid request or claim an estimate is a final charge.
- P0: potential paid output loss or false completion. P1: important core
  workflow, security or continuity gap. P2: usability, scale and broader
  validation. Effort is an estimate (S/M/L), not a commitment.
- Do not change the weather script into claimed measurements without verified
  source data. Preserve existing drafts, cancellation, offline access and
  controlled updates while implementing these tasks.

## P0 — Protect paid work and output integrity

- [x] **T01 — Stop a batch when audio cannot be saved** (impact: high; effort: M;
  risk: high). At review, `src/App.tsx` queued `commit` asynchronously and
  continued the generation loop. A reviewer reproduced all five free demo segments continuing
  after an injected IndexedDB quota failure; the equivalent paid-path risk is
  inferred from the shared loop, not tested with OpenAI.
  - First change: make each segment's persistence outcome observable to the
    batch; stop before sending the next request if saving fails and offer a
    recovery/download path for the in-memory output.
  - Acceptance: injected failure after segment 1 causes zero requests for
    segment 2; completed audio remains recoverable, the error is visible, and
    retry never automatically repeats a possibly charged request.
  - Dependencies: T02 for recovery semantics; preserve ordering and existing
    partial successes.
  - Implemented: wait for local persistence before the next segment; stop on
    failure and provide in-memory WAV download or explicit save retry. A page
    exit warning and update guard protect unresolved recovery. Mocked BYOK and
    keyless tests cover no second request, download and successful save retry;
    real provider behavior was not tested.

- [x] **T02 — Prevent false-complete, truncated narration** (impact: high;
  effort: L; risk: high). `src/browser-tts.ts` treats a two-second quiet tail
  after the server stop event as completion. A synthetic browser audio test
  reproduced a late second burst omitted from a WAV marked generated; the
  owner's actual incident and provider event timing are not established.
  - First change: define and prototype a defensible completion contract for
    browser WebRTC; when completeness cannot be established, preserve the result
    as explicitly uncertain rather than claiming it is complete.
  - Acceptance: repeatable real-track tests cover late last audio, long silence,
    low-level endings, event order, dropped connection and cancellation; no
    automatic retry or unqualified complete status for an uncertain result.
  - Dependencies: provider event semantics and T03; a silence threshold or
    timeout alone cannot prove future audio will not arrive.
  - Implemented: received OpenAI audio is explicitly unverified until the user
    listens and confirms it against the script; full WAV export requires that
    confirmation. Existing audio without a confirmation remains unverified.
    Real local WebRTC tests cover delayed first audio, long gaps, low endings,
    event order, disconnect and cancellation. The quiet-tail heuristic can
    still truncate audio; manual confirmation is not proof supplied by OpenAI.

## P1 — Reliable production and narration continuity

- [x] **T03 — Preflight the entire paid batch** (impact: high; effort: S;
  risk: medium). Previously, per-segment validation could discover a later 4,000-character
  limit only after earlier requests; backup import accepts larger fields.
  - First change: validate every selected segment and instructions before any
    provider connection; show the offending segments and applicable limits.
  - Acceptance: over-limit later segment, over-limit instructions and invalid
    inputs each produce zero provider requests; input is preserved without
    silent truncation, and corrected input can proceed after consent.
  - Implemented: one shared set of application limits is checked against every
    selected BYOK segment and instructions before opening a provider connection.
    Mocked browser tests verify multiple invalid segments, preserved input and
    successful progression to the provider after correction; no paid call made.

- [x] **T04 — Allow safe re-recording and comparison** (impact: high; effort: M;
  risk: medium). At review, the per-segment button was visible for current audio,
  but `generate` excluded current audio. This was reproduced in the free demo.
  - First change: add an explicit re-record action with clear potential cost;
    retain the previous version until replacement succeeds.
  - Acceptance: one explicit action causes at most one provider request;
    failure or cancel preserves the playable previous WAV, and success allows
    a listener to compare old and new before choosing one.
  - Dependencies: T01 and T02 for durable, complete replacement.
  - Implemented: explicitly confirmed BYOK re-recording saves a separate take,
    retains the previous take and supports listening, swapping and confirmed
    removal. Failure, cancellation and save-failure recovery preserve the old
    take. Browser tests use mocked provider requests; live speech comparison
    and perceived narration quality remain unverified.

- [ ] **T05 — Evaluate continuity before choosing an architecture** (impact:
  high; effort: M; risk: medium). Each segment currently opens its own Realtime
  session with the same selected voice but no adjacent narration context;
  the reported delivery difference has not been independently assessed.
  - First change: define one short Mandarin fixture and compare (a) one response,
    (b) multiple responses in one session, and (c) segmented requests with
    carefully scoped textual context. Record text sent, cost and recovery
    trade-offs; do not present context as a guarantee of consistent delivery.
  - Acceptance: free mock tests prove request order and context boundaries;
    a listening rubric covers emotion, pacing, boundary pauses and exact wording.
    Real-provider trials require separate owner cost approval and report actual
    results without automatic repetition.
  - Partial implementation: the experimental browser runner executes the
    [bounded fixture and comparison protocol](docs/NARRATION-EVALUATION.md),
    with mocked tests for ordering, reference-only context, save failures and
    incomplete responses, plus a real local WebRTC loopback for all seven
    responses. Real-provider trials, actual cost and listener scores
    remain outstanding; no paid call has been made.

- [ ] **T06 — Implement the chosen continuity workflow** (impact: high; effort:
  L; risk: high). Select a solution only after T05 evidence; longer requests
  interact with text limits, capture timeouts, and partial-failure recovery.
  - First change: implement the smallest owner-selected option, keeping voice,
    instructions, text order and disclosure explicit.
  - Acceptance: fixture output preserves all words and order, supports cancel
    and partial recovery, and has a documented, listener-verified improvement;
    mock tests cannot be treated as proof of natural-sounding speech.
  - Dependencies: T01–T03 and T05.

- [x] **T07 — Provide adjustable, non-destructive audio joins** (impact: high;
  effort: M; risk: medium). WAV edges currently retain up to 150 ms leading and
  250 ms trailing padding, and `src/audio.ts` concatenates samples without
  normalization or fades. Audible impact on the owner's samples is unknown.
  - First change: add boundary preview and optional pause/fade or loudness
    treatment while retaining unprocessed source audio; do not apply an
    overlapping crossfade by default.
  - Acceptance: tests cover silence, low-level final syllables, clicks and sample
    rates without removing words; a listener can compare and revert processing.
  - Dependencies: T02 and a clear narration-quality rubric from T05.
  - Implemented: optional 0.2/0.5-second silence between segments for preview
    and full WAV export; zero restores the original join. Source audio remains
    unchanged. Unit tests verify all samples including quiet endings and multiple
    sample rates; browser tests cover A/B preview and export. The [listening
    rubric](docs/NARRATION-EVALUATION.md) defines quality checks; T05 real-provider
    comparison and any perceived improvement remain unverified.

- [x] **T08 — Add continuous playback and boundary review** (impact: high;
  effort: M; risk: low). Current players are per segment; a full WAV is
  downloadable, but there is no sequential preview or boundary A/B control.
  - First change: provide in-order preview with a clearly selected starting
    segment and accessible pause/seek behavior.
  - Acceptance: order and transitions match the project; pause, resume,
    cancellation and stale segments are handled without a provider request.
  - Implemented: prepare a local sequential WAV preview from any nonempty
    segment, with native pause/seek and explicit close. Changes to included
    segments invalidate the preview. Browser tests verify order, controls and
    stale handling without provider requests; this does not smooth transitions.

- [x] **T09 — Preserve paid audio in optional project backups** (impact: high;
  effort: L; risk: medium). Current JSON backup deliberately excludes audio.
  - First change: design an explicit, size-aware audio-inclusive export/import
    with script, audio and provenance, while retaining the existing lightweight
    backup format.
  - Acceptance: a project with multiple WAVs restores with correct associations
    and stale status; old backups still import and no key, session token or
    provider credential appears in either format.
  - Dependencies: T01 and T11; test quota and corrupted/oversized archives.
  - Implemented: opt-in bounded JSON backup restores main and alternative WAVs,
    provenance and stale state as a separate project; SHA-256 detects accidental
    corruption, not malicious alteration. Browser tests cover a synthetic paid
    metadata fixture, legacy import, size and quota failures, retry and no key.

- [x] **T10 — Make key exposure and release hardening explicit** (impact: high;
  effort: M; risk: high). Browser BYOK is an owner-selected trade-off; a CSP
  is defense in depth and cannot protect against malicious extensions or a
  compromised same-origin deployment.
  - First change: evaluate a GitHub Pages-compatible restrictive CSP and
    job-level workflow permissions/pinned Actions against the actual app's
    WebRTC, AudioWorklet, blob, worker and update requirements.
  - Acceptance: deployed-policy tests exercise those paths and reject unintended
    origins without logging secrets; audit and threat documentation clearly
    state residual browser and extension exposure.
  - Implemented: built Pages HTML has a restrictive CSP, Actions are pinned to
    verified commit IDs, and Pages job permissions are scoped. The Pages deploy
    for commit 9087f09 succeeded, and deployed Chromium tests verified blocked
    origins, local offline demo and mocked-provider WebRTC. CSP cannot protect
    against extensions or a compromised same-origin release.

- [x] **T11 — Record truthful audio provenance and batch snapshots** (impact:
  high; effort: M; risk: medium). Assets record requested voice/instructions
  and text, but not a verified effective provider configuration or model/version.
  Editing during a running batch can produce audio for an older snapshot.
  - First change: define immutable run inputs and show the exact snapshot in the
    UI; persist non-secret requested/effective metadata only where supported by
    the documented provider response, with unknown values labeled unknown.
  - Acceptance: edits during a run cannot silently make charged output appear
    current; mocked missing/mismatched confirmation is handled honestly and
    exports contain no keys. Do not infer that OpenAI ignored a requested voice.
  - Implemented: each run displays immutable inputs; generated OpenAI takes
    retain requested inputs and bounded model/voice fields reported by the
    provider session. Missing values remain unknown and discrepancies are flagged
    without asserting their cause. Mocked browser tests cover edits during a
    batch, missing/mismatched metadata, reload and credential-free backup.

- [x] **T12 — Protect updates across tabs** (impact: high; effort: L; risk:
  high). The update guard checks the current tab, while activation claims
  clients and removes old caches; cross-tab disruption is a code-based risk,
  not a reproduced incident.
  - First change: specify tab coordination and safe activation/old-asset
    retention for active generation, unsaved drafts and offline clients.
  - Acceptance: a two-tab test covers a running generation plus an update,
    pending save, offline recovery and no secret sharing; neither tab silently
    loses work or restarts paid generation.
  - Implemented: tabs hold shared Web Locks while open; a forced update requires
    exclusive access and a second service-worker client check. The current and immediately previous app shells remain
    available for offline assets. Project writes use transactional revisions;
    conflicts retain local work and offer a separate copy. Browser tests cover
    pending saves, interrupted mocked generation, legacy update messages, offline
    recovery and a concurrent save conflict without sharing keys. Browsers without
    Web Locks must close all app pages before a waiting update can activate.

## P2 — Usability, portability and knowledge workflow

- [x] **T13 — Align style selection with actual instructions** (impact: medium;
  effort: S; risk: low). At review, the preset selector used a default value
  rather than deriving its label from the project's instructions.
  - First change: use one authoritative state and show Custom when text differs.
  - Acceptance: edit, reload, backup restore and project switching show the
    true selection without overwriting custom instructions; choosing a preset
    has a visible, predictable effect.
  - Implemented: the displayed preset derives from the saved instruction text;
    unmatched text shows Custom. Browser coverage checks edits, reload, preset
    selection, backup restore and switching projects without provider calls.

- [x] **T14 — Improve offline demo and export edge cases** (impact: medium;
  effort: S; risk: low). At review, all generation was disabled offline,
  including local demo tones; empty segments could block full WAV export.
  - First change: define whether offline keyless demo is supported and how
    empty sections are treated; use accurate UI copy for the chosen behavior.
  - Acceptance: offline local flows and full export follow that contract with
    explicit tests; real BYOK remains disabled offline and never sends a request.
  - Implemented: keyless tones can be generated offline after the PWA is cached;
    BYOK remains unavailable offline, and full WAV export skips blank segments.
    Browser tests verify offline operation, valid WAV output and zero provider
    requests. Blank-only projects still require at least one nonempty segment.

- [x] **T15 — Expand device, browser and lifecycle evidence** (impact: medium;
  effort: M; risk: medium). CI uses Chromium, while paid provider output,
  real iOS/Android installation, Firefox, interrupted sessions and multi-tab
  behavior are not independently verified.
  - First change: publish a matrix separating automated mocks, real browser
    loopback, deployed smoke, human device checks and optional paid tests.
  - Acceptance: CI provisions and runs supported free browser cases; each
    untested device/provider path is labeled NOT VERIFIED, with steps and
    explicit owner approval required for any paid test.
  - Implemented: [evidence matrix](docs/TEST-MATRIX.md) distinguishes CI,
    mock, deployed and physical-device checks. CI provisions Firefox and runs
    free persistence, offline, export and responsive cases; actual CI results
    determine whether that revision passed. Physical-device and real-provider
    paths remain explicitly unverified.

- [x] **T16 — Add editing and script-source workflow** (impact: medium; effort:
  L; risk: low). At review, the studio had add/delete but no segment reordering,
  user-defined presets or structured claim/source review.
  - First change: implement accessible reorder with stable segment identities;
    plan user presets and source/claim review as independent follow-ups.
  - Acceptance: keyboard and mobile reorder survive reload and export in the
    right order without unnecessarily invalidating unchanged audio; factual
    assertions remain linked to sources and unverified rain measurements stay
    explicitly unverified.
  - Implemented: accessible up/down controls reorder stable segment records,
    retaining audio; browser tests cover keyboard, mobile, reload and transcript
    order. [Independent follow-up designs](docs/CONTENT-ROADMAP.md) describe
    user presets and structured claim review; those features are not implemented.

## Suggested sequence

T01–T04 and T07–T16 are implemented as described above. (Superseded on 2026-11-23: T05 and T06 lived in the removed V1 editor; see the V3 section.) T05 remained open:
complete the bounded three-way real-provider comparison and listener assessment
before selecting and implementing T06. Do not treat simulated audio or inserted
silence as proof of improved narration continuity.

## V2 browser-local production follow-up

The V2 workflow runs topic discovery, independent evidence search, adaptive narration and audio comparison in a trusted worker, then hands the episode to the browser Library. See the [V2 runbook](docs/V2-FACTORY.md) for setup, verification limits and independent QA.

## V3: browser-first BYOK, then video and YouTube

Product goal: an AI-made podcast video, uploaded to YouTube after a human
review. Owner rule (2026-11-23): **browser first, BYOK, no server required.**
Full plan, milestones, risks and unverified claims: [docs/ROADMAP.md](docs/ROADMAP.md).
Decisions: [docs/PRODUCT-DIRECTION.md](docs/PRODUCT-DIRECTION.md).

V1 and browser BYOK were removed in `71a53da`, which left `main` out of
compliance with the rule above. M0 repairs that. The old code is at `636fae0`.
T05 and T06 (narration continuity experiment) are **superseded**: their runner
lived in V1. Revisit continuity only through T27 if the owner still hears
discontinuity.

Rules for every task below: key in page memory only; per-run consent and
estimate-labelled cost disclosure; no automatic retry of ambiguous paid
requests; tests intercept provider requests by default; save before the next
paid step; nothing uploads without approval. Effort is an estimate (S/M/L).
Status words: `[ ]` open, `[x]` done.

### M0. Restore browser-first BYOK (do first)

- [x] **T24 — Provider contract spike** (done 2026-11-23, see [docs/PROVIDER-CONTRACT.md](docs/PROVIDER-CONTRACT.md); all four endpoints work from a browser origin in Chromium, Safari and the Pages origin are still untested) (S; needs owner approval for a paid
  call). In a scratch page, verify from a browser with a user-entered key:
  CORS for `/v1/responses` (with the web search tool and strict JSON schema),
  `/v1/audio/transcriptions`, and WebRTC `/v1/realtime/calls`. Record the real
  status, headers and a cost note. Acceptance: a dated note in `docs/` listing
  each endpoint as works, blocked or needs a proxy; the owner approves the
  dollar ceiling beforehand. If an endpoint is blocked, that stage becomes
  worker-only and the UI must say so.
- [x] **T25 — Browser key session and CSP** (S). A memory-only key holder, _(done 2026-11-23: merged `5e018b2`; CSP fix for the worker header in `70d2681`)_
  cleared on page exit and on demand, with an explicit risk acknowledgement.
  Allow `https://api.openai.com` in `connect-src` for the private build too
  (`vite.config.ts` currently blocks it). Acceptance: unit tests; the key is
  absent from storage, backups, caches and logs; CSP test for both builds.
- [x] **T26 — Share the pipeline between worker and browser** (M). Move the pure _(done 2026-11-23: merged `bc32459`; package-worker and 91 tests pass)_
  modules (`openai`, `script`, `research`, `research-audit`, `claims`,
  `transcript`, `qa`, `languages`, `errors`) to `shared/` with the provider
  function injected, so the worker and the browser run the same code.
  Acceptance: existing worker tests still pass; no Node-only imports in the
  shared modules; no behavior change in worker mode.
- [x] **T27 — Browser narrator** (L). Port `src/browser-tts.ts` (history at _(done 2026-11-23: merged; real-provider check passed for wording and completeness, listening review still open (see docs/PROVIDER-CONTRACT.md))_
  `636fae0`) to the shared pipeline: WebRTC Realtime audio, `Uint8Array`
  instead of `Buffer`, WAV or PCM assembly, completeness checks, and
  save-before-next. Acceptance: mock-provider and local-WebRTC tests; cancel
  and save-failure recovery tests (restore the V1 protections that were
  removed with the specs); listen to one real take with the owner's approval.
- [ ] **T28 — Browser job runner** (L). The stage machine from
  `server/jobs.mjs` (research, outline, script, audio, QA) running in the page
  with each stage checkpointed in IndexedDB, resume after reload, cancel, and
  no automatic retry of paid stages. Acceptance: reload-in-the-middle and
  cancel tests; the episode appears in the Library with the same record format
  the worker produces.
- [ ] **T29 — Studio modes** (M). Add a "browser key" availability state beside
  the worker states in `StudioIntake`; the Settings key field offers memory-only
  browser mode; the worker is labelled optional; Automation is labelled worker
  only. Acceptance: browser test creates an episode with no worker running;
  the dead-end `no-worker` state is gone.
- [ ] **T30 — Rule gates and tests** (M). A Playwright config with no worker; a
  default-deny provider interception fixture; a key-leak scan across
  IndexedDB, backups, service-worker caches, console and URLs; CI runs it.
  Acceptance: CI fails if a test reaches a real provider or leaks the key.
- [ ] **T31 — Documentation** (S). Update README, V2-FACTORY, SECURITY,
  TEST-MATRIX and the production checklist for browser mode; remove the stale
  V1 text. Acceptance: docs state only what is implemented.

### M1. Video in the browser

- [ ] **T32 — Render path spike** (S; parallel with M0). Prove Three.js canvas
  frames, WebCodecs encoding and audio muxing for a 10-second fixture in
  Chromium and Safari. Record codec support, speed and memory. Choose
  (a) WebCodecs, (b) ffmpeg.wasm or (c) a worker-side ffmpeg. Acceptance: a
  decision note and a sample MP4 with no provider calls.
- [x] **T33 — Timeline plan** (M). A deterministic timeline (speaker turns, _(done 2026-11-23: merged `d182f09` lineage; timeline and capability probe, tests pass)_
  chapters, caption cues) from the episode record and audio timings.
  Acceptance: unit tests on fixtures; same input gives the same plan.
- [ ] **T34 — Scene library v1** (M). **Owner decided 2026-11-23: waveform plus
  captions** for the first release (avatars and 3D scenes come later). Two
  themes. Acceptance: screenshot review at 1440 and 390 widths.
- [ ] **T35 — In-browser renderer** (L). OffscreenCanvas worker, frame
  stepping, progress, cancel, memory and storage limits, MP4 stored in
  IndexedDB with a SHA-256 receipt. Acceptance: deterministic fixture render,
  cancel and reload recovery, quota-exceeded handling.
- [ ] **T36 — Video review** (M). Preview, edit title, description, chapters and
  thumbnail, then approve or reject. Acceptance: browser test for approve and
  reject; nothing is uploaded without approval.

### M2. Publish package (YouTube upload is out of scope)

**Owner decided 2026-11-23:** Podcast Studio only needs to produce a fully
production-ready MP4; the owner uploads to YouTube manually. Real upload is
dropped from the critical path.

- [ ] **T37 — YouTube upload client** (parked). A mock-tested client was built
  on branch `feat/t37` as an experiment. It is **not merged** and not wired
  into the UI. Revisit only if the owner asks for in-app upload.
- [ ] **T38 — Publish package export** (S). Export, per episode, the MP4, a
  title, a description with chapter lines (first at 0:00), tags, a thumbnail
  image, and a short manual-upload checklist including YouTube's disclosure
  for AI-generated or synthetic content. Acceptance: one download (zip or
  separate files) from the Studio; chapters match the timeline; no network.

### M3 to M5

- [ ] **T39 — In-browser agent and pi bridge** (L). **Decision (manager,
  2026-11-23; the owner asked us to decide):** a browser page cannot spawn the
  local `pi` CLI, so there are two layers. (1) A native in-page agent loop on
  the OpenAI Responses API with tools (research, outline, script, narrate,
  render, export) behind one `AgentBridge` interface; it needs no server and
  works today. (2) An optional pi bridge: pi 1.5.2 is installed locally and
  offers `--mode rpc` and extensions; a small loopback bridge on 127.0.0.1
  would connect pi to the same `AgentBridge`. A no-cost spike on 2026-11-23 proved pi `--mode rpc` plus a loopback
  WebSocket extension can reach a real browser page (see
  [docs/PI-BRIDGE.md](docs/PI-BRIDGE.md)); model-initiated tool calls over that
  path are still **UNVERIFIED**. The in-page agent
  works within browser limits (the BYOK key, the browser sandbox, no
  filesystem); "no limitation" is not achievable literally, so each tool is
  explicit and bounded. Acceptance: mock-provider tests, cost disclosure and
  consent, no automatic paid retries, every tool call logged for the user.
- [ ] **T40 — Godot path** (M). Evaluate Godot as a worker or export renderer.
  Not on the critical path. Acceptance: a decision note.
- [ ] **T41 — Worker as optional** (S). Keep Automation and unattended runs as
  worker features, labelled optional, using the shared pipeline from T26.
- [ ] **T42 — Release gates for video and upload** (S). Extend
  `docs/V2-PRODUCTION-CHECKLIST.md`: render, review, upload, and YouTube
  content and licensing checks for AI-generated media.
- [ ] **T43 — Real-device and offline verification** (M). Phones and Safari,
  storage quota with large video blobs, offline Library after upload.

Suggested order: T24 and T32 in parallel, then T25, T26, T27, T28, T29, T30,
T31, then T33 to T36, then T38, T39, then T40 to T43 (T37 is parked).

### M6. Internationalization and UI/UX standard (owner instruction 2026-11-23)

Governing rules and acceptance evidence: [docs/UIUX-STANDARD.md](docs/UIUX-STANDARD.md).
UI locales: `zh-CN` (source), `en`, `ms`. Do this after T29 is stable because it
touches every UI file; split the extraction by file group so workers do not
collide.

- [ ] **T44 — i18n core** (M). A keyed catalogue with `t(key, vars)`, Intl
  plural, date, number and list formatting, a locale provider and hook, saved
  per-viewer preference, language switcher in Settings, `document.lang`
  updates, and CI checks (missing or empty keys per locale, unused keys,
  placeholder consistency, question-mark-only strings, duplicate keys).
  Acceptance: unit tests; runtime switch without reload.
- [ ] **T45 — Extract UI strings** (L, parallel by file group). Move every
  user-facing string, thrown error and aria label in `src/factory/*.tsx`,
  `src/agent`, `src/publish` and `src/video` user messages into catalogue keys.
  Source locale stays `zh-CN`. Acceptance: a scan finds no hard-coded
  user-facing string; behavior unchanged; existing browser tests updated only
  where text changed.
- [ ] **T46 — English and Malay catalogues and glossary** (M). Complete `en` and
  `ms` with a per-locale glossary (key, cost, consent, estimate, unknown
  outcome, backup, episode, narration). Mark consent, cost, key-risk and
  no-retry messages for native review. Acceptance: no missing key; `ms`
  recorded as unreviewed until a native speaker signs off.
- [ ] **T47 — UI/UX standard audit and fixes** (L). Run the evidence in the
  standard per locale: scans, runtime toggle, 1440, 768 and 390 screenshots
  viewed by the manager, 200% text, keyboard pass, state coverage (empty,
  loading, running, failed, unknown paid outcome, offline), CJK typography,
  16px inputs and 44px targets, focus and live regions. Fix findings.
  Acceptance: evidence table committed; remaining gaps listed.
- [ ] **T48 — Compatibility and evidence record** (S). Fill the
  `pwa:product-standard` evidence rows for what actually ran; everything
  not run (real iOS, Safari, VoiceOver, field Web Vitals) stays `NOT_RUN`.

Baseline findings from the 2026-11-23 screenshot review (1440, 768, 390; zh-CN;
no horizontal overflow) to fix in T47: (1) at 390 px the fixed bottom playback
bar overlaps the lower part of the Studio submit button at scroll top, so check
bottom padding and reachability; (2) disabled primary buttons are pale purple on
white and hard to read, so check contrast and add the reason next to the button;
(3) 768 px and the Library, Episode and running or failed states were not
reviewed yet.
