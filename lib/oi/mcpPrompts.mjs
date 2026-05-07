/**
 * @param {import("./repository-types.mjs").PromptEntry} entry
 */
export function promptEntryToMcpPrompt(entry) {
  const args = entry.arguments ?? [];

  return {
    name: entry.id,
    ...(entry.title ? { title: entry.title } : {}),
    ...(entry.description ? { description: entry.description } : {}),
    ...(args.length
      ? {
          arguments: args.map((name) => ({
            name,
            description: `Value for ${name}.`,
            required: false
          }))
        }
      : {}),
    _meta: promptEntryMeta(entry)
  };
}

/**
 * @param {import("./repository-types.mjs").PromptEntry} entry
 * @param {Record<string, string>} [args]
 */
export function promptEntryToMcpGetResult(entry, args = {}) {
  const text = applyPromptArguments(entry.text, args);

  return {
    ...(entry.description ? { description: entry.description } : {}),
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text,
          _meta: {
            ...promptEntryMeta(entry),
            arguments: args
          }
        }
      }
    ],
    _meta: promptEntryMeta(entry)
  };
}

/**
 * @param {string} text
 * @param {Record<string, string>} args
 */
export function applyPromptArguments(text, args) {
  let rendered = text;
  for (const [key, value] of Object.entries(args)) {
    const escapedKey = escapeRegExp(key);
    rendered = rendered
      .replace(new RegExp(`{{\\s*${escapedKey}\\s*}}`, "g"), value)
      .replace(new RegExp(`{\\s*${escapedKey}\\s*}`, "g"), value);
  }
  return rendered;
}

/**
 * @param {import("./repository-types.mjs").PromptEntry} entry
 */
function promptEntryMeta(entry) {
  return {
    id: entry.id,
    sourceRelPath: entry.sourceRelPath,
    model: entry.model,
    tools: entry.tools ?? [],
    tags: entry.tags ?? [],
    audience: entry.audience ?? [],
    useWhen: entry.useWhen ?? [],
    context: entry.context ?? [],
    memory: entry.memory
  };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
