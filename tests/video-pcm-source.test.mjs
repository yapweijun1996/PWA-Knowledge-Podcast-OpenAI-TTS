import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { validateAudio } from "../shared/audio-record.ts";
import { memoryPcmSource, openWavPcmSource } from "../src/video/pcm-source.ts";
import { drawWaveform, prepareWaveform } from "../src/video/scenes/waveform.ts";
import {
  prepareAudioEnvelopes,
  speakerEmphasisOffset,
} from "../src/video/scenes/studio3d/audio-state.ts";
import {
  orbScaleAt,
  spectrumBarHeight,
  studioLayout,
} from "../src/video/scenes/studio3d/layout.ts";
import { cameraPoseAt } from "../src/video/scenes/studio3d/presets.ts";

const sampleRate = 24_000;
const fps = 30;
const samplesPerFrame = sampleRate / fps;

function wavHeader(count) {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + count * 2, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(count * 2, 40);
  return header;
}

function wavBlob(samples) {
  const data = Buffer.alloc(samples.length * 2);
  for (let index = 0; index < samples.length; index++)
    data.writeInt16LE(samples[index], index * 2);
  return new Blob([wavHeader(samples.length), data], { type: "audio/wav" });
}

const memory = (samples) =>
  memoryPcmSource({
    sampleRate,
    channels: [Float32Array.from(samples, (sample) => sample / 32768)],
  });

test("PCM windows preserve Int16 extrema and odd counts and pad both ends", async () => {
  const samples = Int16Array.of(-32768, -1, 0, 1, 32767);
  for (const source of [
    memory(samples),
    await openWavPcmSource(wavBlob(samples)),
  ]) {
    assert.equal(source.sampleRate, sampleRate);
    assert.equal(source.length, 5);
    assert.equal(source.channels, 1);
    for (const [start, count, expected] of [
      [-2, 5, [0, 0, -1, -1 / 32768, 0]],
      [-10, 3, [0, 0, 0]],
      [3, 5, [1 / 32768, 32767 / 32768, 0, 0, 0]],
      [5, 3, [0, 0, 0]],
      [1, 0, []],
    ]) {
      const [data] = await source.readWindow(start, count);
      assert.deepEqual(data, Float32Array.from(expected));
    }
    assert.throws(() => source.readWindow(0.5, 2), /Invalid PCM window/);
    assert.throws(() => source.readWindow(0, -1), /Invalid PCM window/);
  }
});

test("streaming WAV and finished-record validation agree on canonical headers and reject extra chunks", async () => {
  const valid = wavBlob(Int16Array.of(10, -100, 1000));
  await validateAudio(valid, "audio/wav");
  await openWavPcmSource(valid);

  const header = wavHeader(3);
  const withExtraChunk = Buffer.concat([
    header.subarray(0, 36),
    Buffer.from("JUNK\x02\x00\x00\x00\xaa\xbb", "latin1"),
    header.subarray(36),
    Buffer.alloc(6),
  ]);
  withExtraChunk.writeUInt32LE(withExtraChunk.length - 8, 4);
  const wrongSizes = wavHeader(3);
  wrongSizes.writeUInt32LE(8, 40);
  const oddSizes = wavHeader(1);
  oddSizes.writeUInt32LE(39, 4);
  oddSizes.writeUInt32LE(3, 40);
  const invalidWavs = [
    ["extra chunk", new Blob([withExtraChunk])],
    ["truncated data", valid.slice(0, valid.size - 2)],
    ["wrong declared data length", new Blob([wrongSizes, Buffer.alloc(6)])],
    ["odd data length", new Blob([oddSizes, Buffer.alloc(3)])],
  ];
  for (const [offset, value, label] of [
    [0, 0, "RIFF ID"],
    [8, 0, "WAVE ID"],
    [12, 0, "format chunk ID"],
    [16, 18, "format chunk length"],
    [20, 3, "PCM format"],
    [22, 2, "channel count"],
    [24, 48000, "sample rate"],
    [34, 8, "bit depth"],
    [36, 0, "data chunk ID"],
  ]) {
    const damaged = wavHeader(3);
    damaged.writeUInt16LE(value, offset);
    invalidWavs.push([label, new Blob([damaged, Buffer.alloc(6)])]);
  }
  for (const [label, wav] of invalidWavs) {
    await assert.rejects(openWavPcmSource(wav), /Invalid Studio WAV/, label);
    await assert.rejects(
      validateAudio(wav, "audio/wav"),
      { code: "record.wavInvalid" },
      label,
    );
  }
});

function turn(start, end, audioStart, speakerId) {
  return { kind: "turn", start, end, audioStart, speakerId };
}

function frameHash(waveform, envelope, plan, index) {
  const time = index / fps;
  const active = plan.scenes.find(
    (scene) => time >= scene.start && time < scene.end,
  );
  const operations = [];
  if (active) {
    drawWaveform(
      {
        fillRect(...box) {
          operations.push([this.fillStyle, ...box]);
        },
      },
      waveform,
      { index, time, turn: active, paletteId: "aurora" },
    );
  }
  const { width, height } = plan.resolution;
  const layout = studioLayout(width, height);
  const pose = cameraPoseAt("drift", time, "calm", layout.orientation);
  const orbs = [0, 1].map((host) =>
    orbScaleAt(envelope[host], envelope[speakerEmphasisOffset + host], false),
  );
  const bars = layout.ring.map((block, bin) =>
    spectrumBarHeight(pose, block, envelope[2 + bin]),
  );
  return createHash("sha256")
    .update(JSON.stringify([operations, orbs, bars]))
    .update(
      Buffer.from(envelope.buffer, envelope.byteOffset, envelope.byteLength),
    )
    .digest("hex");
}

for (const resolution of [
  { width: 1920, height: 1080 },
  { width: 1080, height: 1920 },
]) {
  test(`windowed scene frames have identical hashes at ${resolution.width}×${resolution.height} in shuffled order`, async () => {
    const samples = Int16Array.from(
      { length: 9 * sampleRate + 3 },
      (_, index) =>
        Math.round(
          (8_000 + (index % 12_000)) *
            Math.sin(index / (index < 98000 ? 7 : 21)),
        ),
    );
    const scenes = [
      turn(0, 3.13, 0.32, "A"),
      turn(3.31, 6.9, 3.7, "B"),
      turn(7, 10, 7.5, "A"),
    ];
    const plan = { resolution, duration: 10, scenes, fps };
    const sorted = [0, 15, 81, 90, 93, 99, 101, 185, 207, 239, 255, 299];

    async function hashes(pcm, order) {
      const waveform = prepareWaveform(plan, pcm);
      const studio = prepareAudioEnvelopes(pcm, plan);
      const result = new Map();
      for (const index of order) {
        await waveform.read(index);
        const envelope = await studio.read(index);
        result.set(index, frameHash(waveform, envelope, plan, index));
      }
      return result;
    }
    const expected = await hashes(memory(samples), sorted);
    assert.ok(new Set(expected.values()).size > 8);
    const shuffled = [207, 15, 255, 101, 299, 0, 239, 99, 185, 90, 81, 93];
    assert.deepEqual(await hashes(memory(samples), shuffled), expected);
    assert.deepEqual(
      await hashes(await openWavPcmSource(wavBlob(samples)), shuffled),
      expected,
    );
  });
}

/** A virtual Blob with real WAV bytes generated only when a slice is read. */
class SyntheticWav extends Blob {
  #header;
  #pulses;
  #length;
  bytesRead = 0;
  peakSliceBytes = 0;

  constructor(length, pulses = [], sequential = false) {
    super([], { type: "audio/wav" });
    this.#header = wavHeader(length);
    this.#length = length;
    this.#pulses = pulses;
    this.sequential = sequential;
  }

  get size() {
    return 44 + this.#length * 2;
  }

  slice(start, end) {
    assert.ok(start >= 0 && end <= this.size && start <= end);
    return {
      arrayBuffer: async () => {
        if (this.sequential)
          assert.equal(start, this.bytesRead, "sequential scan offset");
        const count = end - start;
        this.bytesRead += count;
        this.peakSliceBytes = Math.max(count, this.peakSliceBytes);
        const buffer = new ArrayBuffer(count);
        if (start === 0) {
          assert.equal(end, 44);
          new Uint8Array(buffer).set(this.#header);
          return buffer;
        }
        const view = new DataView(buffer);
        const first = (start - 44) / 2;
        const last = (end - 44) / 2;
        for (const pulse of this.#pulses) {
          for (
            let index = Math.max(first, pulse - 300);
            index < Math.min(last, pulse + 300);
            index++
          ) {
            view.setInt16(
              (index - first) * 2,
              Math.round(25_000 * Math.sin(index / 7)),
              true,
            );
          }
        }
        return buffer;
      },
    };
  }
}

test("the streaming reader can seek to the final sample of a two-hour WAV", async () => {
  const length = 2 * 60 * 60 * sampleRate;
  const blob = new SyntheticWav(length, [length - 1]);
  const source = await openWavPcmSource(blob);
  const [data] = await source.readWindow(length - 1, 3);
  assert.equal(source.length, length);
  assert.deepEqual(
    data,
    Float32Array.of(
      Math.round(25_000 * Math.sin((length - 1) / 7)) / 32768,
      0,
      0,
    ),
  );
  assert.ok(blob.bytesRead <= 44 + 128 * 1024);
  await assert.rejects(
    openWavPcmSource(new SyntheticWav(length + 1)),
    /Invalid Studio WAV size/,
  );
});

for (const minutes of [30, 60]) {
  test(`${minutes}-minute scene scan reads each WAV byte once with bounded windows`, async (t) => {
    const duration = minutes * 60;
    const length = duration * sampleRate;
    const frames = duration * fps;
    const sampled = new Set([
      0,
      Math.floor(frames / 3),
      Math.floor(frames / 2),
      frames - 1,
    ]);
    const blob = new SyntheticWav(
      length,
      Array.from(sampled, (index) => index * samplesPerFrame),
      true,
    );
    const wav = await openWavPcmSource(blob);
    let peakWindowBytes = 0;
    const source = {
      ...wav,
      readWindow(start, count) {
        peakWindowBytes = Math.max(
          peakWindowBytes,
          count * Float32Array.BYTES_PER_ELEMENT,
        );
        return wav.readWindow(start, count);
      },
    };
    const plan = {
      resolution: { width: 1920, height: 1080 },
      duration,
      fps,
      scenes: [turn(0, duration, 0, "A")],
    };
    const waveform = prepareWaveform(plan, source);
    const studio = prepareAudioEnvelopes(source, plan);
    let audioOffset = 0;
    for (let index = 0; index < frames; index++) {
      const waveWork = waveform.read(index);
      const waveFrame = waveWork instanceof Promise ? await waveWork : waveWork;
      const studioWork = studio.read(index);
      const studioFrame =
        studioWork instanceof Promise ? await studioWork : studioWork;
      if (sampled.has(index)) {
        assert.ok(waveFrame.some((value) => value > 0));
        assert.ok(studioFrame[0] > 0);
      }
      // Interleave reads at the encoder's 4,096-sample block cadence.
      if (audioOffset < (index + 1) * samplesPerFrame) {
        const count = Math.min(4_096, length - audioOffset);
        await source.readWindow(audioOffset, count);
        audioOffset += count;
      }
    }
    assert.equal(audioOffset, length);
    assert.equal(blob.bytesRead, length * 2 + 44);
    assert.ok(blob.peakSliceBytes <= 128 * 1024);
    assert.ok(peakWindowBytes > 0 && peakWindowBytes < 48 * 1024);
    t.diagnostic(
      `read ${blob.bytesRead} bytes, peak slice ${blob.peakSliceBytes} bytes, peak Float32 request ${peakWindowBytes} bytes`,
    );
  });
}
