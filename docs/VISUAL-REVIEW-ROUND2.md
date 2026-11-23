# Visual review, round 2 (2026-11-23)

Same procedure as [round 1](VISUAL-REVIEW-ROUND1.md): an independent read-only Codex pass (`gpt-6.2-sol`, `xhigh`)
saw nine real rendered frames and thumbnails of the merged build and scored them against the spec's section 8.

**Result: 44.5 of 69 assessable points, 64.5 percent (round 1: 57 percent). Still below the 85 percent bar.**
Round-1 defects: opening title and topic graphic FIXED, wordmark language FIXED, 3D dark inset FIXED; caption
phrasing, speaker emphasis, portrait spacing and thumbnail polish PARTLY FIXED; stepped dark patches on the chapter
card STILL PRESENT.

**Automated browser rubric at the same commit: 62 of 62 (100 percent), 49 of 49 browser tests pass.** The
automated gates measure contrast, safe areas, caption rules, opening timing, flash, determinism and thumbnail
bounds. They did not catch the chapter-card banding the reviewer saw, which is why both layers stay.

## Manager decisions for round 3

- Treat the chapter-card staircase as H.264 blocking or banding of a smooth dark gradient: dither all 2D
  backgrounds with the same deterministic pattern used for the 3D backdrop, keep plate edges pixel-aligned,
  raise the video bitrate modestly, and add a decoded-banding metric to the browser rubric.
- Active speaker label ink `#F5F7FC` against idle `#C4CDDE`; markers `.018H`.
- Wrap titles at clause punctuation first; add an adverb rule so a line does not start with 只 也 都 就 才 还 再 又
  after a verb phrase when a balanced break exists.
- Pedestals `#253247` with `#53617D` rims; near spectrum bars capped at `.012H` with `.015H` clearance.
- Thumbnails: default every variant to the export palette, an opaque foreground tower side, a housing-specific
  headline for the headline variant.
- Waveform stays the default scene.

## Reviewer report (verbatim)

**Round 2 scored 44.5 of 69 assessable points (64.5%), up from 57% in Round 1.** The opening now delivers the housing topic, and the portrait stage has more clearance. The most conspicuous remaining defect is the staircase of dark patches on the landscape chapter card in #4. Waveform should remain the default.

## Round 1 defect check

| Round 1 defect | Verdict | Round 2 evidence |
|---|---|---|
| Missing opening title and topic graphic | **FIXED** | #1 shows the title, housing graphic, active-host chip and caption together at 0.4 s. |
| Captions cut phrases or strand `呢？` | **PARTLY FIXED** | #1–4 show cleaner phrase units. #6 keeps `呢？` with the question. #5–6 still break closely related words across lines. |
| Stepped patches on chapter card | **STILL PRESENT** | #4 has a diagonal chain of blocks from the bottom edge to the upper-right field. |
| Dark inset behind the 3D pair | **FIXED** | #3 and #5 show a continuous full-width backdrop behind the hosts. |
| Weak 3D speaker emphasis and dim bases | **PARTLY FIXED** | #3 and #5 give B a brighter rim and A an outline marker. The labels remain equally bright, and the bases still disappear into their shadows. |
| Crowded portrait ring and low chapter heading | **PARTLY FIXED** | #5 clears the chips, and #6 starts the heading at `y≈.25`. The safe column still has a long gap between the main content and caption. |
| English wordmark in Mandarin exports | **FIXED** | #1–9 consistently show `播客工作室`. |
| Thumbnail silhouette separation, detached rule and palette mismatch | **PARTLY FIXED** | #8 now has about 20 px between silhouettes. #9’s rule sits close to the headline. #8–9 still diverge from the video palette, and #9’s claim could describe almost any subject. |

[Round 1 review](/Users/admin/PWA-Knowledge-Podcast-OpenAI-TTS/docs/VISUAL-REVIEW-ROUND1.md)

## A. Visible-evidence score

I used Round 1’s 9-point split for caption legibility and sync. The score credits visible states. Frame-zero timing, card holds, callout behavior and audio response over time remain unverified. [Design spec, §8](/Users/admin/PWA-Knowledge-Podcast-OpenAI-TTS/docs/VISUAL-DESIGN-SPEC.md:225)

| Criterion | Score | Visible evidence |
|---|---:|---|
| Caption legibility and sync (18) | **4.5/9** legibility. Sync **NOT_ASSESSABLE** (9) | #1–6 have readable, stable-looking plates and at most two lines. #5–6 still split phrases. |
| Contrast and host identity (12) | **6/12** | Labels, markers and silhouettes distinguish A and B. In #2, #3 and #5, idle and active label ink look equally bright. B’s speaking state is much clearer in #2 than in the 3D frames. |
| Framing and collision (12) | **12/12** | #1–6 show clear text and HUD margins, with no visible clipping or text collisions. #5–6 respect the portrait right and bottom reserves. |
| Typography and localization (10) | **5/10** | The Mandarin wordmark is consistent and the type is readable. #1 ends its first title line with `是`, separating it from the question that follows. |
| Opening, chapters and callouts (8) | **8/8** | #1 combines title, topic art and caption. #4 and #6 show a distinct chapter heading, updated progress, active chip and caption. No callout is shown. |
| Motion and flash safety (10) | **NOT_ASSESSABLE** | Requires frame sequences. |
| Scene craft and audio response (8) | **4/8** | #2 reads immediately as two speaker states. #3 and #5 have distinct host silhouettes, but dark bases and blocky spectrum bars give the stage a prototype finish. #4 has visible background artifacts. |
| Thumbnail (10) | **5/10** | All three headlines read at 160×90 and 320×180, with clear duration-badge space. #7 identifies housing immediately. #8–9 lose palette continuity with the exports, and #9 loses subject specificity. |
| Repeatability and fallback (7) | **NOT_ASSESSABLE** | Requires repeat renders and fallback tests. |
| Performance (5) | **NOT_ASSESSABLE** | Requires render and export measurements. |

## B. Prioritized defects

Coordinates are fractions measured from the top-left. **P0:** None visible in the supplied stills.

| Priority | Image and region | Defect and viewer impact | Concrete fix |
|---|---|---|---|
| **P1** | **#4** `x=.07–1.00, y=.40–1.00` | Dark rectangular steps cut diagonally across the chapter card and reach the frame edges. The background looks damaged precisely when the viewer is meant to read the new heading. | Render one continuous full-frame gradient. Target a maximum **2/255 per-channel jump** across the former patch boundaries. |
| **P1** | **#2, #3, #5** host chips and stage, `x=.21–.78, y=.24–.56` | In 3D, the brightest rim and a small marker carry most of the speaking cue. At phone size the pair can read as two equally active objects. #2’s rail makes the difference clear. | Use `#F5F7FC` for active labels and `#C4CDDE` for idle labels. Use **`.018H`** markers and a **3–5%** active-orb scale accent within the **6%** cap. |
| **P1** | **#5–6** captions `x=.08–.78, y=.60–.70` | #5 splits `不是只讲理念`. #6 splits `影响买卖`. Both make the reader carry the phrase across the break. | Wrap as `对，而且它 / 不是只讲理念，` and `那它怎么 / 真的影响买卖呢？`. Both fit the **two-line, 11-grapheme-per-line** limit. |
| **P1** | **#3, #5** pedestal and ring area, `x=.11–.81, y=.35–.50` | The near-black bases lose their lower edges, and isolated square bars compete with the pedestal silhouettes. The orbs are recognizable, but the stage still looks provisional. | Use `#253247` pedestal bodies and `#53617D` rims. Cap near bars at **`.012H`** projected height and give the lit pedestal edges **`.015H`** clearance from foreground bars. |
| **P2** | **#5–6** portrait safe column, `x=.08–.78, y=.36–.60` | #5 has about `.10H` between chip and caption. #6 has about `.12H` between title and chip. These interior gaps fragment the composition. The right and bottom space serves the UI reserve. | In #5, extend a feathered stage wash through `y=.35–.52` at **≤.06 alpha**. In #6, move the heading start from **`.25H` to `.27H`** to close the title-to-chip gap. |
| **P2** | **#1** title `x=.09–.47, y=.29–.47` and plate perimeter `x=.13–.87, y=.68–.85` | The title breaks after `是`. The caption plate has a smudged perimeter, most visible along the left and bottom. Both make the opening look less finished. | Wrap `组屋里的混居， / 是怎么被设计出来的`. Composite a solid `#101522` plate with **`.012H`** corner radii and check for edge bleed at **6 native px** outside the plate. |
| **P2** | **#7** tower overlap `x=.74–.77, y=.32–.59`. **#8–9** headline and art field `x=.06–.93, y=.30–.66` | #7’s rear windows show through a foreground sidewall, muddying the overlap. #8’s wide center gap separates headline and art, while #9’s generic claim leaves the housing subject unclear at feed size. Both alternate palettes weaken recognition. | Make #7’s foreground sidewall **fully opaque**. Shift #8’s pair **12 px left** and use Aurora for both alternates. Give #9 a housing-specific headline such as `组屋混居靠设计` at **≥86 px**. |

## C. Default scene

**Waveform.** In #2 the filled B rail and flat A rail identify the speaker immediately with sound muted. Studio 3D has the more distinctive host silhouettes, but #3 and #5 rely on the chips to communicate the turn and still have visibly weak pedestal definition. The opening and chapter cards work as brief editorial scenes, with #1 connecting most directly to thumbnail #7.

## D. Five highest-impact changes

1. Remove the chapter-card staircase in #4.
2. Make the active speaker readable from both the chip and orb in #3 and #5.
3. Rewrap the portrait cues in #5–6 and the opening title in #1.
4. Define the pedestal edges, quiet the foreground spectrum and tighten the portrait staging.
5. Bring #8–9 into the export palette and make #9’s headline specific to housing.