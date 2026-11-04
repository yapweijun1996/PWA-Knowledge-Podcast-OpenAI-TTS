import test from "node:test";
import assert from "node:assert/strict";
import { makeProject, current } from "../src/model.ts";
import { demoAudio, joinDemoWavs } from "../src/audio.ts";
import { DisabledGatewayProvider } from "../src/provider.ts";
test("audio becomes stale after script, voice or instructions change", () => {
  const p = makeProject(true),
    s = {
      ...p.segments[0],
      audio: new Blob(["x"]),
      audioFor: p.segments[0].text,
      voice: p.voice,
      instructions: p.instructions,
    };
  assert.equal(current(s, p), true);
  assert.equal(current({ ...s, text: s.text + "。" }, p), false);
  assert.equal(current(s, { ...p, voice: "coral" }), false);
  assert.equal(current(s, { ...p, instructions: "Changed" }), false);
});
test("demo creates valid WAV and cancellation rejects", async () => {
  const controller = new AbortController();
  const blob = await demoAudio("hello", controller.signal);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  assert.equal(blob.type, "audio/wav");
  assert.equal(new TextDecoder().decode(bytes.slice(0, 4)), "RIFF");
  assert.equal(new TextDecoder().decode(bytes.slice(8, 12)), "WAVE");
  assert.ok(bytes.length > 44);
  const c = new AbortController();
  const result = demoAudio("hello", c.signal);
  c.abort();
  await assert.rejects(result, { name: "AbortError" });
});
test("paid provider fails closed", async () => {
  await assert.rejects(
    new DisabledGatewayProvider().generate(
      { text: "hello", voice: "marin", instructions: "", requestId: "id" },
      new AbortController().signal,
    ),
    /no gateway is configured/,
  );
});

test("assembled demo WAV contains both samples", async () => {
  const c = new AbortController();
  const a = await demoAudio("test", c.signal);
  const joined = await joinDemoWavs([a, a]);
  const v = new DataView(await joined.arrayBuffer());
  assert.equal(v.getUint32(40, true), 2 * (a.size - 44));
  assert.equal(joined.size, 44 + 2 * (a.size - 44));
});
test("script backup excludes audio and restores with a new identity", async () => {
  const { createBackup, readBackup } = await import("../src/backup.ts");
  const p = makeProject(true);
  p.segments[0].audio = new Blob(["private bytes"]);
  const blob = createBackup(p);
  const text = await blob.text();
  assert.equal(text.includes("private bytes"), false);
  const restored = await readBackup(new File([blob], "backup.json"));
  assert.notEqual(restored.id, p.id);
  assert.equal(restored.segments[0].text, p.segments[0].text);
  assert.equal(restored.segments[0].audio, undefined);
  await assert.rejects(
    readBackup(new File(["{}"], "bad.json")),
    /Invalid backup/,
  );
});

test("gateway adapter enforces HTTPS, fails safely and validates audio", async () => {
  const { GatewayProvider } = await import("../src/provider.ts");
  assert.throws(
    () => new GatewayProvider("http://example.com/tts", "session"),
    /Invalid gateway configuration/,
  );
  assert.throws(
    () =>
      new GatewayProvider("https://api.openai.com/v1/audio/speech", "session"),
    /Invalid gateway configuration/,
  );
  assert.throws(
    () => new GatewayProvider("https://gateway.example/tts", "sk-example"),
    /Invalid gateway configuration/,
  );
  const clip = await demoAudio("sample", new AbortController().signal);
  let options;
  const mock = async (_url, init) => {
    options = init;
    return new Response(clip, {
      headers: {
        "content-type": "audio/wav",
        "content-length": String(clip.size),
      },
    });
  };
  const provider = new GatewayProvider(
    "https://gateway.example/tts",
    "short-lived-session",
    mock,
  );
  const result = await provider.generate(
    { text: "hello", voice: "marin", instructions: "calm", requestId: "job-1" },
    new AbortController().signal,
  );
  assert.equal(result.size, clip.size);
  assert.equal(options.redirect, "error");
  assert.equal(options.cache, "no-store");
  assert.equal(options.credentials, "omit");
  const invalid = new GatewayProvider(
    "https://gateway.example/tts",
    "session",
    async () =>
      new Response("not audio", {
        status: 200,
        headers: { "content-type": "text/html", "content-length": "100" },
      }),
  );
  await assert.rejects(
    invalid.generate(
      { text: "hello", voice: "marin", instructions: "", requestId: "job-1" },
      new AbortController().signal,
    ),
    /Invalid audio response/,
  );
});
