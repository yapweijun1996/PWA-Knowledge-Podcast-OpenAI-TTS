export default [
  ["settings.appearance.title", "应用外观"],
  ["settings.appearance.theme", "外观"],
  ["settings.appearance.system", "跟随系统"],
  ["settings.appearance.light", "浅色"],
  ["settings.appearance.dark", "深色"],
  ["settings.appearance.language", "界面语言"],
  ["settings.language.zh-CN", "简体中文"],
  ["settings.language.en", "English"],
  ["settings.language.ms", "Bahasa Melayu"],

  ["settings.browserKey.title", "浏览器密钥"],
  ["settings.browserKey.label", "浏览器 OpenAI 密钥"],
  // native-review
  [
    "settings.browserKey.risk",
    "我了解页面代码、浏览器扩展和遭入侵的设备都可能读取密钥。我会使用权限受限的密钥。密钥仅保存在此标签页内存中，离开或重新加载页面时清除。",
  ],
  ["settings.browserKey.set", "设置浏览器密钥"],
  ["settings.browserKey.clear", "清除浏览器密钥"],
  ["settings.browserKey.configured", "已设置浏览器密钥。首次请求将验证权限。"],
  [
    "settings.browserKey.unconfigured",
    "尚未设置浏览器密钥。设置后即可直接在浏览器制作。",
  ],
  ["settings.browserKey.saveFailed", "无法设置浏览器密钥。"],
  [
    "settings.browserKey.invalid",
    { other: "请输入不含空白且最多 {count} 个字符的 API 密钥。" },
  ],
  // native-review
  ["settings.browserKey.redacted", "[REDACTED]"],

  ["settings.workerKey.title", "本机制作进程与密钥（可选）"],
  // native-review
  [
    "settings.workerKey.risk",
    "密钥只交给此工作台连接的受信任进程。通过界面输入的密钥驻留在进程内存，关闭网页不影响它，重启进程后需重新输入。浏览器备份不包含密钥。",
  ],
  ["settings.workerKey.label", "OpenAI API 密钥"],
  ["settings.workerKey.set", "设置密钥"],
  ["settings.workerKey.clear", "清除会话密钥"],
  ["settings.workerKey.status", "{keyStatus} {audioStatus}"],
  [
    "settings.workerKey.environment",
    "已从本机环境载入密钥。首次请求将验证权限。",
  ],
  ["settings.workerKey.configured", "已接收密钥。首次请求将验证权限。"],
  [
    "settings.workerKey.unconfigured",
    "尚无密钥。研究、配音和自动排程需要一个 OpenAI API 密钥。",
  ],
  ["settings.workerKey.mp3", "本机可编码 MP3。"],
  [
    "settings.workerKey.wav",
    "本机提供 WAV，安装带 libmp3lame 的 FFmpeg 可生成 MP3。",
  ],
  // native-review
  [
    "settings.workerKey.unavailable",
    "启动受信任的本机制作进程后，可在同一网址设置密钥。",
  ],

  ["settings.contentLanguage.english", "English"],
  ["settings.contentLanguage.mandarin", "华语 Mandarin"],
  ["settings.contentLanguage.malay", "Bahasa Melayu"],
  ["settings.contentLanguage.singaporeMixed", "新加坡混合语"],

  ["settings.schedule.signIn", "请先登录本机制作进程，再设置自动化。"],
  [
    "settings.schedule.connect",
    "请连接本机制作进程后再设置自动化。可在制作台直接用浏览器密钥手动制作。",
  ],
  ["settings.schedule.title", "制作偏好与排程"],
  ["settings.schedule.interests", "选题兴趣与听众"],
  [
    "settings.schedule.interestsExample",
    "例如：面向新加坡通勤者，用生活场景解释城市政策",
  ],
  ["settings.schedule.language", "语言首选"],
  ["settings.schedule.autoLanguage", "AI 按主题选择"],
  ["settings.schedule.maxHosts", "主持人数上限"],
  ["settings.schedule.maxMinutes", "音频时长上限（分钟）"],
  ["settings.schedule.cadence", "选题检查频率"],
  ["settings.schedule.adaptive", "AI 按选题价值调整"],
  ["settings.schedule.daily", "每日"],
  ["settings.schedule.weekly", "每周"],
  ["settings.schedule.weeklyLimit", "滚动 7 天最多选题检查"],
  ["settings.schedule.allowedLanguages", "节目可用语言"],
  ["settings.schedule.enable", "启用无人值守选题、制作和音频核对"],
  // native-review
  [
    "settings.schedule.limits",
    "需要设备保持唤醒、本机进程保持运行。每日最多一次选题检查，跳过、取消或失败也占额度。停用排程会停止选题，已进入制作的节目可单独取消。",
  ],
  // native-review
  [
    "settings.schedule.consent",
    "同意按保存的上限向 OpenAI 发出自动请求，费用以平台账单为准。",
  ],
  ["settings.schedule.save", "保存偏好并应用排程"],
  ["settings.schedule.enabled", "本机排程已开启。"],
  ["settings.schedule.disabled", "本机排程已停用。"],
  [
    "settings.schedule.usage",
    { other: "{state} 已用 {count} / {limit} 次（滚动 7 天）。" },
  ],
  ["settings.schedule.nextCheck", " 下次最早检查：{date}。"],
  ["settings.schedule.detail", "{message}"],
  ["settings.schedule.cancel", "取消本轮选题"],
  ["settings.schedule.runNow", "立即自动选题并制作"],
  ["settings.schedule.checkReserved", "已保留选题额度，正在检索。"],
  ["settings.schedule.noNewTopic", "这轮没有发现值得制作的新主题。"],
  ["settings.schedule.productionStarted", "已选题并开始制作。"],
  // native-review
  ["settings.schedule.checkCancelled", "已停止选题，已提交的请求仍可能计费。"],
  ["settings.schedule.checkFailed", "自动选题中断，可检查网络与本机存储。"],
  ["settings.schedule.searchIncomplete", "选题检索未完成。"],
  ["settings.schedule.invalidTopic", "选题结果格式无效。"],
  // native-review
  [
    "settings.schedule.connectionFailed",
    "连接 OpenAI 失败或超时。此请求可能已计费，可手动重试。",
  ],
] as const;
