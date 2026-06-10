/** Matches `[[target]]`, `![[target]]`, optional `#heading` and `|alias`. */
export const WIKILINK_RE = /!?\[\[([^\]#|]+?)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]/g;

/**
 * @param {string} raw
 * @returns {string | null}
 */
export function normalizeEmbedTarget(raw) {
  const normalized = String(raw ?? "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/")
    .replace(/^\/+|\/+$/g, "");

  if (!normalized || normalized.includes("..")) {
    return null;
  }

  if (/\.md$/i.test(normalized)) {
    return normalized.slice(0, -3);
  }

  return normalized;
}

/**
 * @param {string} raw
 * @returns {{ target: string, heading?: string, alias?: string } | null}
 */
export function parseWikilink(raw) {
  const match = String(raw).match(/^!?\[\[([^\]#|]+?)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]$/);
  if (!match) {
    return null;
  }

  const target = normalizeEmbedTarget(match[1]);
  if (!target) {
    return null;
  }

  return {
    target,
    heading: match[2]?.trim() || undefined,
    alias: match[3]?.trim() || undefined
  };
}

function parseMaxDepth() {
  const raw = process.env.OI_EMBED_MAX_DEPTH?.trim();
  if (!raw) {
    return 3;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return 3;
  }
  return parsed;
}

function isEmbedDisabled() {
  const raw = String(process.env.OI_EMBED_DISABLED ?? "")
    .trim()
    .toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

/**
 * @param {string} body
 * @param {{
 *   resolveEntry: (target: string) => { key: string, body: string } | null,
 *   maxDepth?: number,
 *   visited?: Set<string>
 * }} options
 * @returns {{ text: string, references: string[], missing: string[], cycles: string[] }}
 */
export function expandEmbeddedReferences(body, options) {
  /** @type {string[]} */
  const references = [];
  /** @type {string[]} */
  const missing = [];
  /** @type {string[]} */
  const cycles = [];

  if (isEmbedDisabled()) {
    return { text: body, references, missing, cycles };
  }

  const maxDepth = options.maxDepth ?? parseMaxDepth();
  const visited = options.visited ?? new Set();

  const text = expandLevel(body, 0, visited, {
    resolveEntry: options.resolveEntry,
    maxDepth,
    references,
    missing,
    cycles
  });

  return { text, references, missing, cycles };
}

/**
 * @param {string} body
 * @param {number} depth
 * @param {Set<string>} visited
 * @param {{
 *   resolveEntry: (target: string) => { key: string, body: string } | null,
 *   maxDepth: number,
 *   references: string[],
 *   missing: string[],
 *   cycles: string[]
 * }} state
 */
function expandLevel(body, depth, visited, state) {
  return body.replace(WIKILINK_RE, (fullMatch, rawTarget) => {
    const target = normalizeEmbedTarget(rawTarget);
    if (!target) {
      return `[oi-embed-invalid: ${String(rawTarget).trim()}]`;
    }

    const lookupKey = target.toLowerCase();
    if (visited.has(lookupKey)) {
      state.cycles.push(target);
      return `[oi-embed-cycle: ${target}]`;
    }

    const entry = state.resolveEntry(target);
    if (!entry) {
      state.missing.push(target);
      return `[oi-embed-missing: ${target}]`;
    }

    state.references.push(entry.key);

    const nextVisited = new Set(visited);
    nextVisited.add(lookupKey);

    const embeddedBody =
      depth < state.maxDepth
        ? expandLevel(entry.body, depth + 1, nextVisited, state)
        : entry.body;

    return `<!-- oi-embed: ${entry.key} -->\n${embeddedBody}\n<!-- /oi-embed: ${entry.key} -->`;
  });
}
