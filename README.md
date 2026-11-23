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

## Video, animation and publishing

The Episode view renders a finished episode to MP4 in the browser (Canvas 2D
waveform and captions today, WebCodecs and MP4 muxing, H.264 with AAC or Opus
depending on the browser), previews it, lets you edit the title, description
and chapters, and then downloads one publish ZIP: video, thumbnail, title,
description with chapters and sources, tags and a manual-upload checklist.
Rendering never calls a provider. The owner uploads to YouTube manually.
Verified in Chromium; Safari, phones and upload acceptance are **UNVERIFIED**.
[Renderer](src/video/render.ts) · [Publish package](src/publish/package.ts)

A scene interface lets different scenes draw the video. A Three.js studio
scene and an AI-directed storyboard are in progress. [Animation decision](docs/ANIMATION-DECISION.md) · [Research](docs/ANIMATION-RESEARCH-2026-11-23.md)

## Agent

Studio has a collapsed Agent panel: give a goal, consent to the run, and the
in-page agent calls tools (research, script, narration, render, export). Each
paid tool asks for separate approval, a live log shows every step, and
cancellation stops at the next safe point. Tested with mocked provider
turns; a real model-driven run is **UNVERIFIED**. [Agent](docs/AGENT.md) · [pi bridge spike](docs/PI-BRIDGE.md)

## Repository layout

| Path | Role |
| --- | --- |
| [`src/factory/`](src/factory/) | Library, playback, browser BYOK, Studio and Settings |
| [`src/i18n/`](src/i18n/) | Simplified Chinese source catalogue, English and Malay translations, Intl formatting |
| [`shared/pipeline/`](shared/pipeline/) and [`server/`](server/) | Shared production stages and optional Node 24 worker |
| [`src/video/`](src/video/), [`src/publish/`](src/publish/) and [`src/agent/`](src/agent/) | Local media render, export and agent tools |
| [`tests/`](tests/) and [`.github/workflows/ci.yml`](.github/workflows/ci.yml) | Node tests, mocked Factory browser suites and release gates |

## Verification

On 2026-11-23 the project passed the type check, 199 Node tests (1 skipped),
the strict locale scan (0 hard-coded CJK fragments), 38 of 38 Chromium browser
tests, both builds and the dependency audit (0 vulnerabilities). One real
end-to-end run with a user-supplied key produced a 1:53 episode, an MP4 and a
publish ZIP in about 3 minutes with 14 provider calls and no key found in
storage. **Not verified:** listening quality and continuity, actual dollar
cost, Safari, phones, physical-device accessibility, long episodes and manual
upload compatibility. [Test matrix](docs/TEST-MATRIX.md) · [E2E trial](docs/E2E-TRIAL-2026-11-23.md) · [Provider contract](docs/PROVIDER-CONTRACT.md)

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
