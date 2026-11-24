import { createFile, MP4BoxBuffer } from "mp4box";

// Sequential decode preserves the exact presentation time of every sample in
// the export. Seeking a video element repeatedly re-decodes long H.264 GOPs.
export async function readMp4Frames(
  blob: Blob,
  width: number,
  height: number,
  fps: number,
  frameCount: number,
  read: (frame: VideoFrame, index: number) => void,
) {
  const bytes = await blob.arrayBuffer();
  const file = createFile(false);
  file.onError = (_module, message) => {
    throw new Error(`Cannot demux the visual QA MP4: ${message}`);
  };
  file.appendBuffer(MP4BoxBuffer.fromArrayBuffer(bytes, 0), true);
  const [track, extraTrack] = file.getInfo().videoTracks;
  if (!track?.video || extraTrack || !track.codec.startsWith("avc1."))
    throw new Error("Expected one H.264 video track in the visual QA MP4");
  const samples = file.getTrackSamplesInfo(track.id);
  if (samples.length !== frameCount)
    throw new Error(
      `MP4 contains ${samples.length} frames, expected ${frameCount}`,
    );
  const description = samples[0]?.description;
  const avcC =
    description && "boxes" in description
      ? description.boxes?.find(({ type }) => type === "avcC")
      : undefined;
  if (avcC?.start === undefined || !avcC.hdr_size)
    throw new Error("Missing H.264 decoder configuration in the visual QA MP4");
  const config: VideoDecoderConfig = {
    codec: track.codec,
    codedWidth: track.video.width,
    codedHeight: track.video.height,
    hardwareAcceleration: "prefer-software",
    description: bytes.slice(
      avcC.start + avcC.hdr_size,
      avcC.start + avcC.size,
    ),
  };
  const errors = new AbortController();
  let count = 0;
  const decoder = new VideoDecoder({
    error: (reason) => errors.abort(reason),
    output(frame) {
      try {
        if (errors.signal.aborted) return;
        // The muxer uses an integer timescale and rounds the encoded PTS.
        const expected = Math.round((count / fps) * 1_000_000);
        if (Math.abs(frame.timestamp - expected) > 1_000)
          throw new Error(
            `MP4 frame ${count} has PTS ${frame.timestamp} µs, expected ${expected} µs`,
          );
        if (frame.displayWidth !== width || frame.displayHeight !== height)
          throw new Error(
            `MP4 frame ${count} is ${frame.displayWidth}×${frame.displayHeight}, expected ${width}×${height}`,
          );
        read(frame, count++);
      } catch (reason) {
        errors.abort(reason);
      } finally {
        frame.close();
      }
    },
  });
  try {
    decoder.configure(config);
    for (const sample of samples) {
      errors.signal.throwIfAborted();
      if (decoder.decodeQueueSize >= 8) {
        const listeners = new AbortController();
        try {
          await new Promise<void>((resolve, reject) => {
            decoder.addEventListener("dequeue", () => resolve(), {
              signal: listeners.signal,
            });
            errors.signal.addEventListener(
              "abort",
              () => reject(errors.signal.reason),
              {
                signal: listeners.signal,
              },
            );
          });
        } finally {
          listeners.abort();
        }
      }
      decoder.decode(
        new EncodedVideoChunk({
          timestamp: Math.round((sample.cts / sample.timescale) * 1_000_000),
          type: sample.is_sync ? "key" : "delta",
          data: new Uint8Array(bytes, sample.offset, sample.size),
        }),
      );
    }
    await decoder.flush().catch((error: unknown) => {
      errors.signal.throwIfAborted();
      throw error;
    });
    errors.signal.throwIfAborted();
    if (count !== frameCount)
      throw new Error(`MP4 decoded ${count} frames, expected ${frameCount}`);
    return count;
  } finally {
    if (decoder.state !== "closed") decoder.close();
  }
}
