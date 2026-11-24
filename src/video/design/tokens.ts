// Layout, type, motion and text-limit tokens from docs/VISUAL-DESIGN-SPEC.md section 2.
// Coordinates are [left, top, right, bottom] fractions of the frame (x of width, y of height).
// Font sizes, padding, radii and strokes are fractions of the frame height H.
// This file is the single source of truth: change the spec and this file together.
export const designTokens = {
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
    hostTagCenters: [[.34, .545], [.66, .545]],
    cardHostTagCenter: [.50, .615],
    hostTagMaxWidthW: .22,
    hostMarkerBoxH: .026, hostMarkerStrokeH: .006,
    calloutBox: [.09, .59, .53, .675],
    captionCenterX: .50, captionBottom: .84, captionMaxWidthW: .72,
    waveCenters: [[.34, .385], [.66, .385]],
    waveWidthW: .24, waveBarsPerHost: 36, waveMaxHalfHeightH: .058,
    orbCenters: [[.34, .345], [.66, .345]], orbDiameterH: .195,
    typeH: { title: .082, chapter: .059, caption: .050,
             host: .036, callout: .030, progress: .024, wordmark: .028 },
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
    chapterBox: [.08, .30, .78, .485],
    stageBox: [.09, .17, .77, .51],
    hostTagCenters: [[.25, .480], [.61, .480]],
    cardHostTagCenter: [.43, .505],
    chapterHostTagCenter: [.43, .53],
    chapterWash: { topH: .02, bottomH: .62, alpha: .06 },
    hostTagMaxWidthW: .30,
    hostMarkerBoxH: .018, hostMarkerStrokeH: .003,
    calloutBox: [.08, .507, .78, .575],
    captionCenterX: .43, captionBottom: .68, captionMaxWidthW: .70,
    waveCenters: [[.25, .30], [.61, .30]],
    waveWidthW: .27, waveBarsPerHost: 20, waveMaxHalfHeightH: .039,
    orbCenters: [[.25, .30], [.61, .30]], orbDiameterH: .118,
    typeH: { title: .046, chapter: .041, caption: .032,
             host: .020, callout: .023, progress: .019, wordmark: .021 },
    text: { title: [2,8,16], chapter: [3,10,24], caption: [2,11,26],
            host: [1,7,16], callout: [2,14,26], wordmark: [1,9,20] }
  },
  common: {
    titleSafe: [.05, .05, .95, .95],
    weight: { title: 800, chapter: 800, caption: 600, host: 800,
              callout: 600, progress: 800, wordmark: 800, thumbnail: 800,
              thumbnailWordmark: 600 },
    leading: { title: 1.14, chapter: 1.16, caption: 1.22, callout: 1.18 },
    letterSpacingEm: { CJK: 0, Latin: 0 },
    radiusH: { caption: .012, callout: .012, host: .014, waveBar: .003 },
    padH: {
      captionXY_L: [.018, .014], captionXY_P: [.0125, .010],
      calloutXY: [.0125, .006], hostXY: [.010, .004]
    },
    strokeH: { progress: .004, calloutRule: .004, waveRail: .0025, cardRule: .005 },
    hostMarkerGapH: .006, progressLabelGapH: .008,
    wordmarkMaxWidthW: [.24, .33],
    thumbnailWordmarkSizeH: .022,
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
} as const;

export type DesignTokens = typeof designTokens;
export type Orientation = "landscape" | "portrait";
