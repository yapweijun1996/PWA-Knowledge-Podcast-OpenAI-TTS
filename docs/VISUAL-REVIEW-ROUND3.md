# Visual review, round 3 (2026-11-23)

Third independent pass (same procedure as rounds [1](VISUAL-REVIEW-ROUND1.md) and [2](VISUAL-REVIEW-ROUND2.md)).

**Result: 49.5 of 69 assessable points, 71.7 percent (round 1: 57, round 2: 64.5). Below the 85 percent bar.**

## Manager analysis

- Fixed since round 2: pedestal edges and foreground bars, the opening title break, contrast and host identity
  (12 of 12), typography and localisation (10 of 10), opening and chapter structure (8 of 8).
- The thumbnail items about palette and headline (#8 and #9) came from the manager's sampling script, which passed
  explicit sunset and ocean palettes and a custom headline; the product defaults are the export palette
  (aurora) and the housing headline. The script was corrected for round 4. The real thumbnail defects are the
  tower overlap and the wide gap between headline and art.
- Real remaining defects: portrait caption break after 影响; faint patches and a short strip at the bottom
  edge of the landscape chapter card (likely H.264 edge macroblocks: 1080 is not a multiple of 16); the speaking
  orb still reads weakly; caption plate fringe; portrait spacing.
- Round 4 targets: caption adverb rule, bottom-edge and plate-fringe gates with decoded measurements, a crisp
  ground ring and 4 percent orb accent, tower occlusion, art placement following the headline ink.

## Reviewer report (verbatim)

# Round 3 visual review

**49.5 / 69 assessable points · 71.7%**, up from 64.5% in Round 2. The opening title wraps cleanly, the host chips are easier to distinguish, and the 3D pedestals have visible edges. The biggest remaining defects are the portrait caption break, residual chapter-card artifacts, and a 3D speaking cue that takes longer to read than the waveform. [Round 2 review](/Users/admin/PWA-Knowledge-Podcast-OpenAI-TTS/docs/VISUAL-REVIEW-ROUND2.md:64) · [Design spec, §8](/Users/admin/PWA-Knowledge-Podcast-OpenAI-TTS/docs/VISUAL-DESIGN-SPEC.md:228)

## Round 2 defect check

| Round 2 defect | Verdict | Round 3 evidence |
|---|---|---|
| Landscape chapter-card staircase | **PARTLY FIXED** | **#4** The large diagonal staircase has receded. Faint rectangular patches remain around the speaker chip, and a short violet strip touches the bottom edge. |
| Active and idle speaker emphasis | **PARTLY FIXED** | **#2–3** The idle A label is visibly dimmer and its marker is outlined. B’s waveform reads immediately in #2. In #3 the two orbs still carry similar visual weight, and B’s soft ground ring gives a weaker cue. |
| Portrait caption phrasing | **STILL PRESENT** | **#5–6** Both split `影响 / 买卖`. Both are Chapter 2 cards, so the previous portrait Studio 3D dialogue cue is outside this round’s evidence. |
| Dim pedestal edges and chunky foreground bars | **FIXED** | **#3** Both rims and lower silhouettes are visible, and the foreground bars clear the bases. The portrait samples show cards. |
| Portrait spacing | **PARTLY FIXED** | **#5–6** The chapter heading starts around `.27H`. Roughly `.10H` still separates its lower edge from the speaker chip inside the safe column. |
| Opening title breaks after `是` | **FIXED** | **#1** The first line ends at the clause comma and the second carries the full question phrase. |
| Opening caption plate has a smudged perimeter | **STILL PRESENT** | **#1** A faint irregular fringe shows along the left and lower plate edges. |
| Rear window shows through the foreground tower | **STILL PRESENT** | **#7** A pale window segment remains visible across the teal roof at the overlap. |
| Host-pair thumbnail has an excessive center gap | **STILL PRESENT** | **#8** About 23% of the frame width separates the headline ink from the nearest orb. |
| Alternate thumbnails diverge from the video palette | **STILL PRESENT** | **#8–9** The rose and gold treatment in #8 and the ice-blue treatment in #9 still differ from the Aurora export. |
| Headline thumbnail lacks a housing hook | **STILL PRESENT** | **#9** `不是偶然，是设计` reads clearly, but the standalone image gives no housing context. |

## A. Visible-evidence score

The caption split follows the prior rounds. The 85% release threshold is a reference here. The full rubric also requires native-frame, timing, and runtime evidence. [Design spec, §8](/Users/admin/PWA-Knowledge-Podcast-OpenAI-TTS/docs/VISUAL-DESIGN-SPEC.md:228)

| Rubric criterion | Score | Visible evidence |
|---|---:|---|
| Caption legibility and sync (18) | **4.5 / 9** legibility. Sync **NOT_ASSESSABLE** (9) | **#1–6** show high-contrast captions in consistent positions and use at most two lines. **#5–6** split a closely linked verb and object. |
| Contrast and host identity (12) | **12 / 12** | **#2–3** distinguish A and B through readable labels, different marker shapes, and brighter active label ink. **#3** also distinguishes the orb silhouettes. |
| Framing and collision (12) | **6 / 12** | Text clears the visible margins. **#4** retains an edge artifact, and **#5–6** leave a substantial gap within the portrait safe column. |
| Typography and localization (10) | **10 / 10** | **#1** wraps the opening at the clause boundary. **#4–6** have clear chapter hierarchy, and the Mandarin wordmark is consistent across **#1–9**. |
| Opening, chapters and callouts (8) | **8 / 8** | **#1** shows the housing title, art, speaker, and caption together. **#4–6** retain the caption and speaker while showing Chapter 2. Timing and callout behavior are unobserved. |
| Motion and flash safety (10) | **NOT_ASSESSABLE** | Requires frame sequences. |
| Scene craft and audio response (8) | **4 / 8** | **#2** makes the speaking state clear in one glance. **#3** has distinct silhouettes and defined bases, but the diffuse ground cue and similar orb prominence leave the stage feeling provisional. Response over time is unobserved. |
| Thumbnail (10) | **5 / 10** | All three headlines read at **160×90** and **320×180**, with room for a duration badge. **#7** has the clearest housing hook. **#8–9** lose palette continuity, and **#9** loses subject specificity. |
| Repeatability and fallback (7) | **NOT_ASSESSABLE** | Requires repeated renders and fallback tests. |
| Performance (5) | **NOT_ASSESSABLE** | Requires render and export measurements. |

## B. Prioritized defects

Coordinates are frame fractions from the top left. **P0 findings visible in the stills: none.** **#3** reads as a continuous full-frame backdrop. The clearest background artifacts are localized in **#4**.

| Priority | Image and region | Defect and viewer impact | Concrete fix |
|---|---|---|---|
| **P1** | **#5–6** `x=.08–.78, y=.58–.68` | The break after `影响` makes the viewer carry the verb into the next line on a short cue. | Wrap as `那它怎么` / `真的影响买卖呢？`. The lines are **4 and 8 graphemes**, within the **11-per-line** limit. |
| **P1** | **#4** `x≈.46–.65, y≈.52–.67` and `x=.075–.108, y=.993–1.00` | Faint rectangular patches around the chip and a violet strip at the bottom make the chapter card look uneven. | Composite one full-frame gradient and eliminate the edge strip. Check the full-resolution decoded card against the spec’s **≤3/255** adjacent **8×8** luma-step limit. |
| **P1** | **#3** `x=.28–.74, y=.24–.52` | The pair reads as two equally prominent display objects until the viewer checks the chips. The active ground ring is soft enough to resemble a shadow. | Give the active orb a **4%** size accent within the **6%** cap. Use one ground-ring stroke around **`.003H`** with **`.18`** peak opacity and a defined inner edge. |
| **P1** | **#8–9** full background and headline area `x=.06–.93, y=.30–.63` | The alternate palettes weaken recognition across the upload package. #9’s claim is legible at feed size but could belong to any topic. | Use the export’s **Aurora** stops and accents for both. Set #9 to `组屋混居靠设计` at **96–98 px**, with the accent rule about **24 px** above the ink. |
| **P2** | **#5–6** `x=.08–.78, y=.27–.58` | The title, chip, and caption feel detached within the safe column. The right and bottom space serves the Shorts UI reserve. | Start the chapter block at **`.28H`**, set the headline at **`.041H`**, and center the chip at **`.495H`**. This targets a title-to-chip gap near **`.07H`**. |
| **P2** | **#1** `x=.14–.86, y=.69–.84` | A faint left and bottom fringe makes the caption plate look less crisp than the chapter-card plates. | Render a solid **`#101522`** fill with **`.012H`** corner radii on the even-pixel grid. Inspect the first **6 native pixels** outside the decoded edge for bleed. |
| **P2** | **#7** `x≈.73–.76, y≈.35–.38` | A pale rear-window fragment crosses the teal roof. The overlap looks translucent in the full-size thumbnail. | Draw rear windows first and fully occlude them with the foreground roof and side faces at **alpha 1.00**. |
| **P2** | **#8** `x=.36–.60, y=.34–.61` | The roughly **300 px** center gap makes the headline and orbs feel like separate template slots. | Use `组屋邻里` / `怎样共享空间` at about **98 px**. The six-character second line brings the headline to within roughly **100–120 px** of the artwork. |

## C. Default scene

**Keep Waveform as the default dialogue scene.** In **#2**, the flat A rail and filled B bars communicate the speaker immediately with sound muted. The composition is spare, and the caption remains the strongest element.

**Studio 3D** has the more distinctive host silhouettes in **#3**. Its pedestal edges now read, but the speaking orb needs a clearer emphasis before the scene earns flagship placement. **Editorial cards** serve the opening and chapter transitions. **#1** connects the episode to the housing thumbnail, while **#4–6** establish a chapter change without displacing the caption.

## D. Five highest-impact changes

1. Rewrap the portrait caption at `那它怎么 / 真的影响买卖呢？`.
2. Remove the landscape chapter-card patches and edge strip. Tighten the portrait card within its safe column.
3. Make the 3D speaking state readable from the orb and ground ring at phone size.
4. Match both alternate thumbnails to Aurora and give #9 a housing-specific headline.
5. Clean the hard edges in the opening plate and the topic thumbnail’s tower overlap.