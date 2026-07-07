import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const IGNORED_DIRECTORY_NAMES = new Set(["node_modules", ".git", "dist", "coverage", ".oi"]);

/**
 * @typedef {{ fileRel: string, absPath: string, packageRel: string }} MarkdownFileRef
 */

/**
 * @param {string} rootDir
 * @param {string} packageRelPrefix e.g. sharedContext or prompts
 * @returns {Promise<MarkdownFileRef[]>}
 */
export async function collectMarkdownFiles(rootDir, packageRelPrefix) {
  /** @type {MarkdownFileRef[]} */
  const files = [];

  /**
   * @param {string} absDir
   * @param {string} relDir path under store root without prefix
   */
  async function walk(absDir, relDir) {
    const entries = await readdir(absDir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (entry.name.startsWith(".")) {
        continue;
      }
      if (entry.isDirectory()) {
        if (IGNORED_DIRECTORY_NAMES.has(entry.name)) {
          continue;
        }
        const nextRel = relDir ? `${relDir}/${entry.name}` : entry.name;
        await walk(join(absDir, entry.name), nextRel);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith(".md")) {
        continue;
      }
      const fileRel = relDir ? `${relDir}/${entry.name}` : entry.name;
      files.push({
        fileRel,
        absPath: join(absDir, entry.name),
        packageRel: `${packageRelPrefix}/${fileRel}`.replace(/\\/g, "/")
      });
    }
  }

  await walk(rootDir, "");
  return files.sort((a, b) => a.fileRel.localeCompare(b.fileRel));
}

/**
 * @param {string} fileRel
 * @returns {string}
 */
export function relPathKey(fileRel) {
  return fileRel.replace(/\.md$/i, "").replace(/\\/g, "/").toLowerCase();
}

/**
 * @param {string} absPath
 * @returns {Promise<string>}
 */
export async function readUtf8(absPath) {
  return readFile(absPath, "utf8");
}
