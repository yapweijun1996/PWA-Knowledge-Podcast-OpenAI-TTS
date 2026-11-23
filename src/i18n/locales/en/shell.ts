export default [
  ["shell.nav.library", "Library"],
  ["shell.nav.studio", "Studio"],
  ["shell.nav.automation", "Automation"],
  ["shell.nav.settings", "Settings"],
  ["shell.nav.label", "Podcast workspace navigation"],
  ["shell.status.offline", "Offline"],
  ["shell.status.workerOnline", "Production worker online"],
  ["shell.status.browserLocal", "Local browser mode"],
  ["shell.update.offlineFailed", "Offline features could not be registered."],
  [
    "shell.update.coordinationUnsupported",
    "This browser cannot coordinate the update safely. Close all app pages, then reopen the app.",
  ],
  [
    "shell.update.otherTabsActive",
    "The app is still open in other tabs. Save your work and close those tabs before updating.",
  ],
  [
    "shell.update.approvalFailed",
    "Other pages may still be using the app, or the update did not respond. Close the other pages and try again.",
  ],
  [
    "shell.update.incomplete",
    "The update did not finish. Reopen the app and try again.",
  ],
  [
    "shell.update.coordinationFailed",
    "The update could not be coordinated safely. Close the other pages and try again.",
  ],
  ["shell.update.waiting", "Waiting for the update to finish safely…"],
  ["shell.nav.skip", "Skip to main content"],
  [
    "shell.library.description",
    "Save, play, and edit episodes in this browser.",
  ],
  [
    "shell.automation.description",
    "Automation is available only with the local production worker.",
  ],
] as const;
