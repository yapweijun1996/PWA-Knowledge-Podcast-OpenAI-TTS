import { PublicError } from "./pipeline/errors.ts";
import {
  activeHosts,
  limits,
  voices,
  type Edit,
  type Episode,
} from "./factory.ts";

export function editEpisode(
  episode: Episode,
  revision: number,
  edit: Edit,
): Episode {
  if (episode.revision !== revision)
    throw new PublicError(
      "另一个标签页已更新脚本，请重新打开后再试。",
      undefined,
      "edit.revisionChanged",
    );
  const available = activeHosts(episode);
  const selected = available.map((host) => edit.voices?.[host]);
  const title = typeof edit.title === "string" ? edit.title.trim() : "";
  if (
    !episode.script ||
    !title ||
    title.length > 100 ||
    !available.length ||
    selected.some((voice) => !voice || !voices.includes(voice)) ||
    new Set(selected).size !== selected.length
  )
    throw new PublicError(
      "请输入标题，并为各位主持选择不同声音。",
      undefined,
      "edit.titleAndVoices",
    );

  const turns = episode.script.turns.map((turn) => {
    const value = edit.texts?.[turn.id];
    const text = typeof value === "string" ? value.trim() : "";
    if (!text || text.length > limits.turn)
      throw new PublicError(
        `每段对话须有 1 至 ${limits.turn} 个字符。`,
        undefined,
        "edit.turnLength",
        { maximum: limits.turn },
      );
    return text === turn.text ? turn : { ...turn, text, edited: true };
  });
  if (turns.reduce((sum, turn) => sum + turn.text.length, 0) > limits.script)
    throw new PublicError(
      `全期脚本最多 ${limits.script} 个字符。`,
      undefined,
      "edit.scriptLength",
      { maximum: String(limits.script) },
    );

  const result = structuredClone(episode);
  const audioChanged =
    turns.some((turn, index) => turn !== episode.script!.turns[index]) ||
    available.some((host) => edit.voices[host] !== episode.voices[host]);
  result.script = { ...episode.script, title, turns };
  result.voices = Object.fromEntries(
    available.map((host) => [host, edit.voices[host]]),
  );
  result.revision++;
  if (audioChanged) delete result.job;
  else {
    if (result.finished?.revision === revision) result.finished.revision++;
    if (result.render?.revision === revision) result.render.revision++;
  }
  return result;
}
