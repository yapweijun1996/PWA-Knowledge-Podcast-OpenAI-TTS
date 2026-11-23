export default [
  ["studio.intake.wait", "请等待工作区完成准备或处理。"],
  ["studio.intake.needsTopic", "请填写播客主题后继续。"],
  ["studio.intake.needsConsent", "请同意本次请求后继续。"],
  ["studio.availability.offline", "当前离线"],
  ["studio.availability.offlineHint", "可以先填写主题。联网后再提交。"],
  ["studio.availability.browserKeyMissing", "尚未设置浏览器密钥"],
  [
    "studio.availability.browserKeyMissingHint",
    "请在设置中添加浏览器密钥。也可选择运行本机制作进程。",
  ],
  ["studio.availability.workerLocked", "需要登录制作进程"],
  [
    "studio.availability.workerLockedHint",
    "请在设置中添加浏览器密钥，或登录本机制作进程。",
  ],
  ["studio.availability.keyMissing", "需要 OpenAI 密钥"],
  [
    "studio.availability.keyMissingHint",
    "请在设置中添加浏览器密钥，或为本机制作进程配置密钥。",
  ],
  ["studio.availability.workerBusy", "制作进程正忙"],
  ["studio.availability.workerBusyHint", "当前任务结束后即可制作新节目。"],
  ["studio.availability.workerReady", "可以开始制作"],
  ["studio.availability.workerReadyHint", "制作进程与 OpenAI 密钥已就绪。"],
  ["studio.availability.browserReady", "可以在浏览器制作"],
  [
    "studio.availability.browserReadyHint",
    "此标签页会直接连接 OpenAI 并保存制作进度。",
  ],
  ["studio.availability.openSettings", "前往设置"],

  // native-review
  ["studio.cost.wholeEpisode", "费用预估（按整集用量）"],
  // native-review
  ["studio.cost.usage", "费用预估（按用量）"],
  // native-review
  [
    "studio.cost.disclosure",
    "{output}， {searches}，{transcription}。 输入和工具调用也可能计费，实际费用以 OpenAI 账单为准。",
  ],
  // native-review
  ["studio.cost.output", { other: "输出约 {count} 个词元" }],
  // native-review
  ["studio.cost.searches", { other: "网页搜索最多 {count} 次" }],
  // native-review
  ["studio.cost.transcription", { other: "转录约 {displayCount} 秒" }],

  ["studio.continuation.title", "继续浏览器制作"],
  // native-review
  [
    "studio.continuation.warning",
    "将从已保存的进度继续。若上次请求的结果未知，手动继续可能再次计费。",
  ],
  ["studio.continuation.offline", "当前离线，联网后才能继续制作。"],
  ["studio.continuation.workerUnavailable", "未连接本机制作进程。"],
  ["studio.continuation.workerLocked", "需要登录制作进程。"],
  ["studio.continuation.keyMissing", "需要 OpenAI 密钥。"],
  ["studio.continuation.workerBusy", "制作进程正忙。"],
  [
    "studio.continuation.keyHint",
    "请在设置中添加浏览器密钥，以使用此标签页继续制作。",
  ],
  // native-review
  ["studio.continuation.consent", "我同意本次继续制作的 OpenAI 请求可能计费。"],

  ["studio.intake.title", "从主题制作"],
  ["studio.intake.topic", "播客主题"],
  ["studio.intake.topicCount", { other: "{count} / {limit}" }],
  ["studio.intake.topicExample", "例如：新加坡的组屋为何能容纳不同族群？"],
  ["studio.intake.hosts", "主持人数"],
  ["studio.intake.autoHosts", "自动安排"],
  ["studio.intake.twoHosts", { other: "恰好两位主持人" }],
  ["studio.intake.location", "制作位置"],
  ["studio.intake.browser", "此浏览器"],
  ["studio.intake.worker", "本机制作进程"],
  // native-review
  [
    "studio.intake.consent",
    "同意本次 OpenAI 研究、写稿、配音和转录请求可能计费。",
  ],
  ["studio.intake.submit", "制作整集播客"],

  ["studio.workflow.title", "制作流程"],
  ["studio.workflow.research", "研究与核对来源"],
  ["studio.workflow.researchHint", "交叉检索，保留主张和出处。"],
  ["studio.workflow.script", "编排大纲与脚本"],
  ["studio.workflow.scriptHint", "按偏好安排语言、主持与时长。"],
  ["studio.workflow.narration", "生成配音与转录"],
  ["studio.workflow.narrationHint", "在资料库试听，对照原稿核验。"],

  ["studio.production.noKey", "请先在此页面设置 OpenAI API 密钥。"],
  // native-review
  [
    "studio.production.noConsent",
    "请先确认本次 OpenAI 使用的预估费用并同意继续。",
  ],
  [
    "studio.production.invalidInput",
    "请输入有效主题并检查语言、主持人数和制作时长上限。",
  ],
  [
    "studio.production.invalidCheckpoint",
    "本地制作记录或音频无效，请检查资料库。",
  ],
  ["studio.production.missingCheckpoint", "资料库中没有此制作记录。"],
  [
    "studio.production.conflict",
    "此节目正在制作或已在另一标签页更新，请重新打开后再试。",
  ],
  // native-review
  [
    "studio.production.saveFailed",
    "无法保存本次制作进度。请检查浏览器存储后手动继续。",
  ],
  ["studio.production.loadFailed", "无法读取本地制作进度，请检查浏览器存储。"],
  ["studio.production.cancelled", "已取消制作。先前保存的进度仍可继续使用。"],
  // native-review
  ["studio.production.unknown", "请求结果未知，可能已计费。请确认后手动重试。"],
  // native-review
  [
    "studio.production.rejected",
    "OpenAI 拒绝了请求，请检查密钥、模型权限或用量后手动重试。",
  ],
  // native-review
  [
    "studio.production.invalidResult",
    "OpenAI 返回的结果未通过检查。可使用先前保存的进度手动重试。",
  ],
  // native-review
  [
    "studio.production.incompleteTake",
    "配音片段未完成，可能已计费。请手动重试此片段。",
  ],
  ["studio.production.audioTooLong", "配音超出时长上限。已保存先前的片段。"],
  // native-review
  [
    "studio.production.keyInContent",
    "内容包含当前 API 密钥，已停止制作。请移除密钥后再试。",
  ],
  // native-review
  ["studio.production.callbackFailed", "无法显示制作预估或进度，已停止制作。"],

  ["studio.narration.cancelled", "已取消。"],
  // native-review
  ["studio.narration.noConsent", "请先确认本次生成的预估费用并同意继续。"],
  ["studio.narration.saveRequired", "请先设置音频保存方式。"],
  [
    "studio.narration.invalidInput",
    "请检查 API key、声音、片段长度（最多 {segmentLimit}）和旁白指令（最多 {instructionsLimit}）。",
  ],
  ["studio.narration.characterLimit", { other: "{displayCount} 字符" }],
  // native-review
  ["studio.narration.keyInContent", "请从脚本和旁白指令中移除 API key。"],
  [
    "studio.narration.tokenLimit",
    "输出 token 上限必须为 1 至 {limit} 的整数。",
  ],
  [
    "studio.narration.unsupported",
    "此浏览器不支持实时音频采集，请尝试最新版 Chrome。",
  ],
  // native-review
  [
    "studio.narration.startupFailed",
    "无法启动浏览器音频采集；没有发起 OpenAI 请求。",
  ],
  // native-review
  ["studio.narration.channelError", "Realtime 连接中断；可能已经产生费用。"],
  // native-review
  [
    "studio.narration.channelClosed",
    "Realtime 连接提前关闭；可能已经产生费用。",
  ],
  // native-review
  ["studio.narration.peerFailed", "Realtime 连接失败；可能已经产生费用。"],
  // native-review
  ["studio.narration.captureFailed", "浏览器音频采集失败；可能已经产生费用。"],
  // native-review
  ["studio.narration.trackEnded", "Realtime 音轨提前结束；可能已经产生费用。"],
  // native-review
  [
    "studio.narration.playbackFailed",
    "浏览器无法启动远端音频；可能已经产生费用。",
  ],
  // native-review
  [
    "studio.narration.remoteCaptureFailed",
    "此浏览器无法采集远端音频；可能已经产生费用。",
  ],
  // native-review
  [
    "studio.narration.malformedEvent",
    "Realtime 响应格式错误；可能已经产生费用。",
  ],
  // native-review
  [
    "studio.narration.providerFailed",
    "OpenAI 请求失败，请检查 key、模型权限和用量。可能已经产生费用。",
  ],
  // native-review
  [
    "studio.narration.sessionTimeout",
    "请求超时；请检查网络和模型权限。可能已经产生费用。",
  ],
  // native-review
  ["studio.narration.redacted", "[已隐藏]"],
  ["studio.narration.saveFailed", "旁白生成或保存失败。"],
  ["studio.narration.offerFailed", "无法建立浏览器音频连接。"],
  // native-review
  [
    "studio.narration.connectionFailed",
    "OpenAI 连接失败；请检查网络和模型权限。可能已经产生费用。",
  ],
  // native-review
  ["studio.narration.connectionTimeout", "连接超时；可能已经产生费用。"],
  ["studio.narration.invalidKey", "API key 无效或已过期。"],
  ["studio.narration.rateLimited", "OpenAI 额度或速率受限；请检查账户。"],
  // native-review
  [
    "studio.narration.invalidAnswer",
    "OpenAI 返回的连接信息无法使用；可能已经产生费用。",
  ],
  // native-review
  ["studio.narration.incomplete", "语音生成未完成；可能已经产生费用。"],
  // native-review
  [
    "studio.narration.unexpectedEvent",
    "音频结束事件顺序异常，无法确认结果；可能已经产生费用。",
  ],
  // native-review
  [
    "studio.narration.noAudio",
    "未收到可听见的音频，请检查连接。可能已经产生费用。",
  ],
  // native-review
  [
    "studio.narration.undrainedAudio",
    "无法确认音频已完整接收；可能已经产生费用。",
  ],
  // native-review
  ["studio.narration.requestFailed", "无法启动音频生成；可能已经产生费用。"],
  // native-review
  ["studio.narration.captureTooLong", "生成音频过长；可能已经产生费用。"],
  // native-review
  ["studio.narration.truncatedAudio", "未收到完整音频；可能已经产生费用。"],

  ["studio.demoAudio.missingScript", "请先输入脚本"],
  ["studio.demoAudio.cancelled", "Cancelled"],
  ["studio.demoAudio.noAudio", "No audio to export"],
  ["studio.demoAudio.tooLarge", "Joined audio too large"],
  ["studio.demoAudio.invalidPause", "Invalid pause duration"],
  ["studio.demoAudio.invalidWave", "Invalid or incompatible WAV audio"],

  ["studio.project.untitled", "未命名项目"],

  ["studio.sample.title", "同一场暴雨，五公里外能差多少？"],
  [
    "studio.sample.introduction",
    "同一场暴雨，五公里外能差多少？有时候，一个街区正下着大雨，附近的另一个街区却还没开始下。",
  ],
  [
    "studio.sample.localRainfall",
    "局地对流可能形成范围有限的强降雨，但并不是所有天气系统都如此。云团的位置、移动方向和持续时间，都会影响不同地点的雨量。",
  ],
  [
    "studio.sample.measurements",
    "雨量通常以毫米表示。一毫米的雨落在一平方米的平面上，体积相当于一升水。这是几何换算，不是一场具体暴雨的测量结果。",
  ],
  [
    "studio.sample.comparison",
    "要回答五公里外究竟能差多少，我们需要找到距离相近的测站，核对同时段的观测，并说明缺测和测站覆盖的限制。这个比较在本示例中尚未进行。",
  ],
  [
    "studio.sample.stationData",
    "下一次下雨时，你可以查看官方测站数据，留意时间范围、地点和单位。局部差异值得观察，但我们不能把假设当成实测。",
  ],
] as const;
