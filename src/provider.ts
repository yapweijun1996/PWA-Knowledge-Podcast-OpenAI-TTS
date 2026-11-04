import { MAX_INSTRUCTIONS_LENGTH, MAX_SEGMENT_LENGTH } from "./limits.ts";

/** A provider-neutral boundary. The public demo does not instantiate a gateway. */
export interface AudioRequest {
  text: string;
  voice: string;
  instructions: string;
  requestId: string;
}
export interface AudioProvider {
  generate(request: AudioRequest, signal: AbortSignal): Promise<Blob>;
}
export class DisabledGatewayProvider implements AudioProvider {
  async generate(_request: AudioRequest, _signal: AbortSignal): Promise<Blob> {
    throw new Error(
      "Real generation requires an approved authenticated gateway; no gateway is configured.",
    );
  }
}

/**
 * Contract for a separately approved gateway. The short-lived gateway session is
 * held only in memory; this adapter never accepts an OpenAI API key. It must not
 * be enabled until the server's authentication and abuse controls are audited.
 */
export class GatewayProvider implements AudioProvider {
  private readonly endpoint: URL;
  private readonly session: string;
  private readonly transport: typeof fetch;
  constructor(
    endpoint: string,
    session: string,
    transport: typeof fetch = fetch,
  ) {
    this.endpoint = new URL(endpoint);
    this.session = session;
    this.transport = transport;
    if (
      this.endpoint.protocol !== "https:" ||
      this.endpoint.hostname === "api.openai.com" ||
      this.endpoint.username ||
      this.endpoint.password ||
      this.endpoint.search ||
      this.endpoint.hash ||
      !session.trim() ||
      session.startsWith("sk-")
    ) {
      throw new Error("Invalid gateway configuration");
    }
  }
  async generate(request: AudioRequest, signal: AbortSignal): Promise<Blob> {
    if (
      !request.text.trim() ||
      request.text.length > MAX_SEGMENT_LENGTH ||
      request.instructions.length > MAX_INSTRUCTIONS_LENGTH ||
      !/^[a-z0-9_-]{1,64}$/i.test(request.voice) ||
      !/^[a-z0-9_-]{1,128}$/i.test(request.requestId)
    ) {
      throw new Error("Invalid generation request");
    }
    const response = await this.transport(this.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.session}`,
      },
      body: JSON.stringify(request),
      signal: AbortSignal.any([signal, AbortSignal.timeout(60_000)]),
      credentials: "omit",
      cache: "no-store",
      redirect: "error",
      referrerPolicy: "no-referrer",
    });
    if (!response.ok)
      throw new Error(
        response.status === 429
          ? "Gateway rate limit reached"
          : "Gateway request failed",
      );
    const mime = response.headers.get("content-type")?.split(";")[0].trim();
    const length = Number(response.headers.get("content-length"));
    if (
      !["audio/wav", "audio/mpeg"].includes(mime ?? "") ||
      !Number.isFinite(length) ||
      length <= 44 ||
      length > 20_000_000
    )
      throw new Error("Invalid audio response");
    if (!response.body) throw new Error("Invalid audio response");
    const reader = response.body.getReader();
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let received = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        received += value.byteLength;
        if (received > length) {
          await reader.cancel();
          throw new Error("Invalid audio response");
        }
        chunks.push(new Uint8Array(value));
      }
    } finally {
      reader.releaseLock();
    }
    if (received !== length) throw new Error("Invalid audio response");
    const blob = new Blob(chunks, { type: mime });
    const prefix = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
    const wav =
      mime === "audio/wav" &&
      new TextDecoder().decode(prefix.slice(0, 4)) === "RIFF" &&
      new TextDecoder().decode(prefix.slice(8, 12)) === "WAVE";
    const mp3 =
      mime === "audio/mpeg" &&
      (new TextDecoder().decode(prefix.slice(0, 3)) === "ID3" ||
        (prefix[0] === 0xff && (prefix[1] & 0xe0) === 0xe0));
    if (!wav && !mp3) throw new Error("Invalid audio response");
    return blob;
  }
}
