import assert from "node:assert/strict";
import { createHash, webcrypto } from "node:crypto";
import test from "node:test";
import { t } from "../src/i18n/index.ts";
import { drawFrame } from "../src/video/draw.ts";
import { renderVideo } from "../src/video/render.ts";
import { registerScene } from "../src/video/scenes/registry.ts";
import { WebglContextLostError } from "../src/video/scenes/types.ts";
import { palettes } from "../src/video/design/palettes.ts";
import { buildTimeline } from "../src/video/timeline.ts";

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
    drawImage(...args) {
      this.calls.push(["image", ...args]);
    },
    save() {},
    restore() {},
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

function overlappingPlan(resolution = { width: 1920, height: 1080 }) {
  return buildTimeline(
    {
      language: "zh",
      revision: 1,
      outline: {
        chapters: [
          { id: "one", title: "开场" },
          { id: "two", title: "第二章" },
        ],
      },
      script: {
        title: "节目标题",
        turns: [
          { id: "a", chapterId: "one", host: "A", text: "你好，世界。" },
          { id: "b", chapterId: "two", host: "B", text: "谢谢！" },
        ],
      },
      render: {
        revision: 1,
        clips: { a: { duration: 0.75 }, b: { duration: 2.5 } },
      },
    },
    {
      fps: 4,
      resolution,
      showName: "Fixture Studio",
      mood: "warm",
      paletteId: "ocean",
    },
  );
}

test("waveform drawing snapshot covers the live opening, chapter overlay and return to the stage", async () => {
  const snapshotPlan = overlappingPlan();
  const { deps, trace } = fakeDependencies();
  await renderVideo({ plan: snapshotPlan, audio, theme: "dark", deps });
  assert.deepEqual(
    trace.frames.map(({ calls }) =>
      createHash("sha256").update(JSON.stringify(calls)).digest("hex"),
    ),
    [
      "874559e9a7f577b6bb24e686d72ff5c084e9a7307ebfe88fbe45c6e4031d6b45",
      "c5b5a939407704dab898a142b56852108ceb66edf2e43ea7e4520854f68dac90",
      "d521804996d1db6599ec3a2c99d570a6acfb04fbdd3e959d52a59056c35cfca5",
      "1c26422b35b99826e5886a1857608ecb419ea96e87f711418f0ed64050ccb611",
      "73b34662cc2c0b44111b6a6e3d9ee55361d861630f1f400d4452e101215e4427",
      "fafb511939aa7bdda87b91fb327ff825d0906b4584ec7afebf8cd902ef612cb5",
      "04224d6d8bb57187a75cc0625f2058bd6515dd6b3a3fb583f3f88910cd166c3e",
      "a3dc2c96aba4a8089a53b1dbc0d4b21c6534f557c92ec5e8eaf30e728127dd28",
      "d09408f5c559b56a445b9763954a6c5dc3bd8c0f03fbc11428a266af709769b9",
      "9893bd7b964bc82b61e3ea0d423fd4b345e5e57d774217270cc4bcbf37301488",
      "a51053f8b4cf8e079aa2d308410d10bc1cfb00b76479ee48161a6980762da26c",
      "7e6794f90080f7fd077b4b4bc664f942e94f8e77eb75ad03b428f6a40e728cee",
      "b9a4da5077c1f1397ef1ce052d70c86730f82317b56d1dc5dfa6f0a7c0aede29",
      "6b96b94cd73d3952c871a11cb1b1d044b07e999abb398954937a7fc536b30179",
    ],
  );
});

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
  const result = await renderVideo({
    audio,
    plan,
    theme: "dark",
    deps: first.deps,
    onProgress: (value) => progress.push(value),
  });
  await renderVideo({
    audio,
    plan,
    theme: "dark",
    sceneId: "waveform",
    deps: second.deps,
  });

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
    ["Podcast Studio", "节目标题"],
    ["Podcast Studio", "第一章"],
    ["Podcast Studio", "主持人 A", "主持人 B", "你好，世界。"],
    ["Podcast Studio", "主持人 A", "主持人 B", "Now in English"],
    ["Podcast Studio", "主持人 A", "主持人 B", "Now in English"],
    ["Podcast Studio", "主持人 A", "主持人 B"],
    ["Podcast Studio", "第二章"],
    ["Podcast Studio", "主持人 A", "主持人 B", "谢谢！"],
    ["Podcast Studio", "主持人 A", "主持人 B", "谢谢！"],
    ["Podcast Studio", "主持人 A", "主持人 B", "谢谢！"],
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
      sceneId: "waveform",
      orientation: "landscape",
      paletteId: "aurora",
      // Node has no FontFace API, so the real loader reports it honestly.
      fontNotices: ["font.apiUnavailable"],
      captionReviewCount: 0,
      chapterScenes: [
        { chapterId: "one", sceneId: "waveform" },
        { chapterId: "two", sceneId: "waveform" },
      ],
      sceneNotices: [],
    },
  );
});

test("composites a chapter's WebGL scene before its text and reports actual scene IDs", async () => {
  const id = "test-webgl";
  const observed = [];
  let disposed = 0;
  let layer;
  registerScene({
    id,
    kind: "webgl",
    label: "video.scene.waveform",
    create() {
      return {
        id,
        kind: "webgl",
        async init(env) {
          await Promise.resolve();
          layer = env.canvas;
          assert.equal(env.orientation, "landscape");
          assert.equal(env.paletteId, "aurora");
          assert.equal(env.mood, "calm");
        },
        draw(frame) {
          assert.equal(frame.kind, "webgl");
          assert.equal(frame.canvas, layer);
          assert.deepEqual(frame.audio, audio);
          observed.push(frame);
        },
        dispose() {
          disposed++;
        },
      };
    },
  });

  const { deps, trace } = fakeDependencies();
  const result = await renderVideo({
    plan: {
      ...plan,
      scenes: plan.scenes.map((scene) =>
        scene.kind === "chapter"
          ? { ...scene, sceneId: scene.chapterId === "two" ? id : "missing" }
          : scene,
      ),
    },
    audio,
    theme: "dark",
    sceneId: "missing-default",
    deps,
  });
  assert.equal(disposed, 1);
  assert.equal(result.sceneId, "waveform");
  assert.deepEqual(result.chapterScenes, [
    { chapterId: "one", sceneId: "waveform" },
    { chapterId: "two", sceneId: id },
  ]);
  assert.deepEqual(result.sceneNotices, [
    { reason: "unknown-scene", fallbackSceneId: "waveform" },
    { reason: "unknown-scene", fallbackSceneId: "waveform", chapterId: "one" },
  ]);
  assert.deepEqual(
    observed.map(({ index, time }) => [index, time]),
    [
      [7, 1.75],
      [8, 2],
      [9, 2.25],
    ],
  );
  assert.equal(observed[0].textLayouts, observed[2].textLayouts);
  assert.deepEqual([layer.width, layer.height], [1920, 1080]);
  assert.deepEqual(texts(trace.frames[6]), ["Podcast Studio", "第二章"]);
  assert.equal(
    trace.frames[6].calls.some(([method]) => method === "image"),
    false,
  );
  for (const frame of trace.frames.slice(7)) {
    assert.deepEqual(frame.calls[1], ["image", layer, 0, 0]);
    assert.equal(
      frame.calls.filter(([method]) => method === "image").length,
      1,
    );
    assert.deepEqual(texts(frame), [
      "Podcast Studio",
      "主持人 A",
      "主持人 B",
      "谢谢！",
    ]);
  }
});

test("disposes a scene when its asynchronous initialization is cancelled", async () => {
  const { deps, trace } = fakeDependencies();
  const controller = new AbortController();
  const id = "test-cancelled-scene";
  let disposed = 0;
  registerScene({
    id,
    kind: "2d",
    label: "video.scene.waveform",
    create() {
      return {
        id,
        kind: "2d",
        async init({ signal }) {
          await Promise.resolve();
          controller.abort();
          signal.throwIfAborted();
        },
        draw() {
          assert.fail("Cancelled scene should never draw");
        },
        dispose() {
          disposed++;
        },
      };
    },
  });
  await assert.rejects(
    renderVideo({
      plan,
      audio,
      theme: "dark",
      sceneId: id,
      signal: controller.signal,
      deps,
    }),
    { name: "AbortError" },
  );
  assert.equal(disposed, 1);
  assert.deepEqual(trace.closed, ["video", "audio"]);
  assert.equal(trace.frames.length, 2);
  assert.deepEqual(trace.digests, []);
});

test("a failed Studio 3D probe falls back once and receipts record preset substitutions", async () => {
  const { deps } = fakeDependencies();
  const makeCanvas = deps.createCanvas;
  let probes = 0;
  deps.createCanvas = (width, height) => {
    if (width !== 1 || height !== 1) return makeCanvas();
    return {
      getContext(kind) {
        assert.equal(kind, "webgl2");
        probes++;
        throw new Error("Fixture WebGL2 failure");
      },
    };
  };
  const result = await renderVideo({
    plan,
    audio,
    theme: "dark",
    sceneId: "studio3d",
    studio3d: { paletteId: "missing", cameraPresetId: "missing", intensity: 5 },
    deps,
  });
  assert.equal(probes, 1);
  assert.equal(result.sceneId, "waveform");
  assert.deepEqual(result.studio3d, {
    paletteId: "aurora",
    cameraPresetId: "drift",
    intensity: 1,
  });
  assert.deepEqual(result.chapterScenes, [
    { chapterId: "one", sceneId: "waveform" },
    { chapterId: "two", sceneId: "waveform" },
  ]);
  assert.deepEqual(result.sceneNotices, [
    { reason: "unknown-palette" },
    { reason: "unknown-camera" },
    { reason: "webgl-unavailable", fallbackSceneId: "waveform" },
  ]);
});

test("a layer context creation failure falls back after a successful capability probe", async () => {
  const { deps } = fakeDependencies();
  const makeCanvas = deps.createCanvas;
  let releasedProbes = 0;
  let failedLayers = 0;
  deps.createCanvas = (width, height) => {
    if (width === 1 && height === 1) {
      return {
        getContext: () => ({
          isContextLost: () => false,
          getExtension: () => ({ loseContext: () => releasedProbes++ }),
        }),
      };
    }
    const canvas = makeCanvas();
    canvas.getContext = (kind) => {
      if (kind === "2d") return canvas.context;
      failedLayers++;
      return null;
    };
    return canvas;
  };
  const chapterId = "two";
  const result = await renderVideo({
    plan: {
      ...plan,
      scenes: plan.scenes.map((scene) =>
        scene.kind === "chapter" && scene.chapterId === chapterId
          ? { ...scene, sceneId: "studio3d" }
          : scene,
      ),
    },
    audio,
    theme: "dark",
    deps,
  });
  assert.equal(releasedProbes, 1);
  assert.equal(failedLayers, 1);
  assert.deepEqual(result.sceneNotices, [
    { reason: "webgl-unavailable", fallbackSceneId: "waveform", chapterId },
  ]);
  assert.deepEqual(result.chapterScenes.at(-1), {
    chapterId,
    sceneId: "waveform",
  });
});

test("reported WebGL context loss aborts the whole render and skips hashing", async () => {
  const { deps, trace } = fakeDependencies({ queued: true });
  const id = "test-context-loss";
  let loseContext;
  let disposed = false;
  registerScene({
    id,
    kind: "webgl",
    label: "video.scene.studio3d",
    create: () => ({
      id,
      kind: "webgl",
      init({ fail }) {
        loseContext = () => fail(new WebglContextLostError());
      },
      draw() {},
      dispose() {
        disposed = true;
      },
    }),
  });
  await assert.rejects(
    renderVideo({
      plan,
      audio,
      theme: "dark",
      sceneId: id,
      deps,
      onProgress() {
        loseContext?.();
      },
    }),
    {
      name: "WebglContextLostError",
      message: t("video.render.webglContextLost"),
    },
  );
  assert.equal(disposed, true);
  assert.deepEqual(trace.closed, ["video", "audio"]);
  assert.deepEqual(trace.digests, []);
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
    palettes.light.stops[0],
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
    fakeDependencies({
      videoSupport: ({ codec }) => codec.startsWith("vp09."),
    });
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

test("portrait and landscape exports start with live PCM and captions and keep both through a chapter overlay", async () => {
  for (const [orientation, width, height] of [
    ["landscape", 1920, 1080],
    ["portrait", 1080, 1920],
  ]) {
    const plan = overlappingPlan({ width, height });
    const { deps, trace } = fakeDependencies();
    const audio = {
      sampleRate,
      channels: [
        Float32Array.from({ length: plan.duration * sampleRate }, (_, index) =>
          index < 0.75 * sampleRate ? 0.25 : 0.5,
        ),
      ],
    };
    const theme = orientation === "portrait" ? "light" : "dark";
    const result = await renderVideo({ plan, audio, theme, deps });
    assert.deepEqual(
      [result.orientation, result.width, result.height, result.durationSeconds],
      [orientation, width, height, plan.duration],
    );
    assert.equal(result.paletteId, theme === "light" ? "light" : "ocean");
    assert.deepEqual(result.fontNotices, ["font.apiUnavailable"]);
    assert.equal(trace.audio[0].data[0], 0.25);
    assert.equal(trace.audio[1].data.at(-1), 0.5);
    assert.deepEqual(texts(trace.frames[0]), [
      "Fixture Studio",
      "1 / 2",
      "主持人 A",
      "主持人 B",
      "你好，世界。",
    ]);
    assert.deepEqual(texts(trace.frames[4]), [
      "Fixture Studio",
      "2 / 2",
      "第 2 章",
      "第二章",
      "主持人 B",
      "谢谢！",
    ]);
    assert.deepEqual(texts(trace.frames.at(-1)), [
      "Fixture Studio",
      "2 / 2",
      "主持人 A",
      "主持人 B",
      "谢谢！",
    ]);
    assert.deepEqual(
      [trace.videoConfigs[0].width, trace.videoConfigs[0].height],
      [width, height],
    );
  }
});

test("both rails keep idle ticks and only the current host's rail grows", () => {
  const colors = palettes.aurora;
  function waveform(samples, time) {
    const context = recordingContext();
    drawFrame(context, plan, { sampleRate, channels: [samples] }, "dark", time);
    return context.calls.filter(
      ([method, color, , , width]) =>
        method === "rect" &&
        width < 10 &&
        [colors.hostA, colors.hostB].includes(color),
    );
  }
  const samples = new Float32Array(source.length);
  const flat = waveform(samples, 0.75);
  assert.equal(flat.length, 72);
  assert.ok(flat.every((call) => call.at(-1) >= 3));
  assert.ok(flat.every((call) => call.at(-1) === flat[0].at(-1)));
  samples[Math.round(0.25 * sampleRate)] = -0.5;
  const pulse = waveform(samples, 0.75);
  const rising = pulse.find((call, index) => call.at(-1) > flat[index].at(-1));
  assert.equal(rising[1], colors.hostA);
  assert.ok(rising.at(-1) < 1080 * 0.058 * 2);
  assert.deepEqual(pulse.slice(36), flat.slice(36));
  assert.ok(
    Math.abs(
      rising[3] + rising.at(-1) / 2 - (flat[0][3] + flat[0].at(-1) / 2),
    ) < 1e-9,
  );
  assert.deepEqual(waveform(samples, 1.25), flat);
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
