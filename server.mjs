#!/usr/bin/env node
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mountRepoAdminRoutes } from "./lib/oi/mountRepoAdminRoutes.mjs";

const require = createRequire(import.meta.url);
const frameworkEntry = require.resolve("ai-agent-framework/dist/index.js");

async function loadFramework() {
  return import(pathToFileURL(frameworkEntry).href);
}

const projectRoot = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  /** @type {{ host?: string, port?: number, projectRoot?: string, toolsDir?: string, validateOnly: boolean }} */
  const options = { validateOnly: false };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--host") {
      options.host = argv[++index];
      continue;
    }
    if (arg === "--port" || arg === "-p") {
      options.port = Number(argv[++index]);
      continue;
    }
    if (arg === "--project-root") {
      options.projectRoot = argv[++index];
      continue;
    }
    if (arg === "--tools-dir") {
      options.toolsDir = argv[++index];
      continue;
    }
    if (arg === "--validate" || arg === "--check") {
      options.validateOnly = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (typeof options.port !== "undefined" && (!Number.isFinite(options.port) || options.port <= 0)) {
    throw new Error(`Invalid port: ${options.port}`);
  }

  return options;
}

function printHelp() {
  console.log(
    [
      "Organizational Intelligence server",
      "",
      "Thin host wrapper around ai-agent-framework that adds OI repo-admin routes.",
      "",
      "Usage:",
      "  node server.mjs",
      "  node server.mjs --validate",
      "",
      "Options:",
      "  --host <value>            Override MCP_HOST",
      "  --port, -p <number>       Override MCP_PORT / PORT (default from env or 8080)",
      "  --project-root <path>     Resolve tools and .env files from a different host root",
      "  --tools-dir <path>        Override the host tools directory",
      "  --validate, --check       Validate tool loading then exit",
      "  --help, -h                Show this message"
    ].join("\n")
  );
}

async function main() {
  const framework = await loadFramework();
  const args = parseArgs(process.argv.slice(2));

  framework.configureRuntime({
    host: args.host,
    ...(typeof args.port === "number" ? { port: args.port } : {}),
    projectRoot: args.projectRoot ?? projectRoot,
    toolsDir: args.toolsDir
  });

  const runtime = framework.getRuntimeConfig();
  const loaded = await framework.ensureToolModulesLoaded(runtime.toolsDir);

  console.log(`Project root: ${runtime.projectRoot}`);
  console.log(`Tools directory: ${runtime.toolsDir}`);
  console.log(
    `Loaded tool modules (${framework.getLoadedToolModuleNames().length}): ${framework.getLoadedToolModuleNames().join(", ") || "none"}`
  );
  console.log(
    `Loaded MCP skills (${framework.getAvailableToolNames().length}): ${framework.getAvailableToolNames().join(", ") || "none"}`
  );
  console.log(`Slack route: ${runtime.slackRoute} (${runtime.slack.enabled ? "configured" : "not configured"})`);
  console.log(`MCP route: ${runtime.mcpRoute}`);

  if (args.validateOnly) {
    console.log("Runtime validation passed.");
    return;
  }

  const app = framework.createApp(runtime);
  mountRepoAdminRoutes(app, {
    projectRoot: runtime.projectRoot,
    adminBearerToken: process.env.ADMIN_BEARER_TOKEN?.trim() || undefined
  });

  const server = app.listen(runtime.port, runtime.host, () => {
    console.log(
      `${runtime.serverName} listening on ${runtime.host}:${runtime.port} with ${loaded.tools.length} MCP skill${loaded.tools.length === 1 ? "" : "s"}.`
    );
  });

  const shutdown = () => {
    server.close((error) => {
      if (error) {
        console.error("Error closing server:", error);
      }
      process.exit(error ? 1 : 0);
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

function isMainModule() {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  return import.meta.url === pathToFileURL(resolve(entry)).href;
}

if (isMainModule()) {
  main().catch((error) => {
    console.error("Server error:", error);
    process.exit(1);
  });
}

export { main, parseArgs };
