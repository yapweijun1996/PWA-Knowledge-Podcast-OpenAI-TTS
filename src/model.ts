export type Voice = "marin" | "cedar" | "coral";
export type Segment = {
  id: string;
  text: string;
  audio?: Blob;
  audioKind?: "demo" | "openai";
  audioFor?: string;
  voice?: Voice;
  instructions?: string;
};
export type Project = {
  id: string;
  title: string;
  language: string;
  segments: Segment[];
  voice: Voice;
  instructions: string;
  notes: string;
  updated: number;
};
export const presets = {
  Documentary:
    "Speak in a calm, clear documentary style, with measured pacing.",
  Curious: "Speak with warmth and curiosity, with natural pauses.",
  Neutral: "Speak clearly and evenly, without dramatic emphasis.",
};
export const sampleText = [
  "同一场暴雨，五公里外能差多少？有时候，一个街区正下着大雨，附近的另一个街区却还没开始下。",
  "局地对流可能形成范围有限的强降雨，但并不是所有天气系统都如此。云团的位置、移动方向和持续时间，都会影响不同地点的雨量。",
  "雨量通常以毫米表示。一毫米的雨落在一平方米的平面上，体积相当于一升水。这是几何换算，不是一场具体暴雨的测量结果。",
  "要回答五公里外究竟能差多少，我们需要找到距离相近的测站，核对同时段的观测，并说明缺测和测站覆盖的限制。这个比较在本示例中尚未进行。",
  "下一次下雨时，你可以查看官方测站数据，留意时间范围、地点和单位。局部差异值得观察，但我们不能把假设当成实测。",
];
export function makeProject(sample = false): Project {
  return {
    id: crypto.randomUUID(),
    title: sample ? "同一场暴雨，五公里外能差多少？" : "未命名项目",
    language: "zh-CN",
    segments: (sample ? sampleText : [""]).map((text) => ({
      id: crypto.randomUUID(),
      text,
    })),
    voice: "marin",
    instructions: presets.Documentary,
    notes: "",
    updated: Date.now(),
  };
}
export function current(
  s: Segment,
  p: Project,
  kind: "demo" | "openai" = "demo",
) {
  return (
    !!s.audio &&
    (s.audioKind ?? "demo") === kind &&
    s.audioFor === s.text &&
    s.voice === p.voice &&
    s.instructions === p.instructions
  );
}
