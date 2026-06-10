import { existsSync, statSync } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { basename, join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parsePromptMarkdown,
  parseSharedContextMarkdown,
  promptEntryFromParsed,
  sharedContextEntryFromParsed,
  serializePromptMarkdown,
  serializeSharedContextMarkdown
} from "./parseFrontmatter.mjs";
import { LIST_DEFAULT_LIMIT, LIST_MAX_LIMIT } from "./repository-types.mjs";
import { collectMarkdownFiles, relPathKey, readUtf8 } from "./markdownStoreLoader.mjs";
import { expandEmbeddedReferences, normalizeEmbedTarget } from "./resolveEmbeddedReferences.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_PROJECT_ROOT = join(__dirname, "..", "..");

function resolveDefaultPackageRoot() {
  const repositoryFolder = process.env.REPOSITORY_FOLDER?.trim();
  if (!repositoryFolder) {
    console.log(`[oi] REPOSITORY_FOLDER not set; using project root: ${DEFAULT_PROJECT_ROOT}`);
    return DEFAULT_PROJECT_ROOT;
  }

  const stagedCopyRoot = join(DEFAULT_PROJECT_ROOT, basename(trimTrailingSeparators(repositoryFolder)));
  console.log(`[oi] REPOSITORY_FOLDER raw value: ${repositoryFolder}`);
  console.log(`[oi] REPOSITORY_FOLDER staged copy candidate: ${stagedCopyRoot}`);
  if (isDirectory(stagedCopyRoot)) {
    console.log(`[oi] REPOSITORY_FOLDER resolved to staged copy: ${stagedCopyRoot}`);
    return stagedCopyRoot;
  }

  const originalSourceRoot = resolve(DEFAULT_PROJECT_ROOT, repositoryFolder);
  console.log(`[oi] REPOSITORY_FOLDER original source candidate: ${originalSourceRoot}`);
  if (isDirectory(originalSourceRoot)) {
    console.log(`[oi] REPOSITORY_FOLDER resolved to original source path: ${originalSourceRoot}`);
    return originalSourceRoot;
  }

  console.log(`[oi] REPOSITORY_FOLDER staged copy not found; defaulting to expected staged path: ${stagedCopyRoot}`);
  return stagedCopyRoot;
}

function trimTrailingSeparators(value) {
  return value.replace(/[\\/]+$/, "");
}

function isDirectory(targetPath) {
  return existsSync(targetPath) && statSync(targetPath).isDirectory();
}

function logMarkdownFiles(label, dir, files) {
  const markdownFiles = files.filter((fileName) => fileName.endsWith(".md")).sort();
  console.log(
    `[oi] ${label} markdown files in ${dir}: ${markdownFiles.length ? markdownFiles.join(", ") : "(none)"}`
  );
}

function encodeCursor(offset) {
  return Buffer.from(JSON.stringify({ o: offset }), "utf8").toString("base64url");
}

function decodeCursor(cursor) {
  if (!cursor) return 0;
  try {
    const j = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    return typeof j.o === "number" && j.o >= 0 ? j.o : 0;
  } catch {
    return 0;
  }
}

function fileSafeId(id) {
  const s = String(id)
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || "untitled";
}

function clampLimit(limit) {
  const n = limit ?? LIST_DEFAULT_LIMIT;
  return Math.min(Math.max(1, n), LIST_MAX_LIMIT);
}

function summarizeShared(e) {
  return {
    id: e.id,
    name: e.name,
    description: e.description,
    tags: e.tags,
    sourceRelPath: e.sourceRelPath
  };
}

function summarizePrompt(e) {
  return {
    id: e.id,
    name: e.name,
    description: e.description,
    model: e.model,
    tools: e.tools,
    tags: e.tags ?? [],
    memory: e.memory,
    sourceRelPath: e.sourceRelPath
  };
}

/**
 * @param {Map<string, import('./repository-types.mjs').SharedContextEntry>} byId
 * @param {string} id
 */
function lookupById(byId, id) {
  const direct = byId.get(id);
  if (direct) {
    return direct;
  }
  const want = String(id).toLowerCase();
  for (const entry of byId.values()) {
    if (entry.id.toLowerCase() === want || entry.name.toLowerCase() === want) {
      return entry;
    }
  }
  return null;
}

/**
 * @param {import('./repository-types.mjs').SharedContextEntry | import('./repository-types.mjs').PromptEntry} entry
 * @param {"content" | "text"} bodyField
 * @param {(target: string) => { key: string, body: string } | null} resolveReference
 */
function expandFetchEntry(entry, bodyField, resolveReference) {
  const body = entry[bodyField];
  const expanded = expandEmbeddedReferences(body, { resolveEntry: resolveReference });
  return {
    ...entry,
    [bodyField]: expanded.text,
    embeddedReferences: expanded.references,
    embeddedMissing: expanded.missing,
    embeddedCycles: expanded.cycles
  };
}

/**
 * @param {Map<string, import('./repository-types.mjs').SharedContextEntry>} byId
 * @param {Map<string, import('./repository-types.mjs').SharedContextEntry>} byRelPath
 * @param {string} target
 * @returns {{ key: string, body: string } | null}
 */
function resolveSharedReference(byId, byRelPath, target) {
  const normalized = normalizeEmbedTarget(target);
  if (!normalized) {
    return null;
  }

  const pathHit = byRelPath.get(normalized.toLowerCase());
  if (pathHit) {
    return { key: normalized, body: pathHit.content };
  }

  const idHit = lookupById(byId, normalized);
  if (idHit) {
    return { key: idHit.id, body: idHit.content };
  }

  return null;
}

/**
 * @param {Map<string, import('./repository-types.mjs').PromptEntry>} byId
 * @param {Map<string, import('./repository-types.mjs').PromptEntry>} byRelPath
 * @param {string} target
 * @returns {{ key: string, body: string } | null}
 */
function resolvePromptReference(byId, byRelPath, target) {
  const normalized = normalizeEmbedTarget(target);
  if (!normalized) {
    return null;
  }

  const pathHit = byRelPath.get(normalized.toLowerCase());
  if (pathHit) {
    return { key: normalized, body: pathHit.text };
  }

  const idHit = lookupById(byId, normalized);
  if (idHit) {
    return { key: idHit.id, body: idHit.text };
  }

  return null;
}

export class FileMdSharedContextStore {
  /**
   * @param {string} packageRoot
   */
  constructor(packageRoot) {
    this.packageRoot = packageRoot;
    this.dir = join(packageRoot, "sharedContext");
    /** @type {Map<string, import('./repository-types.mjs').SharedContextEntry>} */
    this.byId = new Map();
    /** @type {Map<string, import('./repository-types.mjs').SharedContextEntry>} */
    this.byRelPath = new Map();
    /** @type {Map<string, Set<string>>} */
    this.tagToIds = new Map();
    this._loaded = false;
  }

  _warnSkip(rel, reason) {
    if (process.env.NODE_ENV === "production") return;
    if (process.env.OI_SILENT_PARSE === "1") return;
    if (reason === "MISSING_OPEN_DELIM") return;
    console.warn(`[oi] sharedContext skip ${rel}: ${reason}`);
  }

  _rebuildTagIndex() {
    this.tagToIds.clear();
    for (const e of this.byId.values()) {
      for (const t of e.tags) {
        const k = t.toLowerCase();
        if (!this.tagToIds.has(k)) this.tagToIds.set(k, new Set());
        this.tagToIds.get(k).add(e.id);
      }
    }
  }

  async load() {
    this.byId.clear();
    this.byRelPath.clear();
    this.tagToIds.clear();
    const files = await collectMarkdownFiles(this.dir, "sharedContext");
    logMarkdownFiles(
      "sharedContext load",
      this.dir,
      files.map((file) => file.fileRel)
    );
    for (const file of files) {
      const raw = await readUtf8(file.absPath);
      const parsed = parseSharedContextMarkdown(raw);
      if (!parsed.ok) {
        this._warnSkip(file.packageRel, parsed.error);
        continue;
      }
      const entry = sharedContextEntryFromParsed(parsed.fields, parsed.body, file.packageRel);
      if (!entry.id) {
        this._warnSkip(file.packageRel, "EMPTY_NAME");
        continue;
      }
      this.byId.set(entry.id, entry);
      this.byRelPath.set(relPathKey(file.fileRel), entry);
    }
    this._rebuildTagIndex();
    this._loaded = true;
  }

  _ensureLoaded() {
    if (!this._loaded) throw new Error("FileMdSharedContextStore: call load() first");
  }

  /**
   * @param {string[]} [tagsAny]
   * @returns {import('./repository-types.mjs').SharedContextEntry[]}
   */
  _filterTags(entries, tagsAny) {
    if (!tagsAny?.length) return entries;
    const want = new Set(tagsAny.map((t) => t.toLowerCase()));
    return entries.filter((e) =>
      e.tags.some((t) => want.has(t.toLowerCase()))
    );
  }

  _haystackShared(e) {
    return [e.id, e.name, e.description, e.content, ...(e.tags ?? [])].join("\n").toLowerCase();
  }

  /**
   * @param {import('./repository-types.mjs').ListSearchOpts} opts
   */
  async list(opts) {
    this._ensureLoaded();
    const files = await collectMarkdownFiles(this.dir, "sharedContext").catch(() => []);
    logMarkdownFiles(
      "sharedContext list",
      this.dir,
      files.map((file) => file.fileRel)
    );
    let entries = [...this.byId.values()].sort((a, b) => a.id.localeCompare(b.id));
    entries = this._filterTags(entries, opts.tagsAny);
    const offset = decodeCursor(opts.cursor);
    const limit = clampLimit(opts.limit);
    const slice = entries.slice(offset, offset + limit);
    const nextOffset = offset + slice.length;
    const nextCursor =
      nextOffset < entries.length ? encodeCursor(nextOffset) : undefined;
    return {
      items: slice.map(summarizeShared),
      entries: slice,
      nextCursor
    };
  }

  /**
   * @param {import('./repository-types.mjs').ListSearchOpts & { query: string }} opts
   */
  async search(opts) {
    this._ensureLoaded();
    const q = opts.query.trim().toLowerCase();
    let entries = [...this.byId.values()].filter((e) =>
      q ? this._haystackShared(e).includes(q) : true
    );
    entries.sort((a, b) => a.id.localeCompare(b.id));
    entries = this._filterTags(entries, opts.tagsAny);
    const offset = decodeCursor(opts.cursor);
    const limit = clampLimit(opts.limit);
    const slice = entries.slice(offset, offset + limit);
    const nextOffset = offset + slice.length;
    const nextCursor =
      nextOffset < entries.length ? encodeCursor(nextOffset) : undefined;
    return {
      items: slice.map(summarizeShared),
      entries: slice,
      nextCursor
    };
  }

  /**
   * @param {string} id
   */
  async fetch(id) {
    this._ensureLoaded();
    const entry = lookupById(this.byId, id);
    if (!entry) {
      return null;
    }
    return expandFetchEntry(entry, "content", (target) =>
      resolveSharedReference(this.byId, this.byRelPath, target)
    );
  }

  /**
   * @param {{ id?: string, markdown: string, tags: string[] }} payload
   */
  async upsert(payload) {
    this._ensureLoaded();
    const id =
      (payload.id && String(payload.id).trim()) ||
      `ctx-${Date.now().toString(36)}`;
    const safe = fileSafeId(id);
    const name = safe;
    const description = deriveDescriptionFromBody(payload.markdown);
    /** @type {import('./repository-types.mjs').SharedContextEntry} */
    const entry = {
      id: name,
      name,
      description,
      tags: [...payload.tags],
      content: payload.markdown,
      sourceRelPath: `sharedContext/${safe}.md`
    };
    const md = serializeSharedContextMarkdown(entry);
    await mkdir(this.dir, { recursive: true });
    const full = join(this.dir, `${safe}.md`);
    await writeFile(full, md, "utf8");
    await this.load();
    return this.byId.get(entry.id) ?? entry;
  }
}

export class FileMdPromptStore {
  /**
   * @param {string} packageRoot
   */
  constructor(packageRoot) {
    this.packageRoot = packageRoot;
    this.dir = join(packageRoot, "prompts");
    /** @type {Map<string, import('./repository-types.mjs').PromptEntry>} */
    this.byId = new Map();
    /** @type {Map<string, import('./repository-types.mjs').PromptEntry>} */
    this.byRelPath = new Map();
    this._loaded = false;
  }

  _warnSkip(rel, reason) {
    if (process.env.NODE_ENV === "production") return;
    if (process.env.OI_SILENT_PARSE === "1") return;
    if (reason === "MISSING_OPEN_DELIM") return;
    console.warn(`[oi] prompts skip ${rel}: ${reason}`);
  }

  async load() {
    this.byId.clear();
    this.byRelPath.clear();
    const files = await collectMarkdownFiles(this.dir, "prompts");
    logMarkdownFiles(
      "prompts load",
      this.dir,
      files.map((file) => file.fileRel)
    );
    for (const file of files) {
      const raw = await readUtf8(file.absPath);
      const parsed = parsePromptMarkdown(raw);
      if (!parsed.ok) {
        this._warnSkip(file.packageRel, parsed.error);
        continue;
      }
      const entry = promptEntryFromParsed(parsed.fields, parsed.body, file.packageRel);
      if (!entry.id) {
        this._warnSkip(file.packageRel, "EMPTY_NAME");
        continue;
      }
      this.byId.set(entry.id, entry);
      this.byRelPath.set(relPathKey(file.fileRel), entry);
    }
    this._loaded = true;
  }

  _ensureLoaded() {
    if (!this._loaded) throw new Error("FileMdPromptStore: call load() first");
  }

  /**
   * @param {import('./repository-types.mjs').PromptEntry[]} entries
   * @param {string[]} [tagsAny]
   */
  _filterTagsAny(entries, tagsAny) {
    if (!tagsAny?.length) return entries;
    const want = new Set(tagsAny.map((t) => t.toLowerCase()));
    return entries.filter((e) => {
      const toolHits = (e.tools ?? []).some((t) => want.has(t.toLowerCase()));
      const tagHits = (e.tags ?? []).some((t) => want.has(t.toLowerCase()));
      return toolHits || tagHits;
    });
  }

  _haystackPrompt(e) {
    return [
      e.id,
      e.name,
      e.description,
      e.text,
      ...(e.tools ?? []),
      ...(e.tags ?? [])
    ]
      .join("\n")
      .toLowerCase();
  }

  /**
   * @param {import('./repository-types.mjs').ListSearchOpts} opts
   */
  async list(opts) {
    this._ensureLoaded();
    const files = await collectMarkdownFiles(this.dir, "prompts").catch(() => []);
    logMarkdownFiles(
      "prompts list",
      this.dir,
      files.map((file) => file.fileRel)
    );
    let entries = [...this.byId.values()].sort((a, b) => a.id.localeCompare(b.id));
    entries = this._filterTagsAny(entries, opts.tagsAny);
    const offset = decodeCursor(opts.cursor);
    const limit = clampLimit(opts.limit);
    const slice = entries.slice(offset, offset + limit);
    const nextOffset = offset + slice.length;
    const nextCursor =
      nextOffset < entries.length ? encodeCursor(nextOffset) : undefined;
    return {
      items: slice.map(summarizePrompt),
      entries: slice,
      nextCursor
    };
  }

  /**
   * @param {import('./repository-types.mjs').ListSearchOpts & { query: string }} opts
   */
  async search(opts) {
    this._ensureLoaded();
    const q = opts.query.trim().toLowerCase();
    let entries = [...this.byId.values()].filter((e) =>
      q ? this._haystackPrompt(e).includes(q) : true
    );
    entries.sort((a, b) => a.id.localeCompare(b.id));
    entries = this._filterTagsAny(entries, opts.tagsAny);
    const offset = decodeCursor(opts.cursor);
    const limit = clampLimit(opts.limit);
    const slice = entries.slice(offset, offset + limit);
    const nextOffset = offset + slice.length;
    const nextCursor =
      nextOffset < entries.length ? encodeCursor(nextOffset) : undefined;
    return {
      items: slice.map(summarizePrompt),
      entries: slice,
      nextCursor
    };
  }

  /**
   * @param {string} id
   */
  async fetch(id) {
    this._ensureLoaded();
    const entry = lookupById(this.byId, id);
    if (!entry) {
      return null;
    }
    return expandFetchEntry(entry, "text", (target) =>
      resolvePromptReference(this.byId, this.byRelPath, target)
    );
  }

  /**
   * @param {import('./repository-types.mjs').PromptUpsertPayload} payload
   */
  async upsert(payload) {
    this._ensureLoaded();
    const id =
      (payload.id && String(payload.id).trim()) ||
      `prompt-${Date.now().toString(36)}`;
    const safe = fileSafeId(id);
    const existing = this.byId.get(safe) ?? this.byId.get(id);

    /** @type {import('./repository-types.mjs').PromptEntry} */
    const entry = {
      id: safe,
      name: safe,
      description: existing?.description ?? deriveDescriptionFromBody(payload.text),
      model: existing?.model ?? "openai:gpt-4o-mini",
      tools: [...payload.requiredTools],
      allowedAgents: existing?.allowedAgents ?? [],
      memory: existing?.memory ?? "thread",
      tags: [...(payload.tags ?? [])],
      text: payload.text,
      sourceRelPath: `prompts/${safe}.md`
    };

    const md = serializePromptMarkdown(entry);
    await mkdir(this.dir, { recursive: true });
    const full = join(this.dir, `${safe}.md`);
    await writeFile(full, md, "utf8");
    await this.load();
    return this.byId.get(entry.id) ?? entry;
  }
}

function deriveDescriptionFromBody(body) {
  const line = body
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (!line) return "";
  return line.length > 200 ? `${line.slice(0, 197)}...` : line;
}

/**
 * @param {string} [packageRoot] defaults to REPOSITORY_FOLDER resolved from the project root
 */
export async function createFileMdRepositories(packageRoot = resolveDefaultPackageRoot()) {
  const sharedContext = new FileMdSharedContextStore(packageRoot);
  const prompts = new FileMdPromptStore(packageRoot);
  await Promise.all([sharedContext.load(), prompts.load()]);
  return {
    packageRoot,
    sharedContext,
    prompts,
    async reload() {
      await Promise.all([sharedContext.load(), prompts.load()]);
    }
  };
}

let _singleton = /** @type {Awaited<ReturnType<typeof createFileMdRepositories>> | null} */ (null);

export async function getOiFileRepositories() {
  if (!_singleton) {
    _singleton = await createFileMdRepositories();
  }
  return _singleton;
}

export async function reloadOiFileRepositories() {
  if (!_singleton) {
    _singleton = await createFileMdRepositories();
  } else {
    await _singleton.reload();
  }
  return _singleton;
}
