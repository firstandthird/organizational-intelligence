import { basename } from "node:path";

/**
 * Split first YAML frontmatter block from markdown (must start with ---).
 * @param {string} raw
 * @returns {{ ok: true, frontmatter: string, body: string } | { ok: false, error: string }}
 */
export function splitFrontmatter(raw) {
  const s = raw.replace(/^\uFEFF/, "");
  if (!s.startsWith("---")) {
    return { ok: false, error: "MISSING_OPEN_DELIM" };
  }
  const m = s.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!m) {
    return { ok: false, error: "MISSING_CLOSE_DELIM" };
  }
  return { ok: true, frontmatter: m[1], body: m[2].trimEnd() };
}

/**
 * Minimal YAML subset: scalars `key: value`, lists after `key:` with `- item`,
 * and inline empty arrays `key: []`.
 * @param {string} block
 * @returns {Record<string, string | string[]>}
 */
export function parseYamlSubset(block) {
  /** @type {Record<string, string | string[]>} */
  const out = {};
  const lines = block.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trimEnd();
    if (!trimmed || trimmed.startsWith("#")) {
      i++;
      continue;
    }

    const inlineEmpty = trimmed.match(/^([\w_]+):\s*\[\s*\]\s*$/);
    if (inlineEmpty) {
      out[inlineEmpty[1]] = [];
      i++;
      continue;
    }

    const inlineList = trimmed.match(/^([\w_]+):\s*\[\s*([^\]]*?)\s*\]\s*$/);
    if (inlineList && !trimmed.includes("\n")) {
      const key = inlineList[1];
      const inner = inlineList[2].trim();
      if (!inner) {
        out[key] = [];
      } else {
        out[key] = inner.split(",").map((s) => s.trim().replace(/^["']|["']$/g, ""));
      }
      i++;
      continue;
    }

    const keyOnly = trimmed.match(/^([\w_]+):\s*$/);
    if (keyOnly) {
      const key = keyOnly[1];
      const items = [];
      let j = i + 1;
      while (j < lines.length) {
        const L = lines[j];
        const itemM = L.match(/^\s*-\s+(.+)$/);
        if (itemM) {
          items.push(itemM[1].trim().replace(/^["']|["']$/g, ""));
          j++;
          continue;
        }
        if (!L.trim()) {
          j++;
          continue;
        }
        break;
      }
      out[key] = items;
      i = j;
      continue;
    }

    const scalar = trimmed.match(/^([\w_]+):\s*(.+)$/);
    if (scalar) {
      out[scalar[1]] = scalar[2].trim();
      i++;
      continue;
    }

    i++;
  }
  return out;
}

/**
 * @param {string} rawFile
 * @returns {{ ok: true, fields: Record<string, string|string[]>, body: string } | { ok: false, error: string }}
 */
export function parsePromptMarkdown(rawFile) {
  const sp = splitFrontmatter(rawFile);
  if (!sp.ok) {
    if (sp.error === "MISSING_OPEN_DELIM") {
      return { ok: true, fields: {}, body: rawFile.replace(/^\uFEFF/, "").trimEnd() };
    }
    return sp;
  }
  const fields = parseYamlSubset(sp.frontmatter);
  return { ok: true, fields, body: sp.body };
}

/**
 * @param {string} rawFile
 */
export function parseSharedContextMarkdown(rawFile) {
  return parsePromptMarkdown(rawFile);
}

/**
 * @param {string[]} items
 */
function serializeYamlStringList(key, items) {
  if (!items.length) {
    return `${key}: []\n`;
  }
  let s = `${key}:\n`;
  for (const it of items) {
    s += `  - ${it}\n`;
  }
  return s;
}

/**
 * @param {import('./repository-types.mjs').PromptEntry} entry
 */
export function serializePromptMarkdown(entry) {
  const tools = entry.tools ?? [];
  const agents = entry.allowedAgents ?? [];
  const tags = entry.tags ?? [];
  let fm = "---\n";
  fm += `name: ${entry.name}\n`;
  fm += `description: ${entry.description}\n`;
  fm += `model: ${entry.model}\n`;
  fm += serializeYamlStringList("tools", tools);
  fm += serializeYamlStringList("allowed_agents", agents);
  if (tags.length) {
    fm += serializeYamlStringList("tags", tags);
  }
  fm += `memory: ${entry.memory}\n`;
  fm += "---\n";
  return fm + (entry.text ?? "").replace(/\n*$/, "") + "\n";
}

/**
 * @param {import('./repository-types.mjs').SharedContextEntry} entry
 */
export function serializeSharedContextMarkdown(entry) {
  let fm = "---\n";
  fm += `name: ${entry.name}\n`;
  fm += `description: ${entry.description}\n`;
  fm += serializeYamlStringList("tags", entry.tags ?? []);
  fm += "---\n";
  return fm + (entry.content ?? "").replace(/\n*$/, "") + "\n";
}

/**
 * Build PromptEntry from parsed file + body.
 * @param {Record<string, string|string[]>} fields
 * @param {string} body
 * @param {string} sourceRelPath
 */
export function promptEntryFromParsed(fields, body, sourceRelPath) {
  const name = String(fields.name ?? deriveNameFromPath(sourceRelPath)).trim();
  const toolsRaw = fields.tools;
  const tools = Array.isArray(toolsRaw)
    ? toolsRaw.map(String)
    : typeof toolsRaw === "string"
      ? [toolsRaw]
      : [];
  const agentsRaw = fields.allowed_agents;
  const allowedAgents = Array.isArray(agentsRaw)
    ? agentsRaw.map(String)
    : [];
  const tagsRaw = fields.tags;
  const tags = Array.isArray(tagsRaw)
    ? tagsRaw.map(String)
    : typeof tagsRaw === "string"
      ? [tagsRaw]
      : [];

  return {
    id: name,
    name,
    description: String(fields.description ?? deriveDescriptionFromBody(body)),
    model: String(fields.model ?? "openai:gpt-4o-mini"),
    tools,
    allowedAgents,
    memory: String(fields.memory ?? "thread"),
    tags,
    text: body,
    sourceRelPath
  };
}

/**
 * @param {Record<string, string|string[]>} fields
 * @param {string} body
 * @param {string} sourceRelPath
 */
export function sharedContextEntryFromParsed(fields, body, sourceRelPath) {
  const name = String(fields.name ?? deriveNameFromPath(sourceRelPath)).trim();
  const tagsRaw = fields.tags;
  const tags = Array.isArray(tagsRaw)
    ? tagsRaw.map(String)
    : typeof tagsRaw === "string"
      ? [tagsRaw]
      : [];

  return {
    id: name,
    name,
    description: String(fields.description ?? deriveDescriptionFromBody(body)),
    tags,
    content: body,
    sourceRelPath
  };
}

function deriveNameFromPath(sourceRelPath) {
  return basename(sourceRelPath, ".md");
}

function deriveDescriptionFromBody(body) {
  const line = body
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .find((entry) => entry.length > 0);
  return line ?? "";
}
