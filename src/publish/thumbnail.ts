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

function wrapTitle(ctx: ThumbnailContext, title: string) {
  const lines: string[] = [];
  let line = "";
  for (const character of title) {
    const next = line + character;
    if (!line || ctx.measureText(next).width <= textWidth) {
      line = next;
      continue;
    }
    if (lines.length === maxLines - 1) {
      const characters = Array.from(line.trimEnd());
      while (
        characters.length &&
        ctx.measureText(`${characters.join("")}…`).width > textWidth
      ) {
        characters.pop();
      }
      lines.push(`${characters.join("").trimEnd()}…`);
      return lines;
    }

    const space = next.lastIndexOf(" ");
    const end = space > 0 ? space : line.length;
    lines.push(next.slice(0, end));
    line = next.slice(end).trimStart();
  }
  if (line) lines.push(line);
  return lines;
}

/** Draw onto an existing 1280×720 canvas with its default transform. */
export function drawThumbnail(
  ctx: ThumbnailContext,
  { title, theme }: { title: string; theme: ThumbnailTheme },
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
    const lines = wrapTitle(
      ctx,
      title.replace(/\s+/gu, " ").trim() || "未命名节目",
    );
    const firstY = 350 - ((lines.length - 1) * lineHeight) / 2;
    for (const [index, line] of lines.entries()) {
      ctx.fillText(line, inset, firstY + index * lineHeight, textWidth);
    }
  } finally {
    ctx.restore();
  }
}
