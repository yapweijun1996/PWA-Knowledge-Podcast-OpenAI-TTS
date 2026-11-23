# UI/UX and i18n standard for this project

Owner instruction (2026-11-23): the UI must be internationalized and must
follow the standard KB-MCP UI/UX skills. This page records which skills govern
the work, the declarations those skills require, and the rules each task must
meet. Skills are specifications, not certifications; nothing here claims a
check passed unless it names the evidence.

## Governing KB-MCP skills

| Skill | Version | Role here |
| --- | --- | --- |
| `kb-mcp:ui-skills` (hub) | 0.3.0 | Phase routing and core rules: look at the real running UI first; test mobile and desktop, keyboard, loading, empty, error and long-content states; never claim an unrun test. |
| `pwa:product-standard` | 1.1.0 | PWA profile, iOS standalone, service worker integrity, offline data safety, WCAG 2.2 AA target, evidence contract, release gates. |
| `ux:byok-pwa-experience` | 0.1.0 candidate | BYOK and paid-call UX, key handling copy, cost and consent states, error recovery, mobile, accessibility and i18n rules. Candidate: desk research, not user-tested. |
| `ui:i18n-complete-translation-runtime-localizer` | 1.0.0 | Scan method for leftover untranslated text and release checks for a language toggle. Its runtime-localizer mechanism is **not** used (see decision below). |
| `ui:taste-gate-before-merge` (via the hub) | n/a | Before any merge or push of UI work, view real 1440, 768 and 390 screenshots and judge taste; machine checks do not replace looking. |
| `ui:ux-quality-auditor` (via the hub) | 1.0.5 | Independent final audit with screenshot evidence. |

The `ui:i18n` skill and the BYOK skill disagree on mechanism. The runtime
localizer suits thousands of strings across about 100 files with an English
source. This project has a small UI (about 25 files), a Chinese source, and
strings that carry cost and consent meaning, so we follow the BYOK skill: a
keyed message catalogue with `t(key, vars)`, Intl for plurals, dates and
numbers, and CI checks. We still use the scan method from the i18n skill to
prove nothing was left behind.

## Declarations required by `pwa:product-standard`

- **Profile:** `STATIC_OFFLINE` (local-first utility). Browser BYOK calls go
  straight to the provider; the optional worker adds scheduling.
- **Supported browsers (target):** Chrome desktop and Android, Edge, Safari
  macOS and iOS (browser and Home Screen), Firefox desktop where supported.
  Status per feature stays `NOT_RUN` until executed.
- **Offline scope:** the Library, playback, edits, backup and restore work
  offline after the first visit. Generation, rendering of provider-dependent
  stages and the worker need the network.
- **Sensitive data:** the API key (page memory only), scripts, research, audio
  and video (IndexedDB). Keys never reach storage, backups, caches or logs.
- **Install targets:** browser tab and Home Screen PWA.
- **Evidence status vocabulary:** `PASS`, `FAIL`, `NOT_RUN`, `BLOCKED`,
  `NOT_APPLICABLE`. `NOT_RUN` never counts as a pass. A real iOS standalone
  device and VoiceOver are required for any iOS claim; none has been run.

## Locales

- **UI locales:** `zh-CN` (source), `en`, `ms`. These match the content
  languages the product already produces.
- **Native review:** consent, cost, key-risk and no-retry text must not ship as
  machine translation without native review. `en` is written by the team and
  reviewed by the owner; `ms` is **unreviewed** until a native speaker checks
  the glossary terms and those four message groups. The UI marks nothing as
  reviewed unless this page records the reviewer and date.
- **Default locale:** from the saved preference, otherwise the browser
  language, otherwise `zh-CN`. A language switch applies without reload and is
  saved as a per-viewer preference only.

## Rules every i18n and UI task must meet

From the BYOK skill, section C and D:
1. Every user-facing string is a catalogue key, including thrown errors; no raw
   `String(e)` or provider bodies in the UI. A test fails when a key is missing
   or empty in any locale.
2. No concatenated plurals; use Intl plural, date, number and list formatting.
3. A per-locale glossary with one term per concept (key, cost, consent, review,
   estimate, unknown outcome, backup).
4. A lint rejects question-mark-only or placeholder strings.
5. `lang` on the document follows the UI locale; content in another language
   (episode text) carries its own `lang`.
6. Reset negative letter-spacing for CJK and name a CJK fallback font.
7. Inputs render at 16px or more on touch; touch targets 44px on coarse
   pointers; type in `rem`; no viewport zoom lock.
8. Off-screen content is out of the focus order and accessibility tree; overlays
   move focus in, close on Escape and return focus.
9. Secret fields stay paste friendly with a show or hide control and an
   accessible name; never echo a secret into a live region, toast or log.
10. Errors say what happened, what was preserved and whether a paid request was
    sent. Never offer Retry on an unknown paid outcome; offer review of the
    request and a check of the provider account.
11. Keep estimate, provider-reported charge, unknown outcome and local-only
    recovery visibly distinct. An attempt ceiling is not a spending cap.
12. A live region exists before its content; milestones and outcomes are
    announced, not ticks. Axe passing is not WCAG acceptance.
13. Severity never depends on colour alone; feedback colours are tokens from one
    source file.
14. Do not remove cost, retention or no-retry disclosures to make a dialog
    lighter; collapse them instead.

## Acceptance evidence (per locale)

For each of `zh-CN`, `en`, `ms`:
- Route and click-sweep scan: zero strings from another locale in the UI shell,
  pages, dialogs and errors (the i18n skill's scans), plus a runtime toggle test
  `zh-CN` to `en` to `ms` without reload.
- Real Chromium screenshots at 1440, 768 and 390 for Library, Studio (idle,
  running, failed, consent), Settings and the Episode view, **looked at** by the
  manager, with overflow checked at 390 and at 200% text size.
- Keyboard-only pass of the main flow; accessibility name and focus checks.
- Evidence table with status per skill rule and environment. Real iOS, Safari
  and VoiceOver stay `NOT_RUN` and are listed as unverified in every report.
