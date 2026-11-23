import type { PaletteId } from "./design/palettes.ts";

export const videoThemes = { dark: "aurora", light: "light" } as const;
export type VideoTheme = keyof typeof videoThemes;
export type VideoPaletteId = PaletteId | "light";

export function themePalette(
  theme: VideoTheme,
  darkPalette?: PaletteId,
): VideoPaletteId {
  return theme === "dark" && darkPalette !== undefined
    ? darkPalette
    : videoThemes[theme];
}
