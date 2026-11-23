# In-page podcast agent

`createPodcastAgentBridge()` connects the browser Library, production pipeline,
renderer and publish-package builder. It accepts injected dependencies for tests
and other hosts. `AgentBridge.listTools()` returns strict function schemas and
paid flags. `callTool(name, args, ctx)` validates inputs and returns a
JSON-serializable status plus a compact result or message. Hosts can supply an
`AbortSignal`, a consent callback and an audit listener. `listAudit()` returns
the in-memory audit entries with timestamps, bounded argument summaries and
credential redaction. The interface is shared by the in-page runner and the
future transport described in [PI-BRIDGE.md](PI-BRIDGE.md).

`runAgent({ goal, tools, getKey, requestConsent, onEvent, ... })` uses Responses
function calls sequentially and emits a tool call and result for the host log.
It defaults to 12 model requests per run and caps the limit at 20. Each request
uses the current page key and an in-memory conversation with `store: false`.
A run ends on completion, abort, an error or the step limit.

## Consent and checkpoints

- The host displays the `label: "estimate"` disclosure for `agent_run` and
  approves the run before the first model request. The disclosure gives model
  request and output-token ceilings. Input tokens are billed separately.
- Each paid tool requests its own consent and includes the relevant estimated
  usage ceilings. Free tools skip consent. An ambiguous paid outcome returns
  `unknown_may_have_been_billed` and stops the run. Calls have deadlines.
- Browser production saves each stage and narration take before the next
  provider request. The tool adapter uses the production progress hook to
  stop between tools. The narration tool allows 1,024 output tokens per take.
- MP4 and ZIP artifacts are saved in the browser's `knowledge-podcast-agent`
  IndexedDB store. Hosts can resolve artifact IDs with
  `browserAgentArtifacts.get(id)`. Exports require an MP4 for the same Library
  snapshot. Tool results carry IDs and metadata.

| Tool                     | Consent | Input and result                                                                                  |
| ------------------------ | ------- | ------------------------------------------------------------------------------------------------- |
| `list_episodes`          | Free    | Lists recent Library summaries and the total count.                                               |
| `get_episode`            | Free    | Takes `episodeId` and returns its Library summary.                                                |
| `research_topic`         | Paid    | Takes `topic` and saves initial and cross-checked research in a new episode.                      |
| `write_script`           | Paid    | Takes a researched `episodeId` and saves the outline and script.                                  |
| `narrate_episode`        | Paid    | Takes a scripted `episodeId` and saves audio and transcription.                                   |
| `render_video`           | Free    | Takes an `episodeId` with current WAV audio and measured turn timings and saves an MP4.           |
| `export_publish_package` | Free    | Takes a rendered `episodeId` and saves a ZIP with the MP4, thumbnail and manual-upload materials. |

**UNVERIFIED** Live model calls, browser codec and IndexedDB behavior through
this agent, and the later UI and pi integrations. Tests use fake provider
requests and injected storage and media dependencies.
