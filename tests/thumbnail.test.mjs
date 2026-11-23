import assert from "node:assert/strict";
import test from "node:test";
import { createTranslator } from "../src/i18n/index.ts";
import { buildPublishPackage } from "../src/publish/package.ts";
import {
  deriveThumbnailHeadline,
  drawThumbnail,
  encodeThumbnail,
  ensureThumbnailContrast,
  resolveThumbnailVariant,
  thumbnailByteLimit,
  thumbnailChecks,
  thumbnailContrastRatio,
  thumbnailHeadlineErrors,
  thumbnailSize,
  ThumbnailError,
  validateThumbnailHeadline,
} from "../src/publish/thumbnail.ts";
import {
  chooseTopicGraphic,
  drawHostPair,
  drawTopicGraphic,
} from "../src/publish/topic-graphics.ts";
import { palettes } from "../src/video/design/palettes.ts";

function recordingContext({ hanEm = 1, latinEm = 0.55, xHeightEm = 0.536 } = {}) {
  const calls = [];
  const states = [];
  let transform = [1, 1, 0, 0];
  let path;

  function bounds(old, [x, y, right, bottom]) {
    const [sx, sy, tx, ty] = transform;
    return [
      Math.min(old[0], x * sx + tx),
      Math.min(old[1], y * sy + ty),
      Math.max(old[2], right * sx + tx),
      Math.max(old[3], bottom * sy + ty),
    ];
  }
  function gradient(kind, coords) {
    const colors = [];
    calls.push([kind, coords, colors]);
    return { colors, addColorStop: (...stop) => colors.push(stop) };
  }
  return {
    calls,
    save() {
      states.push(transform);
    },
    restore() {
      transform = states.pop();
    },
    translate(x, y) {
      const [sx, sy, tx, ty] = transform;
      transform = [sx, sy, tx + sx * x, ty + sy * y];
    },
    scale(x, y) {
      const [sx, sy, tx, ty] = transform;
      transform = [sx * x, sy * y, tx, ty];
    },
    beginPath() {
      path = [Infinity, Infinity, -Infinity, -Infinity];
    },
    moveTo(x, y) {
      path = bounds(path, [x, y, x, y]);
    },
    lineTo(x, y) {
      this.moveTo(x, y);
    },
    bezierCurveTo(x1, y1, x2, y2, x, y) {
      this.moveTo(x1, y1);
      this.moveTo(x2, y2);
      this.moveTo(x, y);
    },
    ellipse(x, y, rx, ry) {
      path = bounds(path, [x - rx, y - ry, x + rx, y + ry]);
    },
    closePath() {},
    clip() {
      calls.push(["clip", path]);
    },
    fill() {
      calls.push(["paint", this.fillStyle, path]);
    },
    stroke() {
      const [sx, sy] = transform;
      const deltaX = (this.lineWidth * sx) / 2;
      const deltaY = (this.lineWidth * sy) / 2;
      const [x, y, right, bottom] = path;
      calls.push([
        "paint",
        this.strokeStyle,
        [x - deltaX, y - deltaY, right + deltaX, bottom + deltaY],
      ]);
    },
    fillRect(x, y, w, h) {
      calls.push([
        "paint",
        this.fillStyle,
        bounds(
          [Infinity, Infinity, -Infinity, -Infinity],
          [x, y, x + w, y + h],
        ),
      ]);
    },
    fillText(text, x, y) {
      const {
        actualBoundingBoxLeft,
        actualBoundingBoxRight,
        actualBoundingBoxAscent,
        actualBoundingBoxDescent,
      } = this.measureText(text);
      calls.push([
        "text",
        text,
        this.font,
        this.fillStyle,
        [
          x - actualBoundingBoxLeft,
          y - actualBoundingBoxAscent,
          x + actualBoundingBoxRight,
          y + actualBoundingBoxDescent,
        ],
      ]);
    },
    measureText(text) {
      const size = Number(this.font?.match(/([\d.]+)px/u)?.[1] ?? 20);
      const width = Array.from(text).reduce((total, char) => {
        if (/\p{M}/u.test(char)) return total;
        return (
          total +
          size * (/[\p{Script=Han}，。？]/u.test(char) ? hanEm : latinEm)
        );
      }, 0);
      return {
        width,
        actualBoundingBoxLeft: 1,
        actualBoundingBoxRight: width,
        actualBoundingBoxAscent: size * (text === "x" ? xHeightEm : 0.8),
        actualBoundingBoxDescent: text === "x" ? 0 : size * 0.12,
      };
    },
    createLinearGradient(...args) {
      return gradient("linear", args);
    },
    createRadialGradient(...args) {
      return gradient("radial", args);
    },
  };
}

const textBounds = {
  "topic-graphic": [80, 155, 755, 540],
  "host-pair": [80, 155, 734, 540],
  headline: [80, 150, 1160, 530],
};
const graphicBounds = {
  "topic-graphic": [800, 112, 1190, 530],
  "host-pair": [768, 120, 1188, 535],
};

function inside([x, y, right, bottom], box) {
  return x >= box[0] && y >= box[1] && right <= box[2] && bottom <= box[3];
}

test("places actual text and all key ink inside the variant, inset and badge bounds", () => {
  assert.deepEqual(thumbnailSize, { width: 1280, height: 720 });
  const headline = "住房邻里如何共享资源";
  for (const [variant, paletteId] of [
    ["topic-graphic", "sunset"],
    ["host-pair", "ocean"],
    ["headline", "light"],
  ]) {
    const context = recordingContext();
    const result = drawThumbnail(context, {
      headline,
      language: "zh",
      variant,
      paletteId,
    });
    assert.equal(result.variant, variant);
    assert.equal(result.headline, headline);
    assert.equal(result.lines.join(""), headline);
    assert.equal(result.lines.length, 2);
    assert.equal(result.fontSize, 0.136 * 720);

    const text = context.calls.filter(([kind]) => kind === "text");
    const [[, , markFont, markColor, markBounds], ...headlines] = text;
    assert.equal(markBounds[0], 80);
    assert.equal(markBounds[1], 72);
    assert.match(markFont, /^600 15\.84px/u);
    assert.equal(markColor, palettes[paletteId].secondaryInk);
    for (const [, , font, color, box] of headlines) {
      assert.match(font, /^800 97\.92px/u);
      assert.equal(color, palettes[paletteId].ink);
      assert.ok(
        inside(box, textBounds[variant]),
        JSON.stringify({ variant, box }),
      );
    }

    const [background, ...keyInk] = context.calls.filter(
      ([kind]) => kind === "paint",
    );
    assert.deepEqual(background[2], [0, 0, 1280, 720]);
    for (const box of [
      ...keyInk.map((paint) => paint[2]),
      ...text.map((draw) => draw[4]),
    ]) {
      assert.ok(inside(box, [80, 72, 1200, 648]));
      assert.ok(box[2] <= 0.79 * 1280 || box[3] <= 0.78 * 720);
    }
    for (const [, , box] of keyInk)
      assert.ok(inside(box, graphicBounds[variant] ?? textBounds[variant]));
    if (variant === "headline") {
      assert.equal(keyInk.length, 1);
      assert.equal(keyInk[0][2][1], 0.33 * 720);
      assert.equal(keyInk[0][2][3], (0.33 * 720) + (0.009 * 720));
      assert.ok(headlines[0][4][1] - keyInk[0][2][3] >= 21.5);
    }

    const { layoutMetadata } = result;
    assert.deepEqual(layoutMetadata.wordmarkBounds, markBounds);
    assert.deepEqual(layoutMetadata.headlineBounds, headlines.map((draw) => draw[4]));
    const checks = thumbnailChecks(layoutMetadata);
    assert.equal(checks.bounds, true);
    assert.equal(checks.contrast.passed, true);
    assert.equal(checks.badgeClearance, true);
    assert.equal(checks.inkHeight160x90.minimum, 8);
    assert.ok(checks.inkHeight160x90.pixels >= 8);
    assert.equal(checks.inkHeight160x90.passed, true);
  }
});

test("scores actual Latin x-height, low contrast, overflowing ink and badge collisions", () => {
  const context = recordingContext();
  const { layoutMetadata, fontSize } = drawThumbnail(context, {
    headline: "Homes build trust",
    language: "en",
    variant: "headline",
  });
  assert.deepEqual(thumbnailChecks(layoutMetadata).inkHeight160x90, {
    pixels: fontSize * 0.536 / 8,
    minimum: 6,
    passed: true,
  });
  const collision = thumbnailChecks({
    ...layoutMetadata,
    decorationBounds: [1020, 570, 1180, 630],
    backdropColors: [layoutMetadata.headlineInk],
    inkHeight: 47,
  });
  assert.deepEqual(collision, {
    bounds: false,
    contrast: { ratio: 1, passed: false },
    badgeClearance: false,
    inkHeight160x90: { pixels: 5.875, minimum: 6, passed: false },
  });
  assert.deepEqual(thumbnailChecks({ ...layoutMetadata, inkHeight: null }).inkHeight160x90, {
    pixels: null,
    minimum: 6,
    passed: false,
  });
});

test("keeps both host silhouettes inside their art box with a 16–24 px gap", () => {
  const context = recordingContext();
  drawHostPair(context, graphicBounds["host-pair"], palettes.aurora, true);
  const paints = context.calls.filter(([kind]) => kind === "paint");
  const [, , a] = paints.find(([, color]) => color === palettes.aurora.hostA);
  const [, , b] = paints.find(([, color]) => color === palettes.aurora.hostB);
  const gap = b[0] - a[2];
  assert.ok(gap >= 16 && gap <= 24, `Silhouette gap: ${gap}px`);
  for (const box of [a, b]) {
    assert.ok(inside(box, graphicBounds["host-pair"]));
    assert.ok((box[2] - box[0]) / 8 >= 22);
    assert.ok((box[3] - box[1]) / 8 >= 22);
  }
});

test("balances the six, six and eight character line limits without an orphan", () => {
  for (const variant of ["topic-graphic", "host-pair", "headline"]) {
    const size = variant === "headline" ? 8 : 6;
    const context = recordingContext({ hanEm: 0.7 });
    const prefix = "天地玄黄宇宙洪荒";
    const options = { variant, locale: "zh-CN", topicGraphic: "open-book" };
    const fits = drawThumbnail(context, {
      ...options,
      headline: prefix.slice(0, size),
    });
    assert.deepEqual(fits.lines, [prefix.slice(0, size)]);
    const oneOver = prefix.slice(0, size) + "日";
    const wrapped = drawThumbnail(context, { ...options, headline: oneOver });
    assert.equal(wrapped.lines.join(""), oneOver);
    assert.equal(wrapped.lines.length, 2);
    assert.ok(
      wrapped.lines.every((line) => line.length >= 2 && line.length <= size),
    );
  }
});

test("tries the exact minimum size and reports a shorter headline when it cannot fit", () => {
  const options = {
    headline: "住房邻里如何共享资源天地",
    language: "zh",
    variant: "host-pair",
  };
  const atMinimum = drawThumbnail(recordingContext({ hanEm: 1.27 }), options);
  assert.equal(atMinimum.fontSize, 0.119 * 720);
  assert.equal(atMinimum.lines.join(""), options.headline);

  const context = recordingContext({ hanEm: 1.45 });
  const result = drawThumbnail(context, options);
  assert.equal(result.error, thumbnailHeadlineErrors.needsShorterHeadline);
  assert.equal(result.needsShorterHeadline, true);
  assert.equal(context.calls.filter(([kind]) => kind === "text").length, 1);
});

test("validates headline limits as words and graphemes in Chinese, English and Malay", () => {
  const valid = validateThumbnailHeadline;
  const errors = thumbnailHeadlineErrors;
  assert.deepEqual(valid("  组屋如何混居 ", "zh-CN"), {
    value: "组屋如何混居",
  });
  assert.equal(valid("组屋混居", "zh-CN").error, errors.cjkTooShort);
  assert.equal(
    valid("住房邻里如何共享资源天地人", "zh-CN").error,
    errors.cjkTooLong,
  );
  assert.deepEqual(valid("𠮷𠮷𠮷𠮷𠮷𠮷", "zh-CN"), { value: "𠮷𠮷𠮷𠮷𠮷𠮷" });
  assert.equal(valid("Housing", "en").error, errors.latinTooShort);
  assert.equal(
    valid("How we make a good home", "en").error,
    errors.latinTooLong,
  );
  assert.equal(
    valid("we make a better home", "en").value,
    "we make a better home",
  );
  const malay = "Kejiranan harmoni untuk komuniti";
  assert.equal(valid(malay, "en").error, errors.latinTooLong);
  assert.equal(valid(malay, "ms").value, malay);
  assert.equal(valid(malay + " ini", "ms").error, errors.latinTooLong);
  assert.equal(valid(`Café ${"é".repeat(25)}`, "en").error, undefined);
  assert.equal(valid("   ", "en").error, errors.empty);
  for (const text of [
    "<b>Public Housing</b>",
    "A &#65; headline",
    "Two\nlines",
    "Invisible\u202E text",
    "Private\u0000 label",
  ]) {
    assert.equal(valid(text, "en").error, errors.invalid);
  }
});

test("prefers a complete title claim and keeps the approved topic-graphic headline", () => {
  const housingTitle = "组屋里的混居，是怎么被设计出来的";
  assert.equal(deriveThumbnailHeadline(housingTitle, "zh-CN", false), "组屋如何混居");
  for (const [variant, expected] of [
    ["topic-graphic", "组屋如何混居"],
    ["headline", "组屋混居并非偶然"],
  ]) {
    assert.equal(drawThumbnail(recordingContext(), {
      title: housingTitle,
      language: "zh",
      variant,
    }).headline, expected);
  }
  for (const [title, locale, expected] of [
    [housingTitle, "zh-CN", "组屋混居并非偶然"],
    ["邻里如何建立信任？共享空间让居民更亲近", "zh-CN", "共享空间让居民更亲近"],
    ["Housing: Homes build trust", "en", "Homes build trust"],
    ["Can housing build trust? Shared spaces change lives", "en", "Shared spaces change lives"],
    ["Dasar perumahan: Ruang bersama membina komuniti", "ms", "Ruang bersama membina komuniti"],
    [
      "邻里怎样共享空间，来自不同社区的居民参与调查",
      "zh-CN",
      "邻里怎样共享空间",
    ],
    [
      "The case for public housing: designing neighbourhoods for the next century",
      "en",
      "The case for public housing",
    ],
    [
      "Kejiranan harmoni untuk komuniti — Bagaimana reka bentuk mengubah cara kita hidup",
      "ms",
      "Kejiranan harmoni untuk komuniti",
    ],
    [
      "Thinking carefully about how public buildings shape our neighbourhoods",
      "en",
      "Thinking carefully about how",
    ],
    ["<b>Shared Places</b>\t", "en", "Shared Places"],
  ]) {
    assert.equal(deriveThumbnailHeadline(title, locale), expected);
  }
  assert.equal(deriveThumbnailHeadline("Housing", "en"), null);
  for (const locale of ["en", "zh-CN", "ms"]) {
    assert.ok(
      validateThumbnailHeadline(deriveThumbnailHeadline("", locale), locale)
        .value,
    );
  }
});

test("all variants default to the video palette and follow the episode wordmark language", () => {
  for (const variant of ["topic-graphic", "host-pair", "headline"]) {
    for (const [language, locale, expected] of [
      ["zh", "en", "播客工作室"],
      ["en", "ms", "Podcast Studio"],
      ["ms", "zh-CN", "Studio Podkes"],
      ["sg", "zh-CN", "Podcast Studio"],
      [undefined, "ms", "Studio Podkes"],
    ]) {
      const context = recordingContext();
      const result = drawThumbnail(context, {
        variant,
        topicGraphic: "open-book",
        headline: "Shared Spaces",
        language,
        locale,
      });
      assert.equal(result.variant, variant);
      assert.equal(context.calls.find(([kind]) => kind === "text")[1], expected);
      assert.equal(
        result.layoutMetadata.backdropColors[0].toLowerCase(),
        palettes.aurora.stops[0].toLowerCase(),
      );
    }
  }
});

test("chooses a localized topic motif or the host-pair fallback, with override", () => {
  for (const [keywords, locale, graphic] of [
    ["组屋里的混居", "zh-CN", "housing-blocks"],
    ["Housing policy", "en", "housing-blocks"],
    ["Hidup di rumah pangsa", "ms", "housing-blocks"],
    ["一本好书", "zh-CN", "open-book"],
    ["How books circulate", "en", "open-book"],
    ["Buku dan bacaan", "ms", "open-book"],
    ["城市网络", "zh-CN", "network-nodes"],
    ["Reliable networks", "en", "network-nodes"],
    [["Komuniti", "rangkaian"], "ms", "network-nodes"],
    ["Notebook storage", "en", null],
  ]) {
    assert.equal(chooseTopicGraphic(keywords, locale), graphic);
  }
  assert.deepEqual(resolveThumbnailVariant({ title: "Housing policy" }), {
    variant: "topic-graphic",
    graphic: "housing-blocks",
  });
  assert.equal(
    resolveThumbnailVariant({ title: "Our history" }).variant,
    "host-pair",
  );
  assert.equal(
    resolveThumbnailVariant({ title: "Our history", variant: "topic-graphic" })
      .variant,
    "host-pair",
  );
  assert.equal(
    resolveThumbnailVariant({ title: "Housing policy", variant: "headline" })
      .variant,
    "headline",
  );
});

test("draws repeatable topic graphics with seed-dependent window lighting", () => {
  function record(graphic, seed) {
    const context = recordingContext();
    drawTopicGraphic(
      context,
      graphic,
      [800, 112, 1190, 530],
      palettes.aurora,
      seed,
    );
    return context.calls;
  }
  for (const graphic of ["housing-blocks", "open-book", "network-nodes"]) {
    assert.deepEqual(record(graphic, 231), record(graphic, 231));
    assert.ok(record(graphic, 231).length > 5);
  }
  const first = record("housing-blocks", 231);
  const shifted = record("housing-blocks", 232);
  assert.notDeepEqual(first, shifted);
  assert.deepEqual(
    first.map((call) => call[2]),
    shifted.map((call) => call[2]),
  );
});

test("composites weak colours to 4.5:1 and keeps all palette gradient samples legible", () => {
  assert.equal(thumbnailContrastRatio("#000000", "#FFFFFF"), 21);
  for (const [ink, backdrop] of [
    ["#F5F7FC", "#AFADAC"],
    ["#172238", "#463A43"],
    ["#777777", "#777777"],
  ]) {
    assert.ok(thumbnailContrastRatio(ink, backdrop) < 4.5);
    assert.ok(
      thumbnailContrastRatio(ink, ensureThumbnailContrast(ink, backdrop)) >=
        4.5,
    );
  }
  for (const [paletteId, palette] of Object.entries(palettes)) {
    const context = recordingContext();
    drawThumbnail(context, {
      headline: "A Shared Future",
      variant: "headline",
      paletteId,
    });
    const gradient = context.calls.find(([kind]) => kind === "linear");
    assert.deepEqual(gradient[1], [0, 0, 1280, 0]);
    const samples = gradient[2];
    assert.deepEqual(
      samples
        .filter(([offset]) => [0, 0.55, 1].includes(offset))
        .map(([offset, color]) => [offset, color.toLowerCase()]),
      palette.stops.map((color, i) => [[0, 0.55, 1][i], color.toLowerCase()]),
    );
    for (const [, background] of samples) {
      assert.ok(thumbnailContrastRatio(palette.ink, background) >= 4.5);
      assert.ok(
        thumbnailContrastRatio(palette.secondaryInk, background) >= 4.5,
      );
    }
  }
});

function fakeCanvas(sizes) {
  const context = recordingContext();
  const encodes = [];
  return {
    context,
    encodes,
    getContext(kind, settings) {
      assert.deepEqual(
        [kind, settings],
        ["2d", { colorSpace: "srgb", alpha: false }],
      );
      assert.deepEqual([this.width, this.height], [1280, 720]);
      return context;
    },
    toBlob(callback, type) {
      assert.equal(type, "image/png");
      encodes.push(context.calls.length);
      const size = sizes[encodes.length - 1];
      callback(
        size == null ? null : new Blob([new Uint8Array(size)], { type }),
      );
    },
  };
}

const mockFonts = async () => ({ notices: [], missingCharacters: [] });

test("inherits the video palette in the publish package and simplifies the PNG once at 2 MB", async () => {
  const canvas = fakeCanvas([thumbnailByteLimit, thumbnailByteLimit - 1]);
  const result = await buildPublishPackage({
    episode: {
      topic: "Public housing",
      language: "en",
      script: { title: "The long upload title" },
    },
    plan: { chapters: [], estimated: true, paletteId: "sunset" },
    thumbnail: {
      variant: "headline",
      headline: "Homes for Everyone",
    },
    thumbnailCanvas: canvas,
    loadThumbnailFonts: async ({ texts }) => {
      assert.deepEqual(texts, ["Homes for Everyone", "Podcast Studio", "Podcast Studio"]);
      return mockFonts();
    },
  });
  const png = result.files.find(({ name }) => name === "thumbnail.png");
  assert.equal(png.blob.size, thumbnailByteLimit - 1);
  assert.equal(canvas.encodes.length, 2);
  const calls = canvas.context.calls;
  assert.equal(calls.filter(([kind]) => kind === "linear").length, 1);
  assert.deepEqual(
    calls.filter(([kind, , box]) => kind === "paint" && box[2] === 1280).at(-1),
    ["paint", palettes.sunset.stops[1], [0, 0, 1280, 720]],
  );
  assert.deepEqual(
    calls
      .filter(
        ([kind, , , color]) => kind === "text" && color === palettes.sunset.ink,
      )
      .map((call) => call[1]),
    ["Homes for Everyone", "Homes for Everyone"],
  );
  assert.equal(
    result.files.find(({ name }) => name === "title.txt").text,
    "The long upload title",
  );
  assert.match(
    result.files.find(({ name }) => name === "checklist.md").text,
    /版式：主标题。.*\n.*9:16/u,
  );
});

test("rejects oversized, failed, invalid and missing-glyph thumbnails with typed errors", async () => {
  const options = { headline: "Shared Spaces", locale: "en" };
  const isError = (code) => (error) =>
    error instanceof ThumbnailError &&
    error.code === code &&
    error.message === createTranslator("en")(code);
  const tooLarge = fakeCanvas([thumbnailByteLimit, thumbnailByteLimit + 1]);
  await assert.rejects(
    encodeThumbnail(tooLarge, options, mockFonts),
    isError("publish.thumbnail.pngTooLarge"),
  );
  assert.equal(tooLarge.encodes.length, 2);
  await assert.rejects(
    encodeThumbnail(fakeCanvas([null]), options, mockFonts),
    isError("publish.thumbnail.pngEncodingFailed"),
  );
  const invalid = fakeCanvas([]);
  await assert.rejects(
    encodeThumbnail(invalid, { ...options, headline: "Single" }, mockFonts),
    isError(thumbnailHeadlineErrors.latinTooShort),
  );
  assert.equal(invalid.encodes.length, 0);
  await assert.rejects(
    encodeThumbnail(invalid, options, async () => ({
      missingCharacters: ["a"],
      notices: [],
    })),
    isError("publish.thumbnail.fontUnavailable"),
  );
});
