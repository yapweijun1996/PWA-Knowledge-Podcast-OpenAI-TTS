// Font access for every video surface (frames, title cards, thumbnails).
// The family names and `videoFont` are the stable interface other modules use;
// `ensureVideoFonts` is implemented by the fonts work package (T58).
export const videoFontFamilies = {
  sc: "PS Noto Sans SC",
  latin: "PS Noto Sans",
} as const;

/** CSS font-family list: bundled faces first, then tested system fallbacks. */
export const videoFontStack =
  '"PS Noto Sans SC", "PS Noto Sans", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';

export type VideoFontWeight = 600 | 700 | 800;

/** A canvas `font` shorthand: weight, size in pixels, family list. */
export function videoFont(weight: VideoFontWeight, sizePx: number): string {
  return `${weight} ${Math.round(sizePx * 100) / 100}px ${videoFontStack}`;
}

export type FontPreflight = {
  /** Human-readable notices for the render receipt (fallback used, shard missing). */
  notices: string[];
  /** Characters in the supplied texts that no bundled face covers. */
  missingCharacters: string[];
};

/** Load and register the bundled faces needed for `texts`, then await them. */
export async function ensureVideoFonts(_options: {
  texts: readonly string[];
  signal?: AbortSignal;
}): Promise<FontPreflight> {
  // Placeholder until T58 lands: system fonts are used and nothing is verified.
  return { notices: [], missingCharacters: [] };
}
