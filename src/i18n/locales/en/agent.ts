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
    "Input tokens are billed separately. Paid tools can start production and show their own estimate before asking for separate consent.",
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
    "The request’s outcome is unknown and may have been billed. Check your OpenAI usage and review saved progress in the Library before starting another run.",
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
  ["agent.panel.title", "Agent"],
  ["agent.panel.offline", "Connect to the internet to run the agent."],
  ["agent.panel.goal", "Goal"],
  ["agent.panel.goalCount", "{count} / {limit} characters"],
  ["agent.panel.goalLength", "Enter a goal of up to 500 characters."],
  ["agent.panel.goalRequired", "Enter a goal to continue."],
  [
    "agent.panel.example.produce",
    "Produce a two-minute episode about city gardens and render its video.",
  ],
  [
    "agent.panel.example.list",
    "List the episodes in my Library and summarize their progress.",
  ],
  ["agent.panel.model", "Model: {model}"],
  ["agent.panel.steps", "Maximum steps: {count}"],
  // native-review
  ["agent.panel.estimate.title", "Estimated usage ceilings"],
  // native-review
  [
    "agent.panel.estimate.requests",
    {
      one: "Up to {count} provider request",
      other: "Up to {count} provider requests",
    },
  ],
  // native-review
  [
    "agent.panel.estimate.tokens",
    { one: "Up to {count} output token", other: "Up to {count} output tokens" },
  ],
  // native-review
  [
    "agent.panel.estimate.searches",
    { one: "Up to {count} web search", other: "Up to {count} web searches" },
  ],
  // native-review
  [
    "agent.panel.estimate.narration",
    {
      one: "Up to {count} narration turn",
      other: "Up to {count} narration turns",
    },
  ],
  // native-review
  [
    "agent.panel.estimate.tokensPerTurn",
    {
      one: "Up to {count} output token per narration turn",
      other: "Up to {count} output tokens per narration turn",
    },
  ],
  // native-review
  [
    "agent.panel.estimate.transcription",
    {
      one: "Up to {count} second of audio for transcription",
      other: "Up to {count} seconds of audio for transcription",
    },
  ],
  // native-review
  [
    "agent.panel.estimate.ceiling",
    "Cost estimates are ceilings, not bills. Usage ceilings do not set a spending cap.",
  ],
  // native-review
  [
    "agent.panel.runConsent",
    "I agree to pay OpenAI for the model requests in this run.",
  ],
  ["agent.panel.start", "Start agent run"],
  ["agent.panel.cancel", "Cancel run"],
  ["agent.panel.cancelling", "Stopping…"],
  ["agent.panel.result", "Run result"],
  // native-review
  ["agent.panel.dialog.title", "Approve paid tool: {tool}"],
  ["agent.panel.dialog.topic", "Topic"],
  ["agent.panel.dialog.episode", "Episode ID"],
  // native-review
  ["agent.panel.dialog.deny", "Deny"],
  // native-review
  ["agent.panel.dialog.approve", "Approve this call"],
  ["agent.panel.tool.run", "Agent run"],
  ["agent.panel.tool.list", "List episodes"],
  ["agent.panel.tool.get", "Get episode"],
  ["agent.panel.tool.research", "Research topic"],
  ["agent.panel.tool.script", "Write script"],
  ["agent.panel.tool.narration", "Narrate episode"],
  ["agent.panel.tool.video", "Render video"],
  ["agent.panel.tool.export", "Export publish package"],
  ["agent.panel.tool.unknown", "Unknown tool"],
  ["agent.panel.toolSucceeded", "Completed."],
  // native-review
  ["agent.panel.toolDenied", "Consent denied."],
  // native-review
  [
    "agent.panel.stoppedAfterDenial",
    "The agent stopped after you denied the paid tool.",
  ],
  ["agent.panel.log.title", "Agent activity"],
  ["agent.panel.log.time", "+{seconds} s"],
  ["agent.panel.log.step", "Model step {step} of {maximum}"],
  ["agent.panel.log.toolCall", "Tool called: {tool}"],
  ["agent.panel.log.toolResult", "Tool result for {tool}: {status}"],
  // native-review
  ["agent.panel.log.consentAsked", "Consent requested for {tool}."],
  // native-review
  ["agent.panel.log.consentGranted", "Consent granted for {tool}."],
  // native-review
  ["agent.panel.log.consentDenied", "Consent denied for {tool}."],
  ["agent.panel.log.error", "Run ended: {status}"],
  ["agent.panel.savedSummary", "Saved on this device: {items}."],
  [
    "agent.panel.savedNone",
    "This run saved no new episodes or production results.",
  ],
  ["agent.panel.saved.episode", "episode record"],
  ["agent.panel.saved.researchDraft", "initial research"],
  ["agent.panel.saved.research", "cross-checked research"],
  ["agent.panel.saved.outline", "outline"],
  ["agent.panel.saved.script", "script"],
  ["agent.panel.saved.narration", "narration segments"],
  ["agent.panel.saved.audio", "episode audio"],
  ["agent.panel.saved.transcript", "transcript"],
  ["agent.panel.saved.video", "MP4 video"],
  ["agent.panel.saved.publish", "publish ZIP"],
  [
    "agent.tool.draftStoryboard",
    "Draft a reviewable video storyboard for an episode with a saved script. The user applies the draft in its Video panel.",
  ],
  [
    "agent.estimate.storyboard",
    "Up to one model request. The saved episode script is sent to OpenAI. Input tokens are billed separately.",
  ],
  ["agent.panel.tool.storyboard", "Draft storyboard"],
  ["agent.panel.saved.storyboard", "Storyboard draft saved"],
] as const;
