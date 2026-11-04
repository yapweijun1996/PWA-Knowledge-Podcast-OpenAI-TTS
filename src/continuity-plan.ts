export const continuityFixture = [
  "同一场暴雨，五公里外能差多少？有时候，一个街区正下着大雨。",
  "附近的另一个街区却还没开始下。云团的位置和移动方向会影响降雨分布。",
  "要比较两个地点的雨量，需要核对相同时段的官方测站数据。",
] as const;

export type ComparisonSession = {
  project: "A" | "B" | "C";
  texts: string[];
  instructions: string;
};

/** Five sessions and seven responses; reference text is never sent as the spoken input. */
export function continuityPlan(instructions: string): ComparisonSession[] {
  const sessions: ComparisonSession[] = [
    { project: "A", texts: [continuityFixture.join("\n")], instructions },
    { project: "B", texts: [...continuityFixture], instructions },
  ];
  for (let i = 0; i < continuityFixture.length; i++) {
    const before = continuityFixture[i - 1] ?? "（无）";
    const after = continuityFixture[i + 1] ?? "（无）";
    sessions.push({
      project: "C",
      texts: [continuityFixture[i]],
      instructions: `${instructions}\n以下内容仅供语气连贯参考，不要朗读或复述。只朗读用户输入。\n前文：${before}\n后文：${after}`,
    });
  }
  return sessions;
}
