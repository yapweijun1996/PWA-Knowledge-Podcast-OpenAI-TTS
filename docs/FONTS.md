# Bundled fonts

Video frames are drawn on a canvas, so the font used is whatever the machine has
unless we bundle one. To make the same episode look the same everywhere, the
renderer uses bundled, subsetted copies of two SIL OFL 1.1 fonts. Design
reasoning: [VISUAL-DESIGN-SPEC.md](VISUAL-DESIGN-SPEC.md) section 3.

| File in `public/fonts/` | Content | Size |
| --- | --- | --- |
| `noto-sans-sc-core-v1.woff2` | Noto Sans SC, weights 600 to 800 (variable `wght`), GB2312 level 1 (3,755 hanzi), CJK and full-width punctuation, digits, ASCII | 904 KiB |
| `noto-sans-sc-l2-v1.woff2` | Same font, GB2312 level 2 (3,008 hanzi), loaded only when a script needs them | 801 KiB |
| `noto-sans-latin-v1.woff2` | Noto Sans, weights 600 to 800, Basic Latin, Latin-1, Latin Extended-A, general punctuation | 29 KiB |
| `coverage-sc-core.txt`, `coverage-sc-l2.txt` | The exact characters each shard contains | |
| `OFL-NotoSansSC.txt`, `OFL-NotoSans.txt` | Licence and copyright notices (must ship with the fonts) | |

Characters outside these shards fall back to the system font; the renderer must
record a notice in the render receipt because those frames are not portable.

## Provenance and how they were made (2026-11-23)

Inputs, downloaded from `github.com/google/fonts` (`ofl/notosanssc`, `ofl/notosans`):

- `NotoSansSC[wght].ttf`, sha256 `a3041811a78c361b1de50f953c805e0244951c21c5bd412f7232ef0d899af0da`
- `NotoSans[wdth,wght].ttf`, sha256 `bfb7bb691513f12e734dc346c03a03f784912432d7e3fa8e56efcf906fe86b3d`

Commands (`fonttools` 4.68.0 with `brotli`; character lists are GB2312 rows decoded
with Python's `gb2312` codec, level 1 = lead bytes 0xB0 to 0xD7):

```sh
fonttools varLib.instancer NotoSansSC.ttf wght=600:800 -o NotoSansSC-600-800.ttf
fonttools varLib.instancer NotoSans.ttf wght=600:800 wdth=100 -o NotoSans-600-800.ttf
pyftsubset NotoSansSC-600-800.ttf --text-file=gb2312_l1.txt --text="<punctuation and digits>" \
  --unicodes="U+0020-007E" --flavor=woff2 --no-hinting \
  --layout-features='kern,locl,vert,vkrn,palt,halt,vpal,vhal' --output-file=noto-sans-sc-core.woff2
pyftsubset NotoSansSC-600-800.ttf --text-file=gb2312_l2.txt --flavor=woff2 --no-hinting \
  --layout-features='' --output-file=noto-sans-sc-l2.woff2
pyftsubset NotoSans-600-800.ttf --unicodes="U+0020-007E,U+00A0-017F,U+2010-2027,U+2030-203A,U+20AC,U+2122,U+2190-2193" \
  --flavor=woff2 --no-hinting --layout-features='kern,liga,calt,locl' --output-file=noto-sans-latin.woff2
```

Checked: the `wght` axis of each subset spans 600 to 800; every character of five
sample strings (Chinese, mixed Chinese and English, Malay with typographic
quotes) is covered by the shards. The fonts are modified subsets; register them
under a distinct family name in code. The font files' reserved font name in the
licence is "Source", which we do not use.
