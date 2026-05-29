import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { resolveRepoStatusPath } from "../repoPaths.mjs";

/**
 * @typedef {Object} RepoStatus
 * @property {string} repository
 * @property {string} ref
 * @property {string} revision
 * @property {string} deployedAt
 * @property {"content-sync" | "full-deploy"} deployKind
 * @property {string} [workflowRun]
 * @property {string} repoRoot
 * @property {{ prompts: number, sharedContext: number, contentTools: number, hostTools: number }} counts
 * @property {string[]} contentToolPaths
 * @property {string} [manifestHash]
 */

/**
 * @param {string} statusPath
 * @returns {Promise<RepoStatus | null>}
 */
export async function readRepoStatus(statusPath) {
  try {
    const raw = await readFile(statusPath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

/**
 * @param {string} statusPath
 * @param {RepoStatus} status
 */
export async function writeRepoStatus(statusPath, status) {
  await mkdir(dirname(statusPath), { recursive: true });
  await writeFile(statusPath, `${JSON.stringify(status, null, 2)}\n`, "utf8");
}

/**
 * @param {string} statusPath
 */
export async function readRepoRevision(statusPath) {
  const status = await readRepoStatus(statusPath);
  return status?.revision ?? "";
}
