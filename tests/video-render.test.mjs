import assert from "node:assert/strict";
import { createHash, webcrypto } from "node:crypto";
import test from "node:test";
import { drawFrame } from "../src/video/draw.ts";
import { renderVideo } from "../src/video/render.ts";
import { videoThemes } from "../src/video/themes.ts";

const plan = {
  duration: 2.45,
  fps: 4,
  resolution: { width: 1920, height: 1080 },
  estimated: false,
  chapters: [],
  scenes: [
    { kind: "intro", title: "节目标题", start: 0, end: 0.25 },
    {
      kind: "chapter",
      chapterId: "one",
      title: "第一章",
      start: 0.25,
      end: 0.5,
    },
    {
      kind: "turn",
      chapterId: "one",
      turnId: "a",
      speakerId: "A",
      audioStart: 0,
      start: 0.5,
      end: 1.25,
      captions: [
        { start: 0.5, end: 0.75, lines: ["你好，世界。"] },
        { start: 0.75, end: 1.25, lines: ["Now in English"] },
      ],
    },
    {
      kind: "chapter",
      chapterId: "two",
      title: "第二章",
      start: 1.5,
      end: 1.75,
    },
    {
      kind: "turn",
      chapterId: "two",
      turnId: "b",
      speakerId: "B",
      audioStart: 1,
      start: 1.75,
      end: 2.45,
      captions: [{ start: 1.75, end: 2.45, lines: ["谢谢！"] }],
    },
  ],
};

const sampleRate = 8000;
const source = Float32Array.from({ length: 1.6 * sampleRate }, (_, index) =>
  index < 0.75 * sampleRate ? 0.25 : index >= sampleRate ? -0.75 : 0.125,
);
const audio = { sampleRate, channels: [source] };

function recordingContext() {
  return {
    calls: [],
    fillRect(...args) {
      this.calls.push(["rect", this.fillStyle, ...args]);
    },
    fillText(...args) {
      this.calls.push(["text", this.fillStyle, this.font, ...args]);
    },
    measureText(text) {
      return {
        width: Array.from(text).reduce(
          (width, symbol) => width + (/\p{Script=Han}/u.test(symbol) ? 2 : 1),
          0,
        ),
      };
    },
  };
}

function fakeDependencies({
  videoSupport = ({ codec }) => codec.startsWith("avc1."),
  audioSupport = () => true,
  queued = false,
  bufferVideo = false,
  oversizedChunk = false,
} = {}) {
  const trace = {
    videoChecks: [],
    videoConfigs: [],
    keyFrames: [],
    audioChecks: [],
    frames: [],
    audio: [],
    closed: [],
    flushes: [],
    maxQueue: { video: 0, audio: 0 },
    maxPendingVideo: 0,
    digests: [],
  };
  class FakeVideoFrame {
    constructor(canvas, info) {
      Object.assign(this, info);
      this.calls = canvas.context.calls.splice(0);
      trace.frames.push(this);
    }
    close() {
      this.closed = true;
    }
  }
  class FakeAudioData {
    constructor(info) {
      Object.assign(this, info);
      trace.audio.push(this);
    }
    close() {
      this.closed = true;
    }
  }
  class FakeEncoder extends EventTarget {
    state = "unconfigured";
    encodeQueueSize = 0;
    pending = [];

    constructor(init) {
      super();
      this.init = init;
    }
    configure(config) {
      this.config = config;
      this.state = "configured";
    }
    submit(emit, waitForFlush = false) {
      assert.equal(this.state, "configured");
      const process = () => {
        if (this.state === "closed") return;
        if (waitForFlush) {
          this.pending.push(emit);
          trace.maxPendingVideo = Math.max(
            trace.maxPendingVideo,
            this.pending.length,
          );
        } else {
          emit();
        }
      };
      if (!queued) {
        process();
        return;
      }
      this.encodeQueueSize++;
      trace.maxQueue[this.kind] = Math.max(
        trace.maxQueue[this.kind],
        this.encodeQueueSize,
      );
      setImmediate(() => {
        this.encodeQueueSize--;
        process();
        this.dispatchEvent(new Event("dequeue"));
      });
    }
    async flush() {
      trace.flushes.push(this.kind);
      if (queued) await new Promise((resolve) => setImmediate(resolve));
      this.pending.splice(0).forEach((emit) => emit());
    }
    close() {
      this.state = "closed";
      trace.closed.push(this.kind);
    }
  }

  function chunk(timestamp, duration, tag, type, byteLength = 4) {
    return {
      timestamp,
      duration,
      type,
      byteLength,
      copyTo(bytes) {
        bytes.set([tag, timestamp & 0xff, (timestamp >> 8) & 0xff, 0x42]);
      },
    };
  }

  class FakeVideoEncoder extends FakeEncoder {
    kind = "video";
    static async isConfigSupported(config) {
      trace.videoChecks.push(config);
      return { supported: videoSupport(config) };
    }
    configure(config) {
      trace.videoConfigs.push(config);
      super.configure(config);
    }
    encode(frame, { keyFrame }) {
      assert.ok(!frame.closed);
      const { timestamp, duration } = frame;
      if (keyFrame) trace.keyFrames.push(timestamp);
      this.submit(() => {
        const codec = this.config.codec;
        const decoderConfig = codec.startsWith("avc1.")
          ? {
              codec,
              description: new Uint8Array([1, 0x42, 0, 0x28, 0xff, 0xe0, 0]),
            }
          : { codec, colorSpace: { fullRange: false } };
        const length = oversizedChunk ? 129 * 1024 * 1024 : undefined;
        this.init.output(
          chunk(timestamp, duration, 0x76, keyFrame ? "key" : "delta", length),
          { decoderConfig },
        );
      }, bufferVideo);
    }
  }

  class FakeAudioEncoder extends FakeEncoder {
    kind = "audio";
    audioEnd = 0;
    opusTimestamp = 0;

    static async isConfigSupported(config) {
      trace.audioChecks.push(config);
      return { supported: audioSupport(config) };
    }
    encode(data) {
      assert.ok(!data.closed);
      const { timestamp, numberOfFrames, sampleRate } = data;
      assert.equal(sampleRate, this.config.sampleRate);
      const duration = Math.round((numberOfFrames / sampleRate) * 1e6);
      this.submit(() => {
        if (this.config.codec === "opus") {
          this.audioEnd = timestamp + duration;
          this.emitOpusPackets(
            this.audioEnd - this.config.opus.frameDuration + 1,
          );
        } else {
          this.init.output(chunk(timestamp, duration, 0x61, "key"));
        }
      });
    }
    emitOpusPackets(before) {
      const duration = this.config.opus.frameDuration;
      while (this.opusTimestamp < before) {
        this.init.output(chunk(this.opusTimestamp, duration, 0x61, "key"));
        this.opusTimestamp += duration;
      }
    }
    async flush() {
      await super.flush();
      if (this.config.codec === "opus") this.emitOpusPackets(this.audioEnd);
    }
  }

  return {
    trace,
    deps: {
      VideoFrame: FakeVideoFrame,
      AudioData: FakeAudioData,
      VideoEncoder: FakeVideoEncoder,
      AudioEncoder: FakeAudioEncoder,
      createCanvas: () => {
        const context = recordingContext();
        return { context, getContext: () => context };
      },
      crypto: {
        subtle: {
          digest(algorithm, bytes) {
            trace.digests.push({
              algorithm,
              bytes: Buffer.from(bytes).slice(),
            });
            return webcrypto.subtle.digest(algorithm, bytes);
          },
        },
      },
    },
  };
}

function texts(frame) {
  return frame.calls
    .filter(([method]) => method === "text")
    .map((call) => call[3]);
}

function mp4Children(bytes, type) {
  const matches = [];
  for (let offset = 0; offset < bytes.length;) {
    const size = bytes.readUInt32BE(offset);
    assert.ok(size >= 8 && offset + size <= bytes.length);
    if (bytes.toString("ascii", offset + 4, offset + 8) === type)
      matches.push(bytes.subarray(offset + 8, offset + size));
    offset += size;
  }
  return matches;
}

async function assertOpusTrack(blob, expectedDuration, fps) {
  const bytes = Buffer.from(await blob.arrayBuffer());
  const [movie] = mp4Children(bytes, "moov");
  const tracks = mp4Children(movie, "trak").map(
    (track) => mp4Children(track, "mdia")[0],
  );
  const handlers = tracks.map((media) =>
    mp4Children(media, "hdlr")[0].toString("ascii", 8, 12),
  );
  assert.deepEqual(handlers, ["vide", "soun"]);
  const audioTrack = tracks[1];
  const [header] = mp4Children(audioTrack, "mdhd");
  const timescaleOffset = header[0] === 1 ? 20 : 12;
  const rate = header.readUInt32BE(timescaleOffset);
  const mediaDuration =
    header[0] === 1
      ? Number(header.readBigUInt64BE(timescaleOffset + 4))
      : header.readUInt32BE(timescaleOffset + 4);
  assert.equal(rate, 48_000);
  assert.ok(Math.abs(mediaDuration / rate - expectedDuration) <= 1 / rate);

  const [mediaInfo] = mp4Children(audioTrack, "minf");
  const [samples] = mp4Children(mediaInfo, "stbl");
  const [descriptions] = mp4Children(samples, "stsd");
  const [opus] = mp4Children(descriptions.subarray(8), "Opus");
  assert.equal(opus.readUInt32BE(24), 48_000 * 65536);
  assert.equal(mp4Children(opus.subarray(28), "dOps").length, 1);

  const [sampleTimes] = mp4Children(samples, "stts");
  let sampleDuration = 0;
  for (let offset = 8; offset < sampleTimes.length; offset += 8) {
    sampleDuration +=
      sampleTimes.readUInt32BE(offset) * sampleTimes.readUInt32BE(offset + 4);
  }
  assert.ok(Math.abs(sampleDuration / rate - expectedDuration) <= 1 / fps);
}

test("steps at i/fps and draws the same scene and caption sequence for identical inputs", async () => {
  const first = fakeDependencies();
  const second = fakeDependencies();
  const progress = [];
  const render = (deps, onProgress) =>
    renderVideo({ audio, plan, theme: "dark", deps, onProgress });
  const result = await render(first.deps, (value) => progress.push(value));
  await render(second.deps);

  assert.deepEqual(
    first.trace.frames.map(({ calls }) => calls),
    second.trace.frames.map(({ calls }) => calls),
  );
  assert.deepEqual(
    first.trace.frames.map(({ timestamp }) => timestamp),
    [
      0, 250000, 500000, 750000, 1000000, 1250000, 1500000, 1750000, 2000000,
      2250000,
    ],
  );
  assert.equal(first.trace.frames.at(-1).duration, 200000);
  assert.deepEqual(first.trace.frames.map(texts), [
    ["节目标题"],
    ["第一章"],
    ["主持人 A", "你好，世界。"],
    ["主持人 A", "Now in English"],
    ["主持人 A", "Now in English"],
    ["主持人 A"],
    ["第二章"],
    ["主持人 B", "谢谢！"],
    ["主持人 B", "谢谢！"],
    ["主持人 B", "谢谢！"],
  ]);
  assert.ok(first.trace.frames.every(({ closed }) => closed));
  assert.equal(progress[0], 0);
  assert.equal(progress.at(-1), 1);
  assert.ok(progress.slice(1).every((value, index) => value > progress[index]));
  assert.deepEqual(first.trace.closed, ["video", "audio"]);
  assert.deepEqual(
    { ...result, blob: undefined, sha256: undefined },
    {
      blob: undefined,
      sha256: undefined,
      durationSeconds: 2.45,
      width: 1920,
      height: 1080,
      fps: 4,
      videoCodec: "avc1.420028",
      audioCodec: "aac",
    },
  );
});

test("aligns planar PCM with cards, pauses, source offsets, and a short recording", async () => {
  const { deps, trace } = fakeDependencies();
  const right = Int16Array.from(source, (sample) => sample * -32768);
  await renderVideo({
    plan,
    theme: "light",
    audio: { sampleRate, channels: [source, right] },
    deps,
  });
  const planes = [[], []];
  for (const block of trace.audio) {
    assert.equal(block.format, "f32-planar");
    assert.equal(
      block.timestamp,
      Math.round((planes[0].length / sampleRate) * 1e6),
    );
    assert.equal(block.numberOfChannels, 2);
    assert.ok(block.closed);
    for (let plane = 0; plane < planes.length; plane++) {
      planes[plane].push(
        ...block.data.slice(
          plane * block.numberOfFrames,
          (plane + 1) * block.numberOfFrames,
        ),
      );
    }
  }
  for (const [plane, samples] of planes.entries()) {
    const direction = plane === 0 ? 1 : -1;
    assert.equal(samples.length, 2.45 * sampleRate);
    for (const [start, end, value] of [
      [0, 0.5, 0],
      [0.5, 1.25, 0.25],
      [1.25, 1.75, 0],
      [1.75, 2.35, -0.75],
      [2.35, 2.45, 0],
    ]) {
      assert.ok(
        samples
          .slice(start * sampleRate, end * sampleRate)
          .every((sample) => sample === value * direction),
      );
    }
  }
  assert.deepEqual(trace.frames[0].calls[0], [
    "rect",
    videoThemes.light.background,
    0,
    0,
    1920,
    1080,
  ]);
});

test("does not emit a zero-duration frame when floating point rounds up the frame count", async () => {
  const { deps, trace } = fakeDependencies();
  await renderVideo({
    plan: { ...plan, duration: 2.24, fps: 25 },
    audio,
    theme: "dark",
    deps,
  });
  assert.equal(trace.frames.length, 56);
  assert.equal(trace.frames.at(-1).duration, 40000);
});

test("aborting at a frame boundary stops both encoders and skips hashing", async () => {
  const { deps, trace } = fakeDependencies();
  const controller = new AbortController();
  await assert.rejects(
    renderVideo({
      plan,
      audio,
      theme: "dark",
      deps,
      signal: controller.signal,
      onProgress: () => {
        if (trace.frames.length === 2) controller.abort();
      },
    }),
    { name: "AbortError" },
  );
  assert.equal(trace.frames.length, 2);
  assert.equal(trace.audio.length, 1);
  assert.ok(trace.frames.every(({ closed }) => closed));
  assert.deepEqual(trace.closed, ["video", "audio"]);
  assert.deepEqual(trace.flushes, []);
  assert.deepEqual(trace.digests, []);
});

test("limits both encoder queues and bounds video frames awaiting output", async () => {
  const { deps, trace } = fakeDependencies({ queued: true, bufferVideo: true });
  const slowFrames = { ...plan, fps: 0.5 };
  const longAudio = { ...slowFrames, duration: 10 };
  await renderVideo({ plan: longAudio, audio, theme: "dark", deps });
  assert.equal(trace.maxQueue.audio, 4);

  const { deps: videoDeps, trace: videoTrace } = fakeDependencies({
    queued: true,
    bufferVideo: true,
  });
  await renderVideo({
    plan: { ...plan, fps: 30 },
    audio,
    theme: "dark",
    deps: videoDeps,
  });
  assert.equal(videoTrace.maxQueue.video, 4);
  assert.equal(videoTrace.maxPendingVideo, 24);
  assert.ok(videoTrace.flushes.filter((kind) => kind === "video").length > 1);
  assert.equal(videoTrace.frames.length, 74);
});

test("rejects when encoded output crosses the in-memory size limit", async () => {
  const { deps, trace } = fakeDependencies({ oversizedChunk: true });
  await assert.rejects(
    renderVideo({ plan, audio, theme: "dark", deps }),
    /128 MiB/,
  );
  assert.equal(trace.frames.length, 1);
  assert.deepEqual(trace.closed, ["video", "audio"]);
  assert.deepEqual(trace.digests, []);
});

test("uses the quality bitrate target and a four-second keyframe interval", async () => {
  const { deps, trace } = fakeDependencies();
  await renderVideo({
    plan: { ...plan, duration: 8.25 },
    audio,
    theme: "dark",
    deps,
  });
  assert.deepEqual(trace.videoChecks, [
    {
      width: 1920,
      height: 1080,
      framerate: 4,
      bitrate: 900_000,
      latencyMode: "quality",
      bitrateMode: "variable",
      codec: "avc1.420028",
      avc: { format: "avc" },
    },
  ]);
  assert.deepEqual(trace.videoConfigs, trace.videoChecks);
  assert.deepEqual(trace.keyFrames, [0, 4_000_000, 8_000_000]);
});

test("keeps H.264 when explicit variable rate control is unsupported", async () => {
  const { deps, trace } = fakeDependencies({
    videoSupport: ({ codec, bitrateMode }) =>
      codec.startsWith("avc1.") && bitrateMode === undefined,
  });
  await renderVideo({ plan, audio, theme: "dark", deps });
  assert.deepEqual(
    trace.videoChecks.map(({ bitrateMode }) => bitrateMode),
    ["variable", undefined],
  );
  assert.deepEqual(trace.videoConfigs, trace.videoChecks.slice(1));
});

test("probes the actual configuration and uses VP9 only with an explicit opt-in", async () => {
  const fixture = () =>
    fakeDependencies({ videoSupport: ({ codec }) => codec.startsWith("vp09.") });
  const denied = fixture();
  await assert.rejects(
    renderVideo({ plan, audio, theme: "dark", deps: denied.deps }),
    /H\.264.*VP9/,
  );
  assert.deepEqual(
    denied.trace.videoChecks.map(({ codec }) => codec),
    ["avc1.420028", "avc1.420028"],
  );
  assert.deepEqual(denied.trace.frames, []);
  assert.deepEqual(denied.trace.digests, []);

  const unsupported = fakeDependencies({ videoSupport: () => false });
  await assert.rejects(
    renderVideo({
      plan: { ...plan, allowVp9: true },
      audio,
      theme: "dark",
      deps: unsupported.deps,
    }),
    /H\.264.*VP9/,
  );
  assert.deepEqual(
    unsupported.trace.videoChecks.map(({ codec }) => codec),
    ["avc1.420028", "avc1.420028", "vp09.00.40.08", "vp09.00.40.08"],
  );
  assert.deepEqual(unsupported.trace.frames, []);

  const allowed = fixture();
  const decoded = {
    sampleRate,
    numberOfChannels: 1,
    getChannelData: () => source,
  };
  const result = await renderVideo({
    plan: { ...plan, allowVp9: true },
    audio: decoded,
    theme: "dark",
    deps: allowed.deps,
  });
  assert.equal(result.videoCodec, "vp09.00.40.08");
  assert.deepEqual(
    allowed.trace.videoChecks.map(({ codec }) => codec),
    ["avc1.420028", "avc1.420028", "vp09.00.40.08"],
  );
  assert.ok(Buffer.from(await result.blob.arrayBuffer()).includes("vpcC"));
  assert.deepEqual(allowed.trace.audioChecks, [
    { codec: "mp4a.40.2", sampleRate, bitrate: 64000, numberOfChannels: 1 },
  ]);
});

test("prefers H.264 and AAC when the encoder supports both codec choices", async () => {
  const { deps, trace } = fakeDependencies({ videoSupport: () => true });
  const result = await renderVideo({
    plan: { ...plan, allowVp9: true },
    audio,
    theme: "dark",
    deps,
  });
  assert.equal(result.videoCodec, "avc1.420028");
  assert.equal(result.audioCodec, "aac");
  assert.deepEqual(
    trace.videoChecks.map(({ codec }) => codec),
    ["avc1.420028"],
  );
  assert.deepEqual(
    trace.audioChecks.map(({ codec }) => codec),
    ["mp4a.40.2"],
  );
});

test("falls back to Opus at the source rate when AAC is unavailable", async () => {
  const { deps, trace } = fakeDependencies({
    audioSupport: ({ codec }) => codec === "opus",
  });
  const result = await renderVideo({ plan, audio, theme: "dark", deps });
  assert.equal(result.videoCodec, "avc1.420028");
  assert.equal(result.audioCodec, "opus");
  assert.deepEqual(
    trace.audioChecks.map(({ codec, sampleRate }) => [codec, sampleRate]),
    [
      ["mp4a.40.2", sampleRate],
      ["opus", sampleRate],
    ],
  );
  assert.ok(trace.audio.every((block) => block.sampleRate === sampleRate));
  assert.equal(trace.audioChecks.at(-1).bitrate, 64_000);
  await assertOpusTrack(result.blob, plan.duration, plan.fps);
});

test("resamples to 48 kHz with linear interpolation and keeps Opus in sync", async () => {
  const { deps, trace } = fakeDependencies({
    audioSupport: ({ codec, sampleRate }) =>
      codec === "opus" && sampleRate === 48_000,
  });
  const fastPlan = { ...plan, duration: 2.453, fps: 30 };
  const left = source.slice();
  left[1] = 0.625;
  left[sampleRate + 1] = -0.375;
  const right = Int16Array.from(left, (sample) => sample * -32768);
  const result = await renderVideo({
    plan: fastPlan,
    audio: { sampleRate, channels: [left, right] },
    theme: "dark",
    deps,
  });
  assert.equal(result.audioCodec, "opus");
  assert.deepEqual(
    trace.audioChecks.map(({ codec, sampleRate }) => [codec, sampleRate]),
    [
      ["mp4a.40.2", sampleRate],
      ["opus", sampleRate],
      ["opus", 48_000],
    ],
  );
  const planes = [[], []];
  for (const block of trace.audio) {
    assert.equal(block.sampleRate, 48_000);
    assert.equal(
      block.timestamp,
      Math.round((planes[0].length / 48_000) * 1e6),
    );
    for (const [index, plane] of planes.entries()) {
      plane.push(
        ...block.data.subarray(
          index * block.numberOfFrames,
          (index + 1) * block.numberOfFrames,
        ),
      );
    }
  }
  for (const [index, samples] of planes.entries()) {
    const direction = index === 0 ? 1 : -1;
    assert.equal(samples.length, Math.round(fastPlan.duration * 48_000));
    assert.equal(samples[24_000], 0.25 * direction);
    assert.equal(samples[24_001], 0.3125 * direction);
    assert.equal(samples[24_006], 0.625 * direction);
    assert.equal(samples[59_999], 0.25 * direction);
    assert.equal(samples[84_001], -0.6875 * direction);
    assert.equal(samples[112_799], -0.75 * direction);
    for (const [start, end] of [
      [0, 24_000],
      [60_000, 84_000],
      [112_800, samples.length],
    ])
      assert.ok(samples.slice(start, end).every((sample) => sample === 0));
  }
  await assertOpusTrack(result.blob, fastPlan.duration, fastPlan.fps);
});

test("rejects with a clear error before rendering if AAC and Opus are unsupported", async () => {
  const { deps, trace } = fakeDependencies({
    audioSupport: () => false,
  });
  await assert.rejects(
    renderVideo({ plan, audio, theme: "dark", deps }),
    /AAC.*Opus/,
  );
  assert.deepEqual(
    trace.audioChecks.map(({ codec, sampleRate }) => [codec, sampleRate]),
    [
      ["mp4a.40.2", sampleRate],
      ["opus", sampleRate],
      ["opus", 48_000],
    ],
  );
  assert.deepEqual(trace.closed, []);
  assert.deepEqual(trace.frames, []);
  assert.deepEqual(trace.audio, []);
  assert.deepEqual(trace.digests, []);
});

test("silence is flat and nearby PCM amplitudes determine the waveform bars", () => {
  const colors = videoThemes.dark;
  function waveform(samples, time) {
    const context = recordingContext();
    drawFrame(context, plan, { sampleRate, channels: [samples] }, "dark", time);
    return context.calls.filter(
      ([method, color]) =>
        method === "rect" && [colors.baseline, colors.accent].includes(color),
    );
  }
  const samples = new Float32Array(source.length);
  const flat = waveform(samples, 0.75);
  assert.equal(flat.length, 1);
  assert.equal(flat[0].at(-1), 2);
  samples[Math.round(0.25 * sampleRate)] = -0.5;
  const pulse = waveform(samples, 0.75);
  assert.equal(pulse.length, 2);
  assert.equal(pulse[1].at(-1), 81);
  assert.deepEqual(waveform(samples, 1.15), flat);
});

test("hashes the actual finalized MP4 bytes returned in the blob", async () => {
  const { deps, trace } = fakeDependencies();
  const result = await renderVideo({ plan, audio, theme: "dark", deps });
  const bytes = Buffer.from(await result.blob.arrayBuffer());
  assert.equal(result.blob.type, "video/mp4");
  assert.equal(bytes.subarray(4, 8).toString(), "ftyp");
  assert.ok(bytes.includes("moov"));
  assert.ok(bytes.includes("mdat"));
  assert.ok(bytes.includes("avcC"));
  assert.ok(bytes.includes("mp4a"));
  assert.deepEqual(trace.digests, [{ algorithm: "SHA-256", bytes }]);
  assert.equal(result.sha256, createHash("sha256").update(bytes).digest("hex"));
});
