# Visual design spec for AI-made podcast videos (2026-11-23)

> Produced by a Codex research pass with live web search and reviewed by the manager. Source claims are the
> researcher's, with the access dates inside. Numbers marked UNVERIFIED are not measured. Implementation:
> tokens in `src/video/design/`, fonts in `public/fonts/` ([FONTS.md](FONTS.md)), rubric in section 8.

**Use a two-host editorial studio with a stable caption rail.** Make `aurora` the default palette, with `drift`, `calm`, and `intensity: 0.55`. Use `studio3d` as the flagship dark scene once it passes the release gates. Use the matching Canvas 2D waveform for the light theme and when WebGL is unavailable. Start the spoken hook on frame 0 in both formats. Let the title, chapter changes, and callouts follow the editorial structure of the episode.

## 1. Design principles and evidence

- **Give the listener a clear place to look.** The active host, current caption, and occasional chapter or callout form the visual hierarchy. Keep captions in one place and change them by phrase. Use the waveform and 3D stage to show who is speaking and how the conversation moves.
- **Make every episode recognizable and every thumbnail specific.** Retain the two host symbols, typography, and palette across the package. Use a code-drawn topic graphic when the subject lends itself to one. For the housing episode, draw a cluster of housing blocks with varied window patterns.
- **Make the opening deliver what the thumbnail promises.** Put the first spoken line and its caption on frame 0. Keep the first chapter title out of the opening sequence. YouTube recommends delivering on the thumbnail and title in the initial seconds. Its retention report measures the first 30 seconds and identifies dips, which can reflect skips or exits. [YouTube recommendation guidance](https://support.google.com/youtube/answer/16559650?hl=en) and [retention reporting](https://support.google.com/youtube/answer/9314415?hl=en), accessed 2026-11-23.

| Pattern | Evidence and product decision |
|---|---|
| **Static art and restrained audiograms** | YouTube supports static show-art videos through RSS. Pew’s audit of 451 top-ranked US podcasts found 20% used static or mostly static video and documented *SmartLess* using logo art and a simple soundwave. Signal Hill reports that *The Daily* ranked among the top ten favorites in its study despite using static show art at the time. These are platform support and descriptive evidence. Use the waveform as a polished full-episode format, with distinct host states and a visible silence state. [YouTube RSS guidance](https://support.google.com/youtube/answer/13525207?hl=en), [Pew audit](https://www.pewresearch.org/journalism/wp-content/uploads/sites/8/2023/06/PJ_2023.06.15_Podcasts-Audit_FINAL.pdf), and [Signal Hill research](https://signalhillinsights.com/youtube-and-video-will-grow-podcasting-in-2024/), accessed 2026-11-23. |
| **Animated characters** | StoryCorps’ *Listening Is an Act of Love* is a published example of animation built around recorded conversations. The characters act out the stories. This is a production example with no transferable retention estimate. Use abstract host objects and give each a recognizable silhouette. [StoryCorps on YouTube](https://www.youtube.com/watch?v=8rgJRzz_zHo), accessed 2026-11-23. |
| **Kinetic captions** | Headliner documents captions for audiograms. A CHI study documents how TikTok creators use captions for both access and expression. An eye-tracking study tested subtitle reading at 12, 16, and 20 characters per second with English, Polish, and Spanish viewers. These studies address practice and reading. Use stable phrase captions in both formats and put emphasis in occasional callouts. [Headliner](https://learn.headliner.app/hc/en-us/articles/360003924753-How-to-Create-a-Manual-Audiogram), [CHI captioning study](https://doi.org/10.1145/3613904.3642177), and [PLOS ONE subtitle study](https://pmc.ncbi.nlm.nih.gov/articles/PMC6007935/), accessed 2026-11-23. |
| **Chapter cards and topic graphics** | YouTube chapters give viewers labeled navigation. Google’s NotebookLM Video Overviews illustrate another audio-led production pattern, pairing narration with diagrams, quotes, and other visuals. Use brief chapter overlays and reserve topic graphics for moments when they add context. [YouTube video chapters](https://support.google.com/youtube/answer/9884579?hl=en) and [Google Video Overviews](https://blog.google/innovation-and-ai/models-and-research/google-labs/notebooklm-video-overviews-studio-upgrades/), accessed 2026-11-23. |
| **Minimal 3D** | The local spike shows the concept is feasible on one software WebGL configuration. A retention benefit remains **UNVERIFIED**. Use 3D for a distinctive, readable stage. Treat the waveform as the comparison format in owner-run retention reviews. [Repository animation decision](/Users/admin/PWA-Knowledge-Podcast-OpenAI-TTS/docs/ANIMATION-DECISION.md:25) |

**Editorial judgment.** A nearly flat equalizer in a large empty panel, two title screens before the first word, unrelated camera motion, and captions that bounce through every syllable can make an export feel templated. Which pattern costs retention for this audience remains unverified. Use timestamped dips around openings and chapter changes to investigate once episodes have enough data. [YouTube retention reporting](https://support.google.com/youtube/answer/9314415?hl=en), accessed 2026-11-23.

## 2. Tokens and composition

Coordinates use `[left, top, right, bottom]` from the top-left of the frame. Horizontal positions are fractions of width and vertical positions are fractions of height. Font sizes, padding, radii, and strokes are fractions of frame height `H`. Boxes include the visible ink, plate, and any motion excursion. Display-text line limits are maxima, followed by measured width and legal line breaking. The 30 fps export clock governs all animation.

```js
{
  landscape: {
    frame: [1920, 1080],
    safe: [.07, .08, .93, .85],
    grid: { columns: 12, gutterH: .020 },
    wordmarkTopLeft: [.07, .080],
    progressTopRight: [.93, .080], progressWidthW: .16,
    titleBox: [.09, .21, .59, .56],
    titleGraphicBox: [.65, .20, .90, .55],
    chapterBox: [.09, .235, .85, .49],
    stageBox: [.13, .18, .87, .57],
    hostTagCenters: [[.34, .54], [.66, .54]],
    cardHostTagCenter: [.50, .615],
    hostTagMaxWidthW: .22,
    calloutBox: [.09, .59, .53, .675],
    captionCenterX: .50, captionBottom: .84, captionMaxWidthW: .72,
    waveCenters: [[.34, .385], [.66, .385]],
    waveWidthW: .24, waveBarsPerHost: 36, waveMaxHalfHeightH: .058,
    orbCenters: [[.34, .345], [.66, .345]], orbDiameterH: .195,
    typeH: { title: .082, chapter: .059, caption: .050,
             host: .028, callout: .030, progress: .024, wordmark: .028 },
    // max lines, CJK graphemes per line, Latin graphemes per line
    text: { title: [2,10,24], chapter: [2,16,36], caption: [2,16,42],
            host: [1,10,22], callout: [2,18,32], wordmark: [1,10,22] }
  },
  portrait: {
    frame: [1080, 1920],
    safe: [.08, .12, .78, .72],
    grid: { columns: 6, gutterH: .0125 },
    wordmarkTopLeft: [.08, .120],
    progressTopRight: [.78, .120], progressWidthW: .18,
    titleBox: [.08, .215, .78, .425],
    titleGraphicBox: [.60, .455, .76, .50],
    chapterBox: [.08, .225, .78, .445],
    stageBox: [.09, .195, .77, .51],
    hostTagCenters: [[.25, .480], [.61, .480]],
    cardHostTagCenter: [.43, .505],
    hostTagMaxWidthW: .30,
    calloutBox: [.08, .515, .78, .59],
    captionCenterX: .43, captionBottom: .70, captionMaxWidthW: .70,
    waveCenters: [[.25, .355], [.61, .355]],
    waveWidthW: .27, waveBarsPerHost: 20, waveMaxHalfHeightH: .039,
    orbCenters: [[.25, .325], [.61, .325]], orbDiameterH: .107,
    typeH: { title: .046, chapter: .036, caption: .032,
             host: .020, callout: .023, progress: .019, wordmark: .021 },
    text: { title: [2,8,16], chapter: [2,10,24], caption: [2,11,26],
            host: [1,7,16], callout: [2,14,26], wordmark: [1,9,20] }
  },
  common: {
    titleSafe: [.05, .05, .95, .95],
    weight: { title: 800, chapter: 800, caption: 600, host: 800,
              callout: 600, progress: 800, wordmark: 800, thumbnail: 800 },
    leading: { title: 1.14, chapter: 1.16, caption: 1.22, callout: 1.18 },
    letterSpacingEm: { CJK: 0, Latin: 0 },
    radiusH: { caption: .012, callout: .012, host: .014, waveBar: .003 },
    padH: {
      captionXY_L: [.018, .014], captionXY_P: [.0125, .010],
      calloutXY: [.0125, .006], hostXY: [.010, .004]
    },
    strokeH: { progress: .004, calloutRule: .004, waveRail: .0025,
               hostMarker: .003, cardRule: .005 },
    hostMarkerBoxH: .014, hostMarkerGapH: .006, progressLabelGapH: .008,
    wordmarkMaxWidthW: [.24, .33],
    motion: {
      titleMs: [2000, 1500], chapterMs: [1600, 1333],
      cardDecorationInMs: 167, cardDecorationOutMs: 133,
      captionInMs: 0, captionOutMs: 0, captionMinMs: 1000,
      captionTargetMs: [1300, 4000], captionMaxMs: 6500,
      calloutMs: 3000, calloutInMs: 133, calloutOutMs: 133,
      calloutStartGapMs: 8000, calloutClearOfCardMs: 600,
      cutMs: 0, fadeMs: 200, peakHoldMs: 0,
      waveAttackReleaseMs: [67, 220], orbAttackReleaseMs: [100, 320],
      spectrumAttackReleaseMs: [80, 260], hostEmphasisMs: 167,
      cardTravelH: .008, calloutTravelH: .005,
      enterEase: "easeOutCubic", exitEase: "easeInCubic",
      fadeEase: "easeInOutSine", cameraPushEase: "smootherstep",
      progressEase: "linear"
    }
  }
}
```

**Safe areas.** The centered 90% rectangle follows SMPTE’s 16:9 title-safe dimensions and is also the product’s baseline for portrait. The stricter product rectangles above reserve roughly 15% at the bottom of landscape and 22% at the right and 28% at the bottom of portrait. Use landscape top and bottom player-control masks and portrait top controls, right action rail, and bottom metadata masks in QA. Google publishes overlay templates for **ads**, which are a reference for the kinds of areas to reserve. The organic watch page and Shorts Feed masks require device checks. [SMPTE ST 2046-1](https://pub.smpte.org/pub/st2046-1/st2046-1-2009.pdf) and [Google Ads video safe-zone guidance](https://support.google.com/google-ads/answer/13547298?hl=en), accessed 2026-11-23.

Use primary ink for the video wordmark, both host labels, progress and chapter index labels, and captions. Use the episode language for the video and publish-thumbnail wordmark. Singapore mixed episodes use the English mark and keep their mixed-script caption layout. A fitting custom show name takes precedence on the video.

### Colour tokens and calculated contrast

Blend the three stops at `0`, `.55`, and `1` in linear-light RGB, then write sRGB. Use the same palette in the video and thumbnail. Use solid plates for captions, badges and callouts. Use gold and rose for `sunset`, pale silver and slate for `mono`, and ice and periwinkle for `ocean`. The light variant is for waveform.

| Palette | Background stops | Host A | Host B | Ink / secondary ink | Plate / track |
|---|---|---|---|---|---|
| `aurora` | `#0B1220` · `#142C3B` · `#241C3C` | `#82F0D9` | `#B29AF0` | `#F5F7FC` / `#C4CDDE` | `#101522` / `#687B96` |
| `sunset` | `#17101A` · `#3B202B` · `#291829` | `#FFD08A` | `#E587AD` | `#F5F7FC` / `#C4CDDE` | `#101522` / `#687B96` |
| `mono` | `#101216` · `#272B33` · `#1C1E25` | `#F2F4F8` | `#A4ACBC` | `#F5F7FC` / `#C4CDDE` | `#101522` / `#687B96` |
| `ocean` | `#081421` · `#142C4B` · `#10263B` | `#A4EEFF` | `#91A6FF` | `#F5F7FC` / `#C4CDDE` | `#101522` / `#687B96` |
| `light` | `#F6F3EC` · `#DFEAF4` · `#F5F4FA` | `#00392E` | `#6150AE` | `#172238` / `#46536B` | `#F8FAFF` / `#69788D` |

| Palette | Worst contrast across stops and plate, ink / secondary / A / B | Ink on plate | A/B luminance separation, original / protanopia / deuteranopia / tritanopia |
|---|---|---|---|
| `aurora` | 13.48 / 9.04 / 10.61 / 6.04 | 17.00 | 1.76 / 1.87 / 1.67 / 1.72 |
| `sunset` | 13.73 / 9.20 / 10.26 / 5.89 | 17.00 | 1.74 / 1.84 / 1.69 / 1.64 |
| `mono` | 13.24 / 8.88 / 12.89 / 6.22 | 17.00 | 2.07 / 2.05 / 2.09 / 2.07 |
| `ocean` | 13.14 / 8.81 / 10.90 / 6.10 | 17.00 | 1.79 / 1.79 / 1.78 / 1.75 |
| `light` | 13.02 / 6.35 / 10.59 / 5.27 | 15.21 | 2.01 / 2.01 / 2.03 / 2.04 |

I computed these ratios in JavaScript using WCAG’s sRGB linearization, `L = .2126R + .7152G + .0722B`, and `(Llighter + .05) / (Ldarker + .05)`. For example, `#F5F7FC` has `L ≈ .9296`, and ocean’s brightest stop `#142C4B` has `L ≈ .0246`, giving `13.14:1`. All rendered text must clear **4.5:1**. Apply that floor to large text and the wordmark as well. The table measures source colours. Sample composited and decoded video frames for the release check. [WCAG 2.2 contrast definition](https://www.w3.org/TR/WCAG22/#dfn-contrast-ratio) and [contrast minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), accessed 2026-11-23.

For the CVD columns I applied the Machado severity-1.0 matrices to linear RGB and clamped the results. Ocean can read as two blues under protanopia. Mono relies on tone. Use **A = one filled dot and a smooth orb with one band**, **B = two stacked strokes and a faceted orb with two bands**. Keep A on the left and B on the right throughout, with readable names. The simulated A/B luminance ratios are below the 3:1 criterion W3C describes for lightness alone as an additional cue. The shapes, labels, and positions carry identity. [Machado et al. simulation model](https://profs.ic.uff.br/~laffernandes/content/publications/journal/2009_tvcg_15%286%29/machado_oliveira_fernandes-tvcg-15%286%29-2009-corrected.pdf) and [WCAG use of colour](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html), accessed 2026-11-23.

## 3. Typography and caption behavior

**Bundle Noto Sans SC and Noto Sans.** Use SC for Han and full-width punctuation. Use Noto Sans for Latin, digits, and half-width punctuation in English, Malay, and mixed dialogue. Use weights 600 and 800, with one baseline for the mixed line. Noto Sans and Noto Sans SC are OFL-licensed. Source Han Sans is a closely related OFL alternative. Inter is an OFL Latin option that would still require a CJK companion. LXGW WenKai is an OFL Klee-derived face whose handwritten forms would create a second visual voice. The Noto pair gives the studio a consistent hierarchy with two families. [Noto Sans SC license](https://github.com/google/fonts/blob/main/ofl/notosanssc/OFL.txt), [Noto Sans license](https://github.com/google/fonts/blob/main/ofl/notosans/OFL.txt), [Noto SC upstream notes](https://github.com/google/fonts/blob/main/ofl/notosanssc/upstream_info.md), [Source Han Sans](https://github.com/adobe-fonts/source-han-sans), [Inter](https://github.com/rsms/inter), and [LXGW WenKai](https://github.com/lxgw/LxgwWenKai), accessed 2026-11-23.

- **Font budget.** The published full SC variable TTF is about 17 MiB. At build time, pin upstream inputs and make a range-limited `600–800` WOFF2 with the 3,500 Level 1 standard hanzi, SC punctuation, and approved symbols. Budget **1.0–1.8 MiB** for that core subset and **≤100 KiB** for Latin and Latin Extended combined. These are estimates and acceptance budgets. Split remaining SC coverage into deterministic same-origin shards of **≤256 KiB** each. Preload and cache the actual shards the episode needs. Keep the copyright and OFL notices and rename modified fonts to distinct family names. [Published font binary](https://github.com/google/fonts/blob/main/ofl/notosanssc/NotoSansSC%5Bwght%5D.ttf), [Chinese Ministry of Education character table](https://www.moe.gov.cn/jyb_xwfb/xw_fbh/moe_2069/s7135/s7562/s7564/201308/t20130827_156334.html), [fontTools subsetting](https://fonttools.readthedocs.io/en/stable/subset/index.html), [fontTools instancing](https://fonttools.readthedocs.io/en/latest/varLib/instancer.html), and [OFL FAQ](https://openfontlicense.org/ofl-faq/), accessed 2026-11-23.
- **Export preflight.** Resolve a versioned glyph-coverage manifest for all visible strings. Load the needed buffers with `FontFace`, add and explicitly await the faces in `document.fonts` or `self.fonts`, and await that set’s `ready` before measuring any text. Cache layouts by font manifest, weight, locale, frame geometry, and input text. Use explicit system fallbacks for a provisional preview if needed. If an export face or glyph is unavailable, identify the field in the editor and block the production-ready export. Bundled fonts give the renderer stable font inputs. Pixel equality is a separate test on a pinned browser, OS, and graphics profile. [FontFace](https://developer.mozilla.org/en-US/docs/Web/API/FontFace), [FontFaceSet.ready](https://developer.mozilla.org/en-US/docs/Web/API/FontFaceSet/ready), [worker fonts](https://developer.mozilla.org/en-US/docs/Web/API/WorkerGlobalScope/fonts), and [Playwright visual comparisons](https://playwright.dev/docs/test-snapshots), accessed 2026-11-23.
- **Caption geometry.** Use `54 px` at 1080p landscape and about `61 px` at 1920p portrait. A constant-bottom solid plate reserves two line slots. Center the text block vertically inside the plate when it has one line. Prefer balanced phrase breaks and keep punctuation, a person’s name, `组屋里`, Latin words, numbers with units, and known abbreviations together where they fit. Validate measured ink width and count spaces in Latin line lengths. In mixed lines count a Han/full-width grapheme as one CJK unit and a Latin grapheme as half, with the measured width as a second cap. Reject an opening mark at line end, a closing mark at line start, and a punctuation-only or single-Han final line on a wrapped cue. An actual one-character utterance can occupy a single-line cue. The product limits use Netflix’s 16-character Simplified Chinese and 42-character US English line limits as landscape references. [Netflix Chinese guide](https://partnerhelp.netflixstudios.com/hc/en-us/articles/215986007-Chinese-Simplified-Timed-Text-Style-Guide), [Netflix US English guide](https://partnerhelp.netflixstudios.com/hc/en-us/articles/217350977-English-USA-Timed-Text-Style-Guide), [W3C Chinese layout requirements](https://www.w3.org/TR/clreq/), and [Unicode line breaking](https://unicode.org/reports/tr14/), accessed 2026-11-23.
- **Caption timing.** Target **7 CJK graphemes/s** and **17 Latin graphemes/s or 160 words/min**, whichever takes more time. Hard ceilings are **9 CJK/s**, **20 Latin/s**, and **180 Latin words/min**. Apply the Latin house limits to Malay. For a mixed cue, require at least `CJK/9 + max(Latin/20, LatinWords/3)` seconds and count punctuation and internal Latin spaces. Use available current-revision timings and snap to frame boundaries. The checked-out app allocates cue time proportionally within each turn. Treat those cues as estimates and review sync against the audio. If a cue fails, rebalance phrases and use up to 200 ms of adjacent silence within the same speaker window when available. If it still fails, flag the cue for timing or script review and preserve all words. Netflix supplies the adult CPS reference points. The slower targets and WPM ceilings are product decisions. [Netflix Chinese guide](https://partnerhelp.netflixstudios.com/hc/en-us/articles/215986007-Chinese-Simplified-Timed-Text-Style-Guide) and [Netflix US English guide](https://partnerhelp.netflixstudios.com/hc/en-us/articles/217350977-English-USA-Timed-Text-Style-Guide), accessed 2026-11-23. [Current cue planner](/Users/admin/PWA-Knowledge-Podcast-OpenAI-TTS/src/video/timeline.ts:86)
- **Caption layers.** Burn in dialogue for the default render. Keep the solid plate through the cue and use a hard phrase cut at the next cue. For the manual YouTube package, generate a reviewed timed caption track from the same timings, with speaker identity and meaningful sound cues, and check the overlap with native captions enabled. [WCAG prerecorded captions](https://www.w3.org/WAI/WCAG22/Understanding/captions-prerecorded.html) and [YouTube caption upload](https://support.google.com/youtube/answer/2734796?hl=en), accessed 2026-11-23.

## 4. Element specifications

| Element | Render behavior |
|---|---|
| **Title card** | Show title, topic graphic, wordmark, and the live caption rail from frame 0. Left-align the title in both formats. Landscape uses the right third for the graphic. Portrait uses a small graphic below the title at right and short opening copy of at most **12 CJK graphemes or four Latin words**, subject to the box limits. Use the active host chip at the card anchor. Keep type opaque and animate only the graphics. After the hold, reveal the stage. |
| **Chapter card** | Show on the first voiced frame of each subsequent chapter. Replace the stage illustration with a short, left-aligned chapter title and a localized chapter index. Keep the caption rail live and the active host chip at the card anchor. Keep audio on its original turn clock. The first chapter appears in the progress HUD. Derive exported YouTube chapter timestamps from the same chapter starts, using YouTube’s requirements for a zero start, at least three timestamps, and 10-second minimum chapters when publishing a chapter list. [YouTube video chapters](https://support.google.com/youtube/answer/9884579?hl=en), accessed 2026-11-23. |
| **Speaker label** | Use the episode’s host names or localized `Host A` and `Host B`. On the stage, show both chips in fixed positions. Use ink plus a solid accent marker for the active host and secondary ink plus an outline marker for the idle host. Switch identities on the turn boundary and ease the decorative emphasis over 167 ms. On a card, show the active host only. If a name exceeds the budget, use the localized short label and preserve the full name in the episode metadata. |
| **Callout lower-third** | Use the reserved higher rail above captions. Left-align a short fact, definition, or detail with a thin accent rule. Permit one at a time, up to three per chapter, in requested timestamp order. Use up to **20 CJK or 46 Latin graphemes total** and keep the text opaque during its 3 s slot. A callout starts at least 600 ms after a card clears and at least 8 s after the previous start. Hold it until the next valid clause boundary or omit it if it cannot finish inside the chapter. |
| **Chapter progress** | At top right, show `current / total` and a short track filled from chapter start to end. Fill with primary ink and use the palette track token. Reset only when the new chapter starts. Keep visible through cards. Right-align the entire group to the safe edge. |
| **Wordmark** | At top left, draw the configured short show name or `Podcast Studio` in secondary ink, with no emblem. One line, fixed position. Use the fallback if the supplied name exceeds the token budget. |
| **Waveform** | Use two open rails on the gradient, each centered above its host chip. Draw a stable baseline and 3 px minimum visible idle ticks at native resolution. Grow only the speaking rail. Reuse the existing 480 ms PCM peak window per turn and apply precomputed smoothing. With normalized peak `p`, use `sqrt(clamp((p - .012)/.38, 0, 1))` before applying the height cap. Bar width is `.58` of pitch. Anchor bars symmetrically to the rail. Leave the broad rectangular panel out of the new composition. |
| **Scene transition** | `cut` changes the stage at the event frame. `fade` dips only the stage to the palette plate over three frames and reveals the next stage over three frames, with `easeInOutSine`. The active caption, wordmark, and progress stay at full opacity. Use at most one 3D scene render per output frame. |

## 5. Studio 3D art direction and motion

**Frame the objects as a pair.** Keep both host orbs visible and stable in scale across turns. A is smooth with a single equatorial band. B retains controlled faceting with two bands. Use matte pedestals with bevels, a dark lower body `#253247`, and a restrained rim `#53617D`. Use `#F5F7FC` for the soft key and `#C4CDDE` for neutral fill, with an accent-colour rim on each host. Start with one hemisphere light at `1.15` and one directional key at `1.75`. Use fog density `.045` and the palette’s outer stop as its colour. Use an analytic radial halo behind each orb, at most `0.18` alpha, and a radial contact shadow below each pedestal using `#000000` at `0.28` peak alpha. Use fog and softer edge contrast for depth. The ground uses those contact shadows and a broad accent wash at `0.06` alpha. Keep the foreground visually quiet enough for text.

**Keep the ring behind the dialogue.** Retain 32 spectrum instances. Fit the ring’s near edge inside the stage box and reduce its maximum height toward the camera. Use a fixed gradient bias from A’s colour to B’s. Cap the total active bar height at `0.055H` in projection. Use 12 seeded particles well behind the ring, rendered in one batch as static points at `0.10` alpha using secondary ink. In portrait, narrow horizontal orbit movement, shift the stage optical centre to `x=.43`, and flatten the projected ring into an ellipse with world-depth scale `.55` of the landscape model. Fit both pedestal bases above the chip line and test the extrema of every camera preset at maximum intensity. Use a reprojected camera composition at 9:16.

**Set a bounded camera path.** Use a 38° vertical field of view, zero roll, a fixed look target at the midpoint of the hosts, and camera time from the episode frame index. Apply the portrait movement multiplier `.65` and cap projected movement from the camera alone at `1.5%` of the short frame edge per second. These are product motion budgets.

| Camera preset | Path |
|---|---|
| `static` | Fixed camera. Use this as the reference pose and for reduced motion. |
| `drift` | Yaw sinusoid ±4° and pitch ±1.25°, period 36 s, with fixed framing distance. |
| `orbit` | Yaw sinusoid ±7°, period 56 s. Pitch stays fixed. |
| `push-in` | Move inward by at most 4% over 12 s with `smootherstep`, starting after the opening card. Hold the final position for the rest of the export. |

Use mood as a motion multiplier, `calm=.70`, `curious=1.00`, `urgent=1.15`, `warm=.80`, `serious=.55`. Clamp `intensity` to `[0,1]`. Multiply the audio-reactive **excursion** by `min(1, mood × intensity)` and camera excursion by `min(1, mood)`. Use active-speaker RMS over 40 ms, mapped from `−48` to `−16 dBFS` and clamped. For the ring, use a centered 40 ms Hann analysis window and 32 log-spaced bands from 80 Hz to `min(8 kHz, Nyquist)`, normalized by the window gain and mapped from `−72` to `−28 dBFS`. Use the attack/release tokens with `alpha = 1 − exp(−(1000/30)/tauMs)` and precompute the envelope for every frame. Cap orb size excursion at **6%** and limit halo/core variation to **0.05 relative luminance** in stationary core samples. Reset levels at episode start and let tails decay into silence. Move scale and bar height while retaining stable accent colours.

**Flash and reduced motion.** Design for zero deliberate flashes and reject more than three qualifying flashes in any rolling second. Check opposing luminance excursions and saturated-red transitions. A general flash uses a relative luminance change of at least `0.10` with the darker state below `0.80`. A whole-frame average can hide local flashing. In the preview, respect `prefers-reduced-motion`. Expose a saved export setting that selects the static camera, freezes particles and halo breathing, cuts cards and callouts in place, and uses the static waveform rail plus speaker change indicators. An exported MP4 needs that choice baked into its pixels. [WCAG three flashes](https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html), [WCAG flash definitions](https://www.w3.org/TR/WCAG22/#dfn-general-flash-and-red-flash-thresholds), and [MDN reduced-motion preference](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/%40media/prefers-reduced-motion), accessed 2026-11-23.

**Performance and repeatability.** Keep a single WebGL canvas at DPR 1, one instanced ring, reused geometry and materials, and one Canvas 2D composite. Budget **≤16 draw calls** and **≤12,000 triangles** per stage frame. Use the analytic halos and shadows in the default profile. Precompute font layouts, PCM features, and seeded particle positions before encoding. Make each draw a function of the frozen render plan, frame index, PCM, fixed visual profile, font manifest and seed. Choose the render profile during preflight and record it. On context loss, stop that export and offer a fresh full waveform render. Three.js provides instancing for shared geometry and material, and the local spike already uses it for the ring. [Three.js InstancedMesh](https://threejs.org/docs/pages/InstancedMesh.html), accessed 2026-11-23. [Scene interface](/Users/admin/PWA-Knowledge-Podcast-OpenAI-TTS/src/video/scenes/types.ts:46) and [Three.js spike](/Users/admin/PWA-Knowledge-Podcast-OpenAI-TTS/spikes/three-scene/src/scene.js:132)

The reported software WebGL baseline is **26.7 ms median and 28.1 ms p95** for 150 frames, with render and a one-pixel readback. Qualify the upgrade at **≤60 ms p95 and ≤40 ms median**, including scene render, 2D compositing, and a one-pixel synchronization readback, after warm-up. Measure both orientations and report warm-up and encoding separately. At 30 fps, a frame can take longer than its playback duration during local offline export. [Repository benchmark](/Users/admin/PWA-Knowledge-Podcast-OpenAI-TTS/docs/ANIMATION-DECISION.md:25)

## 6. Thumbnail specification

Ship **1280×720, 16:9, sRGB, under 2 MB**, using a single composition rendered directly to that size. YouTube’s current desktop Help recommends **3840×2160** for landscape video thumbnails with a 640 px minimum width. It also documents 9:16 custom Shorts thumbnails uploaded through desktop Studio for verified accounts. The package’s 1280×720 image serves the landscape upload. For Shorts, preview the 9:16 opening still as a cover candidate and use a dedicated 9:16 crop if supplying a file. YouTube documents that some surfaces substitute an auto-generated 4:5 image for vertical videos given a 16:9 thumbnail. [YouTube custom thumbnail requirements](https://support.google.com/youtube/answer/72431?hl=en), accessed 2026-11-23.

YouTube advises legible type, simple composition, expressive visuals suited to the audience, and checking across devices. Its example of an expressive face is audience guidance. Use one bold topic graphic or the recognizable host pair as the focal point. The following limits, contrast floor and exclusion box are product rules. Test at `160×90` and `320×180`, with a simulated duration badge in the bottom-right box. [YouTube thumbnail and title tips](https://support.google.com/youtube/answer/12340300?hl=en), accessed 2026-11-23.

| Variant | Layout and selection |
|---|---|
| **Topic graphic** | Default when an approved drawing is available. Text box `[80,155,755,540]`, one graphic in `[800,112,1190,530]`. For the sample episode, use `组屋如何混居` and the housing-block graphic. |
| **Host pair** | Default fallback when the episode has no approved topic drawing. Text box `[80,155,734,540]`, one orb-and-band composition in `[768,120,1188,535]`. Use the episode’s palette and the A/B shapes. |
| **Headline** | Select for an episode with a strong, short editorial claim. Text box `[80,150,1160,530]`. Use one accent rule or a single code-drawn symbol beside the headline. Keep the claim traceable to the reviewed episode script. |

```js
{
  canvas: [1280, 720], insetPx: [80, 72],
  durationBadgeExclusion: [.79, .78, 1, 1],
  ink: "palette.ink", secondaryInk: "palette.secondaryInk",
  backdrop: "palette.stops", graphic: ["palette.A", "palette.B"],
  headlineSizeH: .136, headlineMinSizeH: .119, headlineLeading: 1.10,
  wordmarkSizeH: .022, wordmarkWeight: 600, wordmarkTopLeftPx: [80, 72], accentRuleH: .009,
  maxLines: 2, CJKTotal: [6, 12], CJKPerLine: [6, 6, 8],
  LatinWords: [2, 5], LatinMaxGraphemes: 30, MalayMaxGraphemes: 34
}
```

Use short natural phrases and sentence or title case. Keep the headline visible in full. When it cannot fit at the minimum size, require a shorter thumbnail headline field. Keep the title and thumbnail promise aligned. For eligible long-form videos, hold the upload title constant while comparing variants with YouTube’s test. YouTube chooses a winner by watch-time share and currently excludes Shorts from this test. [YouTube title and thumbnail testing](https://support.google.com/youtube/answer/16391400?hl=en), accessed 2026-11-23.

## 7. Existing frames and change order

I inspected all four `vcheck2` images, `three-frame.png`, `trial/03-video-panel.png`, and the Library, Studio, Settings and language screenshots in `shots/`.

| Priority | Observation and change |
|---|---|
| **P0 — Opening and chapter timing** | `frame0` has crisp Chinese type, but its high accent dash and centered text leave most of the frame inert. `frame1` uses virtually the same hierarchy, so the chapter change reads like a second opening. The current timeline allocates 2 s to the title and 1.5 s to the first chapter before the first turn. Put live speech at frame 0, eliminate the first chapter card, and give later chapters their own layout. [Timeline](/Users/admin/PWA-Knowledge-Podcast-OpenAI-TTS/src/video/timeline.ts:139) |
| **P0 — Caption integrity** | `frame2` is readable at 960×540, but it breaks `组屋里` between lines. The large background panel makes the quiet waveform look dead at that instant. Use legal, phrase-aware wrapping and a solid, fixed caption plate. Give both hosts a narrower rail and an intentional idle state. [Overlay](/Users/admin/PWA-Knowledge-Podcast-OpenAI-TTS/src/video/overlay.ts:123) and [waveform](/Users/admin/PWA-Knowledge-Podcast-OpenAI-TTS/src/video/scenes/waveform.ts:56) |
| **P1 — Thumbnail subject** | `frame3` has stronger hierarchy than the title card. Its large headline and violet background are effective. The repeated episode title and generic equalizer leave little visual information about housing. Use the short headline and housing motif, retaining the confident typography. [Thumbnail renderer](/Users/admin/PWA-Knowledge-Podcast-OpenAI-TTS/src/publish/thumbnail.ts:30) |
| **P1 — Stage readability** | `three-frame.png` establishes a two-person composition, and both glows read. At the sampled instant the dark pedestals merge into the floor and the foreground ring takes more space than the hosts. Differentiate the object shapes, ground them with soft contact shadows, bring up the pedestal rim, and keep the near ring out of the text rails. [Spike lighting and materials](/Users/admin/PWA-Knowledge-Podcast-OpenAI-TTS/spikes/three-scene/src/scene.js:24) |
| **P2 — Preview and localization** | The base screenshots show a restrained, legible app at three widths. The 390 px locale-toggle captures show broken English and Malay navigation words and residual Chinese settings text. In `03-video-panel.png`, the sticky audio footer crosses the visible preview, and the title appears to leave a single-character final line behind it. Treat the screenshot as a preview issue and check the underlying export separately. Give the preview a clear scroll area and show both aspect-ratio guides using the actual renderer. Validate language state again on the current build. [Repository UI/UX standard](/Users/admin/PWA-Knowledge-Podcast-OpenAI-TTS/docs/UIUX-STANDARD.md:89) |

## 8. Release rubric and Playwright checks

Give each criterion full points when all its checks pass, half when it has a documented visual defect and meets its hard gates, and zero when its hard gate fails or its evidence is missing. **Pass at 85/100 with every hard gate passing. Aim for 92/100 for the flagship 3D preset.** Score both aspects independently when delivering both.

| Criterion | Points | Acceptance evidence |
|---|---:|---|
| Caption legibility and sync | **18** | **Gate.** Inspect cue metadata and isolated text masks for safe bounds, two lines max, legal breaks, reading rate, and complete text. Spot-check alignment against speech at the start, middle, speaker changes, and dense cues. |
| Contrast and host identity | **12** | **Gate.** Compute ratios from the captured ink and its corresponding background. Use a glyph mask to sample interior pixels and a same-frame background-only pass for the adjacent plate or art. Test raw and decoded samples. Minimum text ratio `4.5:1`. Verify A/B in grayscale and all three CVD modes with names and shape cues present. |
| Framing and collision | **12** | **Gate.** Assert element boxes and actual ink masks fit the product safe rectangle at boundary and extrema frames. Apply the landscape and portrait UI masks. Review device screenshots. |
| Typography and localization | **10** | **Gate.** Compare glyph coverage, selected face hashes, and layout boxes. Check `zh-CN`, English, Malay and mixed strings with long names, combining marks, Han punctuation, numbers, and wide Latin words. Reject missing glyphs, unintended fonts, and orphan lines. |
| Opening, chapters and callouts | **8** | First spoken hook at frame 0, no first-chapter interruption, later cards at the correct chapter boundary, no annotation collisions, and callout count, hold time and spacing within tokens. |
| Motion and flash safety | **10** | **Gate.** In raw and decoded frames, allow at most three field-level general flashes and three field-level saturated-red flashes per rolling second. Pair opposing qualifying changes using local extrema in a sliding 30-frame window and apply the WCAG area threshold of one quarter of a 10-degree visual field. Exercise alternating loud/quiet PCM and rapid chapter changes. Waveform attack/release smoothing already limits the flicker of individual syllable-driven bars, whose area is below the field threshold. Report observed cell-level maxima as warnings and flag values above the soft limit of 10 flashes per second. Cell counts have no effect on the score. Log frame-to-frame luminance deltas and review the saved reduced-motion profile. |
| Scene craft and audio response | **8** | Both hosts and their symbols read at mobile size. Quiet, spoken and clipped PCM fixtures exercise clear changes in the correct host. Seeded stage elements and background remain understated. Compare with sound on and muted. |
| Thumbnail | **10** | **Gate.** Assert dimensions, file size, headline bounds, 4.5:1 contrast, and duration-mask clearance. At `160×90` require at least 8 px of CJK ink height or 6 px Latin x-height. A reviewer reads the headline and identifies the focal subject at both preview sizes. |
| Repeatability and fallback | **7** | **Gate.** Compare SHA-256 of raw RGBA between the export and a fresh shuffled draw on pinned Chromium and SwiftShader. Sample frames 0, 15, 30, 60, 120, spoken-episode event boundaries ±1, and the exact boundaries in the rapid-chapter stress tail. Verify waveform export on WebGL initialization failure and cancellation/context-loss handling. Use per-platform visual baselines for other rendering stacks. |
| Performance | **5** | **Gate for 3D.** Record p50/p95 after warm-up on the short reference fixture and a full episode stress fixture. Require the stated render budget in both aspects. Check resource cleanup and bounded encoder queues. |

Run the suite against the **actual preview and export entry points** with local fixture PCM and versioned fonts. Log frame indices and layout metadata for all assertions. Use a test-only frame reader for masks, hashes and pixel checks, and decode representative frames from the resulting MP4 to catch composition or compression regressions. Playwright provides per-project visual baselines and documents rendering differences across host environments. [Playwright visual comparisons](https://playwright.dev/docs/test-snapshots), accessed 2026-11-23.

## 9. Status and unverified items

- **Inspected and calculated.** Repository code and supplied screenshots were reviewed. Proposed contrast ratios and modelled CVD results were calculated. The 3D benchmark is repository evidence from the earlier spike. No design was implemented, no Playwright release checks were run, and no files were changed.
- **Current integration.** The checked-out scene registry registers waveform only. The Three.js preset and parameters are design targets for this checkout. The current encoder tries AAC before Opus, so confirm which codec the owner’s environment actually produces. YouTube lists both AAC-LC and Opus in its upload settings. [Scene registry](/Users/admin/PWA-Knowledge-Podcast-OpenAI-TTS/src/video/scenes/registry.ts:13), [codec selection](/Users/admin/PWA-Knowledge-Podcast-OpenAI-TTS/src/video/render.ts:345), and [YouTube upload encoding guidance](https://support.google.com/youtube/answer/1722171?hl=en), accessed 2026-11-23 for the external guidance.
- **UNVERIFIED.** Actual font payloads and rare-name glyph coverage, phrase timing against speech, final mobile overlay positions with native captions on, Shorts thumbnail availability on the owner’s account, mobile readability in all four language modes, long-export memory and 3D frame time, Safari and real iOS, and cross-driver appearance. The supplied stage image provides a landscape still. Portrait composition, new stage lighting, motion safety, and retention all need evidence from the implemented renderer and published episodes.
