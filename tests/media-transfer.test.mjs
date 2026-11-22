import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import test from "node:test";
import { wave } from "../server/audio.mjs";
import { downloadCheckpointAudio } from "../src/factory/media-transfer.ts";

test("audio continues while bytes arrive and aborts after a full minute without progress", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const wav = wave([Buffer.alloc(48000)]);
  let stream;
  t.mock.method(globalThis, "fetch", async (_, { signal }) => {
    const body = new ReadableStream({
      start(controller) {
        stream = controller;
        signal.addEventListener(
          "abort",
          () => controller.error(signal.reason),
          { once: true },
        );
      },
    });
    return new Response(body, {
      headers: {
        "content-length": String(wav.length),
        "content-type": "audio/wav",
      },
    });
  });
  const read = () =>
    downloadCheckpointAudio(
      "http://localhost/fixture",
      "audio/wav",
      new AbortController().signal,
    );
  const progressing = read();
  for (let offset = 0; offset < wav.length; offset += 16000) {
    await setImmediate();
    t.mock.timers.tick(45000);
    stream.enqueue(wav.subarray(offset, offset + 16000));
  }
  stream.close();
  assert.deepEqual(Buffer.from(await (await progressing).arrayBuffer()), wav);
  const stalled = assert.rejects(read(), { name: "TimeoutError" });
  await setImmediate();
  t.mock.timers.tick(60001);
  await stalled;
});
