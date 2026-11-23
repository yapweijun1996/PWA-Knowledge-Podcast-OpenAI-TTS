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
    "输入 token 另行计费。付费工具可以启动制作，并会先显示单独的费用估算，征得你的同意。",
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
    "请求结果未知，可能已计费。再次运行前，请核对 OpenAI 用量和资料库中已保存的进度。",
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
  ["agent.panel.title", "智能助手"],
  ["agent.panel.offline", "联网后即可运行智能助手。"],
  ["agent.panel.goal", "目标"],
  ["agent.panel.goalCount", "{count} / {limit} 个字符"],
  ["agent.panel.goalLength", "目标最多可输入 500 个字符。"],
  ["agent.panel.goalRequired", "请输入目标后继续。"],
  [
    "agent.panel.example.produce",
    "制作一期关于城市花园的两分钟播客，并渲染视频。",
  ],
  ["agent.panel.example.list", "列出资料库中的单集，并总结制作进度。"],
  ["agent.panel.model", "模型：{model}"],
  ["agent.panel.steps", "最多步数：{count}"],
  // native-review
  ["agent.panel.estimate.title", "用量上限估算"],
  // native-review
  ["agent.panel.estimate.requests", { other: "最多 {count} 次服务商请求" }],
  // native-review
  ["agent.panel.estimate.tokens", { other: "最多 {count} 个输出词元" }],
  // native-review
  ["agent.panel.estimate.searches", { other: "最多 {count} 次网页搜索" }],
  // native-review
  ["agent.panel.estimate.narration", { other: "最多 {count} 段配音" }],
  // native-review
  [
    "agent.panel.estimate.tokensPerTurn",
    { other: "每段配音最多 {count} 个输出词元" },
  ],
  // native-review
  ["agent.panel.estimate.transcription", { other: "最多转录 {count} 秒音频" }],
  // native-review
  [
    "agent.panel.estimate.ceiling",
    "费用估算表示用量上限，并非账单。用量上限不会限制实际支出。",
  ],
  // native-review
  [
    "agent.panel.runConsent",
    "我同意向 OpenAI 支付本次运行中模型请求产生的费用。",
  ],
  ["agent.panel.start", "启动智能助手"],
  ["agent.panel.cancel", "取消运行"],
  ["agent.panel.cancelling", "正在停止…"],
  ["agent.panel.result", "运行结果"],
  // native-review
  ["agent.panel.dialog.title", "同意调用付费工具：{tool}"],
  ["agent.panel.dialog.topic", "主题"],
  ["agent.panel.dialog.episode", "单集 ID"],
  // native-review
  ["agent.panel.dialog.deny", "拒绝"],
  // native-review
  ["agent.panel.dialog.approve", "同意本次调用"],
  ["agent.panel.tool.run", "智能助手运行"],
  ["agent.panel.tool.list", "列出单集"],
  ["agent.panel.tool.get", "查看单集"],
  ["agent.panel.tool.research", "研究主题"],
  ["agent.panel.tool.script", "撰写脚本"],
  ["agent.panel.tool.narration", "为单集配音"],
  ["agent.panel.tool.video", "渲染视频"],
  ["agent.panel.tool.export", "导出发布包"],
  ["agent.panel.tool.unknown", "未知工具"],
  ["agent.panel.toolSucceeded", "已完成。"],
  // native-review
  ["agent.panel.toolDenied", "已拒绝授权。"],
  // native-review
  ["agent.panel.stoppedAfterDenial", "你已拒绝调用付费工具，智能助手已停止。"],
  ["agent.panel.log.title", "智能助手活动"],
  ["agent.panel.log.time", "+{seconds} 秒"],
  ["agent.panel.log.step", "模型第 {step} 步，共 {maximum} 步"],
  ["agent.panel.log.toolCall", "已调用工具：{tool}"],
  ["agent.panel.log.toolResult", "工具结果（{tool}）：{status}"],
  // native-review
  ["agent.panel.log.consentAsked", "已请求同意：{tool}。"],
  // native-review
  ["agent.panel.log.consentGranted", "已同意：{tool}。"],
  // native-review
  ["agent.panel.log.consentDenied", "已拒绝：{tool}。"],
  ["agent.panel.log.error", "运行已结束：{status}"],
  ["agent.panel.savedSummary", "已保存在此设备上：{items}。"],
  ["agent.panel.savedNone", "本次运行未保存新单集或制作结果。"],
  ["agent.panel.saved.episode", "单集记录"],
  ["agent.panel.saved.researchDraft", "初步研究"],
  ["agent.panel.saved.research", "已交叉核对的研究"],
  ["agent.panel.saved.outline", "提纲"],
  ["agent.panel.saved.script", "脚本"],
  ["agent.panel.saved.narration", "配音片段"],
  ["agent.panel.saved.audio", "单集音频"],
  ["agent.panel.saved.transcript", "转录文本"],
  ["agent.panel.saved.video", "MP4 视频"],
  ["agent.panel.saved.publish", "ZIP 发布包"],
] as const;
