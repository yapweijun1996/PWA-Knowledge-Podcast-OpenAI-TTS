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

- [ ] **T06 — Implement the chosen continuity workflow** (impact: high; effort:
  L; risk: high). Select a solution only after T05 evidence; longer requests
  interact with text limits, capture timeouts, and partial-failure recovery.
  - First change: implement the smallest owner-selected option, keeping voice,
    instructions, text order and disclosure explicit.
  - Acceptance: fixture output preserves all words and order, supports cancel
    and partial recovery, and has a documented, listener-verified improvement;
    mock tests cannot be treated as proof of natural-sounding speech.
  - Dependencies: T01–T03 and T05.

- [ ] **T07 — Provide adjustable, non-destructive audio joins** (impact: high;
  effort: M; risk: medium). WAV edges currently retain up to 150 ms leading and
  250 ms trailing padding, and `src/audio.ts` concatenates samples without
  normalization or fades. Audible impact on the owner's samples is unknown.
  - First change: add boundary preview and optional pause/fade or loudness
    treatment while retaining unprocessed source audio; do not apply an
    overlapping crossfade by default.
  - Acceptance: tests cover silence, low-level final syllables, clicks and sample
    rates without removing words; a listener can compare and revert processing.
  - Dependencies: T02 and a clear narration-quality rubric from T05.

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

- [ ] **T10 — Make key exposure and release hardening explicit** (impact: high;
  effort: M; risk: high). Browser BYOK is an owner-selected trade-off; a CSP
  is defense in depth and cannot protect against malicious extensions or a
  compromised same-origin deployment.
  - First change: evaluate a GitHub Pages-compatible restrictive CSP and
    job-level workflow permissions/pinned Actions against the actual app's
    WebRTC, AudioWorklet, blob, worker and update requirements.
  - Acceptance: deployed-policy tests exercise those paths and reject unintended
    origins without logging secrets; audit and threat documentation clearly
    state residual browser and extension exposure.
  - Implementation in review: built Pages HTML has a restrictive CSP, Actions
    are pinned to verified commit IDs, and Pages job permissions are scoped.
    Local mocked provider, WebRTC, offline and policy tests pass. Deployed-policy
    and deployment-permission verification are still required before completion.

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

- [ ] **T12 — Protect updates across tabs** (impact: high; effort: L; risk:
  high). The update guard checks the current tab, while activation claims
  clients and removes old caches; cross-tab disruption is a code-based risk,
  not a reproduced incident.
  - First change: specify tab coordination and safe activation/old-asset
    retention for active generation, unsaved drafts and offline clients.
  - Acceptance: a two-tab test covers a running generation plus an update,
    pending save, offline recovery and no secret sharing; neither tab silently
    loses work or restarts paid generation.

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

T01–T04, T13, T14 and T16 have been implemented as described above. Run T05
before committing to T06 or audio post-processing. Larger remaining investments
include T06, T09 and T12. Dependencies, cost authorization and actual
verification take precedence over the sequence.
