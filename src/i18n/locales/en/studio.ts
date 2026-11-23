export default [
  ["studio.availability.offline", "You’re offline"],
  [
    "studio.availability.offlineHint",
    "Enter your topic now and submit it once you’re online.",
  ],
  ["studio.availability.browserKeyMissing", "Browser API key required"],
  [
    "studio.availability.browserKeyMissingHint",
    "Add a browser API key in Settings, or run the local production worker.",
  ],
  ["studio.availability.workerLocked", "Production worker sign-in required"],
  [
    "studio.availability.workerLockedHint",
    "Add a browser API key in Settings, or sign in to the local production worker.",
  ],
  ["studio.availability.keyMissing", "OpenAI API key required"],
  [
    "studio.availability.keyMissingHint",
    "Add a browser API key in Settings, or configure an API key for the local production worker.",
  ],
  ["studio.availability.workerBusy", "Production worker is busy"],
  [
    "studio.availability.workerBusyHint",
    "You can produce a new episode when the current task ends.",
  ],
  ["studio.availability.workerReady", "Ready to start production"],
  [
    "studio.availability.workerReadyHint",
    "The production worker and OpenAI API key are ready.",
  ],
  ["studio.availability.browserReady", "Ready to produce in your browser"],
  [
    "studio.availability.browserReadyHint",
    "This tab connects directly to OpenAI and saves your progress.",
  ],
  ["studio.availability.openSettings", "Go to Settings"],

  // native-review
  ["studio.cost.wholeEpisode", "Cost estimate (full episode usage)"],
  // native-review
  ["studio.cost.usage", "Cost estimate (based on usage)"],
  // native-review
  [
    "studio.cost.disclosure",
    "{output}, {searches}, and {transcription}. Input and tool calls may also incur costs. Actual costs are based on OpenAI’s bill.",
  ],
  // native-review
  [
    "studio.cost.output",
    { one: "About {count} output token", other: "About {count} output tokens" },
  ],
  // native-review
  [
    "studio.cost.searches",
    { one: "up to {count} web search", other: "up to {count} web searches" },
  ],
  // native-review
  [
    "studio.cost.transcription",
    {
      one: "about {displayCount} second of transcription",
      other: "about {displayCount} seconds of transcription",
    },
  ],

  ["studio.continuation.title", "Continue browser production"],
  // native-review
  [
    "studio.continuation.warning",
    "Production resumes from saved progress. If the previous request has an unknown outcome, continuing manually may incur another charge.",
  ],
  [
    "studio.continuation.offline",
    "You’re offline. Reconnect to continue production.",
  ],
  [
    "studio.continuation.workerUnavailable",
    "No local production worker is connected.",
  ],
  [
    "studio.continuation.workerLocked",
    "Sign-in to the production worker is required.",
  ],
  ["studio.continuation.keyMissing", "An OpenAI API key is required."],
  ["studio.continuation.workerBusy", "The production worker is busy."],
  [
    "studio.continuation.keyHint",
    "Add a browser API key in Settings to continue production in this tab.",
  ],
  // native-review
  [
    "studio.continuation.consent",
    "I consent to continuing production with OpenAI requests that may incur costs.",
  ],

  ["studio.intake.title", "Create from a topic"],
  ["studio.intake.topic", "Podcast topic"],
  ["studio.intake.topicCount", { other: "{count} / {limit}" }],
  [
    "studio.intake.topicExample",
    "For example, how does Singapore’s public housing accommodate different ethnic groups?",
  ],
  ["studio.intake.hosts", "Number of hosts"],
  ["studio.intake.autoHosts", "Choose automatically"],
  ["studio.intake.twoHosts", { other: "Exactly two hosts" }],
  ["studio.intake.location", "Production location"],
  ["studio.intake.browser", "This browser"],
  ["studio.intake.worker", "Local production worker"],
  // native-review
  [
    "studio.intake.consent",
    "I consent to OpenAI requests for research, scriptwriting, narration, and transcription that may incur costs.",
  ],
  ["studio.intake.submit", "Produce full episode"],

  ["studio.workflow.title", "Production workflow"],
  ["studio.workflow.research", "Research and review sources"],
  [
    "studio.workflow.researchHint",
    "Cross-check sources and retain claims with their references.",
  ],
  ["studio.workflow.script", "Outline and write the script"],
  [
    "studio.workflow.scriptHint",
    "Set the language, hosts, and duration according to your preferences.",
  ],
  ["studio.workflow.narration", "Generate narration and transcription"],
  [
    "studio.workflow.narrationHint",
    "Listen in the Library and check the audio against the original script.",
  ],

  ["studio.production.noKey", "Set an OpenAI API key on this page first."],
  // native-review
  [
    "studio.production.noConsent",
    "Review the estimated cost of using OpenAI for this run and give your consent to continue.",
  ],
  [
    "studio.production.invalidInput",
    "Enter a valid topic and check the language, number of hosts, and production duration limit.",
  ],
  [
    "studio.production.invalidCheckpoint",
    "The local production record or audio is invalid. Check the Library.",
  ],
  [
    "studio.production.missingCheckpoint",
    "This production record is missing from the Library.",
  ],
  [
    "studio.production.conflict",
    "This episode is in production or was updated in another tab. Reopen the episode and try again.",
  ],
  // native-review
  [
    "studio.production.saveFailed",
    "Couldn’t save production progress. Check browser storage before continuing manually.",
  ],
  [
    "studio.production.loadFailed",
    "Couldn’t load local production progress. Check browser storage.",
  ],
  [
    "studio.production.cancelled",
    "Production was cancelled. You can continue from previously saved progress.",
  ],
  // native-review
  [
    "studio.production.unknown",
    "The request has an unknown outcome and may have incurred a cost. Check your provider account before retrying manually.",
  ],
  // native-review
  [
    "studio.production.rejected",
    "OpenAI rejected the request. Check your API key, model permissions, or usage before retrying manually.",
  ],
  // native-review
  [
    "studio.production.invalidResult",
    "The OpenAI result failed validation. You can retry manually from previously saved progress.",
  ],
  // native-review
  [
    "studio.production.incompleteTake",
    "The narration segment didn’t finish and may have incurred a cost. Retry this segment manually.",
  ],
  [
    "studio.production.audioTooLong",
    "The narration exceeded the duration limit. Earlier segments were saved.",
  ],
  // native-review
  [
    "studio.production.keyInContent",
    "Production stopped because the content contains the current API key. Remove the key before trying again.",
  ],
  // native-review
  [
    "studio.production.callbackFailed",
    "Production stopped because the estimate or progress couldn’t be displayed.",
  ],

  ["studio.narration.cancelled", "Cancelled."],
  // native-review
  [
    "studio.narration.noConsent",
    "Review the estimated cost for this run and give your consent to continue.",
  ],
  ["studio.narration.saveRequired", "Set up audio saving before continuing."],
  [
    "studio.narration.invalidInput",
    "Check the API key, voice, segment length (up to {segmentLimit}), and narration instructions (up to {instructionsLimit}).",
  ],
  [
    "studio.narration.characterLimit",
    { one: "{displayCount} character", other: "{displayCount} characters" },
  ],
  // native-review
  [
    "studio.narration.keyInContent",
    "Remove the API key from the script and narration instructions.",
  ],
  [
    "studio.narration.tokenLimit",
    "The output token limit must be an integer from 1 to {limit}.",
  ],
  [
    "studio.narration.unsupported",
    "This browser does not support real-time audio capture. Try the latest version of Chrome.",
  ],
  // native-review
  [
    "studio.narration.startupFailed",
    "Browser audio capture couldn’t start. No request was sent to OpenAI.",
  ],
  // native-review
  [
    "studio.narration.channelError",
    "The Realtime connection was interrupted. Costs may have been incurred.",
  ],
  // native-review
  [
    "studio.narration.channelClosed",
    "The Realtime connection closed early. Costs may have been incurred.",
  ],
  // native-review
  [
    "studio.narration.peerFailed",
    "The Realtime connection failed. Costs may have been incurred.",
  ],
  // native-review
  [
    "studio.narration.captureFailed",
    "Browser audio capture failed. Costs may have been incurred.",
  ],
  // native-review
  [
    "studio.narration.trackEnded",
    "The Realtime audio track ended early. Costs may have been incurred.",
  ],
  // native-review
  [
    "studio.narration.playbackFailed",
    "The browser couldn’t start remote audio playback. Costs may have been incurred.",
  ],
  // native-review
  [
    "studio.narration.remoteCaptureFailed",
    "This browser couldn’t capture the remote audio. Costs may have been incurred.",
  ],
  // native-review
  [
    "studio.narration.malformedEvent",
    "The Realtime response was in an invalid format. Costs may have been incurred.",
  ],
  // native-review
  [
    "studio.narration.providerFailed",
    "The OpenAI request failed. Check your API key, model permissions, and usage. Costs may have been incurred.",
  ],
  // native-review
  [
    "studio.narration.sessionTimeout",
    "The request timed out. Check your connection and model permissions. Costs may have been incurred.",
  ],
  // native-review
  ["studio.narration.redacted", "[Redacted]"],
  ["studio.narration.saveFailed", "Couldn’t generate or save narration."],
  [
    "studio.narration.offerFailed",
    "Couldn’t establish the browser audio connection.",
  ],
  // native-review
  [
    "studio.narration.connectionFailed",
    "Couldn’t connect to OpenAI. Check your connection and model permissions. Costs may have been incurred.",
  ],
  // native-review
  [
    "studio.narration.connectionTimeout",
    "The connection timed out. Costs may have been incurred.",
  ],
  ["studio.narration.invalidKey", "The API key is invalid or has expired."],
  [
    "studio.narration.rateLimited",
    "An OpenAI quota or rate limit was reached. Check your account.",
  ],
  // native-review
  [
    "studio.narration.invalidAnswer",
    "The connection details from OpenAI were unusable. Costs may have been incurred.",
  ],
  // native-review
  [
    "studio.narration.incomplete",
    "Narration generation didn’t finish. Costs may have been incurred.",
  ],
  // native-review
  [
    "studio.narration.unexpectedEvent",
    "Audio completion events arrived out of order, so the outcome couldn’t be confirmed. Costs may have been incurred.",
  ],
  // native-review
  [
    "studio.narration.noAudio",
    "No audible audio was received. Check your connection. Costs may have been incurred.",
  ],
  // native-review
  [
    "studio.narration.undrainedAudio",
    "Couldn’t confirm that all the audio was received. Costs may have been incurred.",
  ],
  // native-review
  [
    "studio.narration.requestFailed",
    "Audio generation couldn’t start. Costs may have been incurred.",
  ],
  // native-review
  [
    "studio.narration.captureTooLong",
    "The generated audio was too long. Costs may have been incurred.",
  ],
  // native-review
  [
    "studio.narration.truncatedAudio",
    "The complete audio was not received. Costs may have been incurred.",
  ],

  ["studio.demoAudio.missingScript", "Enter a script first"],
  ["studio.demoAudio.cancelled", "Cancelled"],
  ["studio.demoAudio.noAudio", "No audio to export"],
  ["studio.demoAudio.tooLarge", "Joined audio is too large"],
  ["studio.demoAudio.invalidPause", "Invalid pause duration"],
  ["studio.demoAudio.invalidWave", "Invalid or incompatible WAV audio"],

  ["studio.project.untitled", "Untitled project"],

  [
    "studio.sample.title",
    "How much can rainfall differ five kilometres apart in the same storm?",
  ],
  [
    "studio.sample.introduction",
    "How much can rainfall differ five kilometres apart in the same storm? Sometimes it’s pouring in one neighbourhood while a nearby neighbourhood is still dry.",
  ],
  [
    "studio.sample.localRainfall",
    "Local convection can produce heavy rain over a small area, though weather systems vary. Where clouds form, where they move, and how long they last all affect rainfall from place to place.",
  ],
  [
    "studio.sample.measurements",
    "Rainfall is usually measured in millimetres. One millimetre of rain falling over one square metre equals one litre of water. That’s a geometric conversion. It gives no measurement for a particular storm.",
  ],
  [
    "studio.sample.comparison",
    "To find out how large the difference can be over five kilometres, we’d need stations that far apart, observations from the same period, and an account of missing readings and gaps in station coverage. This example leaves that comparison open.",
  ],
  [
    "studio.sample.stationData",
    "Next time it rains, check official weather station data. Pay attention to the time period, location, and units. Local differences are worth looking for, and it takes observations to establish them.",
  ],
] as const;
