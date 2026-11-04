import { openDB } from "idb";
import type { Project } from "./model";

const db = openDB("knowledge-podcast-studio", 1, {
  upgrade(db) {
    db.createObjectStore("projects", { keyPath: "id" });
  },
});

export class ProjectConflict extends Error {}
export const projectVersion = (p: Project | undefined) =>
  p ? (p.revision ?? `legacy:${p.updated}`) : null;

export async function allProjects(): Promise<Project[]> {
  return (await (await db).getAll("projects")).sort(
    (a, b) => b.updated - a.updated,
  );
}

export async function saveProject(p: Project, expected: string | null) {
  const tx = (await db).transaction("projects", "readwrite");
  const existing = await tx.store.get(p.id);
  if (projectVersion(existing) !== expected) {
    tx.abort();
    await tx.done.catch(() => {});
    throw new ProjectConflict("Project changed in another tab");
  }
  await tx.store.put(p);
  await tx.done;
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
