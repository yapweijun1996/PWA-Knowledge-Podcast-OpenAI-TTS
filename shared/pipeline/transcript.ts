import { PublicError } from "./errors.ts";
import type { OpenAI } from "./openai.ts";

const normalize = (text: string) =>
  Array.from(
    text
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]/gu, ""),
  );

export function similarity(intended: string, spoken: string) {
  const a = normalize(intended);
  const b = normalize(spoken);
  if (!a.length || !b.length) return 0;
  const row = Uint16Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = row[j];
      row[j] = Math.min(
        above + 1,
        row[j - 1] + 1,
        diagonal + Number(a[i - 1] !== b[j - 1]),
      );
      diagonal = above;
    }
  }
  return Math.round(100 * (1 - row[b.length] / Math.max(a.length, b.length)));
}

export async function transcribe(
  openai: OpenAI,
  model: string,
  audio: BlobPart,
  intended: string,
  signal: AbortSignal,
) {
  const form = new FormData();
  form.append("model", model);
  form.append("file", new Blob([audio], { type: "audio/wav" }), "episode.wav");
  form.append("response_format", "json");
  const response = (await openai("audio/transcriptions", form, signal)) as
    | { text?: unknown }
    | null;
  const text = typeof response?.text === "string" ? response.text.trim() : "";
  if (!text || text.length > 12_000)
    throw new PublicError(
      "转录为空或超出长度限制。可试听已有音频，或重试转录。",
    );
  return { text, model, similarity: similarity(intended, text) };
}
