import { existsSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function trimTrailingSeparators(value) {
  return value.replace(/[\\/]+$/, "");
}

function isDirectory(targetPath) {
  return existsSync(targetPath) && statSync(targetPath).isDirectory();
}

/**
 * @param {string} [projectRoot]
 */
export function resolveProjectRoot(projectRoot = process.cwd()) {
  return resolve(projectRoot);
}

/**
 * Resolve the active markdown content root (same rules as fileMdRepositories).
 * @param {string} [projectRoot]
 */
export function resolveRepoRoot(projectRoot = process.cwd()) {
  const root = resolveProjectRoot(projectRoot);
  const repositoryFolder = process.env.REPOSITORY_FOLDER?.trim();

  if (!repositoryFolder) {
    return root;
  }

  const stagedCopyRoot = join(root, basename(trimTrailingSeparators(repositoryFolder)));
  if (isDirectory(stagedCopyRoot)) {
    return stagedCopyRoot;
  }

  const originalSourceRoot = resolve(root, repositoryFolder);
  if (isDirectory(originalSourceRoot)) {
    return originalSourceRoot;
  }

  return stagedCopyRoot;
}

/**
 * @param {string} [projectRoot]
 */
export function resolveHostToolsDir(projectRoot = process.cwd()) {
  return join(resolveProjectRoot(projectRoot), "tools");
}

/**
 * @param {string} [projectRoot]
 */
export function resolveRepoAdminDir(projectRoot = process.cwd()) {
  return join(resolveProjectRoot(projectRoot), ".oi", "repo-admin");
}

/**
 * @param {string} [projectRoot]
 */
export function resolveRepoStatusPath(projectRoot = process.cwd()) {
  return join(resolveRepoAdminDir(projectRoot), "current-status.json");
}

/**
 * @param {string} [projectRoot]
 */
export function resolveRepoPaths(projectRoot = process.cwd()) {
  const root = resolveProjectRoot(projectRoot);
  const repoRoot = resolveRepoRoot(projectRoot);
  return {
    projectRoot: root,
    repoRoot,
    promptsDir: join(repoRoot, "prompts"),
    sharedContextDir: join(repoRoot, "sharedContext"),
    contentToolsDir: join(repoRoot, "tools"),
    hostToolsDir: join(root, "tools"),
    adminDir: resolveRepoAdminDir(projectRoot),
    statusPath: resolveRepoStatusPath(projectRoot)
  };
}
