#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const projectRoot = dirname(fileURLToPath(import.meta.url));
const cli = require.resolve("ai-agent-framework/dist/cli.js");

/**
 * @param {string[]} argv
 * @returns {{ args: string[], dataPath?: string }}
 */
export function parseOiArgs(argv) {
  const args = [];
  let dataPath;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--data") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("Missing value for --data");
      }
      dataPath = value;
      index += 1;
      continue;
    }
    args.push(arg);
  }

  return { args, dataPath };
}

function hasPortArg(argv) {
  return argv.some((arg, index) => (arg === "--port" || arg === "-p") && argv[index + 1] !== undefined);
}

function main() {
  let parsed;
  try {
    parsed = parseOiArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`oi: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }

  const forwarded = [...parsed.args];
  if (!hasPortArg(forwarded)) {
    forwarded.push("--port", "3000");
  }

  const env = { ...process.env };
  if (parsed.dataPath !== undefined) {
    env.REPOSITORY_FOLDER = resolve(process.cwd(), parsed.dataPath);
  }

  const result = spawnSync(process.execPath, [cli, ...forwarded], {
    cwd: projectRoot,
    env,
    stdio: "inherit"
  });

  process.exit(result.status ?? 1);
}

function isMainModule() {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  return import.meta.url === pathToFileURL(resolve(entry)).href;
}

if (isMainModule()) {
  main();
}
