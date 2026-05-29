import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const frameworkEntry = require.resolve("ai-agent-framework/dist/index.js");

/**
 * @param {string} projectRoot
 */
export async function reloadRuntimeState(projectRoot) {
  const { reloadOiFileRepositories } = await import("../fileMdRepositories.mjs");
  await reloadOiFileRepositories();

  const framework = await import(pathToFileURL(frameworkEntry).href);
  framework.resetToolModuleCache();
}

/**
 * @param {string} hostToolsDir
 * @param {string[]} relativePaths
 * @param {string} projectRoot
 */
export async function validateMergedToolFiles(hostToolsDir, relativePaths, projectRoot) {
  if (relativePaths.length === 0) {
    return;
  }

  createRequire(pathToFileURL(join(projectRoot, "package.json")));
  /** @type {Set<string>} */
  const toolNames = new Set();
  /** @type {{ path: string, message: string }[]} */
  const errors = [];

  for (const rel of relativePaths) {
    const filePath = join(hostToolsDir, rel);
    try {
      const imported = await import(pathToFileURL(filePath).href);
      const modules = [imported.default, imported].filter(Boolean);
      for (const mod of modules) {
        const tools = mod.tools ?? mod.default?.tools ?? [];
        for (const tool of tools) {
          const name = tool?.name;
          if (!name) {
            continue;
          }
          if (toolNames.has(name)) {
            errors.push({ path: rel, message: `Duplicate tool name: ${name}` });
          } else {
            toolNames.add(name);
          }
        }
      }
    } catch (cause) {
      errors.push({
        path: rel,
        message: cause instanceof Error ? cause.message : String(cause)
      });
    }
  }

  if (errors.length > 0) {
    const error = new Error("Tool validation failed.");
    error.code = "VALIDATION_FAILED";
    error.details = errors;
    throw error;
  }
}
