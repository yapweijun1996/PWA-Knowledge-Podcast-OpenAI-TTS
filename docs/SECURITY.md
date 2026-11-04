# Browser BYOK and release security

The owner chose direct browser BYOK. The key is entered by the user, held in the
page runtime and sent directly to the OpenAI API; the application does not
intentionally put it in source code, local storage, IndexedDB or project backups.
Browser extensions, a compromised browser or device, malicious same-origin code,
and a compromised GitHub Pages deployment can still read it. Use a trusted
browser and device, choose a limited key where available, monitor usage, and
revoke a key if exposure is suspected. This is not equivalent to a trusted
backend and cannot enforce a server-side budget.

The production build includes a Content Security Policy in an early HTML meta
element because GitHub Pages does not let this repository set arbitrary response
headers. The policy allows application assets, local blob media, and connections
to the OpenAI API; it blocks inline scripts and other connection origins. Vite's
local development server does not use this production policy because HMR uses
injected styles and a development connection. Use the built preview to test it.

A meta policy is defense in depth, not a defense against extensions or hostile
same-origin releases. It cannot enforce `frame-ancestors`, report-only mode or
other header-only controls; assets fetched before a meta policy is parsed are not
covered by it. See the [W3C CSP specification](https://www.w3.org/TR/CSP3/) for
these delivery limitations. It also does not authenticate imported backups.

Workflows pin top-level GitHub Actions to exact commits. The build job has read
access to repository content and Pages configuration; only the deployment job
has Pages and OIDC write permissions. The [GitHub Pages workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
describes those deployment permissions. Pinning a top-level action does not
independently pin every transitive dependency; update pins deliberately after
review and rerun the release checks.

The browser tests use intercepted provider requests and synthetic audio. A
passing policy test or WebRTC loopback does not prove a real OpenAI account,
voice, generated content, or browser extension is safe. Do not log keys, audio
payloads or private scripts during diagnosis.

The scoped Pages workflow deployed commit `9087f09` successfully in
[run 41812526581](https://github.com/yapweijun1996/PWA-Knowledge-Podcast-OpenAI-TTS/actions/runs/41812526581).
Chromium tests on that deployed build verified blocked external connections and
inline scripts, offline demo operation, and a real local WebRTC loopback with
the provider intercepted. No paid request was made.
