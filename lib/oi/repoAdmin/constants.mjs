export const ALLOWED_CONTENT_DIRS = new Set(["prompts", "sharedContext", "tools"]);

export const MARKDOWN_DIRS = new Set(["prompts", "sharedContext"]);

export const SUPPORTED_TOOL_EXTENSIONS = new Set([".js", ".mjs", ".cjs", ".ts", ".mts", ".cts"]);

export const IGNORED_DIRECTORY_NAMES = new Set(["node_modules", ".git", "dist", "coverage"]);

export const MAX_TARBALL_BYTES = 20 * 1024 * 1024;
export const MAX_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_FILE_COUNT = 500;

export const LOCK_STALE_MS = 5 * 60 * 1000;
