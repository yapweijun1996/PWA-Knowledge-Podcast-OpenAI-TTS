import assert from "node:assert/strict";
import test from "node:test";
import { setImmediate } from "node:timers/promises";
import { inspect } from "node:util";
import { validateAudio } from "../shared/audio-record.ts";
import { studioBase } from "../shared/factory.ts";
import {
  generateNarration,
  REALTIME_MODEL,
} from "../src/factory/browser-narrator.ts";
import { MAX_INSTRUCTIONS_LENGTH, MAX_SEGMENT_LENGTH } from "../src/limits.ts";

const fakeKey = "sk-fixture-only-narrator-key";
const sampleRate = 24_000;
const samples = (milliseconds, value) =>
  new Float32Array((milliseconds * sampleRate) / 1000).fill(value);

function fixture(t) {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 });
  t.mock.method(performance, "now", () => Date.now());
  const calls = [];
  const sent = [];
  const takes = [];
  const peer = [];
  const sink = [];
  const worklets = [];
  const loaded = [];
  const released = [];
  const controller = new AbortController();
  const channel = {
    readyState: "connecting",
    send(message) {
      sent.push(JSON.parse(message));
    },
    close() {
      released.push("channel");
      this.onclose?.();
    },
  };

  class Track extends EventTarget {
    kind = "audio";
    stop() {
      released.push("track");
    }
  }
  class Peer {
    connectionState = "new";
    constructor() {
      peer.push(this);
    }
    addTransceiver(kind, options) {
      assert.equal(kind, "audio");
      assert.deepEqual(options, { direction: "recvonly" });
    }
    createDataChannel(name) {
      assert.equal(name, "oai-events");
      return channel;
    }
    async createOffer() {
      return { type: "offer", sdp: "fixture-offer" };
    }
    async setLocalDescription(offer) {
      assert.equal(offer.sdp, "fixture-offer");
    }
    async setRemoteDescription(answer) {
      assert.deepEqual(answer, { type: "answer", sdp: "fixture-answer" });
      emit({ type: "session.created", session: fake.session });
      this.ontrack({ track: new Track() });
      channel.readyState = "open";
      channel.onopen();
    }
    close() {
      released.push("peer");
      this.connectionState = "closed";
      this.onconnectionstatechange?.();
    }
  }
  class AudioContext {
    state = "suspended";
    destination = {};
    audioWorklet = {
      async addModule(url) {
        loaded.push(url);
        await fake.load();
      },
    };
    constructor(options) {
      assert.equal(options.sampleRate, sampleRate);
      this.sampleRate = options.sampleRate;
    }
    async resume() {
      this.state = "running";
    }
    createMediaStreamSource(stream) {
      assert.equal(stream.tracks[0].kind, "audio");
      return {
        connect(node) {
          assert.equal(node, worklets.at(-1));
        },
        disconnect() {
          released.push("source");
        },
      };
    }
    async close() {
      this.state = "closed";
      released.push("context");
    }
  }
  class Audio {
    constructor() {
      sink.push(this);
    }
    async play() {
      assert.equal(this.muted, true);
      assert.equal(this.srcObject.tracks[0].kind, "audio");
    }
    pause() {
      released.push("sink");
    }
  }
  class Worklet {
    stops = 0;
    port = {
      postMessage: (command) => {
        if (command === "start") {
          queueMicrotask(() =>
            this.port.onmessage?.({ data: { type: "ready" } }),
          );
        } else {
          assert.equal(command, "stop");
          this.stops++;
          queueMicrotask(() => {
            if (fake.flushed) feed(fake.flushed);
            this.port.onmessage?.({ data: { type: "done" } });
          });
        }
      },
      close() {
        released.push("port");
      },
    };
    constructor(_, processor) {
      assert.equal(processor, "podcast-pcm-capture");
      worklets.push(this);
    }
    connect() {}
    disconnect() {
      released.push("worklet");
    }
  }

  const setGlobal = (name, value) => {
    const original = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value,
    });
    t.after(() => {
      if (original) Object.defineProperty(globalThis, name, original);
      else delete globalThis[name];
    });
  };
  setGlobal("RTCPeerConnection", Peer);
  setGlobal("AudioContext", AudioContext);
  setGlobal("AudioWorkletNode", Worklet);
  setGlobal("Audio", Audio);
  setGlobal(
    "MediaStream",
    class {
      constructor(tracks) {
        this.tracks = tracks;
      }
    },
  );
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, "https://api.openai.com/v1/realtime/calls");
    calls.push({ url, options });
    return fake.fetch();
  });

  function emit(event) {
    channel.onmessage?.({ data: JSON.stringify(event) });
  }
  function feed(chunk) {
    worklets
      .at(-1)
      .port.onmessage?.({ data: { type: "data", samples: chunk } });
  }
  function done(status = "completed", id = "fixture-response") {
    emit({ type: "response.done", response: { status, id } });
  }
  function drained(id = "fixture-response") {
    emit({ type: "output_audio_buffer.stopped", response_id: id });
  }
  async function advance(ms) {
    t.mock.timers.tick(ms);
    await setImmediate();
  }
  const fake = {
    calls,
    sent,
    takes,
    peer,
    sink,
    worklets,
    loaded,
    released,
    channel,
    controller,
    emit,
    feed,
    done,
    drained,
    advance,
    load: async () => {},
    fetch: () => new Response("fixture-answer"),
    session: {
      model: "gpt-realtime-fixture",
      audio: { output: { voice: "cedar" } },
    },
    async finish(status) {
      feed(samples(600, 0.25));
      done(status);
      drained();
      await advance(2_000);
    },
    run(options) {
      return generateNarration({
        key: fakeKey,
        text: ["First line.", "Second line."],
        voice: "marin",
        instructions: "Speak clearly.",
        signal: controller.signal,
        consentGranted: true,
        onTake: (take, index) => takes.push({ take, index }),
        ...options,
      });
    },
    spoken: () =>
      sent
        .filter((event) => event.type === "conversation.item.create")
        .map((event) => event.item.content[0].text),
    responseCount: () =>
      sent.filter((event) => event.type === "response.create").length,
  };
  return fake;
}

test("feature preflight stops before loading the worklet or contacting the provider", async (t) => {
  const fake = fixture(t);
  const peer = globalThis.RTCPeerConnection;
  globalThis.RTCPeerConnection = undefined;
  await assert.rejects(fake.run(), /不支持实时音频采集/);
  globalThis.RTCPeerConnection = peer;
  globalThis.AudioWorkletNode = undefined;
  await assert.rejects(fake.run(), /不支持实时音频采集/);
  assert.equal(fake.loaded.length, 0);
  assert.equal(fake.calls.length, 0);
});

test("missing, failing, and stalled worklet startup all stop before fetch", async (t) => {
  const fake = fixture(t);
  const context = globalThis.AudioContext;
  globalThis.AudioContext = class extends context {
    audioWorklet = undefined;
  };
  await assert.rejects(fake.run(), /不支持实时音频采集/);
  globalThis.AudioContext = context;
  fake.load = () => Promise.reject(new Error(fakeKey));
  await assert.rejects(fake.run(), /无法启动浏览器音频采集/);
  fake.load = () => new Promise(() => {});
  const rejected = assert.rejects(fake.run(), /无法启动浏览器音频采集/);
  await setImmediate();
  await fake.advance(8_000);
  await rejected;
  assert.equal(fake.calls.length, 0);
  assert.deepEqual(fake.released, ["context", "context", "context"]);
});

test("consent and every segment, instruction and token limit are checked before fetch", async (t) => {
  const fake = fixture(t);
  for (const options of [
    { consentGranted: false },
    { onTake: undefined },
    { key: " " },
    { voice: "unsupported" },
    { text: [] },
    { text: ["one", "two", "three", "four"] },
    { text: ["valid", " "] },
    { text: ["valid", "字".repeat(MAX_SEGMENT_LENGTH + 1)] },
    { instructions: "x".repeat(MAX_INSTRUCTIONS_LENGTH + 1) },
    { text: `Key ${fakeKey}` },
    { instructions: `Key ${fakeKey}` },
    ...[0, 1.5, 1025, Infinity].map((maxOutputTokens) => ({ maxOutputTokens })),
  ]) {
    await assert.rejects(fake.run(options));
  }
  fake.controller.abort(new Error(fakeKey));
  await assert.rejects(fake.run(), { name: "AbortError", message: "已取消。" });
  assert.equal(fake.loaded.length, 0);
  assert.equal(fake.calls.length, 0);
});

test("requests a single session, snapshots exact text, and saves each take in order", async (t) => {
  const fake = fixture(t);
  const firstSave = Promise.withResolvers();
  const first = "字".repeat(MAX_SEGMENT_LENGTH);
  const text = [first, " Second line. ", "Third line."];
  const instructions = "x".repeat(MAX_INSTRUCTIONS_LENGTH);
  const run = fake.run({
    text,
    instructions,
    maxOutputTokens: 1024,
    async onTake(take, index) {
      assert.equal(fake.responseCount(), index + 1);
      fake.takes.push({ take, index });
      if (index === 0) await firstSave.promise;
    },
  });
  text[1] = "Edited during the run";
  await setImmediate();
  assert.deepEqual(fake.loaded, [`${studioBase}pcm-capture-worklet.js`]);
  assert.deepEqual(fake.spoken(), [first]);
  await fake.finish();
  assert.equal(fake.responseCount(), 1);
  assert.deepEqual(
    fake.takes.map(({ index }) => index),
    [0],
  );
  firstSave.resolve();
  await setImmediate();
  assert.deepEqual(fake.spoken(), [first, " Second line. "]);
  await fake.finish();
  assert.deepEqual(fake.spoken(), [first, " Second line. ", "Third line."]);
  await fake.finish();
  const results = await run;
  assert.deepEqual(
    results,
    fake.takes.map(({ take }) => take),
  );
  assert.deepEqual(
    fake.takes.map(({ index }) => index),
    [0, 1, 2],
  );
  assert.equal(fake.calls.length, 1);
  assert.equal(fake.sent.length, 6);

  const [{ options }] = fake.calls;
  assert.equal(options.headers.Authorization, `Bearer ${fakeKey}`);
  assert.equal(options.cache, "no-store");
  assert.equal(options.credentials, "omit");
  assert.equal(options.redirect, "error");
  assert.equal(options.referrerPolicy, "no-referrer");
  assert.equal(options.body.get("sdp"), "fixture-offer");
  const session = JSON.parse(options.body.get("session"));
  assert.equal(session.model, REALTIME_MODEL);
  assert.equal(session.audio.output.voice, "marin");
  assert.equal(session.max_output_tokens, 1024);
  assert.ok(session.instructions.endsWith(instructions));
  for (const take of results) {
    assert.equal(take.complete, true);
    assert.deepEqual(take.provenance, {
      requestedModel: REALTIME_MODEL,
      requestedVoice: "marin",
      requestedInstructions: session.instructions,
      effectiveModel: "gpt-realtime-fixture",
      effectiveVoice: "cedar",
      responseStatus: "completed",
    });
    await validateAudio(take.audio, take.audio.type);
  }
  assert.equal(fake.sink[0].muted, true);
  assert.equal(fake.sink[0].srcObject, null);
  assert.deepEqual(
    new Set(fake.released),
    new Set([
      "source",
      "track",
      "channel",
      "peer",
      "sink",
      "worklet",
      "port",
      "context",
    ]),
  );
});

test("a continuity reference stays in session instructions and out of spoken input", async (t) => {
  const fake = fixture(t);
  const reference = "Reference only. Do not read: Next line.";
  const run = fake.run({
    text: "Current line.",
    instructions: reference,
    maxOutputTokens: 1,
  });
  await setImmediate();
  await fake.finish();
  const [take] = await run;
  assert.deepEqual(fake.spoken(), ["Current line."]);
  assert.ok(take.provenance.requestedInstructions.endsWith(reference));
  assert.equal(
    JSON.parse(fake.calls[0].options.body.get("session")).max_output_tokens,
    1,
  );
});

test("cancellation during a save waits for it, keeps the take, and stops", async (t) => {
  const fake = fixture(t);
  const save = Promise.withResolvers();
  let settled = false;
  const run = fake.run({
    async onTake(take, index) {
      await save.promise;
      fake.takes.push({ take, index });
    },
  });
  const rejected = assert
    .rejects(run, { name: "AbortError", message: "已取消。" })
    .then(() => {
      settled = true;
    });
  await setImmediate();
  await fake.finish();
  fake.controller.abort(new Error(fakeKey));
  await setImmediate();
  assert.equal(settled, false);
  assert.equal(fake.responseCount(), 1);
  save.resolve();
  await rejected;
  assert.deepEqual(
    fake.takes.map(({ index }) => index),
    [0],
  );
  assert.equal(fake.takes[0].take.complete, true);
  assert.equal(fake.responseCount(), 1);
  assert.equal(fake.calls.length, 1);
});

test("failed save surfaces the error and leaves the received WAV available for local recovery", async (t) => {
  const fake = fixture(t);
  let recovery;
  const persist = (take, index) => fake.takes.push({ take, index });
  const run = fake.run({
    text: ["One.", "Two.", "Three."],
    async onTake(take, index) {
      if (index === 1) {
        recovery = { take, index };
        throw new DOMException("Fixture quota failure", "QuotaExceededError");
      }
      persist(take, index);
    },
  });
  const rejected = assert.rejects(run, {
    name: "QuotaExceededError",
    message: "Fixture quota failure",
  });
  await setImmediate();
  await fake.finish();
  await fake.finish();
  await rejected;
  assert.deepEqual(fake.spoken(), ["One.", "Two."]);
  assert.deepEqual(
    fake.takes.map(({ index }) => index),
    [0],
  );
  await validateAudio(recovery.take.audio, "audio/wav");
  persist(recovery.take, recovery.index);
  assert.deepEqual(
    fake.takes.map(({ index }) => index),
    [0, 1],
  );
  assert.equal(fake.calls.length, 1);
  assert.equal(fake.responseCount(), 2);
});

for (const preserveIncomplete of [false, true]) {
  test(`provider-reported incomplete audio has opt-in preservation (${preserveIncomplete})`, async (t) => {
    const fake = fixture(t);
    const run = fake.run({ preserveIncomplete });
    const outcome = preserveIncomplete
      ? run
      : assert.rejects(run, /语音生成未完成/);
    await setImmediate();
    await fake.finish("incomplete");
    const results = await outcome;
    if (preserveIncomplete) {
      assert.equal(results.length, 1);
      assert.equal(fake.takes[0].take, results[0]);
      assert.equal(results[0].complete, false);
      assert.equal(results[0].provenance.responseStatus, "incomplete");
      await validateAudio(results[0].audio, "audio/wav");
    } else {
      assert.deepEqual(fake.takes, []);
    }
    assert.equal(fake.responseCount(), 1);
    assert.equal(fake.calls.length, 1);
  });
}

test("waits for delayed first audio and the worklet's final flush", async (t) => {
  const fake = fixture(t);
  fake.flushed = samples(20, 0.3);
  const run = fake.run({ text: "Delayed audio." });
  await setImmediate();
  fake.done();
  fake.drained();
  await fake.advance(3_600);
  assert.equal(fake.worklets[0].stops, 0);
  fake.feed(samples(600, 0.25));
  await fake.advance(2_000);
  const [take] = await run;
  const wav = new DataView(await take.audio.arrayBuffer());
  assert.equal(wav.byteLength, 44 + (sampleRate * 620 * 2) / 1_000);
  assert.equal(wav.getInt16(wav.byteLength - 2, true), Math.trunc(0.3 * 32767));
});

test("late audible frames within the quiet window extend the drain wait", async (t) => {
  const fake = fixture(t);
  const run = fake.run({ text: "A pause between bursts." });
  await setImmediate();
  fake.feed(samples(500, 0.25));
  fake.done();
  fake.drained();
  await fake.advance(1_800);
  fake.feed(samples(1_300, 0));
  fake.feed(samples(500, -0.25));
  await fake.advance(400);
  assert.equal(fake.worklets[0].stops, 0);
  await fake.advance(1_600);
  const [take] = await run;
  const wav = new DataView(await take.audio.arrayBuffer());
  assert.equal(wav.byteLength, 44 + (sampleRate * 2_300 * 2) / 1_000);
  assert.equal(wav.getInt16(44, true), 8191);
  assert.equal(wav.getInt16(wav.byteLength - 2, true), -8192);
});

test("a long silence before provider drain leaves both audible bursts intact", async (t) => {
  const fake = fixture(t);
  const run = fake.run({ text: "A long pause." });
  await setImmediate();
  fake.feed(samples(500, 0.25));
  await fake.advance(3_500);
  assert.equal(fake.worklets[0].stops, 0);
  fake.feed(samples(3_500, 0));
  fake.feed(samples(500, -0.25));
  fake.done();
  fake.drained();
  await fake.advance(2_000);
  const [take] = await run;
  const wav = new DataView(await take.audio.arrayBuffer());
  assert.equal(wav.byteLength, 44 + (sampleRate * 4_500 * 2) / 1_000);
  assert.equal(wav.getInt16(44, true), 8191);
  assert.equal(wav.getInt16(wav.byteLength - 2, true), -8192);
});

test("WAV retains the V1 leading and low-level trailing padding", async (t) => {
  const fake = fixture(t);
  const run = fake.run({ text: "Quiet ending." });
  await setImmediate();
  fake.feed(samples(300, 0));
  fake.feed(samples(500, 1.3));
  fake.feed(samples(800, 0.0005));
  fake.done();
  fake.drained();
  await fake.advance(2_000);
  const [take] = await run;
  const wav = new DataView(await take.audio.arrayBuffer());
  assert.equal(wav.byteLength, 44 + (sampleRate * 900 * 2) / 1_000);
  assert.equal(wav.getInt16(44, true), 0);
  assert.equal(wav.getInt16(44 + sampleRate * 0.15 * 2, true), 32767);
  assert.equal(wav.getInt16(wav.byteLength - 2, true), 16);
});

test("silent capture and continuously audible drain hit their respective bounds", async (t) => {
  for (const audible of [false, true]) {
    await t.test(
      audible ? "drain deadline" : "first sound deadline",
      async (t) => {
        const fake = fixture(t);
        const rejected = assert.rejects(
          fake.run(),
          audible ? /无法确认音频/ : /未收到可听见的音频/,
        );
        await setImmediate();
        fake.done();
        fake.drained();
        if (audible) {
          for (let i = 0; i < 15; i++) {
            fake.feed(samples(1000, 0.05));
            await fake.advance(1000);
          }
        } else {
          fake.feed(samples(600, 0.0005));
          await fake.advance(8_000);
        }
        await rejected;
        assert.equal(fake.takes.length, 0);
        assert.equal(fake.responseCount(), 1);
      },
    );
  }
});

for (const [name, message, interrupt] of [
  ["an out-of-order stop", /顺序异常/, (fake) => fake.drained()],
  [
    "a mismatched response ID",
    /顺序异常/,
    (fake) => {
      fake.done();
      fake.drained("other");
    },
  ],
  [
    "the connection closing during drain",
    /连接/,
    (fake) => {
      fake.done();
      fake.drained();
      fake.channel.onclose();
    },
  ],
  [
    "cancellation during capture",
    { name: "AbortError" },
    (fake) => fake.controller.abort(),
  ],
  [
    "the PCM size bound",
    /音频过长/,
    (fake) => fake.feed(samples(125_001, 0.25)),
  ],
  [
    "an ambiguous provider failure",
    /OpenAI 请求失败/,
    (fake) => {
      fake.emit({ type: "error", error: { message: fakeKey } });
    },
  ],
  [
    "a failed response with preservation enabled",
    /语音生成未完成/,
    (fake) => fake.done("failed"),
  ],
]) {
  test(`stops without saving or requesting again after ${name}`, async (t) => {
    const fake = fixture(t);
    const rejected = assert.rejects(
      fake.run({ preserveIncomplete: true }),
      message,
    );
    await setImmediate();
    interrupt(fake);
    await rejected;
    assert.equal(fake.takes.length, 0);
    assert.equal(fake.responseCount(), 1);
    assert.equal(fake.calls.length, 1);
  });
}

test("bounds an SDP handshake and never sends a late offer after timeout", async (t) => {
  const fake = fixture(t);
  const offer = Promise.withResolvers();
  t.mock.method(
    globalThis.RTCPeerConnection.prototype,
    "createOffer",
    () => offer.promise,
  );
  const rejected = assert.rejects(fake.run(), /连接超时/);
  await setImmediate();
  await fake.advance(30_000);
  await rejected;
  offer.resolve({ type: "offer", sdp: "fixture-offer" });
  await setImmediate();
  assert.equal(fake.calls.length, 0);
  assert.ok(fake.released.includes("peer"));
});

test("bounds a failed-to-settle HTTP handshake without retrying", async (t) => {
  const fake = fixture(t);
  fake.fetch = () => new Promise(() => {});
  const rejected = assert.rejects(fake.run(), /连接超时/);
  await setImmediate();
  await fake.advance(30_000);
  await rejected;
  assert.equal(fake.calls.length, 1);
  assert.equal(fake.calls[0].options.signal.aborted, true);
  assert.equal(fake.responseCount(), 0);
});

test("missing response completion hits the session limit without another request", async (t) => {
  const fake = fixture(t);
  const rejected = assert.rejects(fake.run(), /请求超时/);
  await setImmediate();
  fake.feed(samples(500, 0.25));
  await fake.advance(120_000);
  await rejected;
  assert.equal(fake.responseCount(), 1);
  assert.equal(fake.takes.length, 0);
});

test("only authorization carries the key and errors and logs redact it", async (t) => {
  const fake = fixture(t);
  const logs = [];
  for (const method of ["log", "info", "debug", "warn", "error"]) {
    t.mock.method(console, method, (...values) => logs.push(values));
  }
  const assertRedacted = (error) => {
    assert.ok(!inspect(error, { showHidden: true }).includes(fakeKey));
    assert.ok(!String(error).includes(fakeKey));
    return true;
  };
  fake.fetch = async () => {
    throw new Error(`Fetch reflected ${fakeKey}`);
  };
  await assert.rejects(fake.run(), assertRedacted);
  fake.fetch = () => new Response(fakeKey, { status: 429 });
  await assert.rejects(fake.run(), assertRedacted);
  fake.fetch = () => new Response("fixture-answer");
  const run = fake.run({
    key: `  ${fakeKey}  `,
    onTake() {
      const error = new Error(`Save rejected ${fakeKey}`, {
        cause: new Error(fakeKey),
      });
      error.name = `SaveError ${fakeKey}`;
      throw error;
    },
  });
  const rejected = assert.rejects(run, (error) => {
    assert.match(error.message, /Save rejected \[已隐藏\]/);
    return assertRedacted(error);
  });
  await setImmediate();
  await fake.finish();
  await rejected;
  assert.equal(fake.responseCount(), 1);
  assert.equal(fake.calls.length, 3);
  for (const { url, options } of fake.calls) {
    assert.ok(!url.includes(fakeKey));
    assert.ok(!inspect([...options.body]).includes(fakeKey));
    assert.equal(options.headers.Authorization, `Bearer ${fakeKey}`);
  }
  assert.ok(!inspect(fake.sent).includes(fakeKey));
  assert.deepEqual(logs, []);
});
