import assert from "node:assert/strict";

const url = "https://example.org/primary-source";
const title = "Illustrative primary source";
const caveat = "The fixture covers one location only.";
export const firstText = "Did you notice how this works?";
export const dialogue = [
  {
    chapterId: "ch1",
    turns: [
      { host: "A", text: firstText, claimIds: [] },
      {
        host: "B",
        text: "According to this source, the example covers one location.",
        claimIds: ["C1"],
      },
    ],
  },
  {
    chapterId: "ch2",
    turns: [
      { host: "A", text: "这只是一个地方的例子。", claimIds: ["C1"] },
      { host: "B", text: "Betul. Let's keep that in mind.", claimIds: [] },
    ],
  },
];
export const intended = dialogue
  .flatMap((chapter) => chapter.turns.map((turn) => turn.text))
  .join("\n");
export const heard =
  "Did you notice this? According to the source, this covers one location. 这只是一个例子。 Betul.";

export function textResponse(text, annotations = [], extra = []) {
  return {
    status: "completed",
    model: "fixture-model",
    output: [
      ...extra,
      {
        type: "message",
        content: [{ type: "output_text", text, annotations }],
      },
    ],
  };
}

export function researchResponse() {
  const lines = [
    "CLAIM qualified | The example covers one location | " + caveat + " ",
    "SOURCE 2024-04-02 | 📚 ",
    "CLAIM supported | An unsupported number is 999 | None ",
  ];
  const cited = [url, url, "javascript:alert(1)"];
  let offset = 0;
  const annotations = lines.map((line, index) => {
    const start = offset + [...line].length;
    offset = start + cited[index].length + 1;
    return {
      type: "url_citation",
      start_index: start,
      end_index: start + cited[index].length,
      url: cited[index],
      title,
    };
  });
  return textResponse(
    lines.map((line, i) => line + cited[i]).join("\n"),
    annotations,
    [{ type: "web_search_call", status: "completed" }],
  );
}

export function pcmFixture() {
  const pcm = Buffer.alloc(24_000);
  for (let i = 0; i < pcm.length / 2; i++)
    pcm.writeInt16LE(Math.round(1500 * Math.sin(i / 10)), i * 2);
  return pcm;
}

export function fakeOpenAI({
  failOutline = false,
  failAudio = false,
  invalidScript = false,
  dynamic = false,
  failAudit = false,
  failTranscript = false,
  cast = 3,
} = {}) {
  const calls = [];
  const narrated = [];
  const fetcher = async (url, request) => {
    assert.equal(request.headers.Authorization, "Bearer fixture-only");
    assert.equal(request.redirect, "error");
    const path = new URL(url).pathname;
    if (path === "/v1/audio/transcriptions") {
      calls.push("transcript");
      if (failTranscript) {
        failTranscript = false;
        return Response.json({}, { status: 429 });
      }
      assert.equal(request.body.get("model"), "gpt-transcribe");
      const wav = Buffer.from(await request.body.get("file").arrayBuffer());
      assert.equal(wav.toString("ascii", 0, 4), "RIFF");
      return Response.json({ text: heard });
    }
    assert.equal(path, "/v1/responses");
    const params = JSON.parse(request.body);
    assert.equal(params.store, false);
    if (params.tools) {
      if (dynamic && params.max_tool_calls === 3) {
        calls.push("discovery");
        return Response.json(
          textResponse(
            "DAILY | A practical Singapore topic",
            [],
            [{ type: "web_search_call", status: "completed" }],
          ),
        );
      }
      if (dynamic && params.max_tool_calls === 6) {
        calls.push("audit");
        if (failAudit) {
          failAudit = false;
          return Response.json({}, { status: 429 });
        }
        assert.equal(JSON.parse(params.input).claims[0].id, "C1");
        const prefix =
          "CLAIM supported | C1 | Independently examined example. ";
        const url = "https://independent.test/example";
        return Response.json(
          textResponse(
            prefix + url,
            [
              {
                type: "url_citation",
                start_index: prefix.length,
                end_index: prefix.length + url.length,
                url,
                title: "Independent example",
              },
            ],
            [{ type: "web_search_call", status: "completed" }],
          ),
        );
      }
      calls.push("research");
      assert.equal(params.tools[0].type, "web_search");
      assert.equal(params.tool_choice, "required");
      assert.equal(params.max_tool_calls, 5);
      return Response.json(researchResponse());
    }
    assert.equal(params.text.format.strict, true);
    const name = params.text.format.name;
    if (name === "podcast_outline") {
      calls.push("outline");
      assert.equal(JSON.parse(params.input).claims[0].id, "C1");
      if (failOutline) {
        failOutline = false;
        return Response.json(
          { error: { message: "private provider diagnostics" } },
          { status: 429 },
        );
      }
      return Response.json(
        textResponse(
          JSON.stringify({
            ...(dynamic
              ? {
                  language:
                    JSON.parse(params.input).bounds.language === "auto"
                      ? "sg"
                      : JSON.parse(params.input).bounds.language,
                  hostCount: Math.min(
                    cast,
                    JSON.parse(params.input).bounds.maxHosts,
                  ),
                  targetSeconds: 60,
                  rationale: "以简短的讨论说明资料有限的例子。",
                }
              : {}),
            chapters: [
              {
                title: "What happened",
                angle: "Explain the example",
                claimIds: ["C1"],
              },
              {
                title: "What it means",
                angle: "Establish the limitation",
                claimIds: ["C1"],
              },
            ],
          }),
        ),
      );
    }
    assert.equal(name, "podcast_dialogue");
    assert.equal(JSON.parse(params.input).sources[0].published, "2024-04-02");
    calls.push("script");
    let chapters = structuredClone(dialogue);
    if (dynamic) {
      const available =
        JSON.parse(params.input).cast ?? ["A", "B", "C"].slice(0, cast);
      let turnIndex = 0;
      chapters = chapters.map((chapter) => ({
        ...chapter,
        turns: chapter.turns.map((turn) => ({
          ...turn,
          host: available[turnIndex++ % available.length],
          text:
            turn.text +
            " We will now look at the details and think about what this example can show for other listeners in this broad discussion.",
        })),
      }));
    }
    if (invalidScript) chapters[0].turns[1].claimIds = ["invented"];
    return Response.json(
      textResponse(JSON.stringify({ title: "Fixture episode", chapters })),
    );
  };
  const narrator = async (request) => {
    calls.push("audio");
    narrated.push(request);
    if (failAudio && narrated.length === 2) throw new Error("fixture failure");
    return pcmFixture();
  };
  return { fetcher, narrator, calls, narrated };
}
