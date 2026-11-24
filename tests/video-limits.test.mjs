import assert from "node:assert/strict";
import test from "node:test";
import {
  estimateVideoExport,
  maxEncodedBytes,
  maxVideoPcmBytes,
  maxVideoSeconds,
  mebibyte,
  studioWavChannels,
  studioWavSampleRate,
  videoEncodingRates,
} from "../src/video/limits.ts";

const studio = {
  audioDuration: 300,
  videoDuration: 300,
  fps: 30,
  orientation: "landscape",
  scene: "waveform",
  sampleRate: studioWavSampleRate,
  channels: studioWavChannels,
};

test("Episode eligibility checks both durations and the mono and stereo budgets", () => {
  assert.equal(maxVideoSeconds, 300);
  for (const orientation of ["landscape", "portrait"]) {
    for (const [duration, mono, stereo] of [
      [210, undefined, "pcm"],
      [300, undefined, "pcm"],
      [349.5, "duration", "pcm"],
      [420, "pcm", "pcm"],
    ]) {
      for (const [channels, constraint] of [
        [1, mono],
        [2, stereo],
      ]) {
        const result = estimateVideoExport({
          ...studio,
          audioDuration: duration,
          videoDuration: duration,
          orientation,
          channels,
        });
        assert.equal(result.constraint, constraint);
        assert.equal(result.allowed, constraint === undefined);
        assert.equal(
          result.estimate.pcmBytes,
          duration * 24_000 * channels * 4,
        );
        assert.ok(result.estimate.encodedPayloadBytes <= maxEncodedBytes * 0.8);
      }
    }
  }
  assert.equal(
    estimateVideoExport({ ...studio, audioDuration: 300 + 1 / 24_000 })
      .constraint,
    "duration",
  );
  assert.equal(
    estimateVideoExport({ ...studio, videoDuration: 300.000001 }).constraint,
    "duration",
  );
  const lastMonoSample = maxVideoPcmBytes / 4;
  for (const [samples, constraint] of [
    [lastMonoSample, "duration"],
    [lastMonoSample + 1, "pcm"],
  ]) {
    assert.equal(
      estimateVideoExport({ ...studio, audioDuration: samples / 24_000 })
        .constraint,
      constraint,
    );
  }
  for (const input of [{ videoDuration: 0 }, { audioDuration: Number.NaN }]) {
    assert.equal(
      estimateVideoExport({ ...studio, ...input }).constraint,
      "invalid",
    );
  }
});

test("the estimate uses the renderer's preferred and fallback rates", () => {
  for (const [
    duration,
    channels,
    videoBitrate,
    audioBitrate,
    fallbackBytes,
  ] of [
    [210, 1, 2_400_000, 64_000, 25_305_000],
    [300, 1, 2_400_000, 64_000, 36_150_000],
    [300, 2, 2_400_000, 128_000, 38_550_000],
    [349.5, 1, 2_393_778, 64_000, 42_114_750],
    [420, 2, 1_917_222, 128_000, 53_970_000],
    [1_200, 2, 900_000, 128_000, 154_200_000],
  ]) {
    assert.deepEqual(videoEncodingRates(duration, channels), {
      videoBitrate,
      audioBitrate,
      fallbackVideoBitrate: 900_000,
    });
    const result = estimateVideoExport({
      ...studio,
      audioDuration: 1,
      videoDuration: duration,
      channels,
    });
    assert.equal(
      result.estimate.encodedPayloadBytes,
      (duration * (videoBitrate + audioBitrate)) / 8,
    );
    assert.equal(result.estimate.fallbackPayloadBytes, fallbackBytes);
    if (duration === 1_200) assert.equal(result.constraint, "encoded");
  }
});

test("peak buffer and draw estimates account for the worker, orientation and scenes", () => {
  const { estimate } = estimateVideoExport(studio);
  assert.equal(estimate.decodePeakBytes, 14_400_044 + 28_800_000);
  assert.equal(estimate.mp4Bytes, 92_400_000 + mebibyte);
  const workerMux = 128 * mebibyte + estimate.mp4Bytes + 2 * 28_800_000;
  assert.equal(estimate.muxPeakBytes, workerMux + 9_000 * 36 * 4);
  assert.deepEqual(estimate.drawSeconds, [27, 27]);
  assert.equal(estimate.memoryClass, "high");
  const portrait = estimateVideoExport({
    ...studio,
    orientation: "portrait",
    workerCopy: false,
  }).estimate;
  assert.equal(portrait.muxPeakBytes, workerMux - 28_800_000 + 9_000 * 20 * 4);
  const studio3d = estimateVideoExport({
    ...studio,
    scene: "studio3d",
  }).estimate;
  assert.deepEqual(studio3d.drawSeconds, [144, 270]);
  assert.equal(studio3d.muxPeakBytes, estimate.muxPeakBytes);
  const mixed = estimateVideoExport({ ...studio, scene: "mixed" }).estimate;
  assert.deepEqual(mixed.drawSeconds, [27, 270]);
  assert.equal(mixed.muxPeakBytes, workerMux + 9_000 * (36 + 36) * 4);
  const short = estimateVideoExport({
    ...studio,
    audioDuration: 1,
    videoDuration: 1,
  }).estimate;
  assert.equal(
    short.muxPeakBytes,
    2 * mebibyte + short.mp4Bytes + 192_000 + 30 * 36 * 4,
  );
  assert.equal(short.memoryClass, "lower");
});

test("free space covers the new MP4 and receipt alongside already stored assets", () => {
  const unknown = estimateVideoExport(studio);
  const { additionalStorageBytes, originStorageBytes } = unknown.estimate;
  assert.equal(additionalStorageBytes, 92_400_000 + 2 * mebibyte);
  assert.equal(originStorageBytes, additionalStorageBytes + 14_400_044);
  assert.equal(unknown.allowed, true);
  assert.equal(unknown.estimate.availableStorageBytes, undefined);
  const usage = 120 * mebibyte;
  const quota = usage + additionalStorageBytes;
  assert.equal(
    estimateVideoExport({ ...studio, storage: { usage, quota } }).allowed,
    true,
  );
  assert.equal(
    estimateVideoExport({ ...studio, storage: { usage, quota: quota - 1 } })
      .constraint,
    "storage",
  );
  assert.equal(
    estimateVideoExport({ ...studio, storage: { usage, quota: 0 } }).constraint,
    "storage",
  );
  for (const storage of [
    { quota },
    { usage, quota: Infinity },
    { usage: -1, quota },
  ]) {
    const result = estimateVideoExport({ ...studio, storage });
    assert.equal(result.allowed, true);
    assert.equal(result.estimate.availableStorageBytes, undefined);
  }
});
