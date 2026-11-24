import { designTokens, type Orientation } from "./tokens.ts";

export type PixelBox = { x: number; y: number; width: number; height: number };

function centeredBox(
  x: number,
  y: number,
  width: number,
  height: number,
): PixelBox {
  return { x: x - width / 2, y: y - height / 2, width, height };
}

/** Resolve the orientation tokens once into canvas pixels, without rounding the anchors. */
export function videoLayout(
  width: number,
  height: number,
  orientation: Orientation,
) {
  const tokens = designTokens[orientation];
  const { common } = designTokens;
  const box = ([left, top, right, bottom]: readonly number[]): PixelBox => ({
    x: left * width,
    y: top * height,
    width: (right - left) * width,
    height: (bottom - top) * height,
  });
  const scale = <T extends Record<string, number>>(values: T) =>
    Object.fromEntries(
      Object.entries(values).map(([key, value]) => [key, value * height]),
    ) as Record<keyof T, number>;
  const type = scale(tokens.typeH);
  const radius = scale(common.radiusH);
  const stroke = scale({
    ...common.strokeH,
    hostMarker: tokens.hostMarkerStrokeH,
  });
  const pad = ([x, y]: readonly number[]) => ({ x: x * height, y: y * height });
  const captionPad = pad(
    orientation === "landscape"
      ? common.padH.captionXY_L
      : common.padH.captionXY_P,
  );
  const calloutPad = pad(common.padH.calloutXY);
  const hostPad = pad(common.padH.hostXY);
  const captionHeight =
    type.caption * common.leading.caption * tokens.text.caption[0] +
    2 * captionPad.y;
  const captionWidth = tokens.captionMaxWidthW * width;
  const hostWidth = tokens.hostTagMaxWidthW * width;
  const marker = tokens.hostMarkerBoxH * height;
  const markerGap = common.hostMarkerGapH * height;
  const hostHeight =
    Math.max(type.host * common.leading.caption, marker) + 2 * hostPad.y;
  const hostBox = ([x, y]: readonly number[]) =>
    centeredBox(x * width, y * height, hostWidth, hostHeight);
  const progressRight = tokens.progressTopRight[0] * width;
  const progressWidth = tokens.progressWidthW * width;
  const progressGap = common.progressLabelGapH * height;
  const progressY = tokens.progressTopRight[1] * height;
  const wordmarkWidth =
    common.wordmarkMaxWidthW[orientation === "landscape" ? 0 : 1] * width;
  const wave = tokens.waveCenters.map(([x, y]) =>
    centeredBox(
      x * width,
      y * height,
      tokens.waveWidthW * width,
      2 * tokens.waveMaxHalfHeightH * height,
    ),
  );
  return {
    width,
    height,
    type,
    radius,
    stroke,
    captionPad,
    calloutPad,
    hostPad,
    marker,
    markerGap,
    progressGap,
    safe: box(tokens.safe),
    title: box(tokens.titleBox),
    titleGraphic: box(tokens.titleGraphicBox),
    chapter: box(tokens.chapterBox),
    stage: box(tokens.stageBox),
    hostChips: tokens.hostTagCenters.map(hostBox),
    cardChip: hostBox(tokens.cardHostTagCenter),
    chapterChip: hostBox(
      orientation === "portrait"
        ? designTokens.portrait.chapterHostTagCenter
        : tokens.cardHostTagCenter,
    ),
    callout: box(tokens.calloutBox),
    caption: {
      x: tokens.captionCenterX * width - captionWidth / 2,
      y: tokens.captionBottom * height - captionHeight,
      width: captionWidth,
      height: captionHeight,
    },
    progress: {
      x: progressRight - progressWidth,
      y: progressY,
      width: progressWidth,
      height:
        type.progress * common.leading.caption + progressGap + stroke.progress,
    },
    wordmark: {
      x: tokens.wordmarkTopLeft[0] * width,
      y: tokens.wordmarkTopLeft[1] * height,
      width: wordmarkWidth,
      height: type.wordmark * common.leading.caption,
    },
    wave,
    waveBarsPerHost: tokens.waveBarsPerHost,
    text: tokens.text,
  };
}

export type VideoLayout = ReturnType<typeof videoLayout>;
