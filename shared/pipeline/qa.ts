import type { Episode, Finished } from "../factory.ts";

export function assessAudio(
  episode: Pick<Episode, "plan" | "research"> & { finished: Finished },
): NonNullable<Finished["qa"]> {
  const { finished, plan } = episode;
  const transcript = finished.transcript;
  const reasons = [];
  if (!transcript) reasons.push("成品尚未独立转录比对。");
  else {
    if (transcript.similarity < 88)
      reasons.push("转录与脚本的字面相似度低于 88%。");
    const numbers = (text: string) =>
      text.normalize("NFKC").match(/[0-9]+(?:[.,][0-9]+)*/g) ?? [];
    const intended = numbers(finished.intendedText);
    const heard = numbers(transcript.text);
    if (intended.length && intended.join("|") !== heard.join("|"))
      reasons.push("转录中的数字写法或顺序有差异。");
  }
  if (
    episode.research?.auditModel &&
    !episode.research.claims.some(
      (claim) =>
        claim.crossCheck === "independent-domains" &&
        claim.status !== "disputed",
    )
  )
    reasons.push("交叉检索未找到无争议的不同域名支持，请查阅来源。");
  if (
    plan &&
    (finished.duration < plan.targetSeconds * 0.72 ||
      finished.duration > plan.targetSeconds * 1.3)
  )
    reasons.push("实际时长偏离计划，请试听。");
  return { status: reasons.length ? "review" : "matched", reasons };
}
