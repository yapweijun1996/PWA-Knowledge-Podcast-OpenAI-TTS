# Visual review, round 1 (2026-11-23)

Independent review by a separate Codex pass (`gpt-6.2-sol`, `xhigh`, read-only) that saw only ten
real rendered frames and thumbnails from the merged build (landscape and portrait, waveform and
Studio 3D, a chapter card, three thumbnails) and judged them against
[VISUAL-DESIGN-SPEC.md](VISUAL-DESIGN-SPEC.md) section 8. Stills cannot show motion, repeatability or
performance, so 31 of 100 points were not assessable and are excluded.

**Result: 39.5 of 69 assessable points, 57 percent. Below the 85 percent bar. Round 2 follows.**

## Manager decisions on the findings

- The reviewer is right that the opening must show the title and topic graphic over the live first
  caption (spec section 4, title card: "from frame 0", hold 2.0 s landscape and 1.5 s portrait). The first
  implementation removed the title card instead; that is an implementation deviation, not a design change.
- Caption recutting: break after clauses first, never end a line with a function word (的, 地, 得, 了,
  着, 过, 和, 与, 在, 对, 把, 被, 从, 向, 为, 以, 及, 或, 而) and never start one with a sentence-final
  particle (呢, 吗, 吧, 啊, 嘛, 啦) or a closing mark.
- Default scene stays the waveform until Studio 3D passes the same review; 3D remains opt-in.
- The wordmark follows the episode language (`播客工作室` for Mandarin) rather than always English.
- Thumbnails already pass the visible gates; polish only.

## Reviewer report (verbatim)

## A. Visible-evidence score

**39.5 / 69 assessable points · 57%.** I split the combined caption criterion evenly for this review, assigning 9 points to visible legibility and 9 to sync. The score covers the supplied stills. Release-gate verification requires additional evidence. [Visual design spec, §8](/Users/admin/PWA-Knowledge-Podcast-OpenAI-TTS/docs/VISUAL-DESIGN-SPEC.md:223)

| Criterion | Score | Visible evidence |
|---|---:|---|
| Caption legibility and sync | 4.5 / 9; sync **NOT_ASSESSABLE** (9) | Large, readable type on stable plates. #1 and #6 stop mid-thought, and #5/#7 split the question before `呢？`. |
| Contrast and host identity | 6 / 12 | The labels, colors, and shapes distinguish the hosts. In #3 and #6, the chips do more work than the dim 3D objects to show who is speaking. |
| Framing and collision | 6 / 12 | Text appears inside the specified margins. In #6, the front ring crowds the pedestal bases while the upper stage has room to spare. |
| Typography and localization | 5 / 10 | Mandarin chapter titles are clear, especially the balanced wrap in #7. The English video wordmark and Mandarin thumbnail wordmark weaken continuity, and caption wrapping needs phrase-aware breaks. |
| Opening, chapters and callouts | 4 / 8 | #5 and #7 retain the progress HUD, speaker chip, and caption. #1 lacks the title and topic art within the specified opening hold. Callout behavior is unobserved. |
| Motion and flash safety | **NOT_ASSESSABLE** (10) | Requires a frame sequence. |
| Scene craft and audio response | 4 / 8 | #1 and #2 clearly show opposing active rails. #3, #4, and #6 show recognizable host shapes, but the dim bases and chunky ring give the stage a prototype look. Audio response over time is unobserved. |
| Thumbnail | 10 / 10 | The three 1280×720 headlines remain readable in the 160×90 previews, with roughly 11 px of headline ink height and clear duration-badge space. #8 makes the subject easiest to identify. |
| Repeatability and fallback | **NOT_ASSESSABLE** (7) | Requires repeat renders and fallback testing. |
| Performance | **NOT_ASSESSABLE** (5) | Requires render and export measurements. |

## B. Prioritized defects

Regions use frame fractions from the top-left. Pixel values refer to native output unless stated otherwise.

| Priority | Image and region | Defect and viewer impact | Concrete fix |
|---|---|---|---|
| **P0** | **#1**, title and art area `x=.09–.90, y=.20–.56` | At 0.4 s, the opening shows two generic rails. The viewer gets the dialogue hook but misses the title and housing graphic that connect the video to thumbnail #8. | Render the title, housing graphic, and live caption from frame 0. Hold the opening composition for **2.0 s landscape** and **1.5 s portrait**, then reveal the stage. |
| **P1** | **#1, #5, #6, #7**, caption rails `x=.14–.86, y=.69–.84` landscape and `x=.08–.78, y=.60–.70` portrait | #1 splits `新加坡的 / 组屋里`, #5/#7 strand `呢？` on the next line, and #6 stops at `只讲`. Each makes the viewer carry an unfinished phrase into the next line or cue. | Keep `新加坡的组屋里` and `讲理念` together. In #5, fit the full 12-character question on one line. In #7, use `那它怎么真的 / 影响买卖呢？` and start `二手组屋交易里，` at the next cue boundary. Retain **two lines max** and **16/11 CJK graphemes per line** for landscape/portrait. |
| **P1** | **#5**, right background `x=.77–.87, y=.17–.61`. **#3, #4, #6**, behind the pair `x≈.30–.65, y≈.20–.58` | The chapter card has stepped dark patches in otherwise empty space. The 3D stage has a heavy central dark patch that makes it feel inset. Both draw attention away from the content. | Use a continuous full-frame gradient on the card and target **≤2/255** discontinuity across any visible tile edge in the empty field. On the stage, localize shading with per-orb halos at **≤0.12 alpha** and a ground wash at **0.06**. |
| **P1** | **#3, #4, #6**, host pair and chips `x≈.15–.72, y≈.24–.56` | B’s solid double mark in #3/#6 is the clearest speaking cue. The orbs have similar prominence, and the dark bases lose edge definition. At phone size, the stage reads as two props before it reads as a conversation. | Increase marker height to **.018H**, preserve the filled/outline distinction, and give the active orb a **3–5%** scale accent within the 6% cap. Aim for **3:1** contrast between the lit rim and adjacent backdrop, and use the specified `#53617D` rim to define the bases. |
| **P1** | **#6, #7**, portrait safe column `x=.08–.78, y=.15–.60` | The upper safe area is underused. In #6, the foreground bars bunch against the bases. In #7, the chapter title sits low beneath a large blank band. The bottom 30% and right 22% serve the intended UI clearance. | In #6, move orb centers to **`y=.30`**, try **`.118H`** diameters, and cap the foreground bars at **`.022H`** with **`.02H`** clearance above the chips. In #7, start the title group near **`y=.25`**. Keep the caption bottom at **`.70H`**. |
| **P2** | **#1–#7** wordmark `x=.07–.29, y=.08–.14`; **#8–#10** `x=.06–.15, y=.10–.13` | The video opens with “Podcast Studio” while the thumbnails say `播客工作室`. The permitted English fallback weakens recognition across a Mandarin upload package. | Use `播客工作室` consistently at **600 weight**, **`.022H`** in landscape and **`.016H`** in portrait. |
| **P2** | **#9**, pair `x=.62–.91, y=.30–.60`. **#10**, rule and headline `x=.06–.67, y=.21–.54` | #9’s touching silhouettes reduce separation at feed size. #10’s detached rule leaves the claim feeling generic. Both palettes diverge from the supplied video frames if used for this upload. | Give #9’s shapes **16–24 px** of separation. Move #10’s rule to about **`y=.33`** and use a housing-specific claim. Use `aurora` for either variant when paired with these exports. |

## C. Default scene

**Use the waveform as the default stage for this revision, after fixing the opening and captions.** In #1 and #2, the active host is identifiable at a glance with sound muted. The waveform composition is spare, but its two states are immediately clear.

Studio 3D has the stronger visual identity in its smooth single-band and faceted double-band shapes. The heavy central shading, weak speaker emphasis, and crowded portrait ring keep it from feeling like the flagship yet. The chapter card works as a brief transition. #7 shows the value of a short, left-aligned title with the active speaker and caption still visible.

## D. Five highest-impact changes

1. Restore the opening title and housing graphic over the live first caption.
2. Recut Mandarin captions at phrase boundaries and fix the question wraps.
3. Strengthen the 3D speaking state through the chip, rim, and restrained scale change.
4. Remove the stepped background patches and soften the inset effect behind the orbs.
5. Use more of the portrait safe column and give the foreground ring clearance from the bases and chips.