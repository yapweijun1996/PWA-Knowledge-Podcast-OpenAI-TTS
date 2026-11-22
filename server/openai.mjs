import { PublicError, providerError } from "./errors.mjs";

export const defaults = {
  research: "gpt-5.4-mini",
  script: "gpt-5.4-mini",
  audio: "gpt-realtime-2.1-mini",
  transcript: "gpt-transcribe",
};

export function createOpenAI(key, fetcher = fetch) {
  return async (path, body, signal, timeout = 120_000) => {
    if (!key) throw new PublicError("请先在服务器配置 OPENAI_API_KEY。", 503);
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
      );
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw providerError(response.status, payload?.error?.code);
    }
    return response.json().catch(() => {
      signal.throwIfAborted();
      throw new PublicError("OpenAI 返回了无法读取的结果。");
    });
  };
}

export function responseParts(response) {
  if (response?.status !== "completed")
    throw new PublicError("OpenAI 未完成此阶段，可能已达到输出上限。");
  const parts =
    response.output?.flatMap((item) =>
      item.type === "message" ? item.content : [],
    ) ?? [];
  if (parts.some((part) => part.type === "refusal"))
    throw new PublicError("OpenAI 拒绝处理此主题。请检查主题内容。");
  const result = parts.filter((part) => part.type === "output_text");
  if (!result.length) throw new PublicError("OpenAI 未返回可用内容。");
  return result;
}

export async function structured(
  openai,
  { model, name, schema, instructions, input, tokens },
  signal,
) {
  const response = await openai(
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
  );
  const output = responseParts(response)
    .map((part) => part.text)
    .join("");
  try {
    return { data: JSON.parse(output), model: response.model ?? model };
  } catch {
    throw new PublicError("OpenAI 没有返回有效的结构化内容。");
  }
}
