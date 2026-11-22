import { openDB } from "idb";
import type { AudioTake, Project, Segment } from "./model";
import {
  blobStorageFailed,
  encodeStoredAudio,
  readStoredAudio,
  type StoredAudio,
} from "./stored-audio";

type StoredSegment = Omit<Segment, "audio" | "alternative"> & {
  audio?: StoredAudio;
  alternative?: Omit<AudioTake, "audio"> & { audio: StoredAudio };
};
type StoredProject = Omit<Project, "segments"> & { segments: StoredSegment[] };
let useBinaryAudio = false;

const db = openDB("knowledge-podcast-studio", 1, {
  upgrade(db) {
    db.createObjectStore("projects", { keyPath: "id" });
  },
});

export class ProjectConflict extends Error {}
export const projectVersion = (
  p: Pick<Project, "revision" | "updated"> | undefined,
) => (p ? (p.revision ?? `legacy:${p.updated}`) : null);

export async function allProjects(): Promise<Project[]> {
  const projects: StoredProject[] = await (await db).getAll("projects");
  return projects
    .sort((a, b) => b.updated - a.updated)
    .map((project) => ({
      ...project,
      segments: project.segments.map((segment) => ({
        ...segment,
        audio: segment.audio && readStoredAudio(segment.audio),
        alternative: segment.alternative && {
          ...segment.alternative,
          audio: readStoredAudio(segment.alternative.audio),
        },
      })),
    }));
}

async function encodeProjectAudio(project: Project): Promise<StoredProject> {
  const segments = await Promise.all(
    project.segments.map(async (segment) => ({
      ...segment,
      audio: segment.audio && (await encodeStoredAudio(segment.audio)),
      alternative: segment.alternative && {
        ...segment.alternative,
        audio: await encodeStoredAudio(segment.alternative.audio),
      },
    })),
  );
  return { ...project, segments };
}

export async function saveProject(p: Project, expected: string | null) {
  if (useBinaryAudio)
    return writeProject(await encodeProjectAudio(p), expected);
  try {
    await writeProject(p, expected);
  } catch (error) {
    if (!blobStorageFailed(error)) throw error;
    // A competing tab can save while we convert. Recheck the revision in the retry.
    await writeProject(await encodeProjectAudio(p), expected);
    useBinaryAudio = true;
  }
}

async function writeProject(p: StoredProject, expected: string | null) {
  const tx = (await db).transaction("projects", "readwrite");
  const existing = await tx.store.get(p.id);
  if (projectVersion(existing) !== expected) {
    tx.abort();
    await tx.done.catch(() => {});
    throw new ProjectConflict("Project changed in another tab");
  }
  await Promise.all([tx.store.put(p), tx.done]);
}

export async function deleteProject(id: string, expected: string | null) {
  const tx = (await db).transaction("projects", "readwrite");
  const existing = await tx.store.get(id);
  if (projectVersion(existing) !== expected) {
    tx.abort();
    await tx.done.catch(() => {});
    throw new ProjectConflict("Project changed in another tab");
  }
  await tx.store.delete(id);
  await tx.done;
}
