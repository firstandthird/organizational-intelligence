import { isValidSha, normalizeSha } from "./sha.mjs";

/**
 * @typedef {Object} SyncManifest
 * @property {string} repository
 * @property {string} ref
 * @property {string} sha
 * @property {string} baseSha
 * @property {string} [workflowRun]
 * @property {string[]} [changedPaths]
 * @property {boolean} [allowRebase]
 */

/**
 * @param {unknown} value
 * @returns {{ ok: true, manifest: SyncManifest } | { ok: false, error: string }}
 */
export function parseSyncManifest(value) {
  if (!value || typeof value !== "object") {
    return { ok: false, error: "INVALID_MANIFEST" };
  }

  const manifest = /** @type {Record<string, unknown>} */ (value);
  const repository = String(manifest.repository ?? "").trim();
  const ref = String(manifest.ref ?? "").trim();
  const sha = normalizeSha(String(manifest.sha ?? ""));
  const baseSha = normalizeSha(String(manifest.baseSha ?? ""));

  if (!repository) {
    return { ok: false, error: "INVALID_MANIFEST" };
  }
  if (!ref) {
    return { ok: false, error: "INVALID_MANIFEST" };
  }
  if (!isValidSha(sha)) {
    return { ok: false, error: "INVALID_MANIFEST" };
  }
  if (baseSha && !isValidSha(baseSha)) {
    return { ok: false, error: "INVALID_MANIFEST" };
  }

  /** @type {string[]} */
  const changedPaths = [];
  if (Array.isArray(manifest.changedPaths)) {
    for (const entry of manifest.changedPaths) {
      if (typeof entry === "string" && entry.trim()) {
        changedPaths.push(entry.trim().replace(/\\/g, "/"));
      }
    }
  }

  return {
    ok: true,
    manifest: {
      repository,
      ref,
      sha,
      baseSha,
      workflowRun: typeof manifest.workflowRun === "string" ? manifest.workflowRun.trim() : undefined,
      changedPaths,
      allowRebase: manifest.allowRebase === true
    }
  };
}

/**
 * @param {SyncManifest} manifest
 * @param {string | undefined} configuredRepository
 */
export function assertRepositoryAllowed(manifest, configuredRepository) {
  const expected = String(configuredRepository ?? "").trim().toLowerCase();
  if (!expected) {
    return;
  }
  if (manifest.repository.trim().toLowerCase() !== expected) {
    const error = new Error(`Repository mismatch: expected ${expected}, received ${manifest.repository}`);
    error.code = "REPOSITORY_MISMATCH";
    throw error;
  }
}
