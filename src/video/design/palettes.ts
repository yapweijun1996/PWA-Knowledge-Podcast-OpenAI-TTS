// Colour tokens from docs/VISUAL-DESIGN-SPEC.md section 2 (contrast ratios computed there).
// Blend the three background stops at 0, .55 and 1 in linear-light RGB, then write sRGB.
export const paletteIds = ["aurora", "sunset", "mono", "ocean"] as const;
export type PaletteId = (typeof paletteIds)[number];

export type Palette = {
  /** Background gradient stops at 0, .55 and 1. */
  stops: readonly [string, string, string];
  hostA: string;
  hostB: string;
  ink: string;
  secondaryInk: string;
  /** Solid plate behind captions, badges and callouts. */
  plate: string;
  /** Progress and waveform rail track. */
  track: string;
};

const darkInk = { ink: "#F5F7FC", secondaryInk: "#C4CDDE", plate: "#101522", track: "#687B96" } as const;

export const palettes: Record<PaletteId | "light", Palette> = {
  aurora: { stops: ["#0B1220", "#142C3B", "#241C3C"], hostA: "#82F0D9", hostB: "#B29AF0", ...darkInk },
  sunset: { stops: ["#17101A", "#3B202B", "#291829"], hostA: "#FFD08A", hostB: "#E587AD", ...darkInk },
  mono: { stops: ["#101216", "#272B33", "#1C1E25"], hostA: "#F2F4F8", hostB: "#A4ACBC", ...darkInk },
  ocean: { stops: ["#081421", "#142C4B", "#10263B"], hostA: "#A4EEFF", hostB: "#91A6FF", ...darkInk },
  /** Light variant, used by the 2D waveform theme only. */
  light: {
    stops: ["#F6F3EC", "#DFEAF4", "#F5F4FA"],
    hostA: "#00392E",
    hostB: "#6150AE",
    ink: "#172238",
    secondaryInk: "#46536B",
    plate: "#F8FAFF",
    track: "#69788D",
  },
};
