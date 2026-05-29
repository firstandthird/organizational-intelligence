import { mkdirSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { LOCK_STALE_MS } from "./constants.mjs";

/**
 * @param {string} adminDir
 */
export function acquireMergeLock(adminDir) {
  mkdirSync(adminDir, { recursive: true });
  const lockPath = join(adminDir, "merge.lock");

  if (statSync(lockPath, { throwIfNoEntry: false })) {
    try {
      const existing = JSON.parse(readFileSync(lockPath, "utf8"));
      const acquiredAt = Date.parse(String(existing.acquiredAt ?? ""));
      if (Number.isFinite(acquiredAt) && Date.now() - acquiredAt < LOCK_STALE_MS) {
        const error = new Error("Another content merge is in progress.");
        error.code = "MERGE_IN_PROGRESS";
        throw error;
      }
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "MERGE_IN_PROGRESS") {
        throw error;
      }
    }
    rmSync(lockPath, { force: true });
  }

  const payload = JSON.stringify({ pid: process.pid, acquiredAt: new Date().toISOString() }, null, 2);
  writeFileSync(lockPath, payload, { encoding: "utf8", flag: "wx" });
  return lockPath;
}

/**
 * @param {string} lockPath
 */
export function releaseMergeLock(lockPath) {
  try {
    unlinkSync(lockPath);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return;
    }
    throw error;
  }
}
