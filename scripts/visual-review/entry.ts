// Renders a short Mandarin sample episode with the real renderer and returns decoded frames for review.
// Used by scripts/visual-review/frames.mjs. The synthetic "speech" is seeded, so runs are repeatable.
import { renderVideo } from "../../src/video/render.ts";
import { buildTimeline } from "../../src/video/timeline.ts";
import { readEpisode } from "../../shared/episode-record.ts";
import { drawThumbnail } from "../../src/publish/thumbnail.ts";

const chapters = ["为什么组屋能混居不同族群", "配额怎样影响买卖与转售", "效果与代价并存"];
const lines: [number, "A" | "B", string, number][] = [
  [1, "A", "你有没有想过，为什么新加坡的组屋里，不同族群能比较自然地住在一起？答案不只是大家愿意住，更关键是制度先把这件事情设计好了。", 9],
  [1, "B", "对，而且它不是只讲理念，规则直接落到楼栋和邻里层面，给族群设上限，避免一个区里慢慢变成单一族群聚居区。", 8],
  [2, "A", "那它怎么真的影响买卖呢？二手组屋交易里，如果是混合族群家庭，可以按买家或配偶身份证上的种族来分类。", 8],
  [2, "B", "这就很重要了，因为一旦分类确定，后面卖房时也会沿用这个分类，它不只是登记信息，还会影响之后的配额检查和转售。", 9],
  [3, "A", "从效果看，它有一个很现实的好处：不同族群更容易在同一社区里碰面、打交道，HDB 的说明也和这个方向一致。", 8],
  [3, "B", "但也要看到代价。为了让族群分布保持平衡，政策会限制部分交易选择，对 SPR 家庭来说还要受额外配额约束。", 8],
];
function makeEpisode() {
  const chs = chapters.map((title, i) => ({ id: "chapter-" + (i + 1), title, angle: title, claimIds: [] }));
  const turns = lines.map(([c, host, text], i) => ({ id: "turn-" + (i + 1), chapterId: "chapter-" + c, host, text, claimIds: [] }));
  return readEpisode({ id: "7baa7fc0-fbad-492d-abb7-8896fcd15d3f", topic: "新加坡的组屋为何能容纳不同族群？", revision: 2, updated: "2026-11-23T00:00:00Z", language: "zh",
    voices: { A: "marin", B: "cedar" }, outline: { chapters: chs, model: "fixture" }, script: { title: "组屋里的混居，是怎么被设计出来的", model: "fixture", turns },
    render: { revision: 2, model: "fixture", clips: Object.fromEntries(turns.map((t, i) => [t.id, { asset: "clip-" + String(i).repeat(64) + ".pcm", duration: lines[i][3] }])) } });
}
function speech(durations: number[], sr: number) {
  let seed = 12345; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const parts: Float32Array[] = [];
  durations.forEach((d, k) => {
    const n = Math.round(d * sr); const a = new Float32Array(n); const base = k % 2 ? 150 : 210; const loud = 0.12 + 0.1 * rnd();
    let env = 0;
    for (let i = 0; i < n; i++) { const t = i / sr; const syll = Math.max(0, Math.sin(2 * Math.PI * (3.2 + 0.4 * Math.sin(t))) ) ** 1.5; const word = 0.55 + 0.45 * Math.sin(2 * Math.PI * 0.7 * t + k);
      env += (syll * word - env) * 0.01; a[i] = (Math.sin(2 * Math.PI * base * t) * 0.6 + Math.sin(2 * Math.PI * base * 2 * t) * 0.25 + (rnd() - 0.5) * 0.15) * env * loud * 2.2; }
    parts.push(a);
  });
  const pause = Math.round(0.23 * sr); const total = parts.reduce((s, p) => s + p.length, 0) + pause * (parts.length - 1); const out = new Float32Array(total); let o = 0;
  parts.forEach((p, i) => { out.set(p, o); o += p.length + (i < parts.length - 1 ? pause : 0); }); return out;
}
export async function render(opts: { width: number; height: number; scene: string; frames: number[] }) {
  const ep = makeEpisode(); const sr = 24000;
  const plan = buildTimeline(ep, { resolution: { width: opts.width, height: opts.height } as any, paletteId: "aurora", mood: "calm" } as any);
  const audio = { sampleRate: sr, channels: [speech(lines.map((l) => l[3]), sr)] };
  const t0 = performance.now();
  const { blob, ...receipt } = await renderVideo({ plan, audio, theme: "dark", sceneId: opts.scene } as any);
  const ms = Math.round(performance.now() - t0);
  const url = URL.createObjectURL(blob); const v = document.createElement("video"); v.muted = true; v.src = url; document.body.append(v);
  await new Promise((r) => (v.onloadeddata = r));
  const out: string[] = []; const w = opts.width > opts.height ? 960 : 540; const h = opts.width > opts.height ? 540 : 960;
  for (const t of opts.frames) { await new Promise((r) => { v.onseeked = r; v.currentTime = t; }); const c = document.createElement("canvas"); c.width = w; c.height = h; c.getContext("2d")!.drawImage(v, 0, 0, w, h); out.push(c.toDataURL("image/png")); }
  v.remove(); URL.revokeObjectURL(url);
  return { receipt, mib: Number((blob.size / 1048576).toFixed(2)), ms, frames: out, chapters: plan.chapters, duration: plan.duration };
}
export async function thumbs() {
  const out: string[] = [];
  for (const variant of ["topic-graphic", "host-pair", "headline"] as const) {
    const c = document.createElement("canvas"); c.width = 1280; c.height = 720;
    drawThumbnail(c.getContext("2d") as any, { variant, paletteId: "aurora", title: "组屋里的混居，是怎么被设计出来的", language: "zh", topicKeywords: "组屋 housing" } as any);
    out.push(c.toDataURL("image/png"));
  }
  return out;
}
