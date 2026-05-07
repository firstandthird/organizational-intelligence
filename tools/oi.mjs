// Organizational Intelligence MCP gateway — file-backed shared context + prompts; sub-MCP proxy stub.
// Schemas use zod/v3 so MCP SDK validateToolInput uses v3 safeParse, not z4mini (see @modelcontextprotocol/sdk zod-compat).
import { z } from "zod/v3";
import { getOiFileRepositories } from "../lib/oi/fileMdRepositories.mjs";
import { handleSubMcpProxy } from "../lib/oi/subMcpProxy.mjs";

const repositoryInitialization = getOiFileRepositories()
  .then((repositories) => {
    console.log(`[oi] repositories initialized from ${repositories.packageRoot}`);
    return repositories;
  })
  .catch((error) => {
    console.error(`[oi] repository initialization failed: ${error.message}`);
    throw error;
  });

/** Shared markdown resources: list, search, fetch, upsert. No delete. */
const sharedContextOperationSchema = z.discriminatedUnion("operation", [
  z.object({
    operation: z.literal("list"),
    cursor: z.string().optional(),
    limit: z.number().int().positive().max(200).optional(),
    tagsAny: z.array(z.string()).optional()
  }),
  z.object({
    operation: z.literal("search"),
    query: z.string(),
    cursor: z.string().optional(),
    limit: z.number().int().positive().max(200).optional(),
    tagsAny: z.array(z.string()).optional()
  }),
  z.object({
    operation: z.literal("fetch"),
    id: z.string()
  }),
  z.object({
    operation: z.literal("upsert"),
    id: z.string().optional(),
    markdown: z.string(),
    tags: z.array(z.string())
  })
]);

/** Reusable prompts: list, search, fetch, upsert. No delete. */
const promptRepositoryOperationSchema = z.discriminatedUnion("operation", [
  z.object({
    operation: z.literal("list"),
    cursor: z.string().optional(),
    limit: z.number().int().positive().max(200).optional(),
    tagsAny: z.array(z.string()).optional()
  }),
  z.object({
    operation: z.literal("search"),
    query: z.string(),
    cursor: z.string().optional(),
    limit: z.number().int().positive().max(200).optional(),
    tagsAny: z.array(z.string()).optional()
  }),
  z.object({
    operation: z.literal("fetch"),
    id: z.string()
  }),
  z.object({
    operation: z.literal("upsert"),
    id: z.string().optional(),
    text: z.string(),
    tags: z.array(z.string()),
    requiredTools: z.array(z.string())
  })
]);

/** Discover sub-MCP servers / tools and invoke proxied tools (e.g. Sheet MCP on another host).
 * Include camelCase operation literals so MCP JSON-Schema validation (no z.preprocess) accepts LLM output.
 */
const subMcpProxyOperationSchema = z.discriminatedUnion("operation", [
  z.object({
    operation: z.literal("list_servers")
  }),
  z.object({
    operation: z.literal("listServers")
  }),
  z.object({
    operation: z.literal("list_tools"),
    serverId: z.string()
  }),
  z.object({
    operation: z.literal("listTools"),
    serverId: z.string()
  }),
  z.object({
    operation: z.literal("invoke"),
    serverId: z.string(),
    toolName: z.string(),
    arguments: z.record(z.unknown()).default({})
  })
]);

/** @param {{ operation: string, serverId?: string }} parsed */
function canonicalizeSubMcpProxyParsed(parsed) {
  switch (parsed.operation) {
    case "listServers":
      return { operation: "list_servers" };
    case "listTools":
      return { operation: "list_tools", serverId: parsed.serverId };
    default:
      return parsed;
  }
}

async function handleSharedContext(op) {
  const { sharedContext } = await repositoryInitialization;
  switch (op.operation) {
    case "list": {
      const r = await sharedContext.list({
        cursor: op.cursor,
        limit: op.limit,
        tagsAny: op.tagsAny
      });
      return {
        summary: `${r.items.length} shared context entr${r.items.length === 1 ? "y" : "ies"}.`,
        data: { items: r.items, nextCursor: r.nextCursor }
      };
    }
    case "search": {
      const r = await sharedContext.search({
        query: op.query,
        cursor: op.cursor,
        limit: op.limit,
        tagsAny: op.tagsAny
      });
      return {
        summary: `${r.items.length} match(es) for shared context search.`,
        data: { items: r.items, nextCursor: r.nextCursor, query: op.query }
      };
    }
    case "fetch": {
      const entry = await sharedContext.fetch(op.id);
      if (!entry) {
        return {
          summary: `Shared context not found: ${op.id}`,
          data: { notFound: true, id: op.id }
        };
      }
      return {
        summary: `Loaded shared context "${entry.id}".`,
        data: { entry }
      };
    }
    case "upsert": {
      const entry = await sharedContext.upsert({
        id: op.id,
        markdown: op.markdown,
        tags: op.tags
      });
      return {
        summary: `Upserted shared context "${entry.id}".`,
        data: { entry }
      };
    }
    default:
      return {
        summary: "Unknown shared context operation.",
        data: { error: "UNKNOWN_OPERATION", op }
      };
  }
}

async function handlePromptRepository(op) {
  const { prompts } = await repositoryInitialization;
  switch (op.operation) {
    case "list": {
      const r = await prompts.list({
        cursor: op.cursor,
        limit: op.limit,
        tagsAny: op.tagsAny
      });
      return {
        summary: `${r.items.length} prompt entr${r.items.length === 1 ? "y" : "ies"}.`,
        data: { items: r.items, nextCursor: r.nextCursor }
      };
    }
    case "search": {
      const r = await prompts.search({
        query: op.query,
        cursor: op.cursor,
        limit: op.limit,
        tagsAny: op.tagsAny
      });
      return {
        summary: `${r.items.length} match(es) for prompt search.`,
        data: { items: r.items, nextCursor: r.nextCursor, query: op.query }
      };
    }
    case "fetch": {
      const entry = await prompts.fetch(op.id);
      if (!entry) {
        return {
          summary: `Prompt not found: ${op.id}`,
          data: { notFound: true, id: op.id }
        };
      }
      return {
        summary: `Loaded prompt "${entry.id}".`,
        data: { entry }
      };
    }
    case "upsert": {
      const entry = await prompts.upsert({
        id: op.id,
        text: op.text,
        tags: op.tags,
        requiredTools: op.requiredTools
      });
      return {
        summary: `Upserted prompt "${entry.id}".`,
        data: { entry }
      };
    }
    default:
      return {
        summary: "Unknown prompt repository operation.",
        data: { error: "UNKNOWN_OPERATION", op }
      };
  }
}

const sharedContextTool = {
  name: "oi_shared_context",
  description:
    "Shared context repository: markdown resources with tags (e.g. coding standards, sales playbooks, tone). Operations: list, search, fetch, upsert. No delete.",
  schema: sharedContextOperationSchema,
  async run(input) {
    const parsed = sharedContextOperationSchema.parse(input);
    return handleSharedContext(parsed);
  }
};

const promptRepositoryTool = {
  name: "oi_prompt_repository",
  description:
    "Prompt repository: reusable prompts with text, tags, and requiredTools (e.g. ['exampleTool']). Operations: list, search, fetch, upsert. No delete.",
  schema: promptRepositoryOperationSchema,
  async run(input) {
    const parsed = promptRepositoryOperationSchema.parse(input);
    return handlePromptRepository(parsed);
  }
};

const subMcpProxyTool = {
  name: "oi_sub_mcp_proxy",
  description:
    "Sub-MCP gateway for MCP_PROXY_SERVERS. Required field `operation` (never `{}`). " +
    "`list_servers` / `listServers`: returns configured servers; each `serverId` is the index string (`\"0\"`, `\"1\"`, …). " +
    "`list_tools` / `listTools`: pass `serverId` to list tools on that remote MCP (Streamable HTTP). " +
    "`invoke`: pass `serverId`, `toolName`, and optional `arguments` object to call a remote tool.",
  schema: subMcpProxyOperationSchema,
  async run(input) {
    const parsed = subMcpProxyOperationSchema.parse(input);
    const canonical = canonicalizeSubMcpProxyParsed(parsed);
    return handleSubMcpProxy(canonical);
  }
};

const moduleDefinition = {
  name: "organizational-intelligence",
  tools: [sharedContextTool, promptRepositoryTool, subMcpProxyTool]
};

export const name = moduleDefinition.name;
export const tools = moduleDefinition.tools;

export {
  sharedContextOperationSchema,
  promptRepositoryOperationSchema,
  subMcpProxyOperationSchema
};

export default moduleDefinition;
