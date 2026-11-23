# Provider contract check (T24), 2026-11-23

Question: can a page call OpenAI directly with a user-entered key, with no
server in between? This note records one real check. It is evidence for the
browser-first BYOK rule, not a quality or cost verdict.

## Method

- Real Chromium (Playwright headless shell, fake media device flags) loaded a
  blank page from a local origin (`http://127.0.0.1:<random port>`).
- Page code called `https://api.openai.com` with `fetch` using `credentials:
  "omit"` and the key in page memory only. The key was never logged or written
  to a file by the script; output was redacted.
- Models are the worker defaults in `server/openai.mjs`.
- One run of each call, plus one extra realtime run to check the output cap and
  one accidental repeat of the whole set. Token counts come from the provider's
  own `usage` fields. Dollar cost is **UNVERIFIED** (no price source was
  checked) and was small.

## Results (all from a browser origin, no proxy)

| Endpoint | Result |
| --- | --- |
| `POST /v1/responses`, plain text (`gpt-5.4-mini`) | works, HTTP 200, status `completed` |
| `POST /v1/responses`, strict `json_schema` output | works, HTTP 200, `completed` |
| `POST /v1/responses` with the `web_search` tool, `max_tool_calls: 1` | works, HTTP 200, one search call. One call used about 8,550 input tokens, so research is the expensive stage |
| `POST /v1/audio/transcriptions` (`gpt-transcribe`, multipart WAV) | works, HTTP 200, text returned |
| `POST /v1/realtime/calls` (WebRTC, `gpt-realtime-2.1-mini`, voice `alloy`) | works: HTTP 201, data channel opened, remote audio track arrived, 19 to 24 KB of inbound RTP audio for a short Mandarin line |

Conclusion: **no endpoint needs a proxy for CORS in this test.** The browser
path from the roadmap (M0) is viable for research, script, audio and transcript
QA.

## Finding that changes the design: output token cap

A five-character Mandarin line with `max_output_tokens: 256` ended
`incomplete`. With `1024` it ended `completed` and used 384 output tokens.
Audio output is token-heavy, so a small cap silently truncates speech. The
narrator must keep the cap at 1024 (the V1 value), treat `incomplete` as a
failed take, and show the cap in the cost disclosure.

## Not established (UNVERIFIED)

- Only Chromium was tested. Safari, Firefox and mobile are untested.
- Only a `127.0.0.1` origin was tested, not the GitHub Pages origin.
- Audio was not listened to; quality and continuity are unknown.
- Dollar cost per episode is unknown; only token counts were recorded.
- Rate limits and long-running sessions (a full episode) were not exercised.
- This tested the account's current key and model access on 2026-11-23.

## Addendum: merged narrator against the real provider (2026-11-23)

The merged `generateNarration` (T27, `src/factory/browser-narrator.ts`) was
bundled and run in real Chromium against the real provider with the key in
page memory, then its WAV was sent to `gpt-transcribe`.

- Result: one take, `complete: true`, provider status `completed`, `audio/wav`,
  273,106 bytes (about 5.7 s of 24 kHz mono audio), 13.5 s wall clock for the
  whole call.
- Transcript: "新加坡的组屋让不同族群的家庭住在同一栋楼里。" against the
  intended "新加坡的组屋，让不同族群的家庭住在同一栋楼里。" The words match; only a
  comma differs.
- This checks exact wording and completeness, as the narration rubric requires.
  It does **not** check delivery, pronunciation or continuity across segments.
  Nobody has listened to this audio. A single short sentence, one voice
  (`alloy`) and one run were tested.
