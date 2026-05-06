// Sub-MCP gateway: uses MCP_PROXY_SERVERS (same JSON shape as ai-agent-framework runtimeConfig).
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

/**
 * @typedef {{ url: string, authorization?: string }} McpProxyServerConfig
 */

/** @param {string | undefined} raw */
export function parseMcpProxyServersFromEnv(raw) {
  const normalized = typeof raw === "string" ? raw.trim() : "";
  if (!normalized) {
    return [];
  }
  let parsed;
  try {
    parsed = JSON.parse(normalized);
  } catch (cause) {
    throw new Error("MCP_PROXY_SERVERS must be valid JSON.", { cause });
  }
  if (!Array.isArray(parsed)) {
    throw new Error("MCP_PROXY_SERVERS must be a JSON array.");
  }
  return parsed.map((entry, index) => {
    if (!entry || typeof entry !== "object") {
      throw new Error(`MCP_PROXY_SERVERS[${index}] must be an object.`);
    }
    const url = typeof entry.url === "string" ? entry.url.trim() : "";
    if (!url) {
      throw new Error(`MCP_PROXY_SERVERS[${index}] is missing a non-empty url.`);
    }
    let authorization =
      typeof entry.authorization === "string" ? entry.authorization.trim() : undefined;
    const bearerRaw = entry.bearerToken ?? entry.token;
    const bearer = typeof bearerRaw === "string" ? bearerRaw.trim() : "";
    if (!authorization && bearer) {
      authorization = `Bearer ${bearer}`;
    }
    return { url, authorization };
  });
}

function getServers() {
  return parseMcpProxyServersFromEnv(process.env.MCP_PROXY_SERVERS);
}

/**
 * @param {string} serverId
 * @returns {{ server: McpProxyServerConfig, index: number } | { error: string }}
 */
function resolveServer(serverId) {
  const servers = getServers();
  const idx = Number.parseInt(String(serverId), 10);
  if (!Number.isInteger(idx) || idx < 0 || idx >= servers.length) {
    return {
      error: `Unknown serverId "${serverId}". Configure MCP_PROXY_SERVERS and use serverId from list_servers (0..${
        servers.length > 0 ? servers.length - 1 : "none"
      }).`
    };
  }
  return { server: servers[idx], index: idx };
}

/**
 * @template T
 * @param {McpProxyServerConfig} server
 * @param {(client: Client) => Promise<T>} fn
 */
async function withClient(server, fn) {
  const url = new URL(server.url);
  const client = new Client({ name: "oi-sub-mcp-proxy", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(url, {
    requestInit: server.authorization
      ? { headers: { Authorization: server.authorization } }
      : undefined
  });
  await client.connect(transport);
  try {
    return await fn(client);
  } finally {
    await client.close().catch(() => {});
  }
}

/**
 * @param {{ operation: string, serverId?: string, toolName?: string, arguments?: Record<string, unknown> }} parsed
 */
export async function handleSubMcpProxy(parsed) {
  const op = parsed.operation;

  try {
    if (op === "list_servers") {
      const servers = getServers();
      const items = servers.map((s, i) => ({
        serverId: String(i),
        url: s.url,
        hasAuthorization: Boolean(s.authorization)
      }));
      return {
        summary:
          servers.length === 0
            ? "No MCP proxy servers configured (set MCP_PROXY_SERVERS JSON array)."
            : `${servers.length} MCP proxy server(s) configured (serverId is the index string).`,
        data: { servers: items }
      };
    }

    if (op === "list_tools") {
      const sid = parsed.serverId;
      if (sid == null || String(sid).trim() === "") {
        return {
          summary: "list_tools requires serverId (from list_servers).",
          data: { error: "MISSING_SERVER_ID" }
        };
      }
      const res = resolveServer(sid);
      if ("error" in res) {
        return { summary: res.error, data: { error: "UNKNOWN_SERVER", serverId: sid } };
      }
      try {
        const listed = await withClient(res.server, (c) => c.listTools());
        const tools = (listed.tools ?? []).map((t) => ({
          name: t.name,
          description: typeof t.description === "string" ? t.description : "",
          ...(t.inputSchema != null ? { inputSchema: t.inputSchema } : {})
        }));
        return {
          summary: `${tools.length} tool(s) on server ${res.index} (${res.server.url}).`,
          data: { serverId: String(res.index), url: res.server.url, tools }
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          summary: `list_tools failed: ${msg}`,
          data: { error: "LIST_TOOLS_FAILED", message: msg, serverId: String(res.index) }
        };
      }
    }

    if (op === "invoke") {
      const sid = parsed.serverId;
      if (sid == null || String(sid).trim() === "") {
        return {
          summary: "invoke requires serverId (from list_servers).",
          data: { error: "MISSING_SERVER_ID" }
        };
      }
      const toolName = parsed.toolName;
      if (!toolName || String(toolName).trim() === "") {
        return {
          summary: "invoke requires toolName.",
          data: { error: "MISSING_TOOL_NAME" }
        };
      }
      const res = resolveServer(sid);
      if ("error" in res) {
        return { summary: res.error, data: { error: "UNKNOWN_SERVER", serverId: sid } };
      }
      const args =
        parsed.arguments && typeof parsed.arguments === "object" && !Array.isArray(parsed.arguments)
          ? parsed.arguments
          : {};
      try {
        const result = await withClient(res.server, (c) =>
          c.callTool({
            name: toolName,
            arguments: args
          })
        );
        const isErr = Boolean(result.isError);
        return {
          summary: isErr
            ? `Tool ${toolName} on server ${res.index} returned an error result.`
            : `Invoked ${toolName} on server ${res.index}.`,
          data: {
            serverId: String(res.index),
            url: res.server.url,
            toolName,
            result: isErr
              ? { isError: true, content: result.content }
              : {
                  content: result.content,
                  structuredContent: result.structuredContent
                }
          }
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          summary: `invoke failed: ${msg}`,
          data: {
            error: "INVOKE_FAILED",
            message: msg,
            serverId: String(res.index),
            toolName
          }
        };
      }
    }

    return {
      summary: "Unknown sub-MCP operation.",
      data: { error: "UNKNOWN_OPERATION", operation: op }
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      summary: `Sub-MCP proxy error: ${msg}`,
      data: { error: "SUB_MCP_PROXY_ERROR", message: msg }
    };
  }
}
