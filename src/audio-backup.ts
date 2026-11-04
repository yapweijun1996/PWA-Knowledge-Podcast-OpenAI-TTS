import { createBackup, readBackup } from "./backup";
import type {
  AudioProvenance,
  AudioTake,
  Project,
  Segment,
  Voice,
} from "./model";

const MAX_AUDIO_BYTES = 16 * 1024 * 1024;
const MAX_FILE_BYTES = 24 * 1024 * 1024;
const voices: Voice[] = ["marin", "cedar", "coral"];

type EncodedTake = Omit<AudioTake, "audio"> & { audio: string; sha256: string };
type EncodedSegment = { take?: EncodedTake; alternative?: EncodedTake };

async function sha256(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

function encode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 32768)
    binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(binary);
}

function validateWav(bytes: Uint8Array) {
  if (bytes.length < 44) throw new Error("Invalid WAV");
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const name = (offset: number, value: string) =>
    [...value].every((c, i) => bytes[offset + i] === c.charCodeAt(0));
  const rate = v.getUint32(24, true);
  if (
    !name(0, "RIFF") ||
    !name(8, "WAVE") ||
    !name(12, "fmt ") ||
    !name(36, "data") ||
    v.getUint32(4, true) !== bytes.length - 8 ||
    v.getUint32(16, true) !== 16 ||
    v.getUint16(20, true) !== 1 ||
    v.getUint16(22, true) !== 1 ||
    !rate ||
    v.getUint32(28, true) !== rate * 2 ||
    v.getUint16(32, true) !== 2 ||
    v.getUint16(34, true) !== 16 ||
    v.getUint32(40, true) !== bytes.length - 44 ||
    (bytes.length - 44) % 2
  )
    throw new Error("Invalid WAV");
}

function primary(s: Segment): AudioTake | undefined {
  if (!s.audio) return undefined;
  if (
    !s.audioKind ||
    s.audioFor === undefined ||
    !s.voice ||
    s.instructions === undefined
  )
    throw new Error("Audio metadata missing");
  return {
    audio: s.audio,
    audioKind: s.audioKind,
    audioFor: s.audioFor,
    voice: s.voice,
    instructions: s.instructions,
    audioVerified: s.audioVerified,
    provenance: s.provenance,
  };
}

async function encodeTake(take: AudioTake): Promise<EncodedTake> {
  const bytes = await take.audio.arrayBuffer();
  validateWav(new Uint8Array(bytes));
  return {
    audio: encode(new Uint8Array(bytes)),
    sha256: await sha256(bytes),
    audioKind: take.audioKind,
    audioFor: take.audioFor,
    voice: take.voice,
    instructions: take.instructions,
    audioVerified: take.audioVerified,
    provenance: take.provenance && {
      requestedModel: take.provenance.requestedModel,
      requestedInstructions: take.provenance.requestedInstructions,
      effectiveModel: take.provenance.effectiveModel,
      effectiveVoice: take.provenance.effectiveVoice,
    },
  };
}

export async function createAudioBackup(project: Project): Promise<Blob> {
  const total = project.segments.reduce(
    (sum, s) => sum + (s.audio?.size ?? 0) + (s.alternative?.audio.size ?? 0),
    0,
  );
  if (total > MAX_AUDIO_BYTES) throw new Error("Audio backup too large");
  const script = JSON.parse(await createBackup(project).text());
  const segments: EncodedSegment[] = [];
  for (const segment of project.segments) {
    const take = primary(segment);
    if (!take && segment.alternative)
      throw new Error("Alternative has no primary take");
    segments.push({
      take: take && (await encodeTake(take)),
      alternative:
        segment.alternative && (await encodeTake(segment.alternative)),
    });
  }
  const backup = new Blob(
    [
      JSON.stringify({
        format: "podcast-studio-audio-backup",
        version: 1,
        project: script.project,
        segments,
      }),
    ],
    { type: "application/json" },
  );
  if (backup.size > MAX_FILE_BYTES) throw new Error("Backup too large");
  return backup;
}

function provenance(value: unknown): AudioProvenance | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object")
    throw new Error("Invalid provenance");
  const p = value as Record<string, unknown>;
  if (
    typeof p.requestedModel !== "string" ||
    !/^gpt-realtime-[a-z0-9.-]{1,64}$/.test(p.requestedModel) ||
    (p.requestedInstructions !== undefined &&
      (typeof p.requestedInstructions !== "string" ||
        p.requestedInstructions.length > 5200)) ||
    (p.effectiveModel !== undefined &&
      (typeof p.effectiveModel !== "string" ||
        !/^gpt-realtime-[a-z0-9.-]{1,64}$/.test(p.effectiveModel))) ||
    (p.effectiveVoice !== undefined &&
      (typeof p.effectiveVoice !== "string" ||
        !/^[a-z]{1,32}$/.test(p.effectiveVoice)))
  )
    throw new Error("Invalid provenance");
  return {
    requestedModel: p.requestedModel,
    requestedInstructions: p.requestedInstructions as string | undefined,
    effectiveModel: p.effectiveModel as string | undefined,
    effectiveVoice: p.effectiveVoice as string | undefined,
  };
}

async function decodeTake(
  value: unknown,
  budget: { bytes: number },
): Promise<AudioTake | undefined> {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object") throw new Error("Invalid take");
  const t = value as Record<string, unknown>;
  if (
    typeof t.audio !== "string" ||
    t.audio.length > Math.ceil(MAX_AUDIO_BYTES / 3) * 4 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(t.audio) ||
    typeof t.sha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(t.sha256) ||
    (t.audioKind !== "demo" && t.audioKind !== "openai") ||
    typeof t.audioFor !== "string" ||
    t.audioFor.length > 20000 ||
    !voices.includes(t.voice as Voice) ||
    typeof t.instructions !== "string" ||
    t.instructions.length > 5000 ||
    (t.audioVerified !== undefined && typeof t.audioVerified !== "boolean")
  )
    throw new Error("Invalid take");
  const raw = atob(t.audio);
  budget.bytes += raw.length;
  if (budget.bytes > MAX_AUDIO_BYTES) throw new Error("Audio backup too large");
  const bytes = Uint8Array.from(raw, (char) => char.charCodeAt(0));
  validateWav(bytes);
  if ((await sha256(bytes.buffer)) !== t.sha256)
    throw new Error("Audio checksum mismatch");
  return {
    audio: new Blob([bytes], { type: "audio/wav" }),
    audioKind: t.audioKind,
    audioFor: t.audioFor,
    voice: t.voice as Voice,
    instructions: t.instructions,
    audioVerified: t.audioVerified as boolean | undefined,
    provenance: provenance(t.provenance),
  };
}

export async function readAudioBackup(file: File): Promise<Project> {
  if (file.size > MAX_FILE_BYTES) throw new Error("Backup too large");
  const root: unknown = JSON.parse(await file.text());
  if (!root || typeof root !== "object") throw new Error("Invalid backup");
  const data = root as Record<string, unknown>;
  if (
    data.format !== "podcast-studio-audio-backup" ||
    data.version !== 1 ||
    !Array.isArray(data.segments)
  )
    throw new Error("Invalid backup");
  const scriptFile = new File(
    [
      JSON.stringify({
        format: "podcast-studio-project",
        version: 1,
        project: data.project,
      }),
    ],
    "script.json",
    { type: "application/json" },
  );
  const project = await readBackup(scriptFile);
  if (data.segments.length !== project.segments.length)
    throw new Error("Invalid segment count");
  const budget = { bytes: 0 };
  for (let i = 0; i < project.segments.length; i++) {
    const value: unknown = data.segments[i];
    if (!value || typeof value !== "object") throw new Error("Invalid segment");
    const record = value as Record<string, unknown>;
    const take = await decodeTake(record.take, budget);
    const alternative = await decodeTake(record.alternative, budget);
    if (alternative && !take)
      throw new Error("Alternative has no primary take");
    project.segments[i] = { ...project.segments[i], ...take, alternative };
  }
  return project;
}
