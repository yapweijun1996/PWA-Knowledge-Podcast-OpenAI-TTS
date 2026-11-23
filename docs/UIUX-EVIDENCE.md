# T47 UI/UX audit evidence

The [UI/UX standard](UIUX-STANDARD.md) defines the rules and acceptance evidence.
`T47 workspace sweep` in `tests/factory-i18n-sweep.browser.ts` expands into 12
tests, one per locale and viewport combination. The tests intercept provider
requests and use local fixtures. Playwright discovery does not execute the tests
or produce screenshots.

## Standard rules

| Rule | Evidence or test ID | Status |
| --- | --- | --- |
| 1. Catalogue strings and errors | `T47 workspace sweep` scans rendered text and attributes, including the skip link and failed Studio. Unit catalogue parity and literal-key checks passed. | NOT_RUN |
| 2. Locale-aware plurals, dates, numbers and lists | Intl formatting and plural unit tests passed. `T47 workspace sweep` covers rendered topic counts, estimates and episode dates. Source exceptions remain below. | NOT_RUN |
| 3. Glossary | [UI glossary](../src/i18n/glossary.md) includes all required concepts in zh-CN, en and ms. Native copy review is a separate gate. | PASS |
| 4. Placeholder and empty-string lint | `the message lint rejects empty, placeholder and invalid plural values` in `tests/i18n.test.mjs`. | PASS |
| 5. UI and content language | `T47 workspace sweep` checks the document, live locale switch, and all four episode language tags across titles, chapters, script and research. | NOT_RUN |
| 6. CJK typography | `T47 workspace sweep` captures visual evidence for CJK typography at four widths. Source CSS provides named CJK fallbacks and overrides heading letter spacing. | NOT_RUN |
| 7. Touch size, text size and zoom | `T47 workspace sweep` checks 390px touch emulation and 100%/200% reflow. Source viewport metadata allows zoom. | NOT_RUN |
| 8. Keyboard, hidden content and overlay focus | `T47 workspace sweep` checks Studio and Settings tab order, accessible names, focus indicators, the skip link, and focus entry and return for Now Playing. | NOT_RUN |
| 9. Secret entry and announcements | `T47 workspace sweep` checks password masking, named reveal controls, field clearing and absence of the test key in text, live regions and ARIA attributes. Browser-key unit tests passed. | NOT_RUN |
| 10. Error details and unknown paid outcome | `T47 workspace sweep` exercises a fake 503, checks the localized outcome, checks for provider-body leakage and counts calls. Recovery wording needs follow-up. | NOT_RUN |
| 11. Cost estimate and outcome distinction | `T47 workspace sweep` covers the pre-consent estimate, running progress and the unknown-outcome error. Browser production unit tests passed. | NOT_RUN |
| 12. Persistent live regions and milestones | `T47 workspace sweep` checks live regions before content and runs an announced Studio state change. Announcement timing with assistive technology remains unverified. | NOT_RUN |
| 13. Severity and feedback tokens | `T47 workspace sweep` covers labeled availability, review state, error and disabled-control contrast. The Factory tokens define feedback colors. | NOT_RUN |
| 14. Cost, retention and no-retry disclosures | `T47 workspace sweep` captures the key-risk notice, cost estimate, consent and unknown-outcome copy for review. | NOT_RUN |

## Acceptance checks

| Acceptance item | Evidence or test ID | Status |
| --- | --- | --- |
| zh-CN, en and ms route and state scan | `T47 workspace sweep` covers Library, Studio, Automation, Settings, playback and fake failure states. The scanner checks language-option and explicitly tagged content allowances and keeps the shell copy in scope. | NOT_RUN |
| zh-CN → en → ms without a reload | `T47 workspace sweep`, zh-CN cases. Checks the same heading node, current document language, saved preference and translated Settings controls. | NOT_RUN |
| Screenshots and visual inspection at 1440×900, 768×1024, 390×844 and 320×568 | `T47 workspace sweep` writes and attaches PNGs per state for the manager to inspect. | NOT_RUN |
| Library empty, selected episode and offline; Studio idle, consent, running and failed; Automation and Settings | `T47 workspace sweep`. The production run uses the existing fake provider fixture, holds the first response to inspect progress and returns a synthetic narration failure. | NOT_RUN |
| Overflow, clipping and text enlargement | `T47 workspace sweep`, all four widths at 100% and 200% root font size. | NOT_RUN |
| Bottom reachability and playback expansion | `T47 workspace sweep`, 390px and 320px. Compares the last control against the viewport reserved for content and checks the expanded dialog's last control. | NOT_RUN |
| Disabled-control reasons and contrast | `T47 workspace sweep` checks the accessible description, visible linked reason and at least 3:1 contrast for Studio and browser-key form buttons. | NOT_RUN |
| Keyboard and focus | `T47 workspace sweep`, every locale and viewport. | NOT_RUN |
| Chromium on touch-emulated mobile | `T47 workspace sweep`, 390×844 cases. | NOT_RUN |
| Typecheck and Node tests | `npm run typecheck && npm test` exited 0. Node reported 147 tests, 147 passed and 0 failed. | PASS |
| Browser test discovery | `npm run e2e:factory -- --list` exited 0 and listed 26 tests in 4 files, including all 12 T47 cases. | PASS |
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
