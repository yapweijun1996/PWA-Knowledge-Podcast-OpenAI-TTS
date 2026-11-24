# Visual QA: how the video design is checked

Visual acceptance requires passing automated gates and owner sign-off on real
exports. [Visual design spec](VISUAL-DESIGN-SPEC.md)

| Layer | What it proves | What it cannot prove | Run it |
| --- | --- | --- | --- |
| 1. Unit tests | Layout boxes, wrapping rules, caption timing, palettes, envelopes and camera maths are correct as pure functions. | That real pixels, fonts or encoders behave. | `npm test` |
| 2. Browser rubric (`tests/visual-qa.browser.ts`) | Real Chromium renders real MP4s (waveform and Studio 3D, landscape and portrait, Mandarin, English, Malay, mixed text) with the bundled fonts; decoded frames are measured against the spec's section 8 gates and a machine-readable score report is attached. A three-second H.264 clip checks that the reader returns the right encoded index and sees a callout disappear exactly at frame 45. | Taste, motion feel, real GPUs, other browsers. | `npm run e2e:factory -- --no-deps --project=render tests/visual-qa.browser.ts` |
| 3. Independent image-only review | A reviewer scores visible criteria in rendered stills and suggests fixes. | Motion, determinism, performance or visual acceptance. | [Review procedure](#independent-review-procedure) |
| 4. Owner review | The owner judges the actual exported videos in motion and the exported thumbnails. | Hard defects covered by the automated gates still require their own checks. | [Owner checklist](OWNER-CHECKLIST.md) |

## The gates the browser rubric enforces

| Criterion | Gate (hard unless marked) |
| --- | --- |
| Captions | At most two lines; per-line limits from the tokens; no line ends with a CJK function word (的 地 得 了 着 过 和 与 在 对 把 被 从 向 为 以 及 或 而) or starts with 呢 吗 吧 啊 嘛 啦 or a closing mark; no single-character last line; Latin words whole; cues cover the turn text with no lost words; reading rate within the caption-timing ceilings. |
| Contrast | Every checked text element reaches 4.5:1 in the raw frame **and** in the frame decoded from the H.264 MP4. Small text is measured after compression because that is what viewers see. |
| Framing | Element boxes stay inside the spec's safe rectangle for each orientation. The title-safe exterior (.05 .05 .95 .95) is checked for raw foreground crossings and connected decoded edges. |
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
- **Default scene:** waveform. Studio 3D remains opt-in pending owner sign-off.

## Decoding, flash sampling and timing

The visual suite demuxes the actual H.264 MP4 and decodes it once in
presentation order. It checks the track frame count, dimensions, and each
sample's timestamp. The frame-indexed test compares decoded indices with the
native media element, including the callout boundary at frame 45.

The shared QA frame reader requests `prefer-software` when decoding MP4 frames.
Chromium’s hardware H.264 decoder failed on the first frame of valid exports
on the manager’s Mac. [QA frame reader](../tests/fixtures/visual-mp4.ts)

Flash analysis samples a 160×90 landscape grid or a 90×160 portrait grid. It
checks all raw frames and uses every decoded frame within eight source frames
of a chapter, title hold or speaker or PCM transition, as well as the rapid
chapter tail and every full-resolution rubric sample. It samples every second
decoded frame elsewhere. A one-frame decoded flash outside these windows can
fall between samples. The raw pass keeps full-rate coverage.

The framing check scans the full title-safe exterior in the raw and decoded
frames. Beside confirmed coded padding, it rechecks gradients that touch the
final 4:2:0 chroma sample with the same four-pixel stencil shifted inward.
Components confined to the affected edge contribute to a codec-rim metric.
Any connection to an inward edge or a perpendicular gradient at that rim
counts in the framing check. [Framing harness](../tests/fixtures/visual-qa.ts)

The Studio 3D preview regression compares source-frame SHA-256 values from two
actual worker exports. It decodes the resulting MP4s at the same presentation
times and requires at least 40 dB RGB PSNR for every sampled frame. It also checks
native playback. [Studio 3D browser tests](../tests/factory-video-3d.browser.ts)

The rubric keeps a 120 s deadline per video fixture and a 30 s deadline for
each thumbnail or fallback fixture. It records partial results and fails if
a required check or fixture fails. It measures opaque glyph interiors in the
raw and decoded frames against the same 4.5:1 contrast threshold. Parallel
render jobs share a single Playwright worker to avoid starving those fixtures.

## Independent review procedure

1. Render sample frames with the real renderer and fonts:
   `node scripts/visual-review/frames.mjs <output-dir> '<jobs-json>' thumbs`
   (jobs are objects such as `{"name":"land-3d","width":1920,"height":1080,"scene":"studio3d","frames":[0.4,10,17.8]}`;
   sample chapter cards at the first voiced frame, not inside the 0.23 s pause between turns).
2. Give the PNGs to a reviewer that did not build the design (for example a read-only Codex run with the
   images attached, `gpt-6.2-sol` at `xhigh`) together with section 8 of the spec. The reviewer must score
   only what is visible, mark motion, determinism, performance and caption sync NOT_ASSESSABLE, list defects
   with image, region and a concrete fix, and say which scene should be the default.
3. Record the score, revision, fixture set, prompt and reviewer settings. Use
   repeated findings to guide the owner's export review.

## History and status

At `dd6e2f5` on `main`, `npm run e2e:factory` passed **53/53** tests in two
consecutive runs across `factory`, `render` and `perf` on the manager’s Mac
(Chromium 156–158, software WebGL). Automated visual QA passed **62/62**.
Browser execution for this documentation update was **NOT_RUN**.
[Test matrix](TEST-MATRIX.md)

**VISUAL ACCEPTANCE NOT PASSED.** Earlier round reports apply to their own
samples. [Round 2](VISUAL-REVIEW-ROUND2.md) · [Round 3](VISUAL-REVIEW-ROUND3.md)

## Review reliability and acceptance policy

Six independent image-only reviews used the same prompt and the same nine
stills. Scores cover visible criteria. The still-image bar is 85%.

| Review | Score |
| --- | ---: |
| Baseline recorded at `5546126` (2026-11-23) | 76.8% |
| Review 2 | 71.0% |
| Review 3 | 71.7% |
| Historical review recorded at `c22a9fe` (2026-11-24) | 79.0% (54.5/69) |
| Review recorded at `7e76c16` (2026-11-24) | 70.3% |
| Review 6 | 69.6% |

The scores span 9.4 percentage points. Allow for roughly ±8 percentage points
of review noise. Treat image-only reviews as advisory.

Treat the repeated findings as defects to check in real exports. The Studio 3D
stage has a weak speaking-state cue and still looks like a prototype, the
portrait chapter card is sparse, and faint gradient steps are visible.

The owner decides visual acceptance by viewing real MP4 exports of waveform
and Studio 3D in both landscape and portrait, plus the exported thumbnails,
alongside the automated gate results. [Owner checklist](OWNER-CHECKLIST.md)

## Not verified

Real-GPU frame timing, real-device and Safari/iOS checks, memory at 300 s,
listening review of real TTS audio, YouTube acceptance of Opus, USD cost
accuracy, native-speaker review of Malay and English consent and cost copy,
the Malay product name and the default scene choice are **owner-only,
UNVERIFIED**. Motion quality and audio-visual sync against real speech also
await owner review. [Owner checklist](OWNER-CHECKLIST.md) · [Open items](ROADMAP.md#open-items)
