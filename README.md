# Knowledge Podcast Studio

Research a topic, write a podcast script, generate narration and review the
result in a browser. Studio can send requests directly to OpenAI with your own
API key. The Library keeps episodes and audio in IndexedDB. An optional local
worker adds scheduled discovery and production that can continue while the tab
is closed. [Product direction](docs/PRODUCT-DIRECTION.md)

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

## Video and publishing

The repository includes a browser-local waveform and caption renderer using
Canvas, WebCodecs and MP4 muxing. A publish ZIP builder packages the MP4, a
thumbnail, title, description, tags, chapters and a manual-upload checklist.
Both are exposed as agent tools and in the Episode view: render, preview,
review and approve the video, then download the publish ZIP. This was verified
in Chromium only (render, preview, ZIP and cancel tests); real Safari, mobile
and upload acceptance are **UNVERIFIED**. The owner uploads to YouTube
manually. [Renderer](src/video/render.ts) · [Publish package](src/publish/package.ts) · [Tool integration](src/agent/tools.ts)

## Repository layout

| Path | Role |
| --- | --- |
| [`src/factory/`](src/factory/) | Library, playback, browser BYOK, Studio and Settings |
| [`src/i18n/`](src/i18n/) | Simplified Chinese source catalogue, English and Malay translations, Intl formatting |
| [`shared/pipeline/`](shared/pipeline/) and [`server/`](server/) | Shared production stages and optional Node 24 worker |
| [`src/video/`](src/video/), [`src/publish/`](src/publish/) and [`src/agent/`](src/agent/) | Local media render, export and agent tools |
| [`tests/`](tests/) and [`.github/workflows/ci.yml`](.github/workflows/ci.yml) | Node tests, mocked Factory browser suites and release gates |

## Verification

The T30/T31 candidate passed the type check and 152 Node tests. The locale
scan found zero CJK fragments outside the UI catalogue in its scanned source.
Playwright listed 30 Chromium cases and one WebKit case. Browser execution for
this candidate is `NOT_RUN`. Earlier paid evidence covers individual API
endpoints and a short Chromium narration sample. Full-episode listening,
actual episode costs, physical devices, and manual upload compatibility remain
**UNVERIFIED**. [Test matrix and commands](docs/TEST-MATRIX.md) · [Provider contract](docs/PROVIDER-CONTRACT.md)

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
