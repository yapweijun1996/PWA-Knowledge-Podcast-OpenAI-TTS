import type { Project, Segment, Voice } from "./model";
const voices: Voice[] = ["marin", "cedar", "coral"];
export function createBackup(p: Project): Blob {
  const project = {
    ...p,
    segments: p.segments.map(
      ({
        audio: _,
        audioKind: _kind,
        audioFor: __,
        voice: ___,
        instructions: ____,
        audioVerified: _verified,
        ...segment
      }) => segment,
    ),
  };
  return new Blob(
    [
      JSON.stringify(
        { format: "podcast-studio-project", version: 1, project },
        null,
        2,
      ),
    ],
    { type: "application/json" },
  );
}
/** Restore script and settings only; local generated audio is deliberately excluded. */
export async function readBackup(file: File): Promise<Project> {
  if (file.size > 2_000_000) throw new Error("Backup is too large");
  const data: unknown = JSON.parse(await file.text());
  if (!data || typeof data !== "object") throw new Error("Invalid backup");
  const root = data as Record<string, unknown>,
    p = root.project as Record<string, unknown>;
  if (
    root.format !== "podcast-studio-project" ||
    root.version !== 1 ||
    !p ||
    typeof p !== "object" ||
    typeof p.title !== "string" ||
    p.title.length > 200 ||
    typeof p.language !== "string" ||
    !["zh-CN", "en-US"].includes(p.language) ||
    typeof p.instructions !== "string" ||
    p.instructions.length > 5000 ||
    typeof p.notes !== "string" ||
    p.notes.length > 5000 ||
    !voices.includes(p.voice as Voice) ||
    !Array.isArray(p.segments) ||
    p.segments.length < 1 ||
    p.segments.length > 100
  )
    throw new Error("Invalid backup");
  const segments: Segment[] = p.segments.map((s) => {
    if (
      !s ||
      typeof s !== "object" ||
      typeof s.text !== "string" ||
      s.text.length > 20000
    )
      throw new Error("Invalid segment");
    return { id: crypto.randomUUID(), text: s.text };
  });
  return {
    id: crypto.randomUUID(),
    title: p.title,
    language: p.language,
    voice: p.voice as Voice,
    instructions: p.instructions,
    notes: p.notes,
    segments,
    updated: Date.now(),
  };
}
