export default [
  ["agent.run.replyLanguage", "Simplified Chinese"],
  ["agent.run.aborted", "运行已取消。"],
  ["agent.run.invalidInput", "请检查目标、模型和步骤上限。"],
  ["agent.run.stepLimit", "已达到本次运行的步骤上限。"],
  ["agent.run.modelError", "OpenAI 未返回可用的代理结果。"],
  ["agent.run.toolError", "工具未完成，代理已停止。"],
  // native-review
  [
    "agent.run.estimate",
    "预估用量为本次代理的模型请求与输出 token 上限。输入 token 另计，付费工具会单独请求授权。",
  ],
  // native-review
  ["agent.failure.consentRequired", "请先确认费用预估并授权本次运行。"],
  // native-review
  ["agent.failure.consentDenied", "本次运行未获费用授权。"],
  // native-review
  ["agent.failure.keyInContent", "内容包含 API 密钥，请移除后再试。"],
  // native-review
  ["agent.failure.noKey", "请先在此页面设置 OpenAI API 密钥。"],
  [
    "agent.failure.providerRejected",
    "OpenAI 拒绝了请求，请检查模型权限和用量。",
  ],
  // native-review
  [
    "agent.failure.unknownOutcome",
    "请求结果未知，可能已计费。请核对用量和资料库进度。",
  ],
  ["agent.bridge.unknownTool", "没有找到此工具。"],
  ["agent.bridge.invalidArguments", "工具参数无效。"],
  ["agent.bridge.aborted", "操作已取消。"],
  ["agent.bridge.timeout", "操作已超时。"],
  ["agent.bridge.notFound", "资料库中没有此节目。"],
  ["agent.bridge.prerequisiteRequired", "请先完成所需的节目阶段。"],
  ["agent.bridge.conflict", "节目已更新或正在制作，请重新读取资料库。"],
  // native-review
  ["agent.bridge.saveFailed", "无法保存本次结果，请检查浏览器存储和用量。"],
  ["agent.bridge.error", "工具未能完成，请检查资料库进度。"],
  [
    "agent.bridge.strictSchema",
    "Strict tool schemas must require every property and reject additional properties.",
  ],
  ["agent.bridge.invalidTimeout", "Invalid tool timeout."],
  ["agent.bridge.invalidToolName", "Invalid or duplicate tool name."],
  ["agent.tool.listEpisodes", "列出资料库中最近更新的节目和制作进度。"],
  ["agent.tool.getEpisode", "按节目 ID 查询资料库中的制作进度。"],
  [
    "agent.tool.research",
    "新建节目，研究主题并交叉核对证据，将结果保存到资料库。",
  ],
  // native-review
  [
    "agent.estimate.research",
    "预估用量为研究和交叉核对的输出 token 与网页搜索上限。输入 token 另计。",
  ],
  [
    "agent.tool.writeScript",
    "为已研究的节目写大纲和脚本，并将结果保存到资料库。",
  ],
  // native-review
  [
    "agent.estimate.script",
    "预估用量为大纲和脚本的输出 token 上限。输入 token 另计。",
  ],
  [
    "agent.tool.narrate",
    "为已保存的脚本生成旁白和转录，每段音频生成后保存到资料库。",
  ],
  // native-review
  [
    "agent.estimate.narration",
    "预估用量为旁白的输出 token 上限和转录的音频时长上限。输入 token 另计。",
  ],
  [
    "agent.tool.renderVideo",
    "在此浏览器中将当前版本的节目音频和字幕渲染为 MP4。",
  ],
  [
    "agent.tool.exportPackage",
    "将当前版本的 MP4、缩略图和发布资料保存为 ZIP，供手动上传。",
  ],
] as const;
