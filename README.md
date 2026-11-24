# Knowledge Podcast Studio

Knowledge Podcast Studio is a browser-first podcast studio with bring-your-own-key
(BYOK) access to OpenAI. V2 Studio is the only UI. The browser key stays in page
memory only, and IndexedDB is the Library record store. A private Node.js worker is
optional. [Product direction](docs/PRODUCT-DIRECTION.md)

## Browser quick start

1. Open the [Pages app](https://yapweijun1996.github.io/PWA-Knowledge-Podcast-OpenAI-TTS/)
   or, from a Node.js 24 checkout, run `npm ci`, `npm run build` and
   `npm run preview`. Open the URL printed by Vite, including the project path.
2. Open Settings and choose Simplified Chinese (`zh-CN`, the default), English
   (`en`) or Malay (`ms`). The choice applies immediately. Episode content
   keeps its own language. [Locale guide](docs/I18N.md)
3. In Settings, enter a browser API key, acknowledge the exposure risk and set
   the key. It stays in the tab's memory and clears on page exit or reload.
   Page code, extensions and a compromised device can read it while it is
   present. [Security model](docs/SECURITY.md)
4. In Studio, enter a topic and choose the cast. Review the usage estimate and
   consent for this run before submitting. Studio saves each checkpoint before
   the next paid step. If a request's outcome is unknown, check provider usage
   before choosing to continue with fresh consent. [Browser runner](src/factory/browser-production.ts)
5. Review the citations, script, WAV and transcript in the Library. Export a
   private `.kps` backup to transfer to another browser profile or origin. The
   Library can open saved episodes, play audio and restore backups offline
   after the app shell is cached. [Storage and recovery](docs/V2-FACTORY.md#storage-and-recovery)

## Optional worker quick start

Use Node.js 24 with the prebuilt worker artifact from a successful Pages release,
or build and run the worker from source. [Prebuilt worker instructions](deploy/WORKER.md)

```sh
npm ci
npm run build:private
npm run start:private
```

Open [the loopback workspace](http://127.0.0.1:8787/). Set the worker key in
Settings, select worker production in Studio if both modes are available, then
review the cost disclosure and consent. Configure a schedule in Automation for
unattended production. The worker must stay running. [Worker setup and access](docs/V2-FACTORY.md#optional-worker)

## Video, animation and publishing

The Episode view uses Canvas 2D, WebCodecs and mp4-muxer to export MP4 in an
OffscreenCanvas worker where supported. Video uses H.264 with AAC audio when
available and falls back to Opus audio. Choose the waveform or the lazily
loaded Studio 3D scene. Chapter storyboard generation requires consent, and
you review the draft manually before applying it.
[Renderer](src/video/render.ts) · [Animation decision](docs/ANIMATION-DECISION.md)

The publish ZIP includes the MP4, a thumbnail, chapters and a timed SRT
caption sidecar when measured captions are available. The owner uploads to
YouTube manually. YouTube acceptance of Opus audio is **UNVERIFIED**.
[Publish package](src/publish/package.ts)

## Agent

See the Agent guide for the in-page workflow and consent requirements. A real
model-driven agent run on `c22a9fe` is **UNVERIFIED**.
[Agent](docs/AGENT.md) · [pi bridge spike](docs/PI-BRIDGE.md)

## Repository layout

| Path | Role |
| --- | --- |
| [`src/factory/`](src/factory/) | Library, playback, browser BYOK, Studio and Settings |
| [`src/i18n/`](src/i18n/) | Simplified Chinese source catalogue, English and Malay translations, Intl formatting |
| [`shared/pipeline/`](shared/pipeline/) and [`server/`](server/) | Shared production stages and optional Node 24 worker |
| [`src/video/`](src/video/), [`src/publish/`](src/publish/) and [`src/agent/`](src/agent/) | Local media render, export and agent tools |
| [`tests/`](tests/) and [`.github/workflows/ci.yml`](.github/workflows/ci.yml) | Node tests, mocked Factory browser suites and release gates |

## Verification

On the manager’s Mac at `c22a9fe`, typecheck and both builds passed. `npm test`
reported 289 tests, with 288 passed and one skipped because the Crucible spike
dependency was absent. The strict i18n scan reported 0 findings and `npm audit`
found 0 vulnerabilities. Two consecutive Factory runs passed 51/51 tests with
automated visual QA at 62/62 in Chromium 156–158 with software WebGL. A separate
parallel run had one intermittent failure in `tests/factory-video-options.browser.ts`.
The failure is under investigation. [Test matrix](docs/TEST-MATRIX.md)

**Visual acceptance has not passed.** The latest independent image-only review
scored 79.0% (54.5/69) against an 85% acceptance bar. See the roadmap for the
remaining owner-only and unverified checks. [Visual QA](docs/VISUAL-QA.md) · [Roadmap](docs/ROADMAP.md#open-items)

Pages publishes the tested public build through the Pages workflow. The
optional worker has its own distributable artifact. Use the release and
episode checklists before promoting a candidate or distributing an episode.
[Pages workflow](.github/workflows/pages.yml) · [Release checklist](docs/PRODUCTION-READINESS.md) · [Episode checklist](docs/V2-PRODUCTION-CHECKLIST.md)

## Historical material

The V1 editor, demo tones and V1 backup formats belong to the earlier
prototype. The former editor is available at revision `636fae0`.
[Historical V1 review](docs/REVIEW-2026-11-04.md)

The Pocket Frequency animation is a separate design demo.
[MP4](design/pocket-frequency-duck.mp4) · [Blender scene](design/pocket-frequency-duck.blend)
