export default [
  ["settings.appearance.title", "Appearance"],
  ["settings.appearance.theme", "Theme"],
  ["settings.appearance.system", "System"],
  ["settings.appearance.light", "Light"],
  ["settings.appearance.dark", "Dark"],
  ["settings.appearance.language", "Interface language"],
  ["settings.language.zh-CN", "简体中文"],
  ["settings.language.en", "English"],
  ["settings.language.ms", "Bahasa Melayu"],

  ["settings.browserKey.title", "Browser API key"],
  ["settings.browserKey.label", "OpenAI API key for this browser"],
  // native-review
  [
    "settings.browserKey.risk",
    "I understand that page code, browser extensions, and compromised devices can read the API key. I’ll use a key with restricted permissions. The API key stays in this tab’s memory and is cleared when I leave or reload the page.",
  ],
  ["settings.browserKey.set", "Set browser API key"],
  ["settings.browserKey.clear", "Clear browser API key"],
  [
    "settings.browserKey.configured",
    "The browser API key is set. The first request will verify its permissions.",
  ],
  [
    "settings.browserKey.unconfigured",
    "Set a browser API key to produce episodes directly in your browser.",
  ],
  ["settings.browserKey.saveFailed", "Couldn’t set the browser API key."],
  [
    "settings.browserKey.invalid",
    {
      one: "Enter an API key of at most {count} character with no spaces or other whitespace.",
      other:
        "Enter an API key of at most {count} characters with no spaces or other whitespace.",
    },
  ],
  // native-review
  ["settings.browserKey.redacted", "[REDACTED]"],

  [
    "settings.workerKey.title",
    "Local production worker and API key (optional)",
  ],
  // native-review
  [
    "settings.workerKey.risk",
    "The API key is sent only to the trusted worker connected to this workspace. A key entered here stays in the worker’s memory after you close this page. Enter it again after restarting the worker. Browser backups exclude the API key.",
  ],
  ["settings.workerKey.label", "OpenAI API key"],
  ["settings.workerKey.set", "Set API key"],
  ["settings.workerKey.clear", "Clear session API key"],
  ["settings.workerKey.status", "{keyStatus} {audioStatus}"],
  [
    "settings.workerKey.environment",
    "The API key was loaded from the local environment. The first request will verify its permissions.",
  ],
  [
    "settings.workerKey.configured",
    "The worker received the API key. The first request will verify its permissions.",
  ],
  [
    "settings.workerKey.unconfigured",
    "An OpenAI API key is required for research, narration, and automatic scheduling.",
  ],
  ["settings.workerKey.mp3", "The local worker can encode MP3 audio."],
  [
    "settings.workerKey.wav",
    "The local worker can produce WAV audio. Install FFmpeg with libmp3lame to produce MP3 files.",
  ],
  // native-review
  [
    "settings.workerKey.unavailable",
    "Start the trusted local production worker, then set the API key at the same address.",
  ],

  ["settings.contentLanguage.english", "English"],
  ["settings.contentLanguage.mandarin", "Mandarin"],
  ["settings.contentLanguage.malay", "Malay"],
  ["settings.contentLanguage.singaporeMixed", "Singapore mixed-language"],

  [
    "settings.schedule.signIn",
    "Sign in to the local production worker to set up automation.",
  ],
  [
    "settings.schedule.connect",
    "Connect the local production worker to set up automation. You can also produce episodes manually in Studio with a browser API key.",
  ],
  ["settings.schedule.title", "Production preferences and schedule"],
  ["settings.schedule.interests", "Topic interests and audience"],
  [
    "settings.schedule.interestsExample",
    "For example, explain urban policy to commuters in Singapore using everyday situations",
  ],
  ["settings.schedule.language", "Preferred language"],
  ["settings.schedule.autoLanguage", "Let AI choose based on the topic"],
  ["settings.schedule.maxHosts", "Maximum number of hosts"],
  ["settings.schedule.maxMinutes", "Maximum audio duration (minutes)"],
  ["settings.schedule.cadence", "How often to check for topics"],
  ["settings.schedule.adaptive", "Let AI adjust based on topic value"],
  ["settings.schedule.daily", "Daily"],
  ["settings.schedule.weekly", "Weekly"],
  ["settings.schedule.weeklyLimit", "Maximum topic checks per rolling 7 days"],
  ["settings.schedule.allowedLanguages", "Languages available for episodes"],
  [
    "settings.schedule.enable",
    "Enable unattended topic selection, production, and audio review",
  ],
  // native-review
  [
    "settings.schedule.limits",
    "Keep this device awake and the local worker running. At most one topic check runs per day. Skipped, cancelled, and failed checks count toward the limit. Turning off the schedule stops topic selection. You can cancel episodes already in production individually.",
  ],
  // native-review
  [
    "settings.schedule.consent",
    "I consent to automatic requests to OpenAI within the saved limits. Actual costs are based on OpenAI’s bill.",
  ],
  ["settings.schedule.save", "Save preferences and apply schedule"],
  ["settings.schedule.enabled", "The local schedule is on."],
  ["settings.schedule.disabled", "The local schedule is off."],
  [
    "settings.schedule.usage",
    {
      other:
        "{state} Topic checks used in the past 7 days: {count} of {limit}.",
    },
  ],
  ["settings.schedule.nextCheck", " Next check no earlier than {date}."],
  ["settings.schedule.detail", " {message}"],
  ["settings.schedule.cancel", "Cancel this topic check"],
  ["settings.schedule.runNow", "Find a topic and start production now"],
  [
    "settings.schedule.checkReserved",
    "A topic check has been reserved. Searching for a topic.",
  ],
  [
    "settings.schedule.noNewTopic",
    "This check found no new topic worth producing.",
  ],
  [
    "settings.schedule.productionStarted",
    "A topic was selected and production has started.",
  ],
  // native-review
  [
    "settings.schedule.checkCancelled",
    "Topic selection stopped. Requests already sent may still incur costs.",
  ],
  [
    "settings.schedule.checkFailed",
    "Automatic topic selection stopped. Check your connection and local storage.",
  ],
  [
    "settings.schedule.searchIncomplete",
    "The search for a topic did not finish.",
  ],
  [
    "settings.schedule.invalidTopic",
    "The topic result was in an invalid format.",
  ],
  // native-review
  [
    "settings.schedule.connectionFailed",
    "The connection to OpenAI failed or timed out. This request may have incurred a cost. You can retry it manually.",
  ],
] as const;
