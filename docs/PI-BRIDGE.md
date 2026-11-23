# pi coding agent bridge (T39 spike), 2026-11-23

Question: can the installed pi coding agent drive Podcast Studio running in a
browser page? Pi (`@earendil-works/pi-coding-agent` 1.5.2, `/opt/homebrew/bin/pi`)
is a terminal agent. A page cannot spawn it, and its RPC mode speaks JSON lines
over stdin and stdout (`pi --mode rpc`, see pi's own `docs/rpc.md`).

## Architecture that works

```
Podcast Studio page  <-- WebSocket (127.0.0.1, token + Origin checked) -->
  pi extension (runs inside the pi process)  <-- pi tools and slash commands
```

A small pi extension opens a loopback WebSocket server. The page connects to
it with a one-time token. Pi tools and commands registered by the extension
forward requests to the page, and the page runs them through the in-page
`AgentBridge` (T39) using the user's browser key. Nothing in the page needs a
server: pi and its extension are optional.

## What the spike proved (real Chromium, no model, no cost)

`spikes/pi-bridge/ext.ts` plus `spikes/pi-bridge/run.mjs` (spike code, paths are
absolute to this machine):

- `pi --mode rpc --no-session --offline -e ext.ts` starts; `get_state` and
  `get_commands` answer; the extension's command is listed (`podcast-ping`).
- A real Chromium page on `http://127.0.0.1:<port>` connected to the
  extension's WebSocket with the token. A connection with a wrong token was
  **rejected**. Origin is checked against an allow list.
- Sending `{"type":"prompt","message":"/podcast-ping"}` ran the extension
  command (response `disposition: "handled"`, no model call). The extension
  asked the page, the page answered, and pi emitted a `notify` UI record with
  the page's reply.

## Not proven (UNVERIFIED)

- A model-initiated tool call (`pi.registerTool`) travelling the same path.
  The call path in the spike is the one a tool would use, but no model was run.
- Which model pi should use; pi has its own provider settings and credentials,
  separate from the page's key. Using pi spends pi's provider, not the browser
  key, unless configured otherwise.
- Safari, and an HTTPS Pages origin reaching `ws://127.0.0.1` (mixed content
  and Chrome's Private Network Access rules). Only an `http://127.0.0.1` page
  was tested.
- Pi's extension API is version specific (1.5.2 here); pin and re-test on
  upgrade.
- Pi extensions run with full user permissions. The bridge must stay on
  127.0.0.1, require the token and the Origin allow list, and expose only the
  explicit podcast tools.

## Consequence for T39

Layer 1 (in-page agent on the OpenAI Responses API behind `AgentBridge`) is
independent of pi and ships first. Layer 2 is this bridge: a `pi-podcast-bridge`
extension package with tools such as `podcast_research`, `podcast_script`,
`podcast_narrate`, `podcast_render`, `podcast_export`, each requiring the page's
per-run consent and cost disclosure before any paid call.
