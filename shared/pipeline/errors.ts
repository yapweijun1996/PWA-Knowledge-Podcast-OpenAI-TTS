export type ErrorParams = Readonly<Record<string, string | number>>;

export class PublicError extends Error {
  declare readonly status: number;
  declare readonly code?: string;
  declare readonly params?: ErrorParams;

  constructor(
    message: string,
    status = 422,
    code?: string,
    params?: ErrorParams,
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.params = params;
  }
}

export function providerError(status: number, code: unknown) {
  if (status === 401)
    return new PublicError(
      "OpenAI 密钥无效。请在服务器更新密钥并重启。",
      undefined,
      "openai.keyInvalid",
    );
  if (status === 403 || status === 404 || code === "model_not_found")
    return new PublicError(
      "OpenAI 项目无权使用此接口或模型。请检查服务器的模型配置和项目权限。",
      undefined,
      "openai.modelAccess",
    );
  if (code === "insufficient_quota")
    return new PublicError(
      "OpenAI 项目额度不足。请检查项目账单和预算。",
      undefined,
      "openai.quotaExceeded",
    );
  if (status === 429)
    return new PublicError(
      "OpenAI 已限流或额度不足。请检查项目设置，稍后手动重试。",
      undefined,
      "openai.rateLimited",
    );
  if (status === 400)
    return new PublicError(
      "OpenAI 拒绝请求。请检查模型与该阶段的接口是否兼容。",
      undefined,
      "openai.requestRejected",
    );
  return new PublicError(
    "OpenAI 服务暂不可用。请稍后手动重试。",
    undefined,
    "openai.unavailable",
  );
}
