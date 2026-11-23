export class PublicError extends Error {
  declare status: number;

  constructor(message: string, status = 422) {
    super(message);
    this.status = status;
  }
}

export function providerError(status: number, code: unknown) {
  if (status === 401)
    return new PublicError("OpenAI 密钥无效。请在服务器更新密钥并重启。");
  if (status === 403 || status === 404 || code === "model_not_found")
    return new PublicError(
      "OpenAI 项目无权使用此接口或模型。请检查服务器的模型配置和项目权限。",
    );
  if (code === "insufficient_quota")
    return new PublicError("OpenAI 项目额度不足。请检查项目账单和预算。");
  if (status === 429)
    return new PublicError(
      "OpenAI 已限流或额度不足。请检查项目设置，稍后手动重试。",
    );
  if (status === 400)
    return new PublicError(
      "OpenAI 拒绝请求。请检查模型与该阶段的接口是否兼容。",
    );
  return new PublicError("OpenAI 服务暂不可用。请稍后手动重试。");
}
