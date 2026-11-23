# T47 UI/UX audit evidence

The [UI/UX standard](UIUX-STANDARD.md) defines the rules and acceptance evidence.
`T47 workspace sweep` in `tests/factory-i18n-sweep.browser.ts` expands into 12
tests, one per locale and viewport combination. The tests intercept provider
requests and use local fixtures. Statuses below come from the run record at the end of this file.

## Standard rules

| Rule | Evidence or test ID | Status |
| --- | --- | --- |
| 1. Catalogue strings and errors | `T47 workspace sweep` scans rendered text and attributes, including the skip link and failed Studio. Unit catalogue parity and literal-key checks passed. | PASS (Chromium) |
| 2. Locale-aware plurals, dates, numbers and lists | Intl formatting and plural unit tests passed. `T47 workspace sweep` covers rendered topic counts, estimates and episode dates. Source exceptions remain below. | PASS (Chromium) |
| 3. Glossary | [UI glossary](../src/i18n/glossary.md) includes all required concepts in zh-CN, en and ms. Native copy review is a separate gate. | PASS |
| 4. Placeholder and empty-string lint | `the message lint rejects empty, placeholder and invalid plural values` in `tests/i18n.test.mjs`. | PASS |
| 5. UI and content language | `T47 workspace sweep` checks the document, live locale switch, and all four episode language tags across titles, chapters, script and research. | PASS (Chromium) |
| 6. CJK typography | `T47 workspace sweep` captures visual evidence for CJK typography at four widths. Source CSS provides named CJK fallbacks and overrides heading letter spacing. | PASS (Chromium) |
| 7. Touch size, text size and zoom | `T47 workspace sweep` checks 390px touch emulation and 100%/200% reflow. Source viewport metadata allows zoom. | PASS (Chromium) |
| 8. Keyboard, hidden content and overlay focus | `T47 workspace sweep` checks Studio and Settings tab order, accessible names, focus indicators, the skip link, and focus entry and return for Now Playing. | PASS (Chromium) |
| 9. Secret entry and announcements | `T47 workspace sweep` checks password masking, named reveal controls, field clearing and absence of the test key in text, live regions and ARIA attributes. Browser-key unit tests passed. | PASS (Chromium) |
| 10. Error details and unknown paid outcome | `T47 workspace sweep` exercises a fake 503, checks the localized outcome, checks for provider-body leakage and counts calls. Recovery wording needs follow-up. | PASS (Chromium) |
| 11. Cost estimate and outcome distinction | `T47 workspace sweep` covers the pre-consent estimate, running progress and the unknown-outcome error. Browser production unit tests passed. | PASS (Chromium) |
| 12. Persistent live regions and milestones | `T47 workspace sweep` checks live regions before content and runs an announced Studio state change. Announcement timing with assistive technology remains unverified. | PASS (Chromium) |
| 13. Severity and feedback tokens | `T47 workspace sweep` covers labeled availability, review state, error and disabled-control contrast. The Factory tokens define feedback colors. | PASS (Chromium) |
| 14. Cost, retention and no-retry disclosures | `T47 workspace sweep` captures the key-risk notice, cost estimate, consent and unknown-outcome copy for review. | PASS (Chromium) |

## Acceptance checks

| Acceptance item | Evidence or test ID | Status |
| --- | --- | --- |
| zh-CN, en and ms route and state scan | `T47 workspace sweep` covers Library, Studio, Automation, Settings, playback and fake failure states. The scanner accounts for language options and tagged content. Its script heuristics leave English–Malay leakage and short untranslated strings for targeted assertions and visual review. | PASS (Chromium) |
| zh-CN → en → ms → zh-CN without a reload | `T47 workspace sweep`, zh-CN cases. Checks the same heading node, current document language, saved preference, and the language selector's value and translated accessible name at each step. | PASS (Chromium) |
| Screenshots and visual inspection at 1440×900, 768×1024, 390×844 and 320×568 | `T47 workspace sweep` writes and attaches PNGs per state for the manager to inspect. | PASS (Chromium; manager viewed Studio at 390 and 1440 in en and ms, and zh-CN baselines) |
| Library empty, selected episode and offline; Studio idle, consent, running and failed; Automation and Settings | `T47 workspace sweep`. The production run uses the existing fake provider fixture, holds the first response to inspect progress and returns a synthetic narration failure. | PASS (Chromium) |
| Overflow, clipping and text enlargement | `T47 workspace sweep`, all four widths at 100% and 200% root font size. | PASS (Chromium) |
| Control reachability and playback expansion | `T47 workspace sweep`, 390px and 320px at default text size. Checks that the workspace ends above playback. Scrolls each visible enabled workspace or dialog control into view and checks the scrollport bounds and overlay hit targets. | PASS (Chromium) |
| Disabled-control reasons and contrast | `T47 workspace sweep` checks the accessible description, visible linked reason and at least 3:1 contrast for Studio, browser-key and Episode script buttons. The existing Factory and browser-mode tests exercise Studio availability and continuation guidance. | PASS (Chromium) |
| Keyboard and focus | `T47 workspace sweep`, every locale and viewport. | PASS (Chromium) |
| Chromium on touch-emulated mobile | `T47 workspace sweep`, 390×844 cases. | PASS (Chromium) |
| Typecheck and Node tests | T47b ran `npm run typecheck && npm test`. Both exited 0. Node reported 152 tests, 152 passed and 0 failed. | PASS |
| Browser test discovery | `npm run e2e:factory -- --list` exited 0 and listed 26 tests in 4 files, including all 12 T47 cases. | PASS |
| Chromium regression execution after T47b | `npm run e2e:factory`. | PASS (Chromium) |
| Real iOS Safari and Home Screen, desktop Safari, and VoiceOver | Device and assistive-technology review. | NOT_RUN |
| Field Web Vitals | Field measurements. | NOT_RUN |
| Malay native review | Consent, cost, API-key risk and no-retry message groups. | NOT_RUN |

## Integration notes

- T45b owns the shell skip link, Library description, Automation notice and
  Factory error localization. The sweep checks these surfaces after the merge.
- If navigation is initiated from the middle of a page, the new workspace
  scroll area also needs the route-reset behavior currently applied to the
  window in `App.tsx`. Target `.factory-shell-layout` when the route has no
  fragment. The Factory worker sign-in form also needs a visible disabled
  reason tied to its submit button and a named token visibility control.
- The current unknown-outcome flow still offers manual continuation from saved
  work and can show worker retry wording. The product needs a distinct request
  review step before starting paid work again. Production alerts still need
  verification for live announcement timing on real assistive technology.
- The source-locale Episode voice list and Automation schedule date have
  formatting exceptions. Playback track metadata lacks the episode language.
  The playback sweep identifies rendered titles and chapters as episode
  content, and full language tagging there requires changes to the track
  model and its construction.
- The fixture server serves `dist-private`. Build that bundle after integrating
  the worker changes, then run the browser sweep with the local fixture server.

```sh
npm run build:private
npm run e2e:factory -- tests/factory-i18n-sweep.browser.ts
```

## Run record (2026-11-23)

- Runner: Playwright Chromium, headless, macOS, `npm run e2e:factory` against
  `dist-private` served by `tests/fixtures/factory-server.mjs`.
- Result: **26 of 26 browser tests passed**: 12 sweep cases (zh-CN, en and ms at
  1440x900, 768x1024, 390x844 and 320x568), plus the existing factory, library
  and browser-mode tests. Node: 152 of 152 passed.
- `PASS (Chromium)` means the assertions in that test passed in that browser
  only. It is not WCAG acceptance and not a screen-reader result.
- Defects found by the run and fixed before this record: duplicated visible
  disabled-reason text (two existing tests failed), a sweep locator that
  depended on the locale label, a reachability helper that measured the wrong
  thing, a false positive on the sweep's own typed topic text, and navigation
  labels that wrapped inside a word (for example "Automasi") because
  `overflow-wrap: anywhere` hid a real 200 percent text overflow. The
  navigation is now a wrapping flex row and a sweep assertion rejects labels
  that break inside a word at 100 percent text.
- Still `NOT_RUN`: real iOS Safari and Home Screen, desktop Safari, Firefox,
  VoiceOver or any screen reader, field Web Vitals, and native review of the
  Malay and English consent, cost, key-risk and no-retry text.
- Known product follow-ups from the integration notes: the unknown-outcome flow
  can still show worker retry wording and needs a distinct request-review step
  before new paid work; playback track metadata lacks the episode language.

## Run record 2 (2026-11-23, after T39 UI, T49, T50 and T54)

`npm run e2e:factory`: **38 of 38 browser tests passed** in Chromium (the 12
locale and layout sweep cases, 6 agent panel cases including a key-leak scan,
4 rule cases, 2 video cases with a real render, 9 Library and player cases and
the others). `npm test`: 199 tests, 198 passed, 1 skipped. The agent panel
states were added to the locale sweep: English and Malay show no CJK and no
overflow at 320 to 1440 wide and at 200 percent text. The statuses above remain
`PASS (Chromium)` and the `NOT_RUN` items are unchanged.

## Visual QA checks

T63 runs in the serial Playwright `render` project on Chromium with
SwiftShader. The test bundles the production timeline, renderer, scene registry,
font loader and thumbnail encoder in memory. Playwright serves the bundle and
versioned files from `public/fonts` through the test page's local routes. Every
other route is blocked. Four reference episodes pair Mandarin, English, Malay
and mixed text with the two scenes and two orientations. Each has three
chapters, six turns and seeded 24 kHz PCM. The PCM includes quiet speech-like
bursts, loud bursts, clipping and pauses. Additional short episodes put two
chapter starts inside one rolling second in each scene and orientation.

```sh
npm run e2e:factory -- --project=render --no-deps tests/visual-qa.browser.ts
```

| Check | Automated evidence | Review limits |
| --- | --- | --- |
| Captions and typography | Measures the renderer's cues with the bundled faces. Checks the two-line, grapheme and pixel-width limits, illegal line edges, last-line orphans, Latin word integrity, reading rates, unchanged source text, and displayed text at sample frames. Checks font preflight and the episode-language wordmark. | Synthetic PCM supplies onsets and timing windows. Spoken-word sync and fluent review require real speech. |
| Contrast | Observes the renderer's text positions and fonts, then draws isolated glyph masks on test canvases. For each measured run it compares core ink with the actual pre-text background in raw pixels and uses nearby, background-matched decoded pixels for the MP4 ratio. The minimum is 4.5:1 for caption, host, wordmark, chapter and progress text. | The sample covers glyph interiors with a usable nearby background. Grayscale and colour-vision simulation of host identity remain review items. |
| Framing | Checks every reported element box and sampled glyph bounds against the product rectangle. Looks for strong decoded edges beyond the common 5% title-safe inset, allowing smooth 2D and WebGL backdrops. | A smooth, low-contrast element could escape the exterior edge test. Exact 3D subtraction would need a background-only frame entry point with the same scene, palette and frame index. YouTube overlay and device screenshots still need review. |
| Opening and chapters | Checks the title draw on frames 0–59 in landscape and 0–44 in portrait, decoded title and caption ink at frame 0, and sampled card and caption continuity, chapter titles at their first voiced frames, `n / total` and an eligible callout's hold and clearance. | The fixture exercises one callout per episode. Topic art recognition and editorial timing remain review items. |
| Flash safety | Samples every raw and decoded frame on a 96×54 or 54×96 grid. Uses WCAG luminance, accumulated excursions and opposing changes in rolling 30-frame windows. Tests the quarter-field area approximation and the stricter per-cell limit of three flashes. Logs saturated-red transitions separately. | Downsampling can lose smaller or shorter visual changes. The results cover the reference exports and the rapid chapter stress clips. Review of the saved reduced-motion profile and other viewing conditions remains open. |
| Repeatability and fallback | Compares exact raw and decoded RGBA SHA-256 after a fresh page load at frames 0, 15, 30, 60, 120 and event boundaries ±1. Replays the production overlay and scene draw contracts in chronological and shuffled order and compares with the export's raw hashes. Forces WebGL startup failure and checks a playable waveform export. | The replay uses a test compositor because the encoder submits frames in order. The hashes apply within this Chromium/SwiftShader profile. Context loss, cancellation and full-episode resource use need separate evidence. |
| Thumbnails | Encodes all three variants and checks the decoded PNGs for 1280×720 dimensions, size below 2 MB, layout and duration-badge clearance, 4.5:1 text contrast and at least 8 px of CJK ink at 160×90. It also checks the 320×180 preview. | A reviewer reads each headline and identifies the focal subject at feed sizes. |

The test attaches `visual-qa-report.json` and prints a Markdown score line.
The attachment maps all ten section 8 criteria to their rubric weights,
automated points, status and frame evidence. It includes combined and
per-orientation scores. The automated checks assess **62 of 100 points**.
The remaining points cover manual or separate evidence, including scene craft,
spoken sync and performance. The automated percentage and the independent
review use different evidence and denominators. The spec's 85/100 release bar
still requires the full review. [Visual design rubric](VISUAL-DESIGN-SPEC.md#8-release-rubric-and-playwright-checks)

T63 Chromium execution is `NOT_RUN` in this worktree. Test discovery exercises
project routing only.
