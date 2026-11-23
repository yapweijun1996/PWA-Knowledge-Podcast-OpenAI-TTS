export default [
  ["errors.audio.assetNameInvalid", "音频文件名无效。"],
  ["errors.audio.clipMissing", "找不到此配音片段。"],
  // native-review
  [
    "errors.audio.connectionInterrupted",
    "Realtime 连接中断。请检查 OpenAI 模型权限、额度和服务器网络，再手动重试。",
  ],
  [
    "errors.audio.durationExceeded",
    "配音超出时长上限。已保存可用片段，请缩短部分脚本后重试。",
  ],
  ["errors.audio.fileTooLarge", "成品超过 24 MB，请缩短对话。"],
  [
    "errors.audio.formatUnconfirmed",
    "Realtime 没有确认所选声音或 PCM 格式。请检查模型配置。",
  ],
  ["errors.audio.missing", "找不到此音频。"],
  // native-review
  ["errors.audio.nearSilence", "该配音片段接近静音，请手动重试。"],
  ["errors.audio.pcmMissing", "该配音片段没有可用的 PCM 数据。"],
  // native-review
  [
    "errors.audio.segmentIncomplete",
    "OpenAI 未完成此段配音。请重试，或缩短该段。",
  ],
  ["errors.audio.segmentTooLong", "单个配音片段超过时长上限。请缩短这段脚本。"],
  // native-review
  ["errors.audio.timeout", "配音超时，请手动重试。"],
  ["errors.backup.audioMissing", "还有音频未保存到浏览器，请先同步。"],
  ["errors.backup.invalid", "备份无效、音频缺失或超过 120 MB。"],
  ["errors.backup.recordTooLarge", "节目记录太大，无法导出。"],
  ["errors.discovery.busy", "正在自动选题，请等待完成或取消选题。"],
  // native-review
  ["errors.discovery.cancelled", "已停止选题，已提交的请求仍可能计费。"],
  // native-review
  ["errors.discovery.consentRequired", "请确认自动选题及制作可能计费。"],
  ["errors.discovery.failed", "自动选题中断，可检查网络与本机存储。"],
  ["errors.discovery.resultInvalid", "选题结果格式无效。"],
  ["errors.discovery.searchIncomplete", "选题检索未完成。"],
  // native-review
  [
    "errors.discovery.unavailable",
    "无法立即选题。请检查兴趣、密钥、暂存容量和最近 24 小时／7 天的制作额度。",
  ],
  ["errors.edit.revisionChanged", "另一个标签页已更新脚本，请重新打开后再试。"],
  ["errors.edit.scriptLength", "全期脚本最多 {maximum} 个字符。"],
  ["errors.edit.titleAndVoices", "请输入标题，并为各位主持选择不同声音。"],
  ["errors.edit.turnLength", "每段对话须有 1 至 {maximum} 个字符。"],
  ["errors.episode.alreadyAccepted", "这期节目已交接，请在浏览器资料库查看。"],
  ["errors.episode.idUsed", "这个项目编号已使用。"],
  [
    "errors.episode.limit",
    "已有 {count} 期节目。请先下载并删除不再需要的节目。",
  ],
  ["errors.episode.missing", "找不到这期节目。"],
  ["errors.episode.topicInvalid", "请输入有效主题并选择语言。"],
  ["errors.job.active", "请等待任务完成或取消后再修改。"],
  ["errors.job.audioChanged", "成品或制作检查点已变化，请先同步。"],
  ["errors.job.cancelled", "已停止。先前保存的阶段仍可继续使用。"],
  ["errors.job.checkpointChanged", "制作检查点已变化，请同步后再试。"],
  ["errors.job.checkpointResubmit", "制作检查点已变化。请同步后重新提交。"],
  // native-review
  ["errors.job.consentRequired", "请先确认本次 OpenAI 使用可能产生费用。"],
  ["errors.job.currentAudioRequired", "需要当前脚本版本的成品音频。"],
  ["errors.job.episodeBusy", "已有一期正在制作。请等待或取消该任务。"],
  ["errors.job.failed", "任务未能完成。请检查服务器网络与存储后重试。"],
  ["errors.job.handoffUnavailable", "节目检查点已经变化，或尚未转录完成。"],
  ["errors.job.interrupted", "服务器曾中断，已保存的阶段可继续使用。"],
  [
    "errors.job.requestAccepted",
    "这一制作请求已完成交接，请查看浏览器资料库。",
  ],
  ["errors.job.revisionChanged", "另一个标签页已更新脚本。请刷新后再试。"],
  ["errors.job.scriptInvalid", "本地脚本记录无效。"],
  ["errors.job.scriptNotReady", "本地脚本尚未准备好。"],
  ["errors.job.stageUnavailable", "此阶段已完成，或尚未准备好。"],
  ["errors.job.stagingFull", "本机暂存已满。请先同步节目。"],
  ["errors.job.unknownKind", "未知的制作任务。"],
  [
    "errors.openai.invalidStructuredContent",
    "OpenAI 没有返回有效的结构化内容。",
  ],
  // native-review
  ["errors.openai.keyInvalid", "OpenAI 密钥无效。请在服务器更新密钥并重启。"],
  [
    "errors.openai.modelAccess",
    "OpenAI 项目无权使用此接口或模型。请检查服务器的模型配置和项目权限。",
  ],
  ["errors.openai.noContent", "OpenAI 未返回可用内容。"],
  // native-review
  [
    "errors.openai.quotaExceeded",
    "OpenAI 项目额度不足。请检查项目账单和预算。",
  ],
  // native-review
  [
    "errors.openai.rateLimited",
    "OpenAI 已限流或额度不足。请检查项目设置，稍后手动重试。",
  ],
  [
    "errors.openai.requestRejected",
    "OpenAI 拒绝请求。请检查模型与该阶段的接口是否兼容。",
  ],
  [
    "errors.openai.responseIncomplete",
    "OpenAI 未完成此阶段，可能已达到输出上限。",
  ],
  ["errors.openai.responseUnreadable", "OpenAI 返回了无法读取的结果。"],
  // native-review
  ["errors.openai.serverKeyRequired", "请先在服务器配置 OPENAI_API_KEY。"],
  // native-review
  [
    "errors.openai.timeout",
    "连接 OpenAI 失败或超时。此请求可能已计费，可手动重试。",
  ],
  ["errors.openai.topicRefused", "OpenAI 拒绝处理此主题。请检查主题内容。"],
  // native-review
  ["errors.openai.unavailable", "OpenAI 服务暂不可用。请稍后手动重试。"],
  [
    "errors.outline.hostCount",
    "大纲没有安排恰好两位主持人。已保存研究，可以重试。",
  ],
  ["errors.preferences.invalid", "请检查主题兴趣、语言或制作上限。"],
  ["errors.production.hostChoice", "请选择自动安排或恰好两位主持人。"],
  ["errors.record.audioSize", "音频大小不符合制作记录，请重新同步或检查备份。"],
  ["errors.record.invalid", "节目记录格式无效或超过上限。"],
  ["errors.record.mp3Invalid", "无法识别节目 MP3。"],
  ["errors.record.wavInvalid", "无法识别节目 WAV。"],
  [
    "errors.research.citationsMissing",
    "搜索没有返回可与主张关联的引用。可以重试，或用更具体的主题新建一期。",
  ],
  [
    "errors.research.crossCheckIncomplete",
    "独立交叉检索未完成。初步研究已保存，可以重试。",
  ],
  [
    "errors.research.searchIncomplete",
    "OpenAI 未完成网页搜索。请检查研究模型是否支持 web_search。",
  ],
  // native-review
  ["errors.schedule.consentRequired", "开启排程须确认 OpenAI 可能计费。"],
  [
    "errors.script.chapterClaimMissing",
    "脚本校验失败：第 {chapter} 章至少需要一段发言引用主张。已保存先前阶段，可以重试。",
  ],
  [
    "errors.script.chapterCount",
    "脚本校验失败：章节数为 {count}，大纲要求 {expected} 章。已保存先前阶段，可以重试。",
  ],
  [
    "errors.script.chapterHostsMissing",
    "脚本校验失败：第 {chapter} 章缺少主持人 {hosts} 的发言。已保存先前阶段，可以重试。",
  ],
  [
    "errors.script.chapterInvalid",
    "脚本校验失败：第 {chapter} 章格式无效。已保存先前阶段，可以重试。",
  ],
  [
    "errors.script.chapterOrder",
    "脚本校验失败：第 {chapter} 章的章节编号或顺序与大纲不符。已保存先前阶段，可以重试。",
  ],
  [
    "errors.script.chapterTurnLimit",
    "脚本校验失败：第 {chapter} 章有 {count} 段发言，超过上限 {maximum}。已保存先前阶段，可以重试。",
  ],
  [
    "errors.script.chaptersRequired",
    "脚本校验失败：章节必须是列表。已保存先前阶段，可以重试。",
  ],
  [
    "errors.script.contentInvalid",
    "生成内容超出长度限制或引用关系不完整。已保存先前阶段，可以重试。",
  ],
  [
    "errors.script.hostsMissing",
    "脚本校验失败：全稿缺少主持人 {hosts} 的发言。已保存先前阶段，可以重试。",
  ],
  [
    "errors.script.lengthLimit",
    "脚本校验失败：全稿发言长度为 {count}，超过上限 {maximum}。已保存先前阶段，可以重试。",
  ],
  [
    "errors.script.titleEmpty",
    "脚本校验失败：节目标题不能为空。已保存先前阶段，可以重试。",
  ],
  [
    "errors.script.titleTextRequired",
    "脚本校验失败：节目标题必须是文本。已保存先前阶段，可以重试。",
  ],
  [
    "errors.script.titleTooLong",
    "脚本校验失败：节目标题长度为 {count}，超过上限 {maximum}。已保存先前阶段，可以重试。",
  ],
  [
    "errors.script.tooFewSpokenUnits",
    "脚本校验失败：全稿只有 {count} 个口播单位，至少需要 {minimum} 个。已保存先前阶段，可以重试。",
  ],
  [
    "errors.script.turnClaimsInvalid",
    "脚本校验失败：第 {chapter} 章第 {turn} 段引用了本章大纲未分配的主张。已保存先前阶段，可以重试。",
  ],
  [
    "errors.script.turnClaimsRequired",
    "脚本校验失败：第 {chapter} 章第 {turn} 段的主张引用必须是列表。已保存先前阶段，可以重试。",
  ],
  [
    "errors.script.turnHostInvalid",
    "脚本校验失败：第 {chapter} 章第 {turn} 段的主持人不在本集名单内。已保存先前阶段，可以重试。",
  ],
  [
    "errors.script.turnInvalid",
    "脚本校验失败：第 {chapter} 章第 {turn} 段格式无效。已保存先前阶段，可以重试。",
  ],
  [
    "errors.script.turnLimit",
    "脚本校验失败：全稿有 {count} 段发言，超过上限 {maximum}。已保存先前阶段，可以重试。",
  ],
  [
    "errors.script.turnTextEmpty",
    "脚本校验失败：第 {chapter} 章第 {turn} 段发言不能为空。已保存先前阶段，可以重试。",
  ],
  [
    "errors.script.turnTextRequired",
    "脚本校验失败：第 {chapter} 章第 {turn} 段发言必须是文本。已保存先前阶段，可以重试。",
  ],
  [
    "errors.script.turnTextTooLong",
    "脚本校验失败：第 {chapter} 章第 {turn} 段发言长度为 {count}，超过上限 {maximum}。已保存先前阶段，可以重试。",
  ],
  [
    "errors.script.turnsRequired",
    "脚本校验失败：第 {chapter} 章的发言必须是列表。已保存先前阶段，可以重试。",
  ],
  // native-review
  ["errors.transcript.consentRequired", "请先确认转录可能计费。"],
  [
    "errors.transcript.invalid",
    "转录为空或超出长度限制。可试听已有音频，或重试转录。",
  ],
  ["errors.worker.backupInvalid", "节目备份或音频校验失败。"],
  ["errors.worker.backupRequired", "需要节目备份格式。"],
  ["errors.worker.bodyTooLong", "请求内容过长。"],
  ["errors.worker.fileMissing", "文件不存在。"],
  ["errors.worker.finishedAudioMissing", "找不到此成品音频。"],
  ["errors.worker.hostMismatch", "该请求的主机与服务器配置不符。"],
  ["errors.worker.jsonInvalid", "无效的 JSON 请求。"],
  ["errors.worker.jsonRequired", "请求须使用 JSON。"],
  // native-review
  ["errors.worker.keyBusy", "请等待当前任务结束后更换密钥。"],
  // native-review
  ["errors.worker.keyInvalid", "密钥格式无效。"],
  // native-review
  ["errors.worker.keyRequired", "请先配置密钥。"],
  ["errors.worker.localMode", "此服务器使用本机模式。"],
  ["errors.worker.localVersionInvalid", "本地版本无效。"],
  ["errors.worker.loginRateLimited", "登录尝试过多。请稍后再试。"],
  ["errors.worker.loginRequired", "请先登录私有工作空间。"],
  ["errors.worker.methodUnsupported", "请求方法不受支持。"],
  ["errors.worker.originMismatch", "请求来源与工作空间不符。"],
  ["errors.worker.pathInvalid", "路径无效。"],
  ["errors.worker.routeMissing", "找不到此接口。"],
  ["errors.worker.storageFailed", "服务器未完成请求，请检查存储后重试。"],
  ["errors.worker.syncBusy", "已有任务进行中，请先同步。"],
  ["errors.worker.tokenIncorrect", "私有工作空间口令不正确。"],
  ["errors.worker.workspaceRequired", "请从此工作空间发起请求。"],
] as const;
