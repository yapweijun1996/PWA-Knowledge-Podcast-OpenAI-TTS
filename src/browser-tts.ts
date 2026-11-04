import type { Voice } from "./model";

/** Direct browser use exposes a user-supplied key to the page runtime. */
export async function generateBrowserSpeech(
  key: string,
  text: string,
  voice: Voice,
  instructions: string,
  signal: AbortSignal,
): Promise<Blob> {
  if (
    !key.trim() ||
    !text.trim() ||
    text.length > 4000 ||
    instructions.length > 2000
  )
    throw new Error("请检查 API key 和片段长度（每段最多 4000 字符）。");
  if (
    !globalThis.RTCPeerConnection ||
    !globalThis.AudioContext ||
    !globalThis.AudioWorkletNode
  )
    throw new Error("此浏览器不支持实时音频采集，请尝试最新版 Chrome。");
  if (signal.aborted) throw new DOMException("Cancelled", "AbortError");

  let context: AudioContext | undefined;
  let peer: RTCPeerConnection | undefined;
  let channel: RTCDataChannel | undefined;
  let capture: AudioWorkletNode | undefined;
  let source: MediaStreamAudioSourceNode | undefined;
  let track: MediaStreamTrack | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let finishTimer: ReturnType<typeof setTimeout> | undefined;
  let onAbort = () => {};
  try {
    // Prepare the capture graph before opening any potentially billable session.
    context = new AudioContext();
    if (!context.audioWorklet)
      throw new Error("此浏览器不支持实时音频采集，请尝试最新版 Chrome。");
    try {
      await prepareAudio(context, signal);
    } catch (error) {
      if ((error as Error).name === "AbortError") throw error;
      throw new Error("无法启动浏览器音频采集；没有发起 OpenAI 请求。");
    }
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
    if (context.state !== "running")
      throw new Error("浏览器音频未启动；没有发起 OpenAI 请求。");
    const audioContext = context;
    peer = new RTCPeerConnection();
    peer.addTransceiver("audio", { direction: "recvonly" });
    channel = peer.createDataChannel("oai-events");
    const connection = peer;
    const events = channel;

    const output = new Promise<Float32Array[]>((resolve, reject) => {
      let settled = false;
      let channelReady = false;
      let sessionReady = false;
      let trackReady = false;
      let started = false;
      let completed = false;
      let finishing = false;
      let totalSamples = 0;
      const chunks: Float32Array[] = [];
      const fail = (message: string | DOMException) => {
        if (settled) return;
        settled = true;
        reject(typeof message === "string" ? new Error(message) : message);
      };
      const start = () => {
        if (
          !channelReady ||
          !sessionReady ||
          !trackReady ||
          started ||
          !capture ||
          settled
        )
          return;
        started = true;
        capture.port.postMessage("start");
      };
      onAbort = () => fail(new DOMException("Cancelled", "AbortError"));
      signal.addEventListener("abort", onAbort, { once: true });
      if (signal.aborted) onAbort();
      timer = setTimeout(
        () => fail("请求超时；请检查网络和模型权限。可能已经产生费用。"),
        120_000,
      );
      events.onopen = () => {
        channelReady = true;
        start();
      };
      events.onerror = () => fail("Realtime 连接中断；可能已经产生费用。");
      events.onclose = () => {
        if (!settled && !finishing)
          fail("Realtime 连接提前关闭；可能已经产生费用。");
      };
      connection.ontrack = (event) => {
        if (trackReady || settled || event.track.kind !== "audio") return;
        track = event.track;
        try {
          source = audioContext.createMediaStreamSource(
            new MediaStream([event.track]),
          );
          capture = new AudioWorkletNode(audioContext, "podcast-pcm-capture", {
            numberOfInputs: 1,
            numberOfOutputs: 1,
            outputChannelCount: [1],
          });
          capture.onprocessorerror = () =>
            fail("浏览器音频采集失败；可能已经产生费用。");
          capture.port.onmessage = (
            message: MessageEvent<{ type?: string; samples?: Float32Array }>,
          ) => {
            if (settled) return;
            if (message.data.type === "ready") {
              try {
                events.send(
                  JSON.stringify({
                    type: "conversation.item.create",
                    item: {
                      type: "message",
                      role: "user",
                      content: [{ type: "input_text", text }],
                    },
                  }),
                );
                events.send(
                  JSON.stringify({
                    type: "response.create",
                    response: { output_modalities: ["audio"] },
                  }),
                );
              } catch {
                fail("无法启动音频生成；可能已经产生费用。");
              }
            } else if (
              message.data.type === "data" &&
              message.data.samples instanceof Float32Array
            ) {
              totalSamples += message.data.samples.length;
              if (totalSamples > audioContext.sampleRate * 125) {
                fail("生成音频过长；可能已经产生费用。");
                return;
              }
              chunks.push(message.data.samples);
            } else if (message.data.type === "done") {
              if (!completed || !totalSamples) {
                fail("未收到完整音频；可能已经产生费用。");
                return;
              }
              settled = true;
              resolve(chunks);
            }
          };
          source.connect(capture);
          // The worklet produces silence; the graph runs without playing the stream.
          capture.connect(audioContext.destination);
          trackReady = true;
          start();
        } catch {
          fail("此浏览器无法采集远端音频；可能已经产生费用。");
        }
      };
      events.onmessage = (message) => {
        let e: { type?: string; response?: { status?: string } };
        try {
          e = JSON.parse(String(message.data));
        } catch {
          fail("Realtime 响应格式错误。");
          return;
        }
        if (e.type === "session.created") {
          sessionReady = true;
          start();
        }
        if (e.type === "error") {
          fail(
            "OpenAI 请求失败，请检查 key、模型权限和用量。可能已经产生费用。",
          );
          return;
        }
        if (e.type === "response.done") {
          if (e.response?.status !== "completed") {
            fail("语音生成未完成；可能已经产生费用。");
            return;
          }
          completed = true;
        }
        if (
          e.type === "output_audio_buffer.stopped" &&
          completed &&
          capture &&
          !finishing
        ) {
          finishing = true;
          // Give the browser media jitter buffer time to render the final frames.
          finishTimer = setTimeout(() => {
            if (!settled) capture?.port.postMessage("stop");
          }, 700);
        }
      };
      connection.onconnectionstatechange = () => {
        if (
          connection.connectionState === "failed" ||
          connection.connectionState === "closed"
        )
          fail("Realtime 连接失败；可能已经产生费用。");
      };
    });
    // Attach a rejection handler while the asynchronous handshake runs.
    output.catch(() => {});
    const offer = await connection.createOffer();
    await connection.setLocalDescription(offer);
    if (!offer.sdp) throw new Error("无法建立浏览器音频连接。");
    const form = new FormData();
    form.set("sdp", offer.sdp);
    form.set(
      "session",
      JSON.stringify({
        type: "realtime",
        model: "gpt-realtime-2.1-mini",
        output_modalities: ["audio"],
        instructions: `Read the user's text exactly as written, without introduction, commentary, omissions, or added words. ${instructions}`,
        audio: { output: { voice } },
      }),
    );
    const response = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      headers: { Authorization: `Bearer ${key.trim()}` },
      body: form,
      signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
      credentials: "omit",
      cache: "no-store",
      redirect: "error",
      referrerPolicy: "no-referrer",
    });
    if (!response.ok) {
      if (response.status === 401) throw new Error("API key 无效或已过期。");
      if (response.status === 429)
        throw new Error("OpenAI 额度或速率受限；请检查账户。");
      throw new Error(
        `OpenAI 连接失败（HTTP ${response.status}）；请检查模型权限。`,
      );
    }
    const answer = await response.text();
    if (!answer || answer.length > 200_000)
      throw new Error("OpenAI 返回了无效的连接信息。");
    await connection.setRemoteDescription({ type: "answer", sdp: answer });
    return pcmToWav(await output, audioContext.sampleRate);
  } finally {
    if (timer) clearTimeout(timer);
    if (finishTimer) clearTimeout(finishTimer);
    signal.removeEventListener("abort", onAbort);
    source?.disconnect();
    capture?.disconnect();
    capture?.port.close();
    track?.stop();
    channel?.close();
    peer?.close();
    if (context && context.state !== "closed") await context.close();
  }
}

async function prepareAudio(context: AudioContext, signal: AbortSignal) {
  const limit = AbortSignal.any([signal, AbortSignal.timeout(8000)]);
  await new Promise<void>((resolve, reject) => {
    const stopped = () => {
      cleanup();
      reject(
        signal.aborted
          ? new DOMException("Cancelled", "AbortError")
          : new Error("Audio startup timed out"),
      );
    };
    const cleanup = () => limit.removeEventListener("abort", stopped);
    if (limit.aborted) return stopped();
    limit.addEventListener("abort", stopped, { once: true });
    context
      .resume()
      .then(() =>
        context.audioWorklet.addModule(
          `${import.meta.env.BASE_URL}pcm-capture-worklet.js`,
        ),
      )
      .then(
        () => {
          cleanup();
          resolve();
        },
        (error) => {
          cleanup();
          reject(error);
        },
      );
  });
}

export function pcmToWav(chunks: Float32Array[], sampleRate: number): Blob {
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  let first = length,
    last = -1,
    offset = 0;
  for (const chunk of chunks) {
    for (let i = 0; i < chunk.length; i++) {
      if (Math.abs(chunk[i]) > 0.001) {
        first = Math.min(first, offset + i);
        last = offset + i;
      }
    }
    offset += chunk.length;
  }
  if (last < 0)
    throw new Error("未收到可听见的音频，请检查连接。可能已经产生费用。");
  first = Math.max(0, first - Math.floor(sampleRate * 0.15));
  last = Math.min(length - 1, last + Math.floor(sampleRate * 0.25));
  const samples = last - first + 1,
    data = new ArrayBuffer(44 + samples * 2),
    view = new DataView(data);
  const word = (at: number, value: string) =>
    [...value].forEach((char, i) => view.setUint8(at + i, char.charCodeAt(0)));
  word(0, "RIFF");
  view.setUint32(4, 36 + samples * 2, true);
  word(8, "WAVE");
  word(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  word(36, "data");
  view.setUint32(40, samples * 2, true);
  offset = 0;
  for (const chunk of chunks) {
    for (let i = 0; i < chunk.length; i++) {
      const index = offset + i;
      if (index < first || index > last) continue;
      const sample = Math.max(-1, Math.min(1, chunk[i]));
      view.setInt16(
        44 + (index - first) * 2,
        sample < 0 ? sample * 32768 : sample * 32767,
        true,
      );
    }
    offset += chunk.length;
  }
  return new Blob([data], { type: "audio/wav" });
}
