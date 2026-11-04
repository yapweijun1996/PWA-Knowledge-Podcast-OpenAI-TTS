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
    !globalThis.MediaRecorder ||
    !globalThis.AudioContext
  )
    throw new Error("此浏览器不支持录制 Realtime 音频，请尝试最新版 Chrome。");
  if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
  const peer = new RTCPeerConnection();
  peer.addTransceiver("audio", { direction: "recvonly" });
  const channel = peer.createDataChannel("oai-events");
  let recorder: MediaRecorder | undefined;
  let track: MediaStreamTrack | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort = () => {};
  const output = new Promise<Blob>((resolve, reject) => {
    let settled = false;
    let channelReady = false;
    let sessionReady = false;
    let trackReady = false;
    let sent = false;
    let completed = false;
    let finishing = false;
    const chunks: Blob[] = [];
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
        sent ||
        !recorder ||
        settled
      )
        return;
      try {
        recorder.start();
        channel.send(
          JSON.stringify({
            type: "conversation.item.create",
            item: {
              type: "message",
              role: "user",
              content: [{ type: "input_text", text }],
            },
          }),
        );
        channel.send(
          JSON.stringify({
            type: "response.create",
            response: { output_modalities: ["audio"] },
          }),
        );
        sent = true;
      } catch {
        fail("无法启动音频录制。");
      }
    };
    onAbort = () => fail(new DOMException("Cancelled", "AbortError"));
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
    timer = setTimeout(
      () => fail("请求超时；请检查网络和模型权限。可能已经产生费用。"),
      120_000,
    );
    channel.onopen = () => {
      channelReady = true;
      start();
    };
    channel.onerror = () => fail("Realtime 连接中断；可能已经产生费用。");
    channel.onclose = () => {
      if (!settled && !finishing)
        fail("Realtime 连接提前关闭；可能已经产生费用。");
    };
    peer.ontrack = (event) => {
      if (trackReady || settled || event.track.kind !== "audio") return;
      track = event.track;
      try {
        recorder = new MediaRecorder(new MediaStream([event.track]));
        recorder.ondataavailable = (e) => {
          if (e.data.size) chunks.push(e.data);
        };
        recorder.onerror = () => fail("录音失败；可能已经产生费用。");
        recorder.onstop = () => {
          if (settled) return;
          if (!completed || !chunks.length) {
            fail("未收到完整音频；可能已经产生费用。");
            return;
          }
          settled = true;
          resolve(
            new Blob(chunks, { type: recorder?.mimeType || "audio/webm" }),
          );
        };
        trackReady = true;
        start();
      } catch {
        fail("此浏览器无法录制远端音频。");
      }
    };
    channel.onmessage = (message) => {
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
        fail("OpenAI 请求失败，请检查 key、模型权限和用量。可能已经产生费用。");
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
        recorder?.state === "recording" &&
        !finishing
      ) {
        finishing = true;
        // Allow the browser's media jitter buffer to render the last audio frames.
        setTimeout(() => {
          if (!settled && recorder?.state === "recording") recorder.stop();
        }, 700);
      }
    };
    peer.onconnectionstatechange = () => {
      if (
        peer.connectionState === "failed" ||
        peer.connectionState === "closed"
      )
        fail("Realtime 连接失败；可能已经产生费用。");
    };
  });
  // Attach a rejection handler immediately while the asynchronous handshake runs.
  output.catch(() => {});
  try {
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
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
    await peer.setRemoteDescription({ type: "answer", sdp: answer });
    const recorded = await output;
    return await recordingToWav(recorded);
  } finally {
    if (timer) clearTimeout(timer);
    signal.removeEventListener("abort", onAbort);
    if (recorder?.state === "recording") recorder.stop();
    track?.stop();
    channel.close();
    peer.close();
  }
}

async function recordingToWav(recording: Blob): Promise<Blob> {
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(
      await recording.arrayBuffer(),
    );
    if (!decoded.length || decoded.duration > 125)
      throw new Error("音频为空或过长。");
    const channels = Array.from({ length: decoded.numberOfChannels }, (_, i) =>
      decoded.getChannelData(i),
    );
    let first = decoded.length,
      last = -1;
    for (let i = 0; i < decoded.length; i++) {
      if (channels.some((c) => Math.abs(c[i]) > 0.001)) {
        first = Math.min(first, i);
        last = i;
      }
    }
    if (last < 0) throw new Error("未收到可听见的音频，请检查连接。");
    first = Math.max(0, first - Math.floor(decoded.sampleRate * 0.15));
    last = Math.min(
      decoded.length - 1,
      last + Math.floor(decoded.sampleRate * 0.25),
    );
    const length = last - first + 1,
      data = new ArrayBuffer(44 + length * 2),
      view = new DataView(data);
    const word = (offset: number, value: string) =>
      [...value].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
    word(0, "RIFF");
    view.setUint32(4, 36 + length * 2, true);
    word(8, "WAVE");
    word(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, decoded.sampleRate, true);
    view.setUint32(28, decoded.sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    word(36, "data");
    view.setUint32(40, length * 2, true);
    for (let i = 0; i < length; i++) {
      let sample = 0;
      for (const channel of channels)
        sample += channel[first + i] / channels.length;
      sample = Math.max(-1, Math.min(1, sample));
      view.setInt16(
        44 + i * 2,
        sample < 0 ? sample * 32768 : sample * 32767,
        true,
      );
    }
    return new Blob([data], { type: "audio/wav" });
  } finally {
    await context.close();
  }
}
