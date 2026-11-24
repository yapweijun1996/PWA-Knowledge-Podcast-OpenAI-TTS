import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { ArrayBufferTarget, Muxer } from "mp4-muxer";
import { createTranslator } from "../src/i18n/index.ts";
import { maxEncodedBytes, mebibyte } from "../src/video/limits.ts";
import { MemorySink, Mp4StorageError } from "../src/video/mp4-sink.ts";
import {
  maxOpfsMp4Bytes,
  maxPendingOpfsBytes,
  maxStagedOpfsBytes,
  opfsHashChunkBytes,
  opfsQuotaReserveBytes,
  OpfsSink,
} from "../src/video/opfs-sink.ts";
import { renderEpisodeVideo } from "../src/video/render-client.ts";
import { renderVideo } from "../src/video/render.ts";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const quotaError = () => new DOMException("Disk full", "QuotaExceededError");

function fakeStorage({
  estimate = {},
  beforeWrite,
  beforeOpen,
  beforeClose,
  beforeRead,
} = {}) {
  const files = new Map();
  const trace = {
    writes: [],
    reads: [],
    pending: 0,
    peakPending: 0,
    aborts: 0,
  };
  const directory = {
    async getFileHandle(name, { create = false } = {}) {
      if (!files.has(name)) {
        if (!create) throw new DOMException("Missing file", "NotFoundError");
        files.set(name, new Uint8Array(0));
      }
      return {
        async createWritable() {
          await beforeOpen?.();
          let staged = new Uint8Array(0);
          return {
            async write({ type, position, data }) {
              assert.equal(type, "write");
              trace.pending += data.byteLength;
              trace.peakPending = Math.max(trace.peakPending, trace.pending);
              trace.writes.push({ position, size: data.byteLength });
              try {
                await beforeWrite?.();
                const end = position + data.byteLength;
                if (end > staged.length) {
                  const expanded = new Uint8Array(end);
                  expanded.set(staged);
                  staged = expanded;
                }
                staged.set(data, position);
              } finally {
                trace.pending -= data.byteLength;
              }
            },
            async close() {
              await beforeClose?.();
              files.set(name, staged);
            },
            async abort() {
              trace.aborts++;
            },
          };
        },
        async getFile() {
          assert.ok(files.has(name));
          return new (class extends File {
            arrayBuffer() {
              assert.fail("OPFS hashing must read slices");
            }
            slice(start, end, type) {
              const slice = super.slice(start, end, type);
              if (type) return slice;
              return {
                async arrayBuffer() {
                  trace.reads.push({ start, end });
                  await beforeRead?.();
                  return slice.arrayBuffer();
                },
              };
            }
          })([files.get(name)], name);
        },
      };
    },
    async removeEntry(name) {
      if (!files.delete(name))
        throw new DOMException("Missing file", "NotFoundError");
    },
  };
  return {
    directory,
    files,
    trace,
    storage: {
      getDirectory: async () => directory,
      estimate: async () => estimate,
    },
  };
}

for (const kind of ["memory", "opfs"]) {
  test(`${kind} sink applies out-of-order writes, patches and sparse gaps`, async () => {
    const fixture = fakeStorage();
    const sink =
      kind === "memory" ? new MemorySink() : await OpfsSink.open(fixture);
    await sink.write(7, Uint8Array.of(7, 8));
    await sink.write(0, Uint8Array.of(1, 2, 3, 4));
    await sink.write(2, Uint8Array.of(9, 10, 11));
    const expected = Uint8Array.of(1, 2, 9, 10, 11, 0, 0, 7, 8);
    const result = await sink.close();
    assert.deepEqual(new Uint8Array(await result.blob.arrayBuffer()), expected);
    assert.equal(result.blob.type, "video/mp4");
    assert.equal(result.sha256, sha256(expected));
    if (kind === "opfs") {
      assert.equal(result.opfsFileName, sink.fileName);
      assert.deepEqual(fixture.files.get(sink.fileName), expected);
    }
    await assert.rejects(async () => sink.write(0, expected));
    await sink.abort();
    await sink.abort();
    assert.equal(fixture.files.size, 0);
  });
}

test("OPFS hashes bounded reads across chunks and SHA-256 padding boundaries", async () => {
  for (const size of [0, 3, 55, 56, 63, 64, opfsHashChunkBytes * 2 + 57]) {
    const fixture = fakeStorage();
    const sink = await OpfsSink.open(fixture);
    const memory = new MemorySink();
    const bytes = Uint8Array.from(
      { length: size },
      (_, index) => (index * 31) % 251,
    );
    for (const output of [sink, memory]) {
      await output.write(0, bytes);
      if (size > 3) await output.write(0, Uint8Array.of(97, 98, 99));
    }
    const actual = await sink.close();
    const expected = await memory.close();
    assert.equal(actual.sha256, expected.sha256, `Digest at ${size} bytes`);
    assert.equal(actual.sha256, sha256(fixture.files.get(sink.fileName)));
    assert.deepEqual(
      fixture.trace.reads,
      Array.from(
        { length: Math.ceil(size / opfsHashChunkBytes) },
        (_, index) => ({
          start: index * opfsHashChunkBytes,
          end: Math.min(size, (index + 1) * opfsHashChunkBytes),
        }),
      ),
    );
  }
});

test("a slow OPFS writable receives at most one MiB before backpressure", async () => {
  const gate = Promise.withResolvers();
  const fixture = fakeStorage({ beforeWrite: () => gate.promise });
  const sink = await OpfsSink.open(fixture);
  const bytes = new Uint8Array(maxPendingOpfsBytes * 2 + 19);
  const write = sink.write(0, bytes);
  assert.equal(fixture.trace.pending, maxPendingOpfsBytes);
  assert.equal(fixture.trace.writes.length, 1);
  await assert.rejects(sink.write(0, bytes), /one operation at a time/);
  gate.resolve();
  await write;
  assert.deepEqual(
    fixture.trace.writes.map(({ size }) => size),
    [maxPendingOpfsBytes, maxPendingOpfsBytes, 19],
  );
  assert.equal(fixture.trace.peakPending, maxPendingOpfsBytes);
  assert.equal((await sink.close()).sha256, sha256(bytes));
});

test("abort drains an in-flight write, discards unsent parts and removes the temp file", async () => {
  const gate = Promise.withResolvers();
  const fixture = fakeStorage({ beforeWrite: () => gate.promise });
  const sink = await OpfsSink.open(fixture);
  const write = sink.write(0, new Uint8Array(maxPendingOpfsBytes * 2));
  const rejected = assert.rejects(write, { name: "AbortError" });
  const aborted = sink.abort();
  gate.resolve();
  await Promise.all([aborted, rejected]);
  assert.equal(fixture.trace.writes.length, 1);
  assert.equal(fixture.trace.aborts, 1);
  assert.equal(fixture.files.size, 0);
  await assert.rejects(sink.close());
});

test("cancellation during digest readback removes the already closed file", async () => {
  const reading = Promise.withResolvers();
  const gate = Promise.withResolvers();
  const fixture = fakeStorage({
    beforeRead: () => {
      reading.resolve();
      return gate.promise;
    },
  });
  const sink = await OpfsSink.open(fixture);
  await sink.write(0, Uint8Array.of(1));
  const controller = new AbortController();
  const close = sink.close(controller.signal);
  const rejected = assert.rejects(close, { name: "AbortError" });
  await reading.promise;
  assert.equal(fixture.files.size, 1);
  controller.abort();
  gate.resolve();
  await rejected;
  assert.equal(fixture.files.size, 0);
});

test("storage failures map to catalogue keys and clean up staging files", async () => {
  const cases = [
    [
      fakeStorage({ estimate: { quota: opfsQuotaReserveBytes, usage: 0 } }),
      "quota",
      (fixture) => OpfsSink.open(fixture),
    ],
    [
      fakeStorage({
        beforeOpen: () => {
          throw quotaError();
        },
      }),
      "quota",
      (fixture) => OpfsSink.open(fixture),
    ],
    [
      fakeStorage({ estimate: { quota: opfsQuotaReserveBytes + 1, usage: 0 } }),
      "quota",
      async (fixture) =>
        (await OpfsSink.open(fixture)).write(1, Uint8Array.of(1)),
    ],
    [
      fakeStorage({
        beforeWrite: () => {
          throw quotaError();
        },
      }),
      "quota",
      async (fixture) =>
        (await OpfsSink.open(fixture)).write(0, Uint8Array.of(1)),
    ],
    [
      fakeStorage({
        beforeClose: () => {
          throw new DOMException("Write failed", "UnknownError");
        },
      }),
      "io",
      async (fixture) => (await OpfsSink.open(fixture)).close(),
    ],
    [
      fakeStorage(),
      "size",
      async (fixture) =>
        (await OpfsSink.open(fixture)).write(maxOpfsMp4Bytes, Uint8Array.of(1)),
    ],
  ];
  const keys = {
    quota: "video.render.opfsQuota",
    size: "video.render.opfsSizeLimit",
    io: "video.panel.saveFailed",
  };
  for (const [fixture, kind, operation] of cases) {
    await assert.rejects(operation(fixture), (error) => {
      assert.ok(error instanceof Mp4StorageError);
      assert.equal(error.kind, kind);
      assert.equal(error.messageKey, keys[kind]);
      assert.equal(error.message, createTranslator("zh-CN")(keys[kind]));
      return true;
    });
    assert.equal(fixture.files.size, 0);
  }
});

const plan = {
  duration: 1.25,
  fps: 8,
  resolution: { width: 320, height: 180 },
  estimated: true,
  chapters: [],
  scenes: [{ kind: "intro", title: "Fixture", start: 0, end: 1.25 }],
};
const audio = { sampleRate: 8_000, channels: [new Float32Array(10_000)] };

function renderOptions({ videoBytes = 32, onEncode = () => {} } = {}) {
  class FakeData {
    constructor(canvas, options = canvas) {
      Object.assign(this, options);
    }
    close() {}
  }
  class FakeEncoder {
    static async isConfigSupported() {
      return { supported: true };
    }
    constructor({ output }) {
      this.output = output;
    }
    configure() {
      this.state = "configured";
    }
    encodeQueueSize = 0;
    flush() {
      return Promise.resolve();
    }
    close() {
      this.state = "closed";
    }
  }
  const chunk = (timestamp, duration, type, byteLength) => ({
    timestamp,
    duration,
    type,
    byteLength,
    copyTo(bytes) {
      bytes.set([0x42, timestamp & 0xff]);
    },
  });
  return {
    plan,
    audio,
    theme: "dark",
    deps: {
      VideoEncoder: class extends FakeEncoder {
        encode({ timestamp, duration }, { keyFrame }) {
          onEncode();
          this.output(
            chunk(timestamp, duration, keyFrame ? "key" : "delta", videoBytes),
            {
              decoderConfig: {
                description: Uint8Array.of(1, 0x42, 0, 0x28, 0xff, 0xe0, 0),
              },
            },
          );
        }
      },
      AudioEncoder: class extends FakeEncoder {
        encode({ timestamp, sampleRate, numberOfFrames }) {
          onEncode();
          this.output(
            chunk(
              timestamp,
              Math.round((numberOfFrames * 1e6) / sampleRate),
              "key",
              8,
            ),
          );
        }
      },
      VideoFrame: FakeData,
      AudioData: FakeData,
      createCanvas: () => ({
        getContext: () =>
          new Proxy(
            {
              createRadialGradient: () => ({ addColorStop() {} }),
              measureText: (text) => ({ width: text.length }),
            },
            { get: (context, key) => context[key] ?? (() => {}) },
          ),
      }),
    },
  };
}

test("render opt-in produces the same MP4 bytes and digest through real sinks", async (t) => {
  t.mock.method(Date, "now", () => 1_700_000_000_000);
  const fixture = fakeStorage();
  t.mock.getter(globalThis, "navigator", () => ({ storage: fixture.storage }));
  // Cross a StreamTarget chunk boundary so finalize rewrites a region on disk.
  const videoBytes = 192 * 1024;
  const options = renderOptions({ videoBytes });
  const memory = await renderVideo(options);
  const file = await renderVideo({ ...options, sink: "opfs" });
  const target = new ArrayBufferTarget();
  const reference = new Muxer({
    target,
    video: { codec: "avc", ...plan.resolution },
    audio: { codec: "aac", sampleRate: audio.sampleRate, numberOfChannels: 1 },
    fastStart: false,
  });
  let audioOffset = 0;
  for (let index = 0; index < 10; index++) {
    const timestamp = index * 125_000;
    const video = new Uint8Array(videoBytes);
    video.set([0x42, timestamp & 0xff]);
    reference.addVideoChunkRaw(
      video,
      index ? "delta" : "key",
      timestamp,
      125_000,
      {
        decoderConfig: {
          description: Uint8Array.of(1, 0x42, 0, 0x28, 0xff, 0xe0, 0),
        },
      },
    );
    if (audioOffset < (index + 1) * 1_000) {
      const start = audioOffset * 125;
      const count = Math.min(4_096, 10_000 - audioOffset);
      const bytes = new Uint8Array(8);
      bytes.set([0x42, start & 0xff]);
      reference.addAudioChunkRaw(bytes, "key", start, count * 125);
      audioOffset += count;
    }
  }
  reference.finalize();
  assert.deepEqual(await memory.blob.arrayBuffer(), target.buffer);
  assert.deepEqual(await file.blob.arrayBuffer(), target.buffer);
  assert.equal(file.sha256, memory.sha256);
  assert.equal(file.sha256, sha256(fixture.files.get(file.opfsFileName)));
  assert.equal(fixture.trace.writes[0].position, 0);
  assert.ok(
    fixture.trace.writes.some(
      ({ position }, index) => index > 0 && position < 100,
    ),
  );
});

test("render waits for stalled file I/O before submitting more encoder input", async () => {
  const firstWrite = Promise.withResolvers();
  const gate = Promise.withResolvers();
  const fixture = fakeStorage({
    beforeWrite: () => {
      firstWrite.resolve();
      return gate.promise;
    },
  });
  const sink = await OpfsSink.open(fixture);
  let encoded = 0;
  const result = renderVideo({
    ...renderOptions({ videoBytes: mebibyte / 2, onEncode: () => encoded++ }),
    sink,
  });
  await firstWrite.promise;
  const blockedAt = encoded;
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(encoded, blockedAt);
  assert.equal(fixture.trace.pending, maxPendingOpfsBytes);
  gate.resolve();
  await result;
  assert.ok(encoded > blockedAt);
  assert.equal(fixture.trace.peakPending, maxPendingOpfsBytes);
});

test("file-backed renders can pass the memory encoder limit", async () => {
  const options = renderOptions({ videoBytes: 5 * mebibyte });
  options.plan = { ...plan, duration: 4 };
  let size = 0;
  const sink = {
    kind: "opfs",
    async write(position, bytes) {
      size = Math.max(size, position + bytes.byteLength);
    },
    async close() {
      return { blob: new Blob(), sha256: "" };
    },
    abort() {
      assert.fail("File-backed render unexpectedly failed");
    },
  };
  await renderVideo({ ...options, sink });
  assert.ok(size > maxEncodedBytes);
});

test("render rejection cleans up a supplied sink before publishing output", async () => {
  const fixture = fakeStorage({
    beforeWrite: () => {
      throw quotaError();
    },
  });
  const sink = await OpfsSink.open(fixture);
  const progress = [];
  await assert.rejects(
    renderVideo({
      ...renderOptions(),
      sink,
      onProgress: (fraction) => progress.push(fraction),
    }),
    { name: "Mp4StorageError", kind: "quota" },
  );
  assert.equal(fixture.files.size, 0);
  assert.ok(!progress.includes(1));
});

test("the renderer rejects a synchronous muxer burst above the staging limit", async () => {
  const fixture = fakeStorage();
  const sink = await OpfsSink.open(fixture);
  const options = renderOptions({ videoBytes: maxStagedOpfsBytes / 2 });
  await assert.rejects(renderVideo({ ...options, sink }), {
    name: "Mp4StorageError",
    kind: "size",
  });
  assert.equal(fixture.files.size, 0);
  assert.equal(fixture.trace.writes.length, 0);
});

function mockRenderWorker(t, fixture, Worker) {
  t.mock.getter(globalThis, "navigator", () => ({ storage: fixture.storage }));
  for (const [key, value] of [
    ["Worker", Worker],
    ["OffscreenCanvas", class {}],
  ]) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { value, configurable: true });
    t.after(() => {
      if (original) Object.defineProperty(globalThis, key, original);
      else delete globalThis[key];
    });
  }
}

class FakeWorker {
  constructor() {
    queueMicrotask(() =>
      this.onmessage({ data: { kind: "ready", supported: true } }),
    );
  }
  terminate() {
    this.terminated = true;
  }
}

test("worker opt-in serializes a staging name and restores typed storage errors", async (t) => {
  const fixture = fakeStorage();
  const requests = [];
  mockRenderWorker(
    t,
    fixture,
    class extends FakeWorker {
      postMessage(request) {
        requests.push(request);
        queueMicrotask(() =>
          this.onmessage({ data: { kind: "failed", storageError: "quota" } }),
        );
      }
    },
  );
  await assert.rejects(
    renderEpisodeVideo({
      plan,
      audio,
      theme: "dark",
      locale: "en",
      sink: "opfs",
    }),
    {
      name: "Mp4StorageError",
      kind: "quota",
      messageKey: "video.render.opfsQuota",
    },
  );
  assert.match(requests[0].opfsFileName, /^studio-video-[\da-f-]+\.mp4$/u);
  assert.equal(fixture.files.size, 0);
});

test("cancelling the OPFS worker waits for its reply and deletes a raced completion", async (t) => {
  const fixture = fakeStorage();
  const started = Promise.withResolvers();
  const cancelled = Promise.withResolvers();
  mockRenderWorker(
    t,
    fixture,
    class extends FakeWorker {
      postMessage(request) {
        if (request.kind === "cancel") {
          cancelled.resolve(this);
        } else {
          started.resolve(
            fixture.directory.getFileHandle(request.opfsFileName, {
              create: true,
            }),
          );
        }
      }
    },
  );
  const controller = new AbortController();
  const render = renderEpisodeVideo({
    plan,
    audio,
    theme: "dark",
    locale: "en",
    sink: "opfs",
    signal: controller.signal,
  });
  const rejected = assert.rejects(render, { name: "AbortError" });
  await started.promise;
  controller.abort();
  const worker = await cancelled.promise;
  assert.equal(worker.terminated, undefined);
  worker.onmessage({ data: { kind: "done" } });
  await rejected;
  assert.equal(worker.terminated, true);
  assert.equal(fixture.files.size, 0);
});
