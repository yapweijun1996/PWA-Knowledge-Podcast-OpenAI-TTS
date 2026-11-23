export default [
  [
    "library.api.connectionFailed",
    "无法连接本机制作进程。浏览器节目仍可使用。",
  ],
  [
    "library.api.noWorker",
    "此网址没有连接制作进程。可继续使用浏览器资料库和本地编辑器。",
  ],
  ["library.api.requestFailed", "制作请求未完成。"],
  ["library.api.workerDetail", "{detail}"],

  // native-review
  [
    "library.automation.confirmDiscovery",
    "立即进行一次付费选题检查？选中后会自动研究、配音并转录。",
  ],
  ["library.automation.saved", "偏好和本机排程已保存。"],

  ["library.backup.fileLabel", "节目备份文件"],
  ["library.backup.filename", "podcast-{id}.kps"],
  ["library.backup.prepared", "已准备节目备份，包含研究、脚本和已保存的音频。"],
  ["library.backup.restore", "恢复节目备份"],
  ["library.backup.restored", "备份已恢复为本地副本。"],

  ["library.card.duration", "时长"],
  ["library.card.openAudio", "前往音频"],
  ["library.card.openAudioFor", "前往音频 · {title}"],
  ["library.card.stageStatus", "{status} · {stage}"],
  ["library.card.updated", "更新于 {date}"],

  ["library.delete.concurrentUpdate", "节目已变化，请重新打开后再试。"],

  [
    "library.edit.concurrentUpdate",
    "这期节目已在另一标签页更新，请重新打开后再试。",
  ],
  ["library.edit.productionRunning", "制作进行中，请先取消。"],
  ["library.edit.saved", "脚本已保存到此浏览器。"],

  ["library.empty.changeFilters", "试试其他标题、主题或语言，或清除筛选条件。"],
  ["library.empty.getStarted", "从一个主题开始制作，或恢复已有的节目备份。"],
  ["library.empty.noEpisodes", "此浏览器尚无节目。"],
  ["library.empty.noMatches", "找不到符合条件的节目"],

  ["library.error.audioSize", "音频大小不符合制作记录，请重新同步或检查备份。"],
  ["library.error.backupInvalid", "备份无效、音频缺失或超过 120 MB。"],
  ["library.error.backupMissingAudio", "还有音频未保存到浏览器，请先同步。"],
  ["library.error.backupTooLarge", "节目记录太大，无法导出。"],
  ["library.error.mp3Invalid", "无法识别节目 MP3。"],
  ["library.error.preferences", "请检查主题兴趣、语言或制作上限。"],
  ["library.error.recordInvalid", "节目记录格式无效或超过上限。"],
  ["library.error.scriptChanged", "另一个标签页已更新脚本，请重新打开后再试。"],
  ["library.error.scriptLength", { other: "全期脚本最多 {maximum} 个字符。" }],
  [
    "library.error.scriptTitleAndVoices",
    "请输入标题，并为各位主持选择不同声音。",
  ],
  [
    "library.error.storageInterrupted",
    "读取或保存中断。请检查浏览器存储和本机进程后重试。",
  ],
  [
    "library.error.storageQuota",
    "浏览器存储空间不足。请备份并释放空间；本机进程仍保留未接收的文件。",
  ],
  [
    "library.error.turnLength",
    { other: "每段对话须有 1 至 {maximum} 个字符。" },
  ],
  ["library.error.unfinished", "操作未完成，请重试。"],
  ["library.error.wavInvalid", "无法识别节目 WAV。"],

  ["library.language.english", "English"],
  ["library.language.malay", "Bahasa Melayu"],
  ["library.language.mandarin", "华语 Mandarin"],
  ["library.language.singaporeMixed", "新加坡混合语"],

  ["library.login.signOut", "退出制作进程"],
  ["library.login.submit", "登录"],
  ["library.login.title", "登录制作进程"],
  ["library.login.token", "工作空间口令"],

  ["library.page.library", "播客资料库"],
  ["library.page.studio", "播客制作台"],

  ["library.player.label", "成品音频播放器"],

  ["library.production.cancel", "取消浏览器制作"],
  ["library.production.cancelling", "正在取消浏览器制作…"],
  ["library.production.complete", "浏览器制作完成，节目已保存到资料库。"],
  ["library.production.loadingProgress", "正在读取本地制作进度…"],
  ["library.production.progressTitle", "浏览器制作进度"],
  [
    "library.production.stageProgress",
    { other: "{stage}（{index} / {count}）" },
  ],
  ["library.production.transcriptionAndReview", "音频转录与核对"],
  [
    "library.production.transcriptionCheckpointChanged",
    "制作检查点已变化，请同步后再转录。",
  ],

  ["library.search.english", "英语 英文"],
  ["library.search.malay", "马来语 馬來語 Malay"],
  ["library.search.mandarin", "中文 普通话 汉语 Chinese"],
  ["library.search.singaporeMixed", "新加坡混合語 Singapore mixed"],

  ["library.selection.backToList", "返回节目列表"],
  ["library.selection.create", "＋ 新建"],
  ["library.selection.discardChanges", "放弃尚未保存的脚本修改？"],
  ["library.selection.loading", "正在读取这一期的本地记录…"],
  [
    "library.selection.notFound",
    "尚未在此浏览器找到这一期。可恢复备份，或等待本机同步。",
  ],
  ["library.selection.receiving", "接收节目"],
  ["library.selection.waiting", "等待本机进程同步节目。"],

  ["library.stage.audio", "节目配音"],
  ["library.stage.outline", "节目大纲"],
  ["library.stage.research", "网页研究"],
  ["library.stage.script", "节目脚本"],
  ["library.stage.transcript", "音频转录"],

  ["library.status.cancelled", "已取消"],
  ["library.status.checking", "正在检查音频"],
  ["library.status.checkpoint", "上次制作进度"],
  ["library.status.draft", "研究草稿"],
  ["library.status.failed", "制作失败"],
  ["library.status.interrupted", "已中断"],
  ["library.status.missing", "音频不可用"],
  ["library.status.ready", "可离线播放"],
  ["library.status.review", "待试听核对"],
  ["library.status.running", "制作中"],
  ["library.status.script", "脚本已保存"],
  ["library.status.stale", "上一版音频"],

  ["library.storage.denied", "浏览器未授予持久存储，请保留节目备份。"],
  ["library.storage.estimate", "本来源约用 {used} / {quota} MB。"],
  ["library.storage.granted", "浏览器已授予持久存储。"],
  [
    "library.storage.info",
    "{usage} 节目按浏览器配置和网址隔离。跨设备可通过备份文件转移。",
  ],
  ["library.storage.noEstimate", "浏览器未提供可用空间估算。"],
  ["library.storage.request", "请求持久存储"],
  ["library.storage.temporary", "临时存储可能因空间不足被清理。"],
  ["library.storage.usage", "{space} {persistence}"],

  ["library.sync.failed", "节目同步未完成。{detail}"],
  ["library.sync.receiving", "正在接收本机进程的节目。请保持资料库打开。"],
  // native-review
  [
    "library.sync.workerMissing",
    "制作进程已无此任务，已保留本地进度。可编辑或手动继续制作。",
  ],

  ["library.toolbar.allLanguages", "所有语言"],
  ["library.toolbar.allStatuses", "所有状态"],
  ["library.toolbar.byTitle", "按标题"],
  ["library.toolbar.create", "新建节目"],
  ["library.toolbar.label", "搜索节目资料库"],
  ["library.toolbar.language", "语言"],
  ["library.toolbar.newest", "最近更新"],
  ["library.toolbar.oldest", "最早更新"],
  ["library.toolbar.reset", "重置搜索与筛选"],
  ["library.toolbar.search", "搜索节目"],
  ["library.toolbar.searchPlaceholder", "标题、主题或语言"],
  ["library.toolbar.sort", "排序"],
  ["library.toolbar.status", "制作状态"],

  ["library.transfer.incomplete", "音频接收不完整。"],
  ["library.transfer.invalid", "本机进程返回的音频格式或大小无效。"],
  ["library.transfer.oversized", "音频超过预期大小。"],
  ["library.transfer.stalled", "音频传输停滞，请重新同步。"],
  ["library.transfer.unavailable", "音频检查点已变化或无法下载。"],

  ["library.update.now", "立即更新"],
  ["library.update.ready", "新版已就绪。"],

  ["library.worker.alreadyAccepted", "这期节目已交接，请在浏览器资料库查看。"],
  ["library.worker.assetNameInvalid", "音频文件名无效。"],
  ["library.worker.audioChanged", "成品或制作检查点已变化，请先同步。"],
  ["library.worker.audioMissing", "找不到此音频。"],
  ["library.worker.backupInvalid", "节目备份或音频校验失败。"],
  ["library.worker.backupRequired", "需要节目备份格式。"],
  ["library.worker.bodyTooLong", "请求内容过长。"],
  ["library.worker.checkpointChanged", "制作检查点已变化，请同步后再试。"],
  ["library.worker.checkpointResubmit", "制作检查点已变化。请同步后重新提交。"],
  ["library.worker.clipMissing", "找不到此配音片段。"],
  ["library.worker.currentAudioRequired", "需要当前脚本版本的成品音频。"],
  ["library.worker.discoveryBusy", "正在自动选题，请等待完成或取消选题。"],
  // native-review
  ["library.worker.discoveryConsent", "请确认自动选题及制作可能计费。"],
  // native-review
  [
    "library.worker.discoveryUnavailable",
    "无法立即选题。请检查兴趣、密钥、暂存容量和最近 {dayHours} 小时／{weekDays} 天的制作额度。",
  ],
  // native-review
  [
    "library.worker.environmentKeyRequired",
    "请先在服务器配置 OPENAI_API_KEY。",
  ],
  ["library.worker.episodeBusy", "已有一期正在制作。请等待或取消该任务。"],
  [
    "library.worker.episodeLimit",
    { other: "已有 {count} 期节目。请先下载并删除不再需要的节目。" },
  ],
  ["library.worker.episodeMissing", "找不到这期节目。"],
  ["library.worker.fileNotFound", "文件不存在。"],
  ["library.worker.finishedAudioMissing", "找不到此成品音频。"],
  ["library.worker.handoffUnavailable", "节目检查点已经变化，或尚未转录完成。"],
  ["library.worker.hostChoice", "请选择自动安排或恰好两位主持人。"],
  ["library.worker.hostMismatch", "该请求的主机与服务器配置不符。"],
  ["library.worker.idUsed", "这个项目编号已使用。"],
  ["library.worker.jobActive", "请等待任务完成或取消后再修改。"],
  ["library.worker.jobUnknown", "未知的制作任务。"],
  ["library.worker.jsonInvalid", "无效的 JSON 请求。"],
  ["library.worker.jsonRequired", "请求须使用 JSON。"],
  // native-review
  ["library.worker.keyBusy", "请等待当前任务结束后更换密钥。"],
  // native-review
  ["library.worker.keyInvalid", "密钥格式无效。"],
  // native-review
  ["library.worker.keyRequired", "请先配置密钥。"],
  ["library.worker.localMode", "此服务器使用本机模式。"],
  ["library.worker.localVersionInvalid", "本地版本无效。"],
  ["library.worker.loginRateLimited", "登录尝试过多。请稍后再试。"],
  ["library.worker.loginRequired", "请先登录私有工作空间。"],
  ["library.worker.methodUnsupported", "请求方法不受支持。"],
  ["library.worker.originMismatch", "请求来源与工作空间不符。"],
  ["library.worker.pathInvalid", "路径无效。"],
  // native-review
  [
    "library.worker.productionConsent",
    "请先确认本次 OpenAI 使用可能产生费用。",
  ],
  [
    "library.worker.requestAccepted",
    "这一制作请求已完成交接，请查看浏览器资料库。",
  ],
  ["library.worker.routeMissing", "找不到此接口。"],
  // native-review
  ["library.worker.scheduleConsent", "开启排程须确认 OpenAI 可能计费。"],
  ["library.worker.scriptChanged", "另一个标签页已更新脚本。请刷新后再试。"],
  ["library.worker.scriptInvalid", "本地脚本记录无效。"],
  ["library.worker.scriptNotReady", "本地脚本尚未准备好。"],
  ["library.worker.stageUnavailable", "此阶段已完成，或尚未准备好。"],
  ["library.worker.stagingFull", "本机暂存已满。请先同步节目。"],
  // native-review
  ["library.worker.storageFailed", "服务器未完成请求，请检查存储后重试。"],
  ["library.worker.syncBusy", "已有任务进行中，请先同步。"],
  ["library.worker.tokenIncorrect", "私有工作空间口令不正确。"],
  ["library.worker.topicInvalid", "请输入有效主题并选择语言。"],
  // native-review
  ["library.worker.transcriptionConsent", "请先确认转录可能计费。"],
  ["library.worker.workspaceRequired", "请从此工作空间发起请求。"],

  ["library.workspace.count", { other: "{total} 期节目" }],
  [
    "library.workspace.filteredCount",
    { other: "{matched} 期符合条件，共 {total} 期节目" },
  ],
  // native-review
  [
    "library.workspace.footer",
    "离线可播放、编辑、导出及恢复已保存的节目。联网制作会向 OpenAI 提交主题、脚本和音频。",
  ],
  ["library.workspace.label", "浏览器节目"],
  ["library.workspace.list", "节目列表"],
  ["library.workspace.loading", "正在读取本地节目…"],
  ["library.workspace.unavailable", "暂时无法读取本地节目。"],
] as const;
