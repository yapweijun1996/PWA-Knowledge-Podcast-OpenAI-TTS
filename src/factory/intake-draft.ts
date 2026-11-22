import { episodeId, limits } from "../../shared/factory";

export type IntakeDraft = { topic: string; exactHosts?: 2; requestId?: string };
const key = "podcast-studio-intake-v1";

export function readIntakeDraft(): IntakeDraft {
  try {
    const saved = JSON.parse(sessionStorage.getItem(key) ?? "null");
    if (
      typeof saved?.topic === "string" &&
      saved.topic.length <= limits.topic
    ) {
      return {
        topic: saved.topic,
        exactHosts: saved.exactHosts === 2 ? 2 : undefined,
        requestId:
          typeof saved.requestId === "string" && episodeId.test(saved.requestId)
            ? saved.requestId
            : undefined,
      };
    }
  } catch {
    /* Storage may be disabled for this tab. */
  }
  return { topic: "" };
}

export function writeIntakeDraft(draft: IntakeDraft) {
  try {
    if (draft.topic || draft.exactHosts)
      sessionStorage.setItem(key, JSON.stringify(draft));
    else sessionStorage.removeItem(key);
  } catch {
    /* Continue with the in-memory draft when browser storage is unavailable. */
  }
}
