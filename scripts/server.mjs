import "dotenv/config";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  GetPromptRequestSchema,
  ListPromptsRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import mod from "../tools/oi.mjs";

const PORT = Number(process.env.PORT ?? 3000);
const MCP_PATH = process.env.MCP_PATH ?? "/mcp";
const AUTH_TOKEN = process.env.MCP_AUTH_BEARER_TOKEN;

function createServer() {
  const server = new McpServer(
    {
      name: mod.name ?? "organizational-intelligence",
      version: "1.0.0"
    },
    {
      capabilities: {
        tools: { listChanged: true },
        prompts: { listChanged: true }
      }
    }
  );

  for (const tool of mod.tools ?? []) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.schema
      },
      async (input, extra) => {
        const result = await tool.run(input ?? {}, extra);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result)
            }
          ]
        };
      }
    );
  }

  if (mod.prompts) {
    server.server.assertCanSetRequestHandler("prompts/list");
    server.server.assertCanSetRequestHandler("prompts/get");
    server.server.setRequestHandler(ListPromptsRequestSchema, async (request) => {
      return mod.prompts.list(request.params ?? {});
    });
    server.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      return mod.prompts.get(request.params);
    });
  }

  return server;
}

const app = createMcpExpressApp();

app.post(MCP_PATH, async (req, res) => {
  if (!isAuthorized(req)) {
    res.status(401).json({
      jsonrpc: "2.0",
      error: {
        code: -32001,
        message: "Unauthorized"
      },
      id: null
    });
    return;
  }

  const server = createServer();

  try {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
  } catch (error) {
    console.error("Error handling MCP request:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal server error"
        },
        id: null
      });
    }
  }
});

app.get(MCP_PATH, (_req, res) => {
  res.status(405).json({
    jsonrpc: "2.0",
    error: {
      code: -32000,
      message: "Method not allowed."
    },
    id: null
  });
});

app.delete(MCP_PATH, (_req, res) => {
  res.status(405).json({
    jsonrpc: "2.0",
    error: {
      code: -32000,
      message: "Method not allowed."
    },
    id: null
  });
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.listen(PORT, (error) => {
  if (error) {
    console.error("Failed to start MCP server:", error);
    process.exit(1);
  }
  console.log(`Organizational Intelligence MCP server listening on port ${PORT}${MCP_PATH}`);
});

function isAuthorized(req) {
  if (!AUTH_TOKEN) {
    return true;
  }
  const header = req.headers.authorization;
  return header === `Bearer ${AUTH_TOKEN}`;
}
