# Pi coding agent bridge experiment (T39)

Pi is a terminal agent. A browser page communicates with its RPC process
through an explicitly loaded extension.

```text
Local Chromium fixture <-- authenticated loopback WebSocket --> Pi extension
```

The extension binds to a random port on `127.0.0.1`. One page may pair using a
random 256-bit token and the exact allowed origin. The fixture exposes a ping
only. The browser's production tools continue to use the in-page
[AgentBridge](AGENT.md).

## Run the experiment

With Node 24, Pi installed on PATH and the repository's Chromium dependency
installed, run either command from the repository root.

```sh
node spikes/pi-bridge/run.mjs
node spikes/pi-bridge/run.mjs --tool
```

The first command verifies Pi's RPC slash command. The second also selects
Pi's in-memory fixture model and exercises a registered Pi tool. On a clean
checkout, `npm ci` and `npx playwright install chromium` provide the browser
dependencies. Set `PODCAST_PI_BIN` to an absolute executable path to select
another compatible Pi installation. The extension resolves the WebSocket
dependency through Pi's installed package.

The runner gives Pi temporary settings and working directories, disables
discovery, skills, project context, built-in tools and MCP, and passes only
its explicit extension and local fixture configuration. It closes Chromium,
Pi and both HTTP fixtures and removes the temporary directory.

## Verified on 2026-11-23

Pi 1.4.0, Node 24 and real Chromium on macOS passed the following checks.

- RPC returned the explicitly registered `/podcast-ping` command. Chromium
  rejected the wrong token, a different loopback origin with the correct
  token and a second page after pairing.
- The slash command reached the paired page and returned a Pi notification.
  RPC marked it `handled` without starting a model.
- Pi's in-memory model fixture invoked `podcast_bridge_ping` on the same
  connection. RPC reported a successful tool execution with the expected
  page origin and the run settled. The fixture made zero provider requests
  and used zero provider credentials.

Production tool forwarding, real-model prompts, Safari, and connections from
the HTTPS Pages origin remain unverified. Extensions run with the user's
local permissions. A future production bridge would keep the loopback and
pairing boundaries and use the existing consent and cost disclosure for each
paid browser tool.
