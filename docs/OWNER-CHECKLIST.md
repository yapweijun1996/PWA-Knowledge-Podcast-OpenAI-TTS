# Owner checklist

At `dd6e2f5` on `main`, all checks and decisions below are **owner-only,
UNVERIFIED**. **VISUAL ACCEPTANCE NOT PASSED.** Record the revision, date,
evidence and result for each item.

- [ ] **Visual acceptance.** From Library, open one episode with final audio
  and render Waveform and Studio 3D in both Landscape and Portrait. Download
  each MP4 and its thumbnail PNG. Play the exports through the opening, a
  speaker handoff and a chapter change. Check the weak speaking-state cue on
  the Studio 3D stage, its prototype appearance, the sparse portrait chapter
  card and faint gradient steps. View thumbnails at full size and at 160×90.
  **Pass when** the automated gates pass and the owner signs off on all four
  videos and thumbnails, including readable text, clear speaker cues and
  captions in sync.
- [ ] **MP4 playback on real devices.** Serve the same downloaded MP4 from a
  private test URL. Open it directly in Safari on a physical iPhone, Chrome
  on a physical Android device and desktop Safari. On each, play with sound,
  pause, seek to the middle and resume through the end. Record the device, OS,
  browser version and codecs from the export receipt. **Pass when** all three
  play picture and audible, synchronized audio and seek and resume cleanly.
- [ ] **Private YouTube upload with Opus.** Download an MP4 whose export receipt
  says Opus. Upload that file unchanged in YouTube Studio with visibility set
  to Private. Wait for processing and play it while signed in as the owner.
  **Pass when** the video stays Private and its audio is audible and in sync
  at the opening, middle and end.
- [ ] **Real TTS listening review.** In Library, play the full saved WAV from a
  real Mandarin TTS run. Follow the script and have a fluent Mandarin listener
  check each proper noun against its intended pronunciation. Record timestamps
  for issues. **Pass when** host voices are consistent and distinct, pacing and
  pauses are natural, and the reviewer confirms every Mandarin proper noun.
- [ ] **Malay and English consent and cost copy.** In Settings, select Malay,
  then repeat in English. Have a native speaker of each language read the
  Studio estimate and consent before a run and the continuation copy for a
  saved episode. Include the warning shown after an unknown paid outcome.
  **Pass when** both reviewers sign off that the copy is natural and accurately
  explains which actions can incur charges, the scope of consent, and that
  checking provider usage comes before retrying an uncertain request.
- [ ] **Real-GPU frame timing.** With browser graphics acceleration enabled,
  verify hardware WebGL2 on the target GPU. The bundled benchmark CLI uses
  SwiftShader. Use `bundleStudio3d` and `measureStudio3d` from
  [the benchmark module](../scripts/studio3d-bench.mjs) in a local Playwright
  session with hardware Chrome and no software-rendering flags. Evaluate the
  measurement on a blank secure page with the bundled scene, `worker: true`
  and frame indices 0–149 at 1920×1080 and 1080×1920. Record the reported
  renderer, warm-up time, median and p95. **Pass when** the renderer is the
  target GPU and each orientation meets the spec's ≤40 ms median and ≤60 ms
  p95 after warm-up, including compositing and readback. [Timing spec](VISUAL-DESIGN-SPEC.md#5-studio-3d-art-direction-and-motion)
- [ ] **Five-minute export memory.** **NOT_RUN.** R1 permits up to
  300 s of final audio and planned video when the modeled PCM and encoded
  budgets fit and the browser reports enough free space or gives no estimate.
  Use a verified 300 s local WAV on the target 8 GB laptop and physical iPhone
  and Android devices. Export Waveform and Studio 3D in both orientations.
  Record codecs, estimated and actual MP4 size, available quota, elapsed time,
  and baseline and peak browser, renderer and GPU memory through decode,
  finalization, save and download. Reopen the saved video and check complete
  playback and seeking. **Pass when** the exports finish, reopen and play
  through without a crash, memory error or tab reload. Record browser and
  device versions, including Safari and iOS standalone where tested.
  [R1 model](LONG-EPISODES.md#r1-five-minute-export)
- [ ] **30–60 minute export memory.** **BLOCKED on this revision.** The Episode
  view caps the audio and planned video at 300 s. OPFS streaming and chapter
  parts are later, owner-gated work.
  Once the supported duration covers the check, open a saved 30-minute episode
  with final audio and render Studio 3D from the Episode view. Repeat at 60
  minutes. Sample browser renderer and GPU process memory once per second from
  idle through saving and record baseline, peak, elapsed time and MP4 size.
  Reopen the episode, play and seek through the saved MP4, and recheck memory
  after returning to Library. **Pass when** both exports save and reopen at
  full duration, playback reaches the end, and memory settles after export
  without a crash, out-of-memory error or tab reload. [Duration guard](../src/video/limits.ts) · [Long-episode plan](LONG-EPISODES.md)
- [ ] **USD cost for one real run.** Use a dedicated OpenAI project with one
  owner-approved run in the measurement window. Before consenting, record the
  Studio usage estimate and convert the covered quantities to USD using the
  applicable model and tool rates. After usage posts, filter the OpenAI usage
  dashboard to that project and window. Compare the billed USD with the derived
  estimate and record the difference, including input or tool charges outside
  the estimate. **Pass when** dashboard charges are attributable to the run and
  the difference is explained by actual usage, charge coverage and rounding.
- [ ] **Malay product name.** Use `Studio Podcast` as the working name. Review
  that name and the current `Studio Podkes` video wordmark with the native
  Malay reviewer. **Pass when** the owner records the approved spelling and
  where it should appear in the UI and exports.
- [ ] **Default scene.** Keep Waveform as the default for this revision. After
  reviewing both scenes and the real-GPU timing results, record the owner's
  default and rationale. **Pass when** the owner signs off on the decision.
  Selecting Studio 3D requires owner visual acceptance and passing real-GPU
  timing in both orientations.
