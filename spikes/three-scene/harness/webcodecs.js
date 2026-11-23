import { fps, frameCount } from "./fixture.js";

const codec = "avc1.420028";
const batchSize = 15;
const timestampAt = (index) => Math.round((index * 1_000_000) / fps);

export async function probeWebCodecs(canvas, renderFrame, width, height) {
  const result = {
    videoFrame: { status: "UNAVAILABLE" },
    videoEncoder: { status: "NOT_RUN", codec },
  };
  if (typeof VideoFrame !== "function") return result;

  function capture(index) {
    renderFrame(index);
    return new VideoFrame(canvas, {
      timestamp: timestampAt(index),
      duration: timestampAt(index + 1) - timestampAt(index),
    });
  }

  try {
    const frame = capture(0);
    try {
      if (
        frame.codedWidth !== width ||
        frame.codedHeight !== height ||
        frame.timestamp !== 0
      ) {
        throw new Error(
          "VideoFrame dimensions or timestamp differ from the requested values.",
        );
      }
    } finally {
      frame.close();
    }
    result.videoFrame.status = "PASS";
  } catch (error) {
    result.videoFrame = { status: "FAIL", error: String(error) };
    return result;
  }

  if (typeof VideoEncoder !== "function") {
    result.videoEncoder.status = "UNAVAILABLE";
    return result;
  }

  const config = {
    codec,
    width,
    height,
    framerate: fps,
    bitrate: 5_000_000,
    latencyMode: "realtime",
    avc: { format: "avc" },
  };
  let encoder;
  let encoderError;
  try {
    const { supported } = await VideoEncoder.isConfigSupported(config);
    if (!supported) {
      result.videoEncoder.status = "UNSUPPORTED";
      return result;
    }

    const timestamps = [];
    let encodedBytes = 0;
    encoder = new VideoEncoder({
      error: (error) => {
        encoderError = error;
      },
      output: (chunk) => {
        timestamps.push(chunk.timestamp);
        encodedBytes += chunk.byteLength;
      },
    });
    encoder.configure(config);
    for (let index = 0; index < frameCount; index++) {
      const frame = capture(index);
      try {
        encoder.encode(frame, { keyFrame: index % batchSize === 0 });
      } finally {
        frame.close();
      }
      if ((index + 1) % batchSize === 0 || index + 1 === frameCount)
        await encoder.flush();
      if (encoderError) throw encoderError;
    }

    if (
      timestamps.length !== frameCount ||
      timestamps.some((ts, i) => ts !== timestampAt(i)) ||
      encodedBytes === 0
    ) {
      throw new Error(
        `Unexpected encoder output: ${timestamps.length} chunks, ${encodedBytes} bytes, or mismatched timestamps.`,
      );
    }
    result.videoEncoder = {
      status: "PASS",
      codec,
      encodedFrames: timestamps.length,
      encodedBytes,
    };
  } catch (error) {
    result.videoEncoder = {
      status: "FAIL",
      codec,
      error: String(encoderError ?? error),
    };
  } finally {
    if (encoder && encoder.state !== "closed") encoder.close();
  }
  return result;
}
