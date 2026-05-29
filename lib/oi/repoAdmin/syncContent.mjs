import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { resolveRepoPaths } from "../repoPaths.mjs";
import {
  computeManifestHash,
  copyTree,
  countHostToolFiles,
  countTopLevelFiles,
  diffSubtreeCounts,
  extractContentTarball,
  mergeToolsIntoHost,
  mirrorSubtrees
} from "./archive.mjs";
import { MARKDOWN_DIRS } from "./constants.mjs";
import { acquireMergeLock, releaseMergeLock } from "./mergeLock.mjs";
import { assertRepositoryAllowed, parseSyncManifest } from "./manifest.mjs";
import { reloadRuntimeState, validateMergedToolFiles } from "./reloadRuntime.mjs";
import { shaEquals } from "./sha.mjs";
import { createSnapshot, getLatestSnapshotId, restoreSnapshot } from "./snapshot.mjs";
import { readRepoStatus, writeRepoStatus } from "./status.mjs";
import { validateMarkdownTrees } from "./validateContent.mjs";

const READ_ONLY_ENV_PATTERN = /^(1|true|yes|on)$/i;

function isReadOnlyMode() {
  const raw = process.env.OI_READ_ONLY ?? process.env.ORG_INTEL_READ_ONLY;
  if (raw === undefined || raw === null) {
    return false;
  }
  return READ_ONLY_ENV_PATTERN.test(String(raw).trim());
}

/**
 * @param {string} projectRoot
 */
export async function getRepoStatusPayload(projectRoot) {
  const paths = resolveRepoPaths(projectRoot);
  const status = await readRepoStatus(paths.statusPath);

  return {
    repository: status?.repository ?? process.env.GITHUB_REPOSITORY ?? "",
    ref: status?.ref ?? "",
    revision: status?.revision ?? "",
    deployedAt: status?.deployedAt ?? "",
    deployKind: status?.deployKind ?? "content-sync",
    workflowRun: status?.workflowRun ?? "",
    repoRoot: paths.repoRoot,
    counts: status?.counts ?? {
      prompts: countTopLevelFiles(paths.repoRoot, "prompts"),
      sharedContext: countTopLevelFiles(paths.repoRoot, "sharedContext"),
      contentTools: status?.contentToolPaths?.length ?? 0,
      hostTools: countHostToolFiles(paths.hostToolsDir)
    },
    contentToolPaths: status?.contentToolPaths ?? [],
    manifestHash: status?.manifestHash ?? ""
  };
}

/**
 * @param {string} projectRoot
 * @param {unknown} manifestValue
 * @param {Buffer} tarball
 */
export async function applyContentSync(projectRoot, manifestValue, tarball) {
  if (isReadOnlyMode()) {
    const error = new Error("Content sync is disabled in read-only mode.");
    error.code = "READ_ONLY";
    throw error;
  }

  const parsed = parseSyncManifest(manifestValue);
  if (!parsed.ok) {
    const error = new Error("Invalid sync manifest.");
    error.code = parsed.error;
    throw error;
  }

  assertRepositoryAllowed(parsed.manifest, process.env.GITHUB_REPOSITORY);

  const paths = resolveRepoPaths(projectRoot);
  const currentStatus = await readRepoStatus(paths.statusPath);
  const currentRevision = currentStatus?.revision ?? "";

  if (shaEquals(parsed.manifest.sha, currentRevision)) {
    return {
      ok: true,
      noop: true,
      revision: parsed.manifest.sha,
      message: "Revision already deployed."
    };
  }

  if (
    parsed.manifest.baseSha &&
    currentRevision &&
    !shaEquals(parsed.manifest.baseSha, currentRevision) &&
    !parsed.manifest.allowRebase
  ) {
    const error = new Error(
      `Base SHA mismatch: expected ${currentRevision}, received ${parsed.manifest.baseSha}.`
    );
    error.code = "BASE_SHA_MISMATCH";
    error.expected = currentRevision;
    error.actual = parsed.manifest.baseSha;
    throw error;
  }

  const incomingRoot = join(paths.adminDir, "incoming", randomUUID());
  const extractRoot = join(incomingRoot, "extract");
  let lockPath = "";
  let snapshotId = "";

  try {
    lockPath = acquireMergeLock(paths.adminDir);
    await mkdir(incomingRoot, { recursive: true });
    await extractContentTarball(tarball, extractRoot);
    await validateMarkdownTrees(extractRoot);

    snapshotId = `${new Date().toISOString().replace(/[:.]/g, "")}-${parsed.manifest.sha.slice(0, 12)}`;
    await createSnapshot(join(paths.adminDir, "snapshots"), snapshotId, {
      repoRoot: paths.repoRoot,
      hostToolsDir: paths.hostToolsDir,
      contentToolPaths: currentStatus?.contentToolPaths ?? []
    });

    const beforePrompts = join(incomingRoot, "before", "prompts");
    const beforeShared = join(incomingRoot, "before", "sharedContext");
    if (existsSync(paths.promptsDir)) {
      copyTree(paths.promptsDir, beforePrompts);
    }
    if (existsSync(paths.sharedContextDir)) {
      copyTree(paths.sharedContextDir, beforeShared);
    }

    await mirrorSubtrees(extractRoot, paths.repoRoot, MARKDOWN_DIRS);
    const contentToolPaths = mergeToolsIntoHost(join(extractRoot, "tools"), paths.hostToolsDir);
    await validateMergedToolFiles(paths.hostToolsDir, contentToolPaths, projectRoot);
    await reloadRuntimeState(projectRoot);

    const manifestHash = await computeManifestHash(extractRoot);
    const nextStatus = {
      repository: parsed.manifest.repository,
      ref: parsed.manifest.ref,
      revision: parsed.manifest.sha,
      deployedAt: new Date().toISOString(),
      deployKind: "content-sync",
      workflowRun: parsed.manifest.workflowRun,
      repoRoot: paths.repoRoot,
      counts: {
        prompts: countTopLevelFiles(paths.repoRoot, "prompts"),
        sharedContext: countTopLevelFiles(paths.repoRoot, "sharedContext"),
        contentTools: contentToolPaths.length,
        hostTools: countHostToolFiles(paths.hostToolsDir)
      },
      contentToolPaths,
      manifestHash
    };
    await writeRepoStatus(paths.statusPath, nextStatus);

    return {
      ok: true,
      noop: false,
      revision: parsed.manifest.sha,
      previousRevision: currentRevision || null,
      ref: parsed.manifest.ref,
      repository: parsed.manifest.repository,
      appliedAt: nextStatus.deployedAt,
      summary: {
        prompts: diffSubtreeCounts(beforePrompts, paths.promptsDir),
        sharedContext: diffSubtreeCounts(beforeShared, paths.sharedContextDir),
        tools: {
          added: contentToolPaths.length,
          updated: 0,
          removed: 0
        }
      },
      reload: {
        repositoriesReloaded: true,
        toolCacheReset: true,
        restartRequired: false
      },
      manifestHash
    };
  } catch (error) {
    if (snapshotId) {
      try {
        await restoreSnapshot(join(paths.adminDir, "snapshots", snapshotId), paths);
        await reloadRuntimeState(projectRoot);
      } catch (restoreError) {
        console.error("[repo-admin] failed to restore snapshot after apply error:", restoreError);
      }
    }
    throw error;
  } finally {
    if (lockPath) {
      releaseMergeLock(lockPath);
    }
    await rm(incomingRoot, { recursive: true, force: true });
  }
}

/**
 * @param {string} projectRoot
 */
export async function reloadContentRepo(projectRoot) {
  await reloadRuntimeState(projectRoot);
  return { ok: true, reloadedAt: new Date().toISOString() };
}

/**
 * @param {string} projectRoot
 */
export async function rollbackContentRepo(projectRoot) {
  if (isReadOnlyMode()) {
    const error = new Error("Content rollback is disabled in read-only mode.");
    error.code = "READ_ONLY";
    throw error;
  }

  const paths = resolveRepoPaths(projectRoot);
  const snapshotsDir = join(paths.adminDir, "snapshots");
  const snapshotId = getLatestSnapshotId(snapshotsDir);
  if (!snapshotId) {
    const error = new Error("No snapshot available for rollback.");
    error.code = "APPLY_FAILED";
    throw error;
  }

  let lockPath = "";
  try {
    lockPath = acquireMergeLock(paths.adminDir);
    const currentStatus = await readRepoStatus(paths.statusPath);
    await restoreSnapshot(join(snapshotsDir, snapshotId), paths);
    await reloadRuntimeState(projectRoot);
    return {
      ok: true,
      restoredRevision: currentStatus?.revision ?? "",
      snapshotId
    };
  } finally {
    if (lockPath) {
      releaseMergeLock(lockPath);
    }
  }
}
