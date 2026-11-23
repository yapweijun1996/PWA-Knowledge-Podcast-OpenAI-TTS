import type { Locale } from "../i18n/index.ts";
import type { Palette } from "../video/design/palettes.ts";

export type TopicGraphic = "housing-blocks" | "open-book" | "network-nodes";
export type GraphicBox = readonly [
  left: number,
  top: number,
  right: number,
  bottom: number,
];
type Point = readonly [number, number];
type Path = readonly Point[];

export type GraphicContext = Pick<
  CanvasRenderingContext2D,
  | "save"
  | "restore"
  | "translate"
  | "scale"
  | "beginPath"
  | "moveTo"
  | "lineTo"
  | "closePath"
  | "bezierCurveTo"
  | "ellipse"
  | "fill"
  | "stroke"
  | "clip"
  | "fillRect"
  | "fillStyle"
  | "strokeStyle"
  | "lineWidth"
  | "lineCap"
  | "createRadialGradient"
>;

// Han keywords are search terms across Chinese writing systems.
const keywordRules: Record<TopicGraphic, readonly [RegExp, RegExp, RegExp]> = {
  "housing-blocks": [
    /\u7ec4\u5c4b|\u7d44\u5c4b|\u4f4f\u623f|\u516c\u5bd3|\u623f\u5730\u4ea7/u,
    /\b(?:housing|hdb|apartments?|condominiums?|public flats?|homes?)\b/u,
    /\b(?:perumahan|pangsapuri|rumah|kediaman)\b/u,
  ],
  "open-book": [
    /\u4e66|\u66f8|\u9605\u8bfb|\u95b1\u8b80|\u6587\u5b66|\u6587\u5b78/u,
    /\b(?:books?|reading|novels?|literature|librar(?:y|ies))\b/u,
    /\b(?:buku|membaca|bacaan|sastera|perpustakaan)\b/u,
  ],
  "network-nodes": [
    /\u7f51\u7edc|\u7db2\u7d61|\u4e92\u8054\u7f51|\u8fde\u63a5/u,
    /\b(?:networks?|internet|connections?|connectivity)\b/u,
    /\b(?:rangkaian|sambungan|hubungan)\b/u,
  ],
};

export function chooseTopicGraphic(
  keywords: string | readonly string[],
  locale: Locale,
): TopicGraphic | null {
  const text = (typeof keywords === "string" ? keywords : keywords.join(" "))
    .normalize("NFKC")
    .toLocaleLowerCase(locale);
  for (const [graphic, rules] of Object.entries(keywordRules)) {
    if (rules.some((rule) => rule.test(text))) return graphic as TopicGraphic;
  }
  return null;
}

function tracePolygon(ctx: GraphicContext, points: Path) {
  ctx.beginPath();
  ctx.moveTo(...points[0]);
  for (const point of points.slice(1)) ctx.lineTo(...point);
  ctx.closePath();
}

function polygon(ctx: GraphicContext, points: Path, color: string) {
  tracePolygon(ctx, points);
  ctx.fillStyle = color;
  ctx.fill();
}

function line(ctx: GraphicContext, points: Path, color: string, width: number) {
  ctx.beginPath();
  ctx.moveTo(...points[0]);
  for (const point of points.slice(1)) ctx.lineTo(...point);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.stroke();
}

function ellipse(
  ctx: GraphicContext,
  x: number,
  y: number,
  rx: number,
  ry: number,
  color: string | CanvasGradient,
) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, 2 * Math.PI);
  ctx.fillStyle = color;
  ctx.fill();
}

function inGraphicBox(ctx: GraphicContext, box: GraphicBox, draw: () => void) {
  const [left, top, right, bottom] = box;
  const scale = Math.min(right - left, bottom - top);
  ctx.save();
  try {
    ctx.translate((left + right - scale) / 2, (top + bottom - scale) / 2);
    ctx.scale(scale, scale);
    draw();
  } finally {
    ctx.restore();
  }
}

function housingBlocks(
  ctx: GraphicContext,
  palette: Palette,
  seed: number,
  reduced: boolean,
) {
  let random = seed >>> 0;
  const towers = [
    {
      x: 0.33,
      y: 0.12,
      w: 0.29,
      h: 0.64,
      accent: palette.hostB,
      rows: 8,
      columns: 4,
    },
    {
      x: 0.64,
      y: 0.29,
      w: 0.22,
      h: 0.5,
      accent: palette.hostA,
      rows: 6,
      columns: 3,
    },
    {
      x: 0.08,
      y: 0.38,
      w: 0.31,
      h: 0.46,
      accent: palette.hostA,
      rows: 5,
      columns: 4,
    },
  ];
  ellipse(ctx, 0.51, 0.84, 0.45, 0.055, palette.track + "35");
  for (const { x, y, w, h, accent, rows, columns } of towers) {
    const depth = 0.074;
    const rise = 0.05;
    polygon(
      ctx,
      [
        [x, y],
        [x + depth, y - rise],
        [x + w + depth, y - rise],
        [x + w, y],
      ],
      accent + "9C",
    );
    polygon(
      ctx,
      [
        [x + w, y],
        [x + w + depth, y - rise],
        [x + w + depth, y + h - rise],
        [x + w, y + h],
      ],
      accent + "50",
    );
    ctx.fillStyle = palette.plate;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = accent + "44";
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = accent;
    ctx.fillRect(x, y, w, 0.014);
    const stepX = w / (columns + 0.35);
    const stepY = (h - 0.065) / rows;
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        random = (Math.imul(1664525, random) + 1013904223) >>> 0;
        const lit = random >>> 24 < 146;
        ctx.fillStyle = lit ? accent : palette.plate;
        ctx.fillRect(
          x + stepX * (0.41 + column),
          y + 0.046 + row * stepY,
          stepX * 0.53,
          stepY * 0.49,
        );
      }
      if (!reduced) {
        ctx.fillStyle = palette.plate + "65";
        ctx.fillRect(
          x + w + 0.022,
          y + 0.027 + row * stepY,
          0.032,
          stepY * 0.39,
        );
      }
    }
  }
}

function openBook(ctx: GraphicContext, palette: Palette, reduced: boolean) {
  ellipse(ctx, 0.5, 0.77, 0.43, 0.07, palette.track + "32");
  polygon(
    ctx,
    [
      [0.13, 0.32],
      [0.47, 0.39],
      [0.53, 0.39],
      [0.87, 0.32],
      [0.95, 0.74],
      [0.54, 0.84],
      [0.46, 0.84],
      [0.05, 0.74],
    ],
    palette.hostB + "AD",
  );
  for (const side of [-1, 1]) {
    const outer = 0.5 + side * 0.36;
    const inner = 0.5 + side * 0.02;
    ctx.beginPath();
    ctx.moveTo(inner, 0.39);
    ctx.bezierCurveTo(
      0.5 + side * 0.16,
      0.25,
      0.5 + side * 0.28,
      0.3,
      outer,
      0.25,
    );
    ctx.lineTo(outer + side * 0.057, 0.694);
    ctx.bezierCurveTo(
      0.5 + side * 0.27,
      0.72,
      0.5 + side * 0.11,
      0.7,
      inner,
      0.79,
    );
    ctx.closePath();
    ctx.fillStyle = side < 0 ? palette.hostA : palette.hostB;
    ctx.fill();
    for (let index = 0; index < (reduced ? 2 : 4); index++) {
      const y = 0.44 + index * 0.057;
      line(
        ctx,
        [
          [0.5 + side * 0.089, y + 0.018],
          [0.5 + side * 0.214, y - 0.03],
          [0.5 + side * 0.301, y - 0.042],
        ],
        palette.plate + "95",
        0.011,
      );
    }
  }
  line(
    ctx,
    [
      [0.5, 0.404],
      [0.5, 0.77],
    ],
    palette.plate,
    0.008,
  );
}

function networkNodes(ctx: GraphicContext, palette: Palette) {
  const nodes: Path = [
    [0.49, 0.49],
    [0.17, 0.34],
    [0.54, 0.15],
    [0.86, 0.36],
    [0.77, 0.76],
    [0.32, 0.81],
  ];
  ellipse(ctx, 0.5, 0.5, 0.42, 0.42, palette.track + "26");
  for (const [from, to] of [
    [0, 1],
    [0, 2],
    [0, 3],
    [0, 4],
    [0, 5],
    [1, 5],
    [2, 3],
    [4, 5],
  ]) {
    line(ctx, [nodes[from], nodes[to]], palette.hostB + "AC", 0.013);
  }
  for (const [index, [x, y]] of nodes.entries()) {
    const radius = index === 0 ? 0.104 : 0.061;
    ellipse(ctx, x, y, radius + 0.02, radius + 0.02, palette.plate);
    ellipse(
      ctx,
      x,
      y,
      radius,
      radius,
      index % 2 ? palette.hostB : palette.hostA,
    );
  }
}

export function drawTopicGraphic(
  ctx: GraphicContext,
  graphic: TopicGraphic,
  box: GraphicBox,
  palette: Palette,
  seed: number,
  reduced = false,
) {
  inGraphicBox(ctx, box, () => {
    switch (graphic) {
      case "housing-blocks":
        housingBlocks(ctx, palette, seed, reduced);
        break;
      case "open-book":
        openBook(ctx, palette, reduced);
        break;
      case "network-nodes":
        networkNodes(ctx, palette);
        break;
    }
  });
}

function orbBand(
  ctx: GraphicContext,
  x: number,
  y: number,
  r: number,
  color: string,
  width: number,
) {
  ctx.beginPath();
  ctx.moveTo(x - r, y - r * 0.24);
  ctx.bezierCurveTo(
    x - r * 0.52,
    y + r * 0.38,
    x + r * 0.5,
    y + r * 0.28,
    x + r,
    y - r * 0.24,
  );
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

export function drawHostPair(
  ctx: GraphicContext,
  box: GraphicBox,
  palette: Palette,
  reduced = false,
) {
  inGraphicBox(ctx, box, () => {
    const ax = 0.272,
      ay = 0.456,
      ar = 0.22;
    const bx = 0.715,
      by = 0.523,
      br = 0.231;
    ellipse(ctx, 0.5, 0.791, 0.43, 0.054, palette.track + "40");

    let smooth: string | CanvasGradient = palette.hostA;
    if (!reduced) {
      const light = ctx.createRadialGradient(
        ax - ar * 0.33,
        ay - ar * 0.42,
        0,
        ax,
        ay,
        ar * 1.14,
      );
      // The local highlights share their host's hue and work in the light palette.
      light.addColorStop(0, palette.ink);
      light.addColorStop(0.38, palette.hostA);
      light.addColorStop(0.82, palette.hostA);
      light.addColorStop(1, palette.plate);
      smooth = light;
    }
    ellipse(ctx, ax, ay, ar, ar, smooth);
    ctx.save();
    ctx.clip();
    orbBand(ctx, ax, ay + ar * 0.1, ar, palette.plate, 0.021);
    ctx.restore();

    const contour: Path = [
      [bx - br * 0.48, by - br * 0.91],
      [bx + br * 0.38, by - br],
      [bx + br * 0.91, by - br * 0.49],
      [bx + br, by + br * 0.26],
      [bx + br * 0.46, by + br * 0.86],
      [bx - br * 0.25, by + br],
      [bx - br * 0.88, by + br * 0.57],
      [bx - br, by - br * 0.22],
    ];
    polygon(ctx, contour, palette.hostB);
    const facet: Point = [bx - br * 0.23, by - br * 0.23];
    const facets = ["26", "0D", "24", "55", "47", "20", "12", "36"];
    for (const [index, point] of contour.entries()) {
      const tint = index < 2 || index === 7 ? palette.ink : palette.plate;
      polygon(
        ctx,
        [point, contour[(index + 1) % contour.length], facet],
        tint + facets[index],
      );
    }
    tracePolygon(ctx, contour);
    ctx.clip();
    polygon(
      ctx,
      [
        [bx - br * 0.94, by + br * 0.11],
        [bx - br * 0.33, by + br * 0.3],
        [bx + br * 0.36, by + br * 0.25],
        [bx + br * 0.96, by - br * 0.07],
        [bx + br * 0.98, by + br * 0.03],
        [bx + br * 0.39, by + br * 0.36],
        [bx - br * 0.33, by + br * 0.41],
        [bx - br * 0.92, by + br * 0.22],
      ],
      palette.plate,
    );
    polygon(
      ctx,
      [
        [bx - br * 0.9, by + br * 0.4],
        [bx - br * 0.32, by + br * 0.6],
        [bx + br * 0.41, by + br * 0.55],
        [bx + br * 0.95, by + br * 0.28],
        [bx + br * 0.85, by + br * 0.4],
        [bx + br * 0.42, by + br * 0.66],
        [bx - br * 0.32, by + br * 0.71],
        [bx - br * 0.88, by + br * 0.51],
      ],
      palette.plate,
    );
  });
}
