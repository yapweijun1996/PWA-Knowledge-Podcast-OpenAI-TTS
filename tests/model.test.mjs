import test from "node:test";
import assert from "node:assert/strict";
import { makeProject, current } from "../src/model.ts";
import { demoAudio, joinDemoWavs } from "../src/audio.ts";
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
  assert.equal(current(s, p, "openai"), false);
  assert.equal(current({ ...s, audioKind: "openai" }, p, "openai"), true);
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
  p.segments[0].alternative = {
    audio: new Blob(["alternate private bytes"]),
    audioKind: "openai",
    audioFor: p.segments[0].text,
    voice: p.voice,
    instructions: "alternate-only metadata",
  };
  const blob = createBackup(p);
  const text = await blob.text();
  assert.equal(text.includes("private bytes"), false);
  assert.equal(text.includes("alternate-only metadata"), false);
  assert.equal(text.includes('"alternative"'), false);
  const restored = await readBackup(new File([blob], "backup.json"));
  assert.notEqual(restored.id, p.id);
  assert.equal(restored.segments[0].text, p.segments[0].text);
  assert.equal(restored.segments[0].audio, undefined);
  await assert.rejects(
    readBackup(new File(["{}"], "bad.json")),
    /Invalid backup/,
  );
});

test("WAV assembly rejects incompatible sample rates", async () => {
  const a = await demoAudio("x", new AbortController().signal);
  const bytes = await a.arrayBuffer();
  new DataView(bytes).setUint32(24, 48000, true);
  await assert.rejects(
    joinDemoWavs([a, new Blob([bytes], { type: "audio/wav" })]),
    /incompatible/,
  );
});

test("optional pauses preserve every PCM sample including quiet endings", async () => {
  for (const rate of [16000, 48000]) {
    const base = await demoAudio("fixture", new AbortController().signal);
    const one = await base.arrayBuffer();
    const two = await base.arrayBuffer();
    for (const buffer of [one, two]) {
      const view = new DataView(buffer);
      view.setUint32(24, rate, true);
      view.setUint32(28, rate * 2, true);
    }
    const a = new DataView(one);
    const b = new DataView(two);
    a.setInt16(one.byteLength - 2, 1, true);
    b.setInt16(44, -1, true);
    const joined = new DataView(
      await (
        await joinDemoWavs([new Blob([one]), new Blob([two])], 200)
      ).arrayBuffer(),
    );
    const pauseBytes = rate * 0.2 * 2;
    const boundary = one.byteLength;
    assert.equal(joined.getInt16(boundary - 2, true), 1);
    for (let i = boundary; i < boundary + pauseBytes; i += 2)
      assert.equal(joined.getInt16(i, true), 0);
    assert.equal(joined.getInt16(boundary + pauseBytes, true), -1);
    assert.deepEqual(
      new Uint8Array(joined.buffer, 44, one.byteLength - 44),
      new Uint8Array(one, 44),
    );
    assert.deepEqual(
      new Uint8Array(joined.buffer, boundary + pauseBytes, two.byteLength - 44),
      new Uint8Array(two, 44),
    );
    assert.equal(
      joined.byteLength,
      one.byteLength + two.byteLength - 44 + pauseBytes,
    );
    assert.equal(a.getInt16(one.byteLength - 2, true), 1);
    assert.equal(b.getInt16(44, true), -1);
    const original = await joinDemoWavs([new Blob([one]), new Blob([two])], 0);
    assert.equal(original.size, one.byteLength + two.byteLength - 44);
  }
  const source = await demoAudio("boundary", new AbortController().signal);
  const left = await source.arrayBuffer(),
    right = await source.arrayBuffer();
  new Uint8Array(left, 44).fill(0);
  new Uint8Array(right, 44).fill(0);
  const silent = new Uint8Array(
    await (
      await joinDemoWavs([new Blob([left]), new Blob([right])], 200)
    ).arrayBuffer(),
  );
  assert.ok(silent.subarray(44).every((sample) => sample === 0));
  new DataView(left).setInt16(left.byteLength - 2, 32767, true);
  new DataView(right).setInt16(44, -32768, true);
  const abrupt = new DataView(
    await (
      await joinDemoWavs([new Blob([left]), new Blob([right])], 0)
    ).arrayBuffer(),
  );
  assert.equal(abrupt.getInt16(left.byteLength - 2, true), 32767);
  assert.equal(abrupt.getInt16(left.byteLength, true), -32768);
  await assert.rejects(joinDemoWavs([new Blob()], 1001), /pause/);
});
