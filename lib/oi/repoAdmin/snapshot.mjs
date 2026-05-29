import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { copyTree } from "./archive.mjs";
import { MARKDOWN_DIRS } from "./constants.mjs";

/**
 * @param {string} snapshotsDir
 * @param {string} snapshotId
 * @param {{ repoRoot: string, hostToolsDir: string, contentToolPaths: string[] }} state
 */
export async function createSnapshot(snapshotsDir, snapshotId, state) {
  const snapshotRoot = join(snapshotsDir, snapshotId);
  await rm(snapshotRoot, { recursive: true, force: true });
  mkdirSync(snapshotRoot, { recursive: true });

  for (const topLevel of MARKDOWN_DIRS) {
    const sourceDir = join(state.repoRoot, topLevel);
    const targetDir = join(snapshotRoot, topLevel);
    if (existsSync(sourceDir)) {
      copyTree(sourceDir, targetDir);
    }
  }

  const snapshotToolsDir = join(snapshotRoot, "host-tools");
  mkdirSync(snapshotToolsDir, { recursive: true });
  for (const rel of state.contentToolPaths) {
    const sourcePath = join(state.hostToolsDir, rel);
    const targetPath = join(snapshotToolsDir, rel);
    if (!existsSync(sourcePath)) {
      continue;
    }
    mkdirSync(join(targetPath, ".."), { recursive: true });
    cpSync(sourcePath, targetPath);
  }

  return snapshotRoot;
}

/**
 * @param {string} snapshotsDir
 */
export function getLatestSnapshotId(snapshotsDir) {
  if (!existsSync(snapshotsDir)) {
    return null;
  }
  const entries = readdirSync(snapshotsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  return entries.at(-1) ?? null;
}

/**
 * @param {string} snapshotRoot
 * @param {{ repoRoot: string, hostToolsDir: string }} paths
 */
export async function restoreSnapshot(snapshotRoot, paths) {
  for (const topLevel of MARKDOWN_DIRS) {
    const sourceDir = join(snapshotRoot, topLevel);
    const targetDir = join(paths.repoRoot, topLevel);
    await rm(targetDir, { recursive: true, force: true });
    if (existsSync(sourceDir)) {
      copyTree(sourceDir, targetDir);
    }
  }

  const snapshotToolsDir = join(snapshotRoot, "host-tools");
  if (existsSync(snapshotToolsDir)) {
    const visit = (currentDir, prefix = "") => {
      for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
        const sourcePath = join(currentDir, entry.name);
        const targetPath = join(paths.hostToolsDir, rel);
        if (entry.isDirectory()) {
          visit(sourcePath, rel);
          continue;
        }
        if (entry.isFile()) {
          mkdirSync(join(targetPath, ".."), { recursive: true });
          cpSync(sourcePath, targetPath);
        }
      }
    };
    visit(snapshotToolsDir);
  }
}
