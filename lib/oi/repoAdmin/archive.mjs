import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  ALLOWED_CONTENT_DIRS,
  IGNORED_DIRECTORY_NAMES,
  MARKDOWN_DIRS,
  MAX_FILE_BYTES,
  MAX_FILE_COUNT,
  MAX_TARBALL_BYTES,
  SUPPORTED_TOOL_EXTENSIONS
} from "./constants.mjs";

/**
 * @param {string} filePath
 * @param {number} maxBytes
 */
function assertFileSize(filePath, maxBytes) {
  const size = statSync(filePath).size;
  if (size > maxBytes) {
    const error = new Error(`File exceeds max size (${maxBytes} bytes): ${filePath}`);
    error.code = "PAYLOAD_TOO_LARGE";
    throw error;
  }
}

/**
 * @param {string} rootDir
 * @param {string} relativePath
 */
function assertAllowedRelativePath(rootDir, relativePath) {
  const normalized = relativePath.replace(/\\/g, "/");
  if (!normalized || normalized.startsWith("/") || normalized.includes("..")) {
    const error = new Error(`Disallowed path: ${relativePath}`);
    error.code = "INVALID_ARCHIVE";
    throw error;
  }

  const topLevel = normalized.split("/")[0];
  if (!ALLOWED_CONTENT_DIRS.has(topLevel)) {
    const error = new Error(`Disallowed top-level path: ${relativePath}`);
    error.code = "INVALID_ARCHIVE";
    throw error;
  }

  if (normalized.split("/").some((segment) => segment.startsWith("."))) {
    const error = new Error(`Hidden paths are not allowed: ${relativePath}`);
    error.code = "INVALID_ARCHIVE";
    throw error;
  }

  if (MARKDOWN_DIRS.has(topLevel) && extname(normalized) !== ".md") {
    const error = new Error(`Only markdown files are allowed under ${topLevel}: ${relativePath}`);
    error.code = "INVALID_ARCHIVE";
    throw error;
  }

  if (topLevel === "tools" && !SUPPORTED_TOOL_EXTENSIONS.has(extname(normalized))) {
    const error = new Error(`Unsupported tool file extension: ${relativePath}`);
    error.code = "INVALID_ARCHIVE";
    throw error;
  }

  const absolute = join(rootDir, normalized);
  if (!absolute.startsWith(rootDir)) {
    const error = new Error(`Path escapes archive root: ${relativePath}`);
    error.code = "INVALID_ARCHIVE";
    throw error;
  }
}

/**
 * @param {string} dir
 * @param {string} [prefix]
 * @returns {string[]}
 */
export function listContentFiles(dir, prefix = "") {
  if (!existsSync(dir)) {
    return [];
  }

  /** @type {string[]} */
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || IGNORED_DIRECTORY_NAMES.has(entry.name)) {
      continue;
    }
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listContentFiles(abs, rel));
      continue;
    }
    if (entry.isFile()) {
      files.push(rel.replace(/\\/g, "/"));
    }
  }
  return files.sort();
}

/**
 * @param {string} extractRoot
 */
export function validateExtractedArchive(extractRoot) {
  const files = listContentFiles(extractRoot);
  if (files.length > MAX_FILE_COUNT) {
    const error = new Error(`Archive exceeds max file count (${MAX_FILE_COUNT}).`);
    error.code = "PAYLOAD_TOO_LARGE";
    throw error;
  }

  for (const rel of files) {
    assertAllowedRelativePath(extractRoot, rel);
    assertFileSize(join(extractRoot, rel), MAX_FILE_BYTES);
  }

  for (const entry of readdirSync(extractRoot, { withFileTypes: true })) {
    if (entry.isDirectory() && !ALLOWED_CONTENT_DIRS.has(entry.name)) {
      const error = new Error(`Unexpected top-level directory in archive: ${entry.name}`);
      error.code = "INVALID_ARCHIVE";
      throw error;
    }
  }

  return files;
}

/**
 * @param {Buffer} tarball
 * @param {string} extractRoot
 */
export async function extractContentTarball(tarball, extractRoot) {
  if (tarball.length > MAX_TARBALL_BYTES) {
    const error = new Error(`Archive exceeds max size (${MAX_TARBALL_BYTES} bytes).`);
    error.code = "PAYLOAD_TOO_LARGE";
    throw error;
  }

  await rm(extractRoot, { recursive: true, force: true });
  await mkdir(extractRoot, { recursive: true });

  const archivePath = join(extractRoot, "..", "content.tar.gz");
  await writeFile(archivePath, tarball);

  const result = spawnSync("tar", ["-xzf", archivePath, "-C", extractRoot], {
    encoding: "utf8"
  });
  if (result.status !== 0) {
    const error = new Error(result.stderr || "Failed to extract content archive.");
    error.code = "INVALID_ARCHIVE";
    throw error;
  }

  await rm(archivePath, { force: true });
  return validateExtractedArchive(extractRoot);
}

/**
 * @param {string} rootDir
 * @returns {Promise<string>}
 */
export async function computeManifestHash(rootDir) {
  const hash = createHash("sha256");
  const files = listContentFiles(rootDir);
  for (const rel of files) {
    hash.update(rel);
    hash.update("\0");
    hash.update(await readFile(join(rootDir, rel)));
    hash.update("\0");
  }
  return `sha256:${hash.digest("hex")}`;
}

function ensureDir(dir) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * @param {string} sourceDir
 * @param {string} targetDir
 */
export function copyTree(sourceDir, targetDir) {
  ensureDir(targetDir);
  for (const entry of readdirSync(sourceDir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || IGNORED_DIRECTORY_NAMES.has(entry.name)) {
      continue;
    }
    const sourcePath = join(sourceDir, entry.name);
    const targetPath = join(targetDir, entry.name);
    if (entry.isDirectory()) {
      copyTree(sourcePath, targetPath);
      continue;
    }
    if (entry.isFile()) {
      writeFileSync(targetPath, readFileSync(sourcePath));
    }
  }
}

/**
 * @param {string} sourceRoot
 * @param {string} targetRoot
 * @param {Set<string>} allowedTopLevels
 */
export async function mirrorSubtrees(sourceRoot, targetRoot, allowedTopLevels) {
  ensureDir(targetRoot);
  for (const topLevel of allowedTopLevels) {
    const sourceDir = join(sourceRoot, topLevel);
    const targetDir = join(targetRoot, topLevel);
    await rm(targetDir, { recursive: true, force: true });
    if (!existsSync(sourceDir)) {
      continue;
    }
    copyTree(sourceDir, targetDir);
  }
}

/**
 * @param {string} sourceToolsDir
 * @param {string} hostToolsDir
 * @returns {string[]}
 */
export function mergeToolsIntoHost(sourceToolsDir, hostToolsDir) {
  ensureDir(hostToolsDir);
  if (!existsSync(sourceToolsDir)) {
    return [];
  }

  /** @type {string[]} */
  const mergedPaths = [];

  const visit = (currentSource, relativePrefix = "") => {
    for (const entry of readdirSync(currentSource, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || IGNORED_DIRECTORY_NAMES.has(entry.name)) {
        continue;
      }
      const rel = relativePrefix ? `${relativePrefix}/${entry.name}` : entry.name;
      const sourcePath = join(currentSource, entry.name);
      const targetPath = join(hostToolsDir, rel);
      if (entry.isDirectory()) {
        ensureDir(targetPath);
        visit(sourcePath, rel);
        continue;
      }
      if (!entry.isFile() || !SUPPORTED_TOOL_EXTENSIONS.has(extname(entry.name))) {
        continue;
      }
      ensureDir(join(targetPath, ".."));
      writeFileSync(targetPath, readFileSync(sourcePath));
      mergedPaths.push(rel.replace(/\\/g, "/"));
    }
  };

  visit(sourceToolsDir);
  return mergedPaths.sort();
}

/**
 * @param {string} beforeDir
 * @param {string} afterDir
 */
export function diffSubtreeCounts(beforeDir, afterDir) {
  const before = new Set(listContentFiles(beforeDir));
  const after = new Set(listContentFiles(afterDir));
  let added = 0;
  let removed = 0;
  let updated = 0;

  for (const file of after) {
    if (!before.has(file)) {
      added += 1;
    } else if (readFileSync(join(afterDir, file)).compare(readFileSync(join(beforeDir, file))) !== 0) {
      updated += 1;
    }
  }
  for (const file of before) {
    if (!after.has(file)) {
      removed += 1;
    }
  }

  return { added, updated, removed };
}

/**
 * @param {string} rootDir
 * @param {string} topLevel
 */
export function countTopLevelFiles(rootDir, topLevel) {
  return listContentFiles(join(rootDir, topLevel), topLevel).length;
}

/**
 * @param {string} hostToolsDir
 */
export function countHostToolFiles(hostToolsDir) {
  if (!existsSync(hostToolsDir)) {
    return 0;
  }
  return readdirSync(hostToolsDir, { withFileTypes: true }).filter(
    (entry) => entry.isFile() && SUPPORTED_TOOL_EXTENSIONS.has(extname(entry.name))
  ).length;
}
