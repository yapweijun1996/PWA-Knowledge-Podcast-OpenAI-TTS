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
| `coverage-sc-core.txt`, `coverage-sc-l2.txt` | The listed SC characters. The core font also covers printable ASCII. | |
| `OFL-NotoSansSC.txt`, `OFL-NotoSans.txt` | Licence and copyright notices (must ship with the fonts) | |

## Loading and offline cache

`ensureVideoFonts({ texts, signal })` loads the core and Latin faces and requests
the level-2 face only when the text needs it. It registers the weight range
600–800 with the document or worker font set and awaits `fonts.ready`. Each
font set shares successful loads, including concurrent calls. An aborted caller
stops waiting while any shared load can still finish. A failed load can be
retried during a later preflight.

`missingCharacters(texts)` checks the bundled coverage synchronously. The
loader embeds UTF-8 coverage snapshots as Base64 so native Node imports and
browser preflight both work without a text request or a Vite-only loader.
The asset test compares the snapshots with `public/fonts/`, checks the actual
WOFF2 character maps, and verifies the font sizes and hashes against the
versioned manifest. Regenerate a snapshot with `Buffer.from(coverageText,
"utf8").toString("base64")` when its source list changes.

An uncovered character uses a system fallback and can vary by machine. The
preflight returns its code points in `missingCharacters` with
`font.missingCharacters`. It reports failed faces as `font.shardUnavailable.<id>`
and an unavailable font API as `font.apiUnavailable`. Receipts can retain the
codes. UI consumers should translate them through the message catalogue.

Vite copies all seven files into `fonts/`. The service worker precaches them
under the app base so rare-name exports can load level 2 offline after the
service worker installs. The font files account for **1,775,496 bytes** and the
coverage lists plus licenses add **29,423 bytes**, for **1,804,919 bytes** of
asset payload per release cache, about **1.72 MiB**. The private worker package
includes them and serves WOFF2 as `font/woff2` under the existing `font-src 'self'`
CSP. The supplied level-2 asset is about 801 KiB. Resharding it to satisfy the
design spec's 256 KiB per-shard budget is separate asset work.

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
