export default [
  [
    "library.api.connectionFailed",
    "Could not connect to the local production worker. Episodes saved in this browser are still available.",
  ],
  [
    "library.api.noWorker",
    "This site is not connected to a production worker. You can still use the browser library and local editor.",
  ],
  ["library.api.requestFailed", "The production request did not complete."],
  ["library.api.workerDetail", "Production worker: {detail}"],

  // native-review
  [
    "library.automation.confirmDiscovery",
    "Run a paid topic search now? If a topic is selected, research, narration and transcription will run automatically.",
  ],
  [
    "library.automation.saved",
    "Preferences and the local schedule have been saved.",
  ],

  ["library.backup.fileLabel", "Episode backup file"],
  ["library.backup.filename", "podcast-{id}.kps"],
  [
    "library.backup.prepared",
    "The episode backup is ready and contains the research, script and saved audio.",
  ],
  ["library.backup.restore", "Restore episode backup"],
  ["library.backup.restored", "The backup has been restored as a local copy."],

  ["library.card.duration", "Duration"],
  ["library.card.openAudio", "Go to audio"],
  ["library.card.openAudioFor", "Go to audio · {title}"],
  ["library.card.stageStatus", "{status} · {stage}"],
  ["library.card.updated", "Updated {date}"],

  [
    "library.delete.concurrentUpdate",
    "This episode has changed. Reopen it and try again.",
  ],

  [
    "library.edit.concurrentUpdate",
    "This episode was updated in another tab. Reopen it and try again.",
  ],
  [
    "library.edit.productionRunning",
    "Production is in progress. Cancel it first.",
  ],
  ["library.edit.saved", "The script has been saved in this browser."],

  [
    "library.empty.changeFilters",
    "Try a different title, topic or language, or clear the filters.",
  ],
  [
    "library.empty.getStarted",
    "Start with a topic or restore an existing episode backup.",
  ],
  ["library.empty.noEpisodes", "There are no episodes in this browser yet."],
  ["library.empty.noMatches", "No matching episodes"],

  [
    "library.error.audioSize",
    "The audio size does not match the production record. Sync again or check the backup.",
  ],
  [
    "library.error.backupInvalid",
    "The backup is invalid, is missing audio or exceeds 120 MB.",
  ],
  [
    "library.error.backupMissingAudio",
    "Some audio has yet to be saved in this browser. Sync the episode first.",
  ],
  [
    "library.error.backupTooLarge",
    "The episode record is too large to export.",
  ],
  [
    "library.error.mp3Invalid",
    "The episode’s MP3 file could not be recognized.",
  ],
  [
    "library.error.preferences",
    "Check your topic interests, language or production limits.",
  ],
  [
    "library.error.recordInvalid",
    "The episode record is invalid or exceeds its limits.",
  ],
  [
    "library.error.scriptChanged",
    "The script was updated in another tab. Reopen it and try again.",
  ],
  [
    "library.error.scriptLength",
    {
      other: "The full episode script can contain up to {maximum} characters.",
    },
  ],
  [
    "library.error.scriptTitleAndVoices",
    "Enter a title and choose a different voice for each host.",
  ],
  [
    "library.error.storageInterrupted",
    "Reading or saving was interrupted. Check browser storage and the local worker before trying again.",
  ],
  [
    "library.error.storageQuota",
    "Browser storage is full. Back up your episodes and free some space. The local worker still has the files this browser hasn’t received.",
  ],
  [
    "library.error.turnLength",
    { other: "Each line of dialogue must contain 1 to {maximum} characters." },
  ],
  ["library.error.unfinished", "The operation didn’t complete. Try again."],
  [
    "library.error.wavInvalid",
    "The episode’s WAV file could not be recognized.",
  ],

  ["library.language.english", "English"],
  ["library.language.malay", "Malay"],
  ["library.language.mandarin", "Mandarin"],
  ["library.language.singaporeMixed", "Singapore mixed"],

  ["library.login.signOut", "Sign out of the production worker"],
  ["library.login.submit", "Sign in"],
  ["library.login.title", "Sign in to the production worker"],
  ["library.login.token", "Workspace passphrase"],

  ["library.page.library", "Podcast Library"],
  ["library.page.studio", "Podcast Studio"],

  ["library.player.label", "Finished audio player"],

  ["library.production.cancel", "Cancel browser production"],
  ["library.production.cancelling", "Cancelling browser production…"],
  [
    "library.production.complete",
    "Browser production is complete. The episode has been saved to the library.",
  ],
  ["library.production.loadingProgress", "Loading local production progress…"],
  ["library.production.progressTitle", "Browser production progress"],
  [
    "library.production.stageProgress",
    { other: "{stage} ({index} of {count})" },
  ],
  [
    "library.production.transcriptionAndReview",
    "Audio transcription and review",
  ],
  [
    "library.production.transcriptionCheckpointChanged",
    "The production checkpoint has changed. Sync the episode before transcribing.",
  ],

  ["library.search.english", "English"],
  ["library.search.malay", "Bahasa Melayu Malay"],
  ["library.search.mandarin", "Chinese Mandarin"],
  ["library.search.singaporeMixed", "Singapore mixed"],

  ["library.selection.backToList", "Back to episode list"],
  ["library.selection.create", "＋ New"],
  [
    "library.selection.discardChanges",
    "Discard unsaved changes to the script?",
  ],
  ["library.selection.loading", "Loading this episode’s local record…"],
  [
    "library.selection.notFound",
    "This episode hasn’t been found in this browser yet. You can restore a backup or wait for the local worker to sync it.",
  ],
  ["library.selection.receiving", "Receiving episode"],
  [
    "library.selection.waiting",
    "Waiting for the local worker to sync the episode.",
  ],

  ["library.stage.audio", "Episode narration"],
  ["library.stage.outline", "Episode outline"],
  ["library.stage.research", "Web research"],
  ["library.stage.script", "Episode script"],
  ["library.stage.transcript", "Audio transcription"],

  ["library.status.cancelled", "Cancelled"],
  ["library.status.checking", "Checking audio"],
  ["library.status.checkpoint", "Last production checkpoint"],
  ["library.status.draft", "Research draft"],
  ["library.status.failed", "Production failed"],
  ["library.status.interrupted", "Interrupted"],
  ["library.status.missing", "Audio unavailable"],
  ["library.status.ready", "Available offline"],
  ["library.status.review", "Ready for listening review"],
  ["library.status.running", "In production"],
  ["library.status.script", "Script saved"],
  ["library.status.stale", "Previous audio version"],

  [
    "library.storage.denied",
    "The browser did not grant persistent storage. Keep a backup of your episodes.",
  ],
  [
    "library.storage.estimate",
    "This site is using about {used} of {quota} MB.",
  ],
  ["library.storage.granted", "The browser has granted persistent storage."],
  [
    "library.storage.info",
    "{usage} Episodes are stored separately for each browser profile and site. Use a backup file to move them between devices.",
  ],
  [
    "library.storage.noEstimate",
    "The browser did not provide a storage estimate.",
  ],
  ["library.storage.request", "Request persistent storage"],
  [
    "library.storage.temporary",
    "Temporary storage may be cleared when space runs low.",
  ],
  ["library.storage.usage", "{space} {persistence}"],

  ["library.sync.failed", "Episode sync did not complete. {detail}"],
  [
    "library.sync.receiving",
    "Receiving episodes from the local worker. Keep the library open.",
  ],
  // native-review
  [
    "library.sync.workerMissing",
    "The production worker no longer has this job. Local progress has been kept. You can edit the episode or continue production manually.",
  ],

  ["library.toolbar.allLanguages", "All languages"],
  ["library.toolbar.allStatuses", "All statuses"],
  ["library.toolbar.byTitle", "By title"],
  ["library.toolbar.create", "New episode"],
  ["library.toolbar.label", "Search the episode library"],
  ["library.toolbar.language", "Language"],
  ["library.toolbar.newest", "Most recently updated"],
  ["library.toolbar.oldest", "Least recently updated"],
  ["library.toolbar.reset", "Reset search and filters"],
  ["library.toolbar.search", "Search episodes"],
  ["library.toolbar.searchPlaceholder", "Title, topic or language"],
  ["library.toolbar.sort", "Sort"],
  ["library.toolbar.status", "Production status"],

  ["library.transfer.incomplete", "The audio transfer was incomplete."],
  [
    "library.transfer.invalid",
    "The local worker returned audio with an invalid format or size.",
  ],
  ["library.transfer.oversized", "The audio exceeded its expected size."],
  ["library.transfer.stalled", "The audio transfer stalled. Sync again."],
  [
    "library.transfer.unavailable",
    "The audio checkpoint changed or could not be downloaded.",
  ],

  ["library.update.now", "Update now"],
  ["library.update.ready", "An update is ready."],

  [
    "library.worker.alreadyAccepted",
    "This episode has already been handed off. Look for it in the browser library.",
  ],
  ["library.worker.assetNameInvalid", "The audio filename is invalid."],
  [
    "library.worker.audioChanged",
    "The finished audio or production checkpoint has changed. Sync the episode first.",
  ],
  ["library.worker.audioMissing", "This audio could not be found."],
  [
    "library.worker.backupInvalid",
    "The episode backup or audio failed validation.",
  ],
  ["library.worker.backupRequired", "An episode backup file is required."],
  ["library.worker.bodyTooLong", "The request is too large."],
  [
    "library.worker.checkpointChanged",
    "The production checkpoint has changed. Sync before trying again.",
  ],
  [
    "library.worker.checkpointResubmit",
    "The production checkpoint has changed. Sync before submitting again.",
  ],
  ["library.worker.clipMissing", "This narration clip could not be found."],
  [
    "library.worker.currentAudioRequired",
    "Finished audio for the current script version is required.",
  ],
  [
    "library.worker.discoveryBusy",
    "Automatic topic selection is in progress. Wait for it to finish or cancel it.",
  ],
  // native-review
  [
    "library.worker.discoveryConsent",
    "Confirm that automatic topic selection and production may incur costs.",
  ],
  // native-review
  [
    "library.worker.discoveryUnavailable",
    "Topic selection couldn’t start. Check your interests, API key, staging capacity and production allowances for the past {dayHours} hours and {weekDays} days.",
  ],
  // native-review
  [
    "library.worker.environmentKeyRequired",
    "Set OPENAI_API_KEY on the server first.",
  ],
  [
    "library.worker.episodeBusy",
    "An episode is already in production. Wait for it to finish or cancel the job.",
  ],
  [
    "library.worker.episodeLimit",
    {
      one: "There is already {count} episode. Download and delete any episodes you no longer need first.",
      other:
        "There are already {count} episodes. Download and delete any episodes you no longer need first.",
    },
  ],
  ["library.worker.episodeMissing", "This episode could not be found."],
  ["library.worker.fileNotFound", "The file does not exist."],
  [
    "library.worker.finishedAudioMissing",
    "The finished audio could not be found.",
  ],
  [
    "library.worker.handoffUnavailable",
    "The episode checkpoint has changed or transcription has yet to finish.",
  ],
  [
    "library.worker.hostChoice",
    "Choose automatic assignment or exactly two hosts.",
  ],
  [
    "library.worker.hostMismatch",
    "The request host does not match the server configuration.",
  ],
  ["library.worker.idUsed", "This project ID is already in use."],
  [
    "library.worker.jobActive",
    "Wait for the job to finish or cancel it before making changes.",
  ],
  ["library.worker.jobUnknown", "Unrecognized production job."],
  ["library.worker.jsonInvalid", "Invalid JSON request."],
  ["library.worker.jsonRequired", "The request must use JSON."],
  // native-review
  [
    "library.worker.keyBusy",
    "Wait for the current job to finish before changing the API key.",
  ],
  // native-review
  ["library.worker.keyInvalid", "The API key format is invalid."],
  // native-review
  ["library.worker.keyRequired", "Set an API key first."],
  ["library.worker.localMode", "This server is running in local mode."],
  ["library.worker.localVersionInvalid", "The local version is invalid."],
  [
    "library.worker.loginRateLimited",
    "Too many sign-in attempts. Try again later.",
  ],
  ["library.worker.loginRequired", "Sign in to the private workspace first."],
  ["library.worker.methodUnsupported", "The request method is not supported."],
  [
    "library.worker.originMismatch",
    "The request origin does not match the workspace.",
  ],
  ["library.worker.pathInvalid", "The request path is invalid."],
  // native-review
  [
    "library.worker.productionConsent",
    "Confirm that this use of OpenAI may incur costs before continuing.",
  ],
  [
    "library.worker.requestAccepted",
    "This production request has already been handed off. Check the browser library.",
  ],
  ["library.worker.routeMissing", "This endpoint could not be found."],
  // native-review
  [
    "library.worker.scheduleConsent",
    "Confirm that OpenAI may charge you before enabling the schedule.",
  ],
  [
    "library.worker.scriptChanged",
    "The script was updated in another tab. Refresh and try again.",
  ],
  ["library.worker.scriptInvalid", "The local script record is invalid."],
  ["library.worker.scriptNotReady", "The local script is not ready yet."],
  [
    "library.worker.stageUnavailable",
    "This stage is already complete or isn’t ready yet.",
  ],
  [
    "library.worker.stagingFull",
    "The worker’s staging storage is full. Sync your episodes first.",
  ],
  // native-review
  [
    "library.worker.storageFailed",
    "The server didn’t complete the request. Check its storage before trying again.",
  ],
  ["library.worker.syncBusy", "A job is already in progress. Sync first."],
  [
    "library.worker.tokenIncorrect",
    "The private workspace passphrase is incorrect.",
  ],
  ["library.worker.topicInvalid", "Enter a valid topic and select a language."],
  // native-review
  [
    "library.worker.transcriptionConsent",
    "Confirm that transcription may incur costs before continuing.",
  ],
  ["library.worker.workspaceRequired", "Send the request from this workspace."],

  [
    "library.workspace.count",
    { one: "{total} episode", other: "{total} episodes" },
  ],
  [
    "library.workspace.filteredCount",
    {
      one: "Matches: {matched} of {total} episode",
      other: "Matches: {matched} of {total} episodes",
    },
  ],
  // native-review
  [
    "library.workspace.footer",
    "You can play, edit, export and restore saved episodes offline. Online production sends the topic, script and audio to OpenAI.",
  ],
  ["library.workspace.label", "Browser episodes"],
  ["library.workspace.list", "Episode list"],
  ["library.workspace.loading", "Loading local episodes…"],
  [
    "library.workspace.unavailable",
    "Local episodes are temporarily unavailable.",
  ],
] as const;
