import { closeSync, openSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

export function lockWorkerDirectory(root) {
  // The OS releases this SQLite write lock even after SIGKILL. A PID file can go stale.
  const path = join(root, ".worker-lock.sqlite");
  closeSync(openSync(path, "a", 0o600));
  const lock = new DatabaseSync(path);
  try {
    lock.exec("BEGIN IMMEDIATE");
    return lock;
  } catch (error) {
    lock.close();
    if (error.errcode === 5) return null; // SQLITE_BUSY
    throw error;
  }
}
