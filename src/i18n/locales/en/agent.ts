export default [
  ["agent.run.replyLanguage", "English"],
  ["agent.run.aborted", "The run was cancelled."],
  ["agent.run.invalidInput", "Check the goal, model and step limit."],
  ["agent.run.stepLimit", "This run has reached its step limit."],
  [
    "agent.run.modelError",
    "OpenAI did not return a usable result for the agent.",
  ],
  ["agent.run.toolError", "The tool did not finish, so the agent stopped."],
  // native-review
  [
    "agent.run.estimate",
    "This usage estimate gives the maximum number of model requests and output tokens for this agent run. Input tokens are counted separately, and paid tools require separate consent.",
  ],
  // native-review
  [
    "agent.failure.consentRequired",
    "Review the cost estimate and give consent before starting this run.",
  ],
  // native-review
  [
    "agent.failure.consentDenied",
    "Consent for the costs of this run was not granted.",
  ],
  // native-review
  [
    "agent.failure.keyInContent",
    "The content contains an API key. Remove it before trying again.",
  ],
  // native-review
  ["agent.failure.noKey", "Set your OpenAI API key on this page first."],
  [
    "agent.failure.providerRejected",
    "OpenAI rejected the request. Check your model access and usage.",
  ],
  // native-review
  [
    "agent.failure.unknownOutcome",
    "The request has an unknown outcome and may have incurred a cost. Review your usage and the progress in the Library.",
  ],
  ["agent.bridge.unknownTool", "This tool could not be found."],
  ["agent.bridge.invalidArguments", "The tool arguments are invalid."],
  ["agent.bridge.aborted", "The operation was cancelled."],
  ["agent.bridge.timeout", "The operation timed out."],
  ["agent.bridge.notFound", "This episode is missing from the Library."],
  [
    "agent.bridge.prerequisiteRequired",
    "Complete the required stages for this episode first.",
  ],
  [
    "agent.bridge.conflict",
    "The episode has changed or is in production. Reload it from the Library.",
  ],
  // native-review
  [
    "agent.bridge.saveFailed",
    "The result could not be saved. Check browser storage and your usage.",
  ],
  [
    "agent.bridge.error",
    "The tool could not finish. Check your progress in the Library.",
  ],
  [
    "agent.bridge.strictSchema",
    "Strict tool schemas must require every property and reject additional properties.",
  ],
  ["agent.bridge.invalidTimeout", "Invalid tool timeout."],
  ["agent.bridge.invalidToolName", "Invalid or duplicate tool name."],
  [
    "agent.tool.listEpisodes",
    "List recently updated episodes in the Library and show their production progress.",
  ],
  [
    "agent.tool.getEpisode",
    "Look up an episode’s production progress in the Library by ID.",
  ],
  [
    "agent.tool.research",
    "Create an episode, research the topic, cross-check the evidence and save the result to the Library.",
  ],
  // native-review
  [
    "agent.estimate.research",
    "This usage estimate gives the maximum output tokens and web searches for research and cross-checking. Input tokens are counted separately.",
  ],
  [
    "agent.tool.writeScript",
    "Write an outline and script for an episode with completed research, and save them to the Library.",
  ],
  // native-review
  [
    "agent.estimate.script",
    "This usage estimate gives the maximum output tokens for the outline and script. Input tokens are counted separately.",
  ],
  [
    "agent.tool.narrate",
    "Generate narration and a transcript from the saved script. Save each audio segment to the Library as soon as it is ready.",
  ],
  // native-review
  [
    "agent.estimate.narration",
    "This usage estimate gives the maximum output tokens for narration and the maximum audio duration for transcription. Input tokens are counted separately.",
  ],
  [
    "agent.tool.renderVideo",
    "Render the current episode’s audio and captions as an MP4 in this browser.",
  ],
  [
    "agent.tool.exportPackage",
    "Save the current MP4, thumbnail and publishing materials as a ZIP for manual upload.",
  ],
] as const;
