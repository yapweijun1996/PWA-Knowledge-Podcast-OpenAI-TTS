# Narration evaluation fixture and rubric

Use this short Mandarin fixture for each comparison, keeping the requested voice
and narrator instructions identical. It states no measured rainfall values.

1. 同一场暴雨，五公里外能差多少？有时候，一个街区正下着大雨。
2. 附近的另一个街区却还没开始下。云团的位置和移动方向会影响降雨分布。
3. 要比较两个地点的雨量，需要核对相同时段的官方测站数据。

First check every word against the fixture: omissions, additions, reordered words,
truncation or uncertain capture fail the comparison regardless of sound quality.
Then ask a listener to rate each item from 0 (poor) to 3 (good), and note the
exact boundary or phrase where a difference occurs:

- Narrator identity and timbre stay recognizable throughout.
- Emotion and emphasis fit the whole passage without an abrupt reset.
- Pacing and breathing sound natural across sentence and clip boundaries.
- Boundary pauses are neither clipped nor conspicuously long; clicks are absent.

Record model and voice requested, any session settings actually reported, exact
text and instructions, approach, segment order, duration, listener scores, and
actual charge. Do not claim that a higher score proves deterministic voice
continuity. Do not log keys or publish private recordings. The three planned
approaches are a single response, multiple responses in one Realtime session,
and separate sessions with bounded adjacent text context. Their reliability,
partial-recovery and cost trade-offs need actual comparison; T05 remains open.
The owner authorized up to US$5 for a small comparison, but no paid comparison
has been performed yet.

For local join comparisons, prepare and listen with no added pause, then with an
optional 0.2- or 0.5-second pause. Changing the option invalidates the prepared
preview; preparing it again enables an A/B comparison, and selecting zero restores
the unprocessed join. The original clips are not modified. Silence insertion does
not repair clicks, change delivery or guarantee a more natural result.

## Planned controlled comparison (not yet run)

Use the same short fixture above, requested voice and narrator instructions for
all approaches. Keep every take and record failures; do not automatically retry.
The experimental browser runner shows the fixture and exact session inputs,
asks for explicit cost consent and runs this sequence with at most 1024 output
tokens per response. It has only been validated with intercepted provider events;
actual provider behavior and audible results remain unverified.

| Approach             | Request sequence                        | Text and context                                                                                                                                                                                                              | Recovery and cost considerations                                                                                                                       |
| -------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A: one response      | One session, one response               | Send all three fixture paragraphs in order as one input.                                                                                                                                                                      | One failure can affect the whole recording; one long response has no per-section recovery.                                                             |
| B: shared session    | One session, three sequential responses | Send paragraph 1, then 2, then 3 in the same session; wait for capture and local save before requesting the next. The default conversation may carry previous turns.                                                          | Earlier saved takes survive a later failure; context and output usage can grow across turns.                                                           |
| C: separate sessions | Three sessions, one response each       | Send only the current paragraph as text to be read. Include at most the immediately preceding and following fixture paragraphs as clearly marked reference-only context in the instructions; never ask to speak that context. | A failed segment can be repeated separately, but every session may reset delivery. Context increases input usage and may still be spoken accidentally. |

For C, paragraph 1 has no preceding context, paragraph 2 has paragraphs 1 and 3,
and paragraph 3 has no following context. Compare the assembled order against
the fixture, including the boundaries. The [Realtime conversation documentation](https://developers.openai.com/api/docs/guides/realtime-conversations)
describes session conversation state, but neither shared state nor contextual
instructions guarantees consistent expression or exact wording.

The runner previews every text and instruction, keeps the user's key in page
memory, limits each response to 1024 output tokens, makes no more than the seven
described responses in one run, saves each take before the next request, and
stops on cancellation, capture or storage failure without automatic retry. An
incomplete response is retained when audio can be captured, but cannot be marked
complete or included in a full export. A token limit is not a guaranteed dollar cap: model prices, usage and
account billing need checking on the [model's current pricing page](https://developers.openai.com/api/docs/models/gpt-realtime-2.1-mini)
and the user's usage dashboard. The owner has authorized at most US$5 in total;
stop if the remaining budget or actual cost cannot be established. No result,
spend or subjective improvement is asserted until a person listens and the usage
is reviewed. T05 and the dependent T06 remain pending.
