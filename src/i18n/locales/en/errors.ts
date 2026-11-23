export default [
  ["errors.audio.assetNameInvalid", "The audio filename is invalid."],
  ["errors.audio.clipMissing", "This narration clip could not be found."],
  // native-review
  [
    "errors.audio.connectionInterrupted",
    "The Realtime connection was interrupted. Check OpenAI model permissions, quota, and the worker’s network before retrying manually.",
  ],
  [
    "errors.audio.durationExceeded",
    "Narration exceeded the duration limit. Usable segments were saved. Shorten parts of the script before trying again.",
  ],
  [
    "errors.audio.fileTooLarge",
    "The finished audio exceeds 24 MB. Shorten the dialogue.",
  ],
  [
    "errors.audio.formatUnconfirmed",
    "Realtime did not confirm the selected voice or PCM format. Check the model configuration.",
  ],
  ["errors.audio.missing", "This audio could not be found."],
  // native-review
  [
    "errors.audio.nearSilence",
    "The narration segment is nearly silent. Retry manually.",
  ],
  [
    "errors.audio.pcmMissing",
    "The narration segment contains no usable PCM data.",
  ],
  // native-review
  [
    "errors.audio.segmentIncomplete",
    "OpenAI did not finish this narration segment. Try again or shorten the segment.",
  ],
  [
    "errors.audio.segmentTooLong",
    "A narration segment exceeded its duration limit. Shorten this part of the script.",
  ],
  // native-review
  ["errors.audio.timeout", "Narration timed out. Retry manually."],
  [
    "errors.backup.audioMissing",
    "Some audio has yet to be saved in this browser. Sync the episode first.",
  ],
  [
    "errors.backup.invalid",
    "The backup is invalid, is missing audio or exceeds 120 MB.",
  ],
  [
    "errors.backup.recordTooLarge",
    "The episode record is too large to export.",
  ],
  [
    "errors.discovery.busy",
    "Automatic topic selection is in progress. Wait for it to finish or cancel it.",
  ],
  // native-review
  [
    "errors.discovery.cancelled",
    "Topic selection stopped. Requests already sent may still incur costs.",
  ],
  // native-review
  [
    "errors.discovery.consentRequired",
    "Confirm that automatic topic selection and production may incur costs.",
  ],
  [
    "errors.discovery.failed",
    "Automatic topic selection stopped. Check your connection and local storage.",
  ],
  [
    "errors.discovery.resultInvalid",
    "The topic result was in an invalid format.",
  ],
  [
    "errors.discovery.searchIncomplete",
    "The search for a topic did not finish.",
  ],
  // native-review
  [
    "errors.discovery.unavailable",
    "Topic selection is unavailable. Check topic interests, the API key, staging capacity, and the 24-hour and 7-day production limits.",
  ],
  [
    "errors.edit.revisionChanged",
    "The script was updated in another tab. Reopen it and try again.",
  ],
  [
    "errors.edit.scriptLength",
    "The episode script may contain up to {maximum} characters.",
  ],
  [
    "errors.edit.titleAndVoices",
    "Enter a title and choose a different voice for each host.",
  ],
  [
    "errors.edit.turnLength",
    "Each turn must contain between 1 and {maximum} characters.",
  ],
  [
    "errors.episode.alreadyAccepted",
    "This episode has already been handed off. Look for it in the browser library.",
  ],
  ["errors.episode.idUsed", "This project ID is already in use."],
  [
    "errors.episode.limit",
    "There are already {count} episodes. Download and delete episodes you no longer need.",
  ],
  ["errors.episode.missing", "This episode could not be found."],
  ["errors.episode.topicInvalid", "Enter a valid topic and select a language."],
  [
    "errors.job.active",
    "Wait for the job to finish or cancel it before making changes.",
  ],
  [
    "errors.job.audioChanged",
    "The finished audio or production checkpoint has changed. Sync the episode first.",
  ],
  [
    "errors.job.cancelled",
    "The job stopped. You can continue from the stages already saved.",
  ],
  [
    "errors.job.checkpointChanged",
    "The production checkpoint has changed. Sync before trying again.",
  ],
  [
    "errors.job.checkpointResubmit",
    "The production checkpoint has changed. Sync before submitting again.",
  ],
  // native-review
  [
    "errors.job.consentRequired",
    "Confirm that this use of OpenAI may incur costs before continuing.",
  ],
  [
    "errors.job.currentAudioRequired",
    "Finished audio for the current script version is required.",
  ],
  [
    "errors.job.episodeBusy",
    "An episode is already in production. Wait for it to finish or cancel the job.",
  ],
  [
    "errors.job.failed",
    "The job could not finish. Check the worker’s network and storage before trying again.",
  ],
  [
    "errors.job.handoffUnavailable",
    "The episode checkpoint has changed or transcription has yet to finish.",
  ],
  [
    "errors.job.interrupted",
    "The worker was interrupted. You can continue from the stages already saved.",
  ],
  [
    "errors.job.requestAccepted",
    "This production request has already been handed off. Check the browser library.",
  ],
  [
    "errors.job.revisionChanged",
    "The script was updated in another tab. Refresh and try again.",
  ],
  ["errors.job.scriptInvalid", "The local script record is invalid."],
  ["errors.job.scriptNotReady", "The local script is not ready yet."],
  [
    "errors.job.stageUnavailable",
    "This stage is already complete or isn’t ready yet.",
  ],
  [
    "errors.job.stagingFull",
    "The worker’s staging storage is full. Sync your episodes first.",
  ],
  ["errors.job.unknownKind", "Unrecognized production job."],
  [
    "errors.openai.invalidStructuredContent",
    "OpenAI returned invalid structured content.",
  ],
  // native-review
  [
    "errors.openai.keyInvalid",
    "The OpenAI API key is invalid. Update the key on the server and restart it.",
  ],
  [
    "errors.openai.modelAccess",
    "The OpenAI project cannot access this endpoint or model. Check the server model configuration and project permissions.",
  ],
  ["errors.openai.noContent", "OpenAI returned no usable content."],
  // native-review
  [
    "errors.openai.quotaExceeded",
    "The OpenAI project has insufficient quota. Check project billing and budget.",
  ],
  // native-review
  [
    "errors.openai.rateLimited",
    "OpenAI rate-limited the request or the available quota is insufficient. Check your project settings and retry manually later.",
  ],
  [
    "errors.openai.requestRejected",
    "OpenAI rejected the request. Check that the model supports the endpoint used at this stage.",
  ],
  [
    "errors.openai.responseIncomplete",
    "OpenAI did not finish this stage and may have reached its output limit.",
  ],
  ["errors.openai.responseUnreadable", "OpenAI returned an unreadable result."],
  // native-review
  [
    "errors.openai.serverKeyRequired",
    "Set OPENAI_API_KEY on the server first.",
  ],
  // native-review
  [
    "errors.openai.timeout",
    "The connection to OpenAI failed or timed out. This request may have incurred a cost. You can retry it manually.",
  ],
  [
    "errors.openai.topicRefused",
    "OpenAI declined to process this topic. Check the topic content.",
  ],
  // native-review
  [
    "errors.openai.unavailable",
    "OpenAI is temporarily unavailable. Retry manually later.",
  ],
  [
    "errors.outline.hostCount",
    "The outline does not assign exactly two hosts. The research was saved. You can try again.",
  ],
  [
    "errors.preferences.invalid",
    "Check your topic interests, language or production limits.",
  ],
  [
    "errors.production.hostChoice",
    "Choose automatic assignment or exactly two hosts.",
  ],
  [
    "errors.record.audioSize",
    "The audio size does not match the production record. Sync again or check the backup.",
  ],
  [
    "errors.record.invalid",
    "The episode record is invalid or exceeds its limits.",
  ],
  [
    "errors.record.mp3Invalid",
    "The episode’s MP3 file could not be recognized.",
  ],
  [
    "errors.record.wavInvalid",
    "The episode’s WAV file could not be recognized.",
  ],
  [
    "errors.research.citationsMissing",
    "The search returned no citations that could be linked to the claims. Try again or start a new episode with a more specific topic.",
  ],
  [
    "errors.research.crossCheckIncomplete",
    "The independent cross-check did not finish. The initial research was saved. You can try again.",
  ],
  [
    "errors.research.searchIncomplete",
    "OpenAI did not finish the web search. Check that the research model supports web_search.",
  ],
  // native-review
  [
    "errors.schedule.consentRequired",
    "Confirm that OpenAI may charge you before enabling the schedule.",
  ],
  [
    "errors.script.chapterClaimMissing",
    "Script validation failed because at least one turn in chapter {chapter} must cite a claim. Earlier stages were saved. You can try again.",
  ],
  [
    "errors.script.chapterCount",
    "Script validation failed because the script has {count} chapters and the outline requires {expected}. Earlier stages were saved. You can try again.",
  ],
  [
    "errors.script.chapterHostsMissing",
    "Script validation failed because chapter {chapter} has no dialogue from host(s) {hosts}. Earlier stages were saved. You can try again.",
  ],
  [
    "errors.script.chapterInvalid",
    "Script validation failed because chapter {chapter} has an invalid format. Earlier stages were saved. You can try again.",
  ],
  [
    "errors.script.chapterOrder",
    "Script validation failed because the number or order of chapter {chapter} does not match the outline. Earlier stages were saved. You can try again.",
  ],
  [
    "errors.script.chapterTurnLimit",
    "Script validation failed because chapter {chapter} has {count} turns, exceeding the limit of {maximum}. Earlier stages were saved. You can try again.",
  ],
  [
    "errors.script.chaptersRequired",
    "Script validation failed because chapters must be a list. Earlier stages were saved. You can try again.",
  ],
  [
    "errors.script.contentInvalid",
    "The generated content exceeds the length limit or has incomplete citations. Earlier stages were saved. You can try again.",
  ],
  [
    "errors.script.hostsMissing",
    "Script validation failed because the full script has no dialogue from host(s) {hosts}. Earlier stages were saved. You can try again.",
  ],
  [
    "errors.script.lengthLimit",
    "Script validation failed because the full dialogue contains {count} characters, exceeding the limit of {maximum}. Earlier stages were saved. You can try again.",
  ],
  [
    "errors.script.titleEmpty",
    "Script validation failed because the episode title cannot be empty. Earlier stages were saved. You can try again.",
  ],
  [
    "errors.script.titleTextRequired",
    "Script validation failed because the episode title must be text. Earlier stages were saved. You can try again.",
  ],
  [
    "errors.script.titleTooLong",
    "Script validation failed because the episode title contains {count} characters, exceeding the limit of {maximum}. Earlier stages were saved. You can try again.",
  ],
  [
    "errors.script.tooFewSpokenUnits",
    "Script validation failed because the full script has only {count} spoken units and needs at least {minimum}. Earlier stages were saved. You can try again.",
  ],
  [
    "errors.script.turnClaimsInvalid",
    "Script validation failed because turn {turn} in chapter {chapter} cites a claim that the outline did not assign to this chapter. Earlier stages were saved. You can try again.",
  ],
  [
    "errors.script.turnClaimsRequired",
    "Script validation failed because the claim references for turn {turn} in chapter {chapter} must be a list. Earlier stages were saved. You can try again.",
  ],
  [
    "errors.script.turnHostInvalid",
    "Script validation failed because the host for turn {turn} in chapter {chapter} is outside the episode cast. Earlier stages were saved. You can try again.",
  ],
  [
    "errors.script.turnInvalid",
    "Script validation failed because turn {turn} in chapter {chapter} has an invalid format. Earlier stages were saved. You can try again.",
  ],
  [
    "errors.script.turnLimit",
    "Script validation failed because the full script has {count} turns, exceeding the limit of {maximum}. Earlier stages were saved. You can try again.",
  ],
  [
    "errors.script.turnTextEmpty",
    "Script validation failed because turn {turn} in chapter {chapter} cannot be empty. Earlier stages were saved. You can try again.",
  ],
  [
    "errors.script.turnTextRequired",
    "Script validation failed because turn {turn} in chapter {chapter} must contain text. Earlier stages were saved. You can try again.",
  ],
  [
    "errors.script.turnTextTooLong",
    "Script validation failed because turn {turn} in chapter {chapter} contains {count} characters, exceeding the limit of {maximum}. Earlier stages were saved. You can try again.",
  ],
  [
    "errors.script.turnsRequired",
    "Script validation failed because the turns in chapter {chapter} must be a list. Earlier stages were saved. You can try again.",
  ],
  // native-review
  [
    "errors.transcript.consentRequired",
    "Confirm that transcription may incur costs before continuing.",
  ],
  [
    "errors.transcript.invalid",
    "The transcript is empty or exceeds the length limit. Listen to the saved audio or try transcription again.",
  ],
  [
    "errors.worker.backupInvalid",
    "The episode backup or audio failed validation.",
  ],
  ["errors.worker.backupRequired", "An episode backup file is required."],
  ["errors.worker.bodyTooLong", "The request is too large."],
  ["errors.worker.fileMissing", "The file does not exist."],
  [
    "errors.worker.finishedAudioMissing",
    "The finished audio could not be found.",
  ],
  [
    "errors.worker.hostMismatch",
    "The request host does not match the server configuration.",
  ],
  ["errors.worker.jsonInvalid", "Invalid JSON request."],
  ["errors.worker.jsonRequired", "The request must use JSON."],
  // native-review
  [
    "errors.worker.keyBusy",
    "Wait for the current job to finish before changing the API key.",
  ],
  // native-review
  ["errors.worker.keyInvalid", "The API key format is invalid."],
  // native-review
  ["errors.worker.keyRequired", "Set an API key first."],
  ["errors.worker.localMode", "This server is running in local mode."],
  ["errors.worker.localVersionInvalid", "The local version is invalid."],
  [
    "errors.worker.loginRateLimited",
    "Too many sign-in attempts. Try again later.",
  ],
  ["errors.worker.loginRequired", "Sign in to the private workspace first."],
  ["errors.worker.methodUnsupported", "The request method is not supported."],
  [
    "errors.worker.originMismatch",
    "The request origin does not match the workspace.",
  ],
  ["errors.worker.pathInvalid", "The request path is invalid."],
  ["errors.worker.routeMissing", "This endpoint could not be found."],
  [
    "errors.worker.storageFailed",
    "The server didn’t complete the request. Check its storage before trying again.",
  ],
  ["errors.worker.syncBusy", "A job is already in progress. Sync first."],
  [
    "errors.worker.tokenIncorrect",
    "The private workspace passphrase is incorrect.",
  ],
  ["errors.worker.workspaceRequired", "Send the request from this workspace."],
] as const;
