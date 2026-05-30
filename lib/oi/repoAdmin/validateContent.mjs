import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { parsePromptMarkdown, parseSharedContextMarkdown } from "../parseFrontmatter.mjs";
import { listContentFiles } from "./archive.mjs";
import { MARKDOWN_DIRS, SUPPORTED_TOOL_EXTENSIONS } from "./constants.mjs";

/**
 * @param {string} extractRoot
 */
export async function validateMarkdownTrees(extractRoot) {
  /** @type {{ path: string, message: string }[]} */
  const errors = [];

  for (const topLevel of MARKDOWN_DIRS) {
    const files = listContentFiles(join(extractRoot, topLevel), topLevel).filter((rel) => rel.endsWith(".md"));
    for (const rel of files) {
      const filePath = join(extractRoot, rel);
      const raw = await readFile(filePath, "utf8");
      const parsed = topLevel === "prompts" ? parsePromptMarkdown(raw) : parseSharedContextMarkdown(raw);
      if (!parsed.ok) {
        errors.push({ path: rel, message: parsed.error });
        continue;
      }
      const name = String(parsed.fields?.name ?? basename(rel, extname(rel))).trim();
      if (!name) {
        errors.push({ path: rel, message: "Missing required frontmatter field: name" });
      }
    }
  }

  if (errors.length > 0) {
    const error = new Error("Content validation failed.");
    error.code = "VALIDATION_FAILED";
    error.details = errors;
    throw error;
  }
}

/**
 * @param {string} hostToolsDir
 */
export async function validateHostTools(hostToolsDir) {
  if (!existsSync(hostToolsDir)) {
    return;
  }

  const toolFiles = listContentFiles(hostToolsDir).filter((rel) =>
    SUPPORTED_TOOL_EXTENSIONS.has(extname(rel))
  );

  /** @type {Set<string>} */
  const toolNames = new Set();
  /** @type {{ path: string, message: string }[]} */
  const errors = [];

  for (const rel of toolFiles) {
    if (rel.startsWith("zz-data-")) {
      continue;
    }
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
