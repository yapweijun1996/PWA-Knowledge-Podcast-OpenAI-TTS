# Product direction (decided 2026-11-23)

## Goal

Podcast Studio is a browser-first studio, similar in spirit to YouTube Studio.
An AI agent researches a topic, writes the script, produces the audio, animates
a video (Three.js first; Godot and others later) and, after a human review,
publishes to YouTube. The owner is the only user for now.

See the [roadmap](ROADMAP.md) for milestones, risks and unverified claims.

## Decisions

1. **Browser first.** The browser is the primary runtime. IndexedDB is the
   system of record for episodes, research, scripts, audio, video and
   backups. Everything the Library does works offline after the first visit.
2. **BYOK.** The user brings their own OpenAI API key. Browser BYOK is a
   supported mode again (M0 in the [roadmap](ROADMAP.md), T24 to T31 in `TASK.md`). It is an explicit trade-off:
   a key entered in the page is readable by page code, extensions and a
   compromised device. Use a restricted, budget-limited key. The key is never
   written to IndexedDB, backups, caches, logs or source.
3. **The worker is optional.** The trusted local worker adds unattended
   scheduling, long research runs and server-held keys. It is an upgrade, not
   a requirement.
4. **One interface.** The Library, Studio, Automation and Settings are the
   only UI. The V1 local editor was removed in `71a53da`; its source is in git
   history at `636fae0`.
5. **Agents.** The pi coding agent in the browser is the first agent
   integration, with the OpenAI API key as the provider (T39).
6. **No spend or upload without per-run approval.** Paid calls show an
   estimate-labelled cost disclosure and need consent. YouTube upload is
   private by default and needs explicit approval.

## Current state versus the goal

| Capability | State |
| --- | --- |
| Library in IndexedDB, offline playback, backup and restore | implemented |
| Research, script and audio through the worker | implemented |
| Browser-direct BYOK generation in the Studio | **removed with V1; planned (M0, T24 to T31)** |
| Video rendering | planned (M1, T32-T36) |
| YouTube upload | planned (M2, T37-T38) |
| pi agent adapter | planned (M3, T39) |

## Run modes

| Mode | Key lives in | Needs worker | Status |
| --- | --- | --- | --- |
| Browser BYOK | page memory only | no | planned (M0, T24 to T31) |
| Worker | worker process memory | yes | implemented |
| Library only (public Pages) | none | no | implemented |

Documents written before this date that describe V1, the admin workspace,
demo tones or the T05/T06 narration experiment are historical.
