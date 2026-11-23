import type { Language } from "../../shared/factory.ts";
import { createTranslator, t } from "../i18n/index.ts";
import { wrapText } from "../text/wrap.ts";
import { publishLocales } from "./package.ts";

export const thumbnailSize = { width: 1280, height: 720 } as const;
export type ThumbnailTheme = "light" | "dark";

type ThumbnailContext = Pick<
  CanvasRenderingContext2D,
  | "save"
  | "restore"
  | "fillStyle"
  | "fillRect"
  | "font"
  | "textBaseline"
  | "textAlign"
  | "fillText"
> & { measureText(text: string): { width: number } };

const palettes = {
  light: { background: "#f7f5fc", title: "#221b34", accent: "#6338bf" },
  dark: { background: "#221b34", title: "#f7f5fc", accent: "#c5aeff" },
};
const maxLines = 3;
const inset = 104;
const lineHeight = 102;
const textWidth = thumbnailSize.width - 2 * inset;

/** Draw onto an existing 1280×720 canvas with its default transform. */
export function drawThumbnail(
  ctx: ThumbnailContext,
  {
    title,
    theme,
    language,
  }: { title: string; theme: ThumbnailTheme; language?: Language },
) {
  const colors = palettes[theme];
  ctx.save();
  try {
    ctx.fillStyle = colors.background;
    ctx.fillRect(0, 0, thumbnailSize.width, thumbnailSize.height);
    ctx.fillStyle = colors.accent;
    ctx.fillRect(inset, 104, 96, 8);
    const barHeights = [16, 36, 24, 52, 78, 46, 62, 34, 48, 22, 12];
    for (const [index, height] of barHeights.entries()) {
      ctx.fillRect(
        thumbnailSize.width - inset - 212 + index * 20,
        596 - height / 2,
        12,
        height,
      );
    }

    ctx.font = "750 84px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = colors.title;
    const locale = language && publishLocales[language];
    const translate = locale ? createTranslator(locale) : t;
    const label = title.trim() || translate("publish.content.untitled");
    const lines = wrapText(ctx, label, textWidth, locale, maxLines);
    const firstY = 350 - ((lines.length - 1) * lineHeight) / 2;
    for (const [index, line] of lines.entries()) {
      ctx.fillText(line, inset, firstY + index * lineHeight, textWidth);
    }
  } finally {
    ctx.restore();
  }
}
