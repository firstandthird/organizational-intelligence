/**
 * @typedef {Object} SharedContextEntry
 * @property {string} id
 * @property {string} name
 * @property {string} [title]
 * @property {string} description
 * @property {string[]} tags
 * @property {string[]} [audience]
 * @property {string[]} [useWhen]
 * @property {string[]} [context]
 * @property {string} content
 * @property {string} [sourceRelPath] relative path under package root, e.g. sharedContext/styleguide.md
 */

/**
 * @typedef {Object} PromptEntry
 * @property {string} id same as `name` in frontmatter
 * @property {string} name
 * @property {string} [title]
 * @property {string} description
 * @property {string} model
 * @property {string[]} tools
 * @property {string[]} [tags] optional; persisted when non-empty
 * @property {string[]} [audience]
 * @property {string[]} [useWhen]
 * @property {string[]} [context]
 * @property {string[]} [arguments]
 * @property {string[]} allowedAgents
 * @property {string} memory
 * @property {string} text body markdown
 * @property {string} [sourceRelPath]
 */

/**
 * @typedef {Object} ListSearchOpts
 * @property {string} [cursor]
 * @property {number} [limit]
 * @property {string[]} [tagsAny]
 */

/**
 * @typedef {Object} ListResult
 * @property {Array<SharedContextEntry|PromptEntry>} items
 * @property {string} [nextCursor]
 */

/**
 * Repository contract for shared context (DB or file impl).
 * @typedef {Object} SharedContextRepository
 * @property {(opts: ListSearchOpts) => Promise<ListResult>} list
 * @property {(opts: ListSearchOpts & { query: string }) => Promise<ListResult>} search
 * @property {(id: string) => Promise<SharedContextEntry | null>} fetch
 * @property {(payload: { id?: string, markdown: string, tags: string[] }) => Promise<SharedContextEntry>} upsert
 */

/**
 * @typedef {Object} PromptUpsertPayload
 * @property {string} [id]
 * @property {string} text
 * @property {string[]} tags
 * @property {string[]} requiredTools
 */

/**
 * @typedef {Object} PromptRepository
 * @property {(opts: ListSearchOpts) => Promise<ListResult>} list
 * @property {(opts: ListSearchOpts & { query: string }) => Promise<ListResult>} search
 * @property {(id: string) => Promise<PromptEntry | null>} fetch
 * @property {(payload: PromptUpsertPayload) => Promise<PromptEntry>} upsert
 */

export const LIST_DEFAULT_LIMIT = 50;
export const LIST_MAX_LIMIT = 200;
