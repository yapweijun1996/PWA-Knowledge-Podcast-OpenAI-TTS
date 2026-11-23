# Security and key boundaries

## Browser BYOK

In browser mode the tab sends the user-supplied OpenAI key in the
`Authorization` header directly to `https://api.openai.com`. While the key is
set, page code, browser extensions with access to the page and a compromised
device can read it. Use a trusted app origin and device and a key with the
permissions needed for the run. [Settings disclosure](../src/factory/Preferences.tsx) · [Provider request adapter](../shared/pipeline/openai.ts) · [Narrator](../src/factory/browser-narrator.ts)

The browser key lives in page memory and clears on explicit removal or
`pagehide`, including reload. Browser storage, URLs, backups, caches and logs
must stay free of the key. The app stores project artifacts for recovery and
clears the key-entry field when the key is set. Project content and backups can
contain private text and media. [Key lifecycle](../src/factory/browser-key.ts) · [Backup format](../shared/episode-backup.ts) · [Browser rules tests](../tests/factory-rules.browser.ts)

Studio requires per-run consent and labels costs as estimates. The browser
runner saves a result before the next paid step and stops when a save fails.
If a paid request has an unknown outcome, it remains unknown until the user
decides whether to continue. Check provider usage before consenting again.
[Studio](../src/factory/StudioIntake.tsx) · [Checkpoint runner](../src/factory/browser-production.ts) · [Node tests](../tests/browser-production.test.mjs)

## Content Security Policy and offline cache

The public and private builds add an HTML meta CSP. Their `connect-src`
includes `'self' https://api.openai.com blob:` for browser BYOK. The worker
serves a corresponding response header. The policy restricts scripts to the
app origin and blocks other connection origins. The Vite development server
uses its development setup for hot reload. The generated service worker
precaches app assets and bypasses API traffic. [CSP directives](../config/csp.ts) · [Build configuration](../vite.config.ts) · [Worker HTTP server](../server/http.mjs) · [Service worker builder](../scripts/build-sw.mjs) · [CSP tests](../tests/csp.test.mjs)

A malicious release on the app origin, a privileged extension or a compromised
device can still access a browser key. CSP adds a browser enforcement layer
around resource loading and connections. [Key disclosure](../src/i18n/locales/en/settings.ts)

## Optional trusted worker

Worker-mode provider calls use a key held by the worker process. Provisioning
through the worker Settings form passes the key through that page to the
trusted worker. Environment-based provisioning keeps it off the page
entirely. A Settings-provided worker key is cleared on process exit or explicit
removal. The worker host, its operator and any configured reverse proxy form
the trust boundary. [Worker startup](../server/main.mjs) · [Credential handling](../server/production.mjs) · [Setup](V2-FACTORY.md#optional-worker)

The worker binds to loopback by default and checks the host and origin for
writes. A configured private HTTPS origin requires an owner token and a
Secure, HttpOnly session cookie for protected routes. API responses use
`Cache-Control: no-store`. The worker data folder and browser-local copies
need separate protection and recovery. [HTTP routes](../server/http.mjs) · [Owner session](../server/session.mjs) · [Worker tests](../tests/factory.test.mjs)

## Release evidence

The guarded browser tests block service workers, abort unmatched external
requests and inspect fake-key exposure in storage, URLs and history, console,
downloads and the DOM. The scan describes the exercised page and downloaded
files. Live Pages and browser execution status are tracked in the test matrix.
The reusable CI workflow retains pinned Actions, the dependency audit and
scoped artifact handling. [Fixture](../tests/fixtures/guards.ts) · [Matrix](TEST-MATRIX.md) · [CI](../.github/workflows/ci.yml) · [Pages workflow](../.github/workflows/pages.yml)
