import { studioBase, voices, type Voice } from "../../shared/factory.ts";
import { MAX_INSTRUCTIONS_LENGTH, MAX_SEGMENT_LENGTH } from "../limits.ts";
import type { AudioProvenance } from "../model.ts";
import { AUDIBLE_SAMPLE, pcmToWav } from "./pcm.ts";

export const REALTIME_MODEL = "gpt-realtime-2.1-mini";
const SAMPLE_RATE = 24_000;
const MAX_OUTPUT_TOKENS = 1024;
const MAX_CAPTURE_SAMPLES = SAMPLE_RATE * 125;
const PROCESSOR = "podcast-pcm-capture";
const AUDIO_UNSUPPORTED = "此浏览器不支持实时音频采集，请尝试最新版 Chrome。";
const NO_AUDIO = "未收到可听见的音频，请检查连接。可能已经产生费用。";
const CAPTURE_FAILED = "浏览器音频采集失败；可能已经产生费用。";

type ResponseStatus = "completed" | "incomplete";

export type NarrationTake = {
  audio: Blob;
  /** Provider completion plus a drained, audible capture. Listening QA is separate. */
  complete: boolean;
  provenance: AudioProvenance & {
    requestedVoice: Voice;
    requestedInstructions: string;
    responseStatus: ResponseStatus;
  };
};

export type NarrationOptions = {
  key: string;
  text: string | readonly string[];
  voice: Voice;
  instructions: string;
  signal: AbortSignal;
  /** The caller discloses the estimated cost and obtains consent for this run. */
  consentGranted: boolean;
  onTake: (take: NarrationTake, index: number) => void | Promise<void>;
  maxOutputTokens?: number;
  preserveIncomplete?: boolean;
};

type RealtimeEvent = {
  type?: string;
  response?: { id?: string; status?: string };
  response_id?: string;
  session?: {
    model?: unknown;
    audio?: { output?: { voice?: unknown } };
  };
};

/** Open one browser-direct session for up to three segments and await each save.
 * An opted-in, provider-reported incomplete take is saved last and ends the run.
 * The callback owns any recovery of a received take when its save fails.
 */
export async function generateNarration({
  key: apiKey,
  text,
  voice,
  instructions,
  signal,
  consentGranted,
  onTake,
  maxOutputTokens = MAX_OUTPUT_TOKENS,
  preserveIncomplete = false,
}: NarrationOptions): Promise<NarrationTake[]> {
  const key = apiKey.trim();
  const cleanup: (() => void)[] = [];
  const run = new AbortController();
  const fail = (message: string) => run.abort(new Error(message));
  const cancel = () => run.abort(new DOMException("已取消。", "AbortError"));

  try {
    const texts = typeof text === "string" ? [text] : [...text];
    if (consentGranted !== true)
      throw new Error("请先确认本次生成的预估费用并同意继续。");
    if (typeof onTake !== "function") throw new Error("请先设置音频保存方式。");
    if (
      !key ||
      texts.length < 1 ||
      texts.length > 3 ||
      texts.some(
        (segment) => !segment.trim() || segment.length > MAX_SEGMENT_LENGTH,
      ) ||
      instructions.length > MAX_INSTRUCTIONS_LENGTH ||
      !voices.includes(voice)
    )
      throw new Error(
        `请检查 API key、声音、片段长度（最多 ${MAX_SEGMENT_LENGTH} 字符）和旁白指令（最多 ${MAX_INSTRUCTIONS_LENGTH} 字符）。`,
      );
    if (
      instructions.includes(key) ||
      texts.some((segment) => segment.includes(key))
    )
      throw new Error("请从脚本和旁白指令中移除 API key。");
    if (
      !Number.isInteger(maxOutputTokens) ||
      maxOutputTokens < 1 ||
      maxOutputTokens > MAX_OUTPUT_TOKENS
    )
      throw new Error(
        `输出 token 上限必须为 1 至 ${MAX_OUTPUT_TOKENS} 的整数。`,
      );
    if (
      typeof globalThis.RTCPeerConnection !== "function" ||
      typeof globalThis.AudioContext !== "function" ||
      typeof globalThis.AudioWorkletNode !== "function" ||
      typeof globalThis.Audio !== "function" ||
      typeof globalThis.MediaStream !== "function"
    )
      throw new Error(AUDIO_UNSUPPORTED);

    signal.addEventListener("abort", cancel, { once: true });
    cleanup.push(() => signal.removeEventListener("abort", cancel));
    if (signal.aborted) cancel();
    run.signal.throwIfAborted();

    const context = new AudioContext({ sampleRate: SAMPLE_RATE });
    cleanup.push(() => {
      if (context.state !== "closed") void context.close().catch(() => {});
    });
    if (typeof context.audioWorklet?.addModule !== "function")
      throw new Error(AUDIO_UNSUPPORTED);
    const startupError = "无法启动浏览器音频采集；没有发起 OpenAI 请求。";
    let capture: AudioWorkletNode;
    try {
      await withDeadline(run.signal, 8_000, startupError, async (active) => {
        await context.resume();
        active.throwIfAborted();
        await context.audioWorklet.addModule(
          `${studioBase}pcm-capture-worklet.js`,
        );
      });
      run.signal.throwIfAborted();
      if (context.state !== "running" || context.sampleRate !== SAMPLE_RATE)
        throw new Error(startupError);
      capture = new AudioWorkletNode(context, PROCESSOR, {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      });
      cleanup.push(
        () => capture.port.close(),
        () => capture.disconnect(),
      );
      // The worklet feeds a silent output to keep the Web Audio graph rendering.
      capture.connect(context.destination);
    } catch {
      run.signal.throwIfAborted();
      throw new Error(startupError);
    }

    const sink = new Audio();
    sink.muted = true;
    cleanup.push(
      () => {
        sink.srcObject = null;
      },
      () => sink.pause(),
    );
    const peer = new RTCPeerConnection();
    cleanup.push(() => peer.close());
    peer.addTransceiver("audio", { direction: "recvonly" });
    const channel = peer.createDataChannel("oai-events");
    cleanup.push(() => channel.close());
    cleanup.push(() => {
      peer.ontrack = peer.onconnectionstatechange = null;
      channel.onopen =
        channel.onmessage =
        channel.onerror =
        channel.onclose =
          null;
      capture.onprocessorerror = null;
    });

    const requestedInstructions = `Read the user's text exactly as written, without introduction, commentary, omissions, or added words. ${instructions}`;
    const session = {
      type: "realtime",
      model: REALTIME_MODEL,
      output_modalities: ["audio"],
      instructions: requestedInstructions,
      audio: { output: { voice } },
      max_output_tokens: maxOutputTokens,
    };
    let effectiveModel: string | undefined;
    let effectiveVoice: string | undefined;
    let onResponse: ((event: RealtimeEvent) => void) | undefined;
    let track: MediaStreamTrack | undefined;
    const ready = new Promise<void>((resolve) => {
      let channelReady = channel.readyState === "open";
      let sessionReady = false;
      let trackReady = false;
      const checkReady = () => {
        if (channelReady && sessionReady && trackReady) resolve();
      };

      channel.onopen = () => {
        channelReady = true;
        checkReady();
      };
      channel.onerror = () => fail("Realtime 连接中断；可能已经产生费用。");
      channel.onclose = () => fail("Realtime 连接提前关闭；可能已经产生费用。");
      peer.onconnectionstatechange = () => {
        if (
          peer.connectionState === "failed" ||
          peer.connectionState === "closed"
        )
          fail("Realtime 连接失败；可能已经产生费用。");
      };
      capture.onprocessorerror = () => fail(CAPTURE_FAILED);

      peer.ontrack = (event) => {
        if (track || run.signal.aborted || event.track.kind !== "audio") return;
        track = event.track;
        const onEnded = () => fail("Realtime 音轨提前结束；可能已经产生费用。");
        cleanup.push(
          () => event.track.stop(),
          () => event.track.removeEventListener("ended", onEnded),
        );
        try {
          track.addEventListener("ended", onEnded);
          const stream = new MediaStream([track]);
          // Chrome may need a media element to render a remote WebRTC track.
          sink.srcObject = stream;
          const source = context.createMediaStreamSource(stream);
          cleanup.push(() => source.disconnect());
          source.connect(capture);
          void sink.play().then(
            () => {
              trackReady = true;
              checkReady();
            },
            () => fail("浏览器无法启动远端音频；可能已经产生费用。"),
          );
        } catch {
          fail("此浏览器无法采集远端音频；可能已经产生费用。");
        }
      };

      channel.onmessage = ({ data }) => {
        if (run.signal.aborted) return;
        let event: RealtimeEvent;
        try {
          event = JSON.parse(String(data));
          if (!event || typeof event.type !== "string") throw new Error();
        } catch {
          fail("Realtime 响应格式错误；可能已经产生费用。");
          return;
        }
        if (event.type === "error") {
          fail(
            "OpenAI 请求失败，请检查 key、模型权限和用量。可能已经产生费用。",
          );
        } else if (event.type === "session.created" && !sessionReady) {
          const model = event.session?.model;
          const voice = event.session?.audio?.output?.voice;
          if (
            typeof model === "string" &&
            /^gpt-realtime-[a-z0-9.-]{1,64}$/.test(model) &&
            !model.includes(key)
          )
            effectiveModel = model;
          if (
            typeof voice === "string" &&
            /^[a-z]{1,32}$/.test(voice) &&
            !voice.includes(key)
          )
            effectiveVoice = voice;
          sessionReady = true;
          checkReady();
        } else {
          onResponse?.(event);
        }
      };
    });

    const timer = setTimeout(
      () => fail("请求超时；请检查网络和模型权限。可能已经产生费用。"),
      120_000,
    );
    cleanup.push(() => clearTimeout(timer));
    await negotiate(peer, session, key, run.signal);
    await abortable(run.signal, () => ready);

    const takes: NarrationTake[] = [];
    for (const [index, segment] of texts.entries()) {
      const { audio, status } = await recordTake(
        capture,
        channel,
        segment,
        preserveIncomplete === true,
        run.signal,
        (handler) => {
          onResponse = handler;
        },
      );
      const take: NarrationTake = {
        audio,
        complete: status === "completed",
        provenance: {
          requestedModel: REALTIME_MODEL,
          requestedVoice: voice,
          requestedInstructions,
          effectiveModel,
          effectiveVoice,
          responseStatus: status,
        },
      };
      // A completed capture belongs to the caller even if the run stops during its save.
      await onTake(take, index);
      run.signal.throwIfAborted();
      takes.push(take);
      if (status === "incomplete") break;
    }
    return takes;
  } catch (error) {
    // Rebuild the public error without the original stack, cause, or custom fields.
    const redact = (message: string) =>
      key ? message.replaceAll(key, "[已隐藏]") : message;
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : "旁白生成或保存失败。";
    if (error instanceof DOMException)
      throw new DOMException(redact(message), redact(error.name));
    const publicError = new Error(redact(message));
    if (error instanceof Error) publicError.name = redact(error.name);
    throw publicError;
  } finally {
    for (const release of cleanup.reverse()) {
      try {
        release();
      } catch {
        // A failed release must not mask the outcome or skip other resources.
      }
    }
  }
}

async function negotiate(
  peer: RTCPeerConnection,
  session: object,
  key: string,
  signal: AbortSignal,
) {
  const offerError = "无法建立浏览器音频连接。";
  const connectionError =
    "OpenAI 连接失败；请检查网络和模型权限。可能已经产生费用。";
  await withDeadline(
    signal,
    30_000,
    "连接超时；可能已经产生费用。",
    async (active) => {
      let offer: RTCSessionDescriptionInit;
      try {
        offer = await peer.createOffer();
        active.throwIfAborted();
        await peer.setLocalDescription(offer);
      } catch {
        active.throwIfAborted();
        throw new Error(offerError);
      }
      active.throwIfAborted();
      if (!offer.sdp) throw new Error(offerError);
      const form = new FormData();
      form.set("sdp", offer.sdp);
      form.set("session", JSON.stringify(session));
      let response: Response;
      try {
        response = await fetch("https://api.openai.com/v1/realtime/calls", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}` },
          body: form,
          signal: active,
          credentials: "omit",
          cache: "no-store",
          redirect: "error",
          referrerPolicy: "no-referrer",
        });
      } catch {
        active.throwIfAborted();
        throw new Error(connectionError);
      }
      active.throwIfAborted();
      if (response.status === 401) throw new Error("API key 无效或已过期。");
      if (response.status === 429)
        throw new Error("OpenAI 额度或速率受限；请检查账户。");
      if (!response.ok) throw new Error(connectionError);
      try {
        const answer = await response.text();
        active.throwIfAborted();
        if (!answer || answer.length > 200_000) throw new Error();
        await peer.setRemoteDescription({ type: "answer", sdp: answer });
      } catch {
        active.throwIfAborted();
        throw new Error("OpenAI 返回的连接信息无法使用；可能已经产生费用。");
      }
    },
  );
}

async function recordTake(
  capture: AudioWorkletNode,
  channel: RTCDataChannel,
  text: string,
  preserveIncomplete: boolean,
  signal: AbortSignal,
  setResponseHandler: (handler?: (event: RealtimeEvent) => void) => void,
) {
  let drainTimer: ReturnType<typeof setTimeout> | undefined;
  const collect = () =>
    new Promise<{ audio: Blob; status: ResponseStatus }>((resolve, reject) => {
      type Phase = "starting" | "recording" | "draining" | "flushing";
      let phase: Phase = "starting";
      let status: ResponseStatus | undefined;
      let responseId: string | undefined;
      let sampleCount = 0;
      let lastSoundAt: number | undefined;
      const chunks: Float32Array[] = [];
      const fail = (message: string) => reject(new Error(message));

      setResponseHandler((event) => {
        if (
          event.type === "response.done" &&
          phase === "recording" &&
          !status
        ) {
          const reported = event.response?.status;
          if (
            reported === "completed" ||
            (reported === "incomplete" && preserveIncomplete)
          ) {
            status = reported;
            responseId = event.response?.id;
          } else {
            fail("语音生成未完成；可能已经产生费用。");
          }
        }
        if (event.type !== "output_audio_buffer.stopped") return;
        if (
          !status ||
          (responseId && event.response_id && responseId !== event.response_id)
        ) {
          fail("音频结束事件顺序异常，无法确认结果；可能已经产生费用。");
          return;
        }
        if (phase !== "recording") return;
        phase = "draining";
        // The server can drain before the browser renders the final frames.
        const stoppedAt = performance.now();
        const drain = () => {
          const now = performance.now();
          if (lastSoundAt === undefined && now - stoppedAt >= 8_000) {
            fail(NO_AUDIO);
          } else if (
            lastSoundAt !== undefined &&
            now - Math.max(stoppedAt, lastSoundAt) >= 2_000
          ) {
            phase = "flushing";
            try {
              capture.port.postMessage("stop");
            } catch {
              fail(CAPTURE_FAILED);
            }
          } else if (now - stoppedAt >= 15_000) {
            fail("无法确认音频已完整接收；可能已经产生费用。");
          } else {
            drainTimer = setTimeout(drain, 200);
          }
        };
        drainTimer = setTimeout(drain, 200);
      });

      capture.port.onmessage = ({
        data,
      }: MessageEvent<{ type: string; samples?: Float32Array }>) => {
        if (signal.aborted) return;
        if (data.type === "ready" && phase === "starting") {
          phase = "recording";
          try {
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
          } catch {
            fail("无法启动音频生成；可能已经产生费用。");
          }
        } else if (
          data.type === "data" &&
          phase !== "starting" &&
          data.samples instanceof Float32Array
        ) {
          sampleCount += data.samples.length;
          if (sampleCount > MAX_CAPTURE_SAMPLES) {
            fail("生成音频过长；可能已经产生费用。");
            return;
          }
          chunks.push(data.samples);
          if (data.samples.some((sample) => Math.abs(sample) > AUDIBLE_SAMPLE))
            lastSoundAt = performance.now();
        } else if (data.type === "done") {
          if (phase !== "flushing" || !status || !sampleCount) {
            fail("未收到完整音频；可能已经产生费用。");
            return;
          }
          try {
            resolve({ audio: pcmToWav(chunks, SAMPLE_RATE), status });
          } catch (error) {
            reject(error);
          }
        }
      };
      capture.port.postMessage("start");
    });
  try {
    return await abortable(signal, collect);
  } finally {
    clearTimeout(drainTimer);
    setResponseHandler();
    capture.port.onmessage = null;
  }
}

async function abortable<T>(
  signal: AbortSignal,
  work: () => Promise<T>,
): Promise<T> {
  signal.throwIfAborted();
  let removeListener = () => {};
  const aborted = new Promise<never>((_, reject) => {
    const stop = () => reject(signal.reason);
    signal.addEventListener("abort", stop, { once: true });
    removeListener = () => signal.removeEventListener("abort", stop);
  });
  try {
    return await Promise.race([aborted, (async () => work())()]);
  } finally {
    removeListener();
  }
}

async function withDeadline<T>(
  signal: AbortSignal,
  ms: number,
  message: string,
  work: (active: AbortSignal) => Promise<T>,
): Promise<T> {
  const timeout = new AbortController();
  const active = AbortSignal.any([signal, timeout.signal]);
  const timer = setTimeout(() => timeout.abort(new Error(message)), ms);
  try {
    return await abortable(active, () => work(active));
  } finally {
    clearTimeout(timer);
  }
}
