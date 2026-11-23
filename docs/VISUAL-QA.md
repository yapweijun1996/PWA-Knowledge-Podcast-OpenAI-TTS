# Visual QA: how the video design is checked

The visual design ([VISUAL-DESIGN-SPEC.md](VISUAL-DESIGN-SPEC.md)) is accepted only through evidence.
Three layers, each catching different failures. A layer passing never substitutes for another.

| Layer | What it proves | What it cannot prove | Run it |
| --- | --- | --- | --- |
| 1. Unit tests | Layout boxes, wrapping rules, caption timing, palettes, envelopes and camera maths are correct as pure functions. | That real pixels, fonts or encoders behave. | `npm test` |
| 2. Browser rubric (`tests/visual-qa.browser.ts`) | Real Chromium renders real MP4s (waveform and Studio 3D, landscape and portrait, Mandarin, English, Malay, mixed text) with the bundled fonts; decoded frames are measured against the spec's section 8 gates and a machine-readable score report is attached. A three-second H.264 clip checks that the reader returns the right encoded index and sees a callout disappear exactly at frame 45. | Taste, motion feel, real GPUs, other browsers. | `npm run e2e:factory -- --no-deps --project=render tests/visual-qa.browser.ts` |
| 3. Independent visual review | A reviewer who did not build the design looks at real rendered frames and scores them against the rubric. | Anything not visible in stills: motion, determinism, performance. | See below. |

## The gates the browser rubric enforces

| Criterion | Gate (hard unless marked) |
| --- | --- |
| Captions | At most two lines; per-line limits from the tokens; no line ends with a CJK function word (的 地 得 了 着 过 和 与 在 对 把 被 从 向 为 以 及 或 而) or starts with 呢 吗 吧 啊 嘛 啦 or a closing mark; no single-character last line; Latin words whole; cues cover the turn text with no lost words; reading rate within the caption-timing ceilings. |
| Contrast | Every checked text element reaches 4.5:1 in the raw frame **and** in the frame decoded from the H.264 MP4. Small text is measured after compression because that is what viewers see. |
| Framing | Element boxes inside the spec's safe rectangle for each orientation, no decoded ink outside the title-safe rectangle (.05 .05 .95 .95), no adjacent 8×8 background luma step above 3/255 on decoded card scan lines, and raw-to-decoded deltas at or below 3/255 in the bottom four rows and outside plate edges. |
| Typography | Bundled faces loaded, no missing glyphs after NFC normalisation, wordmark in the episode language. |
| Opening and chapters | Caption and title ink at frame 0; title hold 2.0 s landscape and 1.5 s portrait; chapter cards on the first voiced frame; correct `n / total` progress. |
| Flash safety | General-flash and red-flash counts over the area rule must be at most 3 per rolling second. The cell-level count is a diagnostic reported as a warning with its value (soft limit 10 per second). |
| Determinism | SHA-256 of frames 0, 15, 30, 60, 120 and event boundaries identical across fresh runs and shuffled draw order, for each scene and orientation. |
| Thumbnails | 1280x720, under 2 MB, headline inside its box, 4.5:1 contrast, duration-badge area clear, 160x90 ink height at least 8 px for CJK. |

Decisions that shaped the gates (2026-11-23):

- **Flash:** the hard gate follows WCAG 2.3.1, which counts only flashes covering a quarter of a 10-degree
  field. The waveform's small bars change at syllable rate (cell count 6 per second) while the field count
  is 0; counting cells as failures would forbid every audio-reactive visual. The cell count stays visible.
- **Wordmark:** it follows the episode language (`播客工作室`, `Podcast Studio`, `Studio Podkes`). The first
  implementation always rendered English; the browser rubric found it.
- **Small text:** primary ink, weight 800 and larger sizes, because secondary ink measured 6.78:1 raw but 3.82:1
  after H.264.
- **Text normalisation:** all visible text is normalised to NFC before measuring, drawing and the font
  check, so decomposed accents do not report missing glyphs.
- **Default scene:** waveform until Studio 3D passes the same review.

## Decoding, flash sampling and timing

The reader attaches a visible, paused, muted video and seeks to
`(i + 0.5) / fps` for each sampled frame. After `seeked`, it checks the
requested time against `currentTime` within 1 ms and draws the frame. The reader
self-test checks 10 decoded indices, including adjacent seeks in both
directions and the two sides of the callout end boundary.

The banding gate reuses decoded full-resolution title-hold and chapter-card
samples in all four scene and orientation combinations. It scans neighboring
8×8 blocks horizontally through the empty middle strip (`.57H` landscape,
`.55H` portrait) and vertically through the empty right strip (`.96W`).
The block means use Rec. 709 luma in 8-bit code values so the test can detect
steps on dark gradients. Averaging 64 pixels reduces dither and isolated
pixel noise. A step above 3/255 on either scan fails framing. The fixture
report records both maxima and their block coordinates for each checked frame.
The gate adds no seeks.

The framing check also examines every decoded sample, including those used for
flash analysis. The bottom four native rows must be within 3/255 in each RGB
channel of the encoder input. The first six native pixels outside every drawn
caption plate, callout plate and speaker chip must be within 3/255 Rec. 709
code-value luma of the same pixel in the raw frame. This includes background
pixels along the rounded corners. The report gives each region's maximum,
coordinate and pixel count. It also checks even coordinates and sizes and
clearance between the caption plate and each chip. The checks reuse the
existing seeks.

Run the targeted chapter-card experiment with
`npm run e2e:factory -- --no-deps --project=render tests/visual-qa.browser.ts -g "compares the raw and decoded"`.
It reuses the original Mandarin review episode and PCM and attaches the
1920×1080 encoder input, decoded frame 534 and eightfold RGB difference.
The JSON attachment compares both reported regions with the encoder input and
the untouched Aurora gradient, excluding the drawn plate bounds. A deviation
present only after decode narrows the cause to the encode/decode path.
Compare the native and downscaled captures if the original review image
shows a deviation absent from both native frames.

The flash pass samples a 160×90 landscape grid or a 90×160 portrait grid. It
checks all raw frames and seeks all decoded frames within eight source frames
of a chapter, title hold or speaker and PCM level transition, throughout the
rapid chapter tail, and at every full-resolution rubric sample. It seeks every
second frame elsewhere. The rolling window spans 30 source frames. At 15
samples per second a sustained three-flash-per-second pattern has about five
samples per cycle. Four regularly spaced flashes per second can also be
detected when each bright and dark excursion lasts at least two source frames.
Isolated one-frame decoded flashes outside the dense windows can fall between
samples. The raw pass retains full-rate coverage throughout.

Media loads and seeks have 5 s watchdogs. Each reference episode has a 120 s
budget shared across its evaluation steps, with a 40 s runtime target.
Thumbnails and each fallback example have 30 s budgets. The rubric attaches
individual fixture scores and timing even if a fixture is blocked, then fails
the test if any required evidence is missing or a gate failed. It prints render,
decode, fresh-draw and overall times with the seek count and mean and maximum
seek cost for each reference episode that completes decoding.

## Independent review procedure

1. Render sample frames with the real renderer and fonts:
   `node scripts/visual-review/frames.mjs <output-dir> '<jobs-json>' thumbs` uses product thumbnail defaults. Use `thumbs-explicit` to check the alternate palettes and headlines.
   (jobs are objects such as `{"name":"land-3d","width":1920,"height":1080,"scene":"studio3d","frames":[0.4,10,17.8]}`;
   sample chapter cards at the first voiced frame, not inside the 0.23 s pause between turns).
2. Give the PNGs to a reviewer that did not build the design (for example a read-only Codex run with the
   images attached, `gpt-6.2-sol` at `xhigh`) together with section 8 of the spec. The reviewer must score
   only what is visible, mark motion, determinism, performance and caption sync NOT_ASSESSABLE, list defects
   with image, region and a concrete fix, and say which scene should be the default.
3. Pass: at least 85 percent of the assessable points and every hard gate. Record the report in this
   folder (round 1 is [VISUAL-REVIEW-ROUND1.md](VISUAL-REVIEW-ROUND1.md)).

## History and status

| Date | Event | Result |
| --- | --- | --- |
| 2026-11-23 | Round 1 independent review of the first implementation | **57 percent** of 69 assessable points: the opening title hold was missing, captions broke at unnatural places, 3D showed banding and weak speaker emphasis, portrait left the lower half empty, the wordmark did not match the thumbnails. |
| 2026-11-23 | Browser rubric first run | 47 percent. Real findings: wordmark not localised in the render path, small text below 4.5:1 after H.264, flash semantics, a too-fast caption fixture. |
| 2026-11-23 | After fixes, second browser rubric run | 35 percent, dominated by harness frame misalignment (decoded ratio exactly 1.00) and one real finding (decomposed accents reported as missing glyphs). Harness and NFC fixes were in progress when this was written. |
| 2026-11-23 | Manager's merged Chromium run after the presentation-callback rewrite | 47 browser tests passed. The visual rubric reported 0 of 62 after its fixture evaluations hit the 360 s test timeout. |
| 2026-11-23 | Frame-centre seek reader and isolated fixture watchdogs | Chromium `NOT_RUN` in the G3 worktree. The new scores and 40 s runtime target await a browser run. |

| 2026-11-23 | After the reader rewrite (G3): browser rubric and round 2 independent review | Browser rubric **62 of 62**, 49 of 49 browser tests. Independent review **64.5 percent** ([round 2](VISUAL-REVIEW-ROUND2.md)): the reviewer saw chapter-card banding that no automated gate measures. |

**Status: the visual design has not passed its acceptance bar (the independent review is below 85 percent).** Update this table with each run; do
not mark the design accepted until the rubric and an independent review both pass.

## Not verified

Real GPUs and other drivers (pixel hashes may differ), Safari and phones, motion quality judged by eye,
long episodes, audio-visual sync against real speech, YouTube's own caption and chapter handling, and any
claim about retention or click-through.
