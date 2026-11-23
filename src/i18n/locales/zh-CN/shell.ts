export default [
  ["shell.nav.library", "资料库"],
  ["shell.nav.studio", "制作台"],
  ["shell.nav.automation", "自动化"],
  ["shell.nav.settings", "设置"],
  ["shell.nav.label", "播客工作区导航"],
  ["shell.status.offline", "离线"],
  ["shell.status.workerOnline", "制作进程在线"],
  ["shell.status.browserLocal", "浏览器本地模式"],
  ["shell.update.offlineFailed", "离线功能注册失败。"],
  [
    "shell.update.coordinationUnsupported",
    "此浏览器无法安全协调更新。请关闭所有应用页面，再重新打开。 ",
  ],
  [
    "shell.update.otherTabsActive",
    "其他标签页仍在使用应用。请保存并关闭其他页面后再更新。",
  ],
  [
    "shell.update.approvalFailed",
    "其他页面可能仍在使用应用，或更新未响应。请关闭其他页面后重试。",
  ],
  ["shell.update.incomplete", "更新未完成，请重新打开应用后重试。"],
  [
    "shell.update.coordinationFailed",
    "无法安全协调更新，请关闭其他页面后重试。",
  ],
  ["shell.update.waiting", "正在等待安全更新完成…"],
  ["shell.nav.skip", "跳到主要内容"],
  ["shell.library.description", "在此浏览器保存、播放与编辑节目。"],
  ["shell.automation.description", "自动化仅限本机制作进程。"],
] as const;
