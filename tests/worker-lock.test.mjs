import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { lockWorkerDirectory } from "../server/worker-lock.mjs";

test(
  "one process owns the spool and a replacement can recover after an abrupt exit",
  { timeout: 10000 },
  async (t) => {
    const root = mkdtempSync(join(tmpdir(), "podcast-owner-"));
    const child = spawn(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `
    import { lockWorkerDirectory } from "./server/worker-lock.mjs";
    const lock = lockWorkerDirectory(process.argv[1]);
    if (!lock) process.exit(1);
    process.send("owned");
    process.on("exit", () => lock.close());
    process.on("message", () => {});
  `,
        root,
      ],
      { stdio: ["ignore", "ignore", "inherit", "ipc"] },
    );
    const exited = once(child, "exit");
    t.after(async () => {
      child.kill("SIGKILL");
      await exited;
      rmSync(root, { recursive: true, force: true });
    });
    assert.equal(
      (await Promise.race([once(child, "message"), exited]))[0],
      "owned",
    );
    assert.equal(lockWorkerDirectory(root), null);
    child.kill("SIGKILL");
    await exited;
    const replacement = lockWorkerDirectory(root);
    assert.ok(replacement);
    replacement.close();
  },
);
