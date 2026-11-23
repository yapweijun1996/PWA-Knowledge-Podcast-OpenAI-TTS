import { PublicError, providerError } from "./errors.ts";

export type OpenAI = (
  path: string,
  body: Record<string, unknown> | FormData,
  signal: AbortSignal,
  timeout?: number,
) => Promise<unknown>;

export type URLCitation = {
  type: "url_citation";
  start_index: number;
  end_index: number;
  url: string;
  title?: string;
};

export type OutputText = {
  type: "output_text";
  text: string;
  annotations?: (
    | URLCitation
    | { type: "file_citation" | "container_file_citation" | "file_path" }
  )[];
};

export type ResponsesResult = {
  status?: string;
  model?: string | null;
  output?: {
    type: string;
    status?: string;
    content?: (OutputText | { type: "refusal" })[];
  }[];
};

type StructuredRequest = {
  model: string;
  name: string;
  schema: Record<string, unknown>;
  instructions: string;
  input: unknown;
  tokens: number;
};

export const defaults = {
  research: "gpt-5.4-mini",
  script: "gpt-5.4-mini",
  audio: "gpt-realtime-2.1-mini",
  transcript: "gpt-transcribe",
};

export function createOpenAI(
  key: string | null | undefined,
  fetcher: typeof fetch = fetch,
): OpenAI {
  return async (path, body, signal, timeout = 120_000) => {
    if (!key)
      throw new PublicError(
        "请先在服务器配置 OPENAI_API_KEY。",
        503,
        "openai.serverKeyRequired",
      );
    const multipart = body instanceof FormData;
    const response = await fetcher("https://api.openai.com/v1/" + path, {
      method: "POST",
      redirect: "error",
      headers: {
        Authorization: "Bearer " + key,
        ...(multipart ? {} : { "Content-Type": "application/json" }),
      },
      body: multipart ? body : JSON.stringify(body),
      signal: AbortSignal.any([signal, AbortSignal.timeout(timeout)]),
    }).catch(() => {
      signal.throwIfAborted();
      throw new PublicError(
        "连接 OpenAI 失败或超时。此请求可能已计费，可手动重试。",
        undefined,
        "openai.timeout",
      );
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as
        | { error?: { code?: unknown } }
        | null;
      throw providerError(response.status, payload?.error?.code);
    }
    return response.json().catch(() => {
      signal.throwIfAborted();
      throw new PublicError(
        "OpenAI 返回了无法读取的结果。",
        undefined,
        "openai.responseUnreadable",
      );
    });
  };
}

export function responseParts(response: ResponsesResult | null | undefined) {
  if (response?.status !== "completed")
    throw new PublicError(
      "OpenAI 未完成此阶段，可能已达到输出上限。",
      undefined,
      "openai.responseIncomplete",
    );
  const parts =
    response.output?.flatMap((item) =>
      item.type === "message" ? item.content! : [],
    ) ?? [];
  if (parts.some((part) => part.type === "refusal"))
    throw new PublicError(
      "OpenAI 拒绝处理此主题。请检查主题内容。",
      undefined,
      "openai.topicRefused",
    );
  const result = parts.filter((part) => part.type === "output_text");
  if (!result.length)
    throw new PublicError(
      "OpenAI 未返回可用内容。",
      undefined,
      "openai.noContent",
    );
  return result;
}

export async function structured(
  openai: OpenAI,
  { model, name, schema, instructions, input, tokens }: StructuredRequest,
  signal: AbortSignal,
) {
  const response = (await openai(
    "responses",
    {
      model,
      store: false,
      instructions,
      input: JSON.stringify(input),
      max_output_tokens: tokens,
      text: { format: { type: "json_schema", name, schema, strict: true } },
    },
    signal,
  )) as ResponsesResult;
  const output = responseParts(response)
    .map((part) => part.text)
    .join("");
  try {
    const data: unknown = JSON.parse(output);
    return { data, model: response.model ?? model };
  } catch {
    throw new PublicError(
      "OpenAI 没有返回有效的结构化内容。",
      undefined,
      "openai.invalidStructuredContent",
    );
  }
}
