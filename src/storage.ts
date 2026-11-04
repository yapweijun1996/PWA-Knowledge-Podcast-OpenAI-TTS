import { openDB } from "idb";
import type { Project } from "./model";
const db = openDB("knowledge-podcast-studio", 1, {
  upgrade(db) {
    db.createObjectStore("projects", { keyPath: "id" });
  },
});
export async function allProjects(): Promise<Project[]> {
  return (await (await db).getAll("projects")).sort(
    (a, b) => b.updated - a.updated,
  );
}
export async function saveProject(p: Project) {
  await (await db).put("projects", p);
}
export async function deleteProject(id: string) {
  await (await db).delete("projects", id);
}
