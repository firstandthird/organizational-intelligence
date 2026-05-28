#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  prepareDataRepoToolStubs,
  removeGeneratedToolStubs
} from "./lib/oi/dataRepoToolStubs.mjs";

const require = createRequire(import.meta.url);
const projectRoot = dirname(fileURLToPath(import.meta.url));
const hostToolsDir = join(projectRoot, "tools");
const hostNodeModulesHook = fileURLToPath(new URL("./lib/oi/hostNodeModulesHook.mjs", import.meta.url));
const cli = require.resolve("ai-agent-framework/dist/cli.js");

function appendNodeOption(existing, option) {
  return existing ? `${existing} ${option}` : option;
}

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

function hasArg(argv, flag) {
  return argv.some((arg, index) => arg === flag && argv[index + 1] !== undefined);
}

function hasPortArg(argv) {
  return hasArg(argv, "--port") || hasArg(argv, "-p");
}

/**
 * @param {{ args: string[], dataPath?: string }} parsed
 * @param {NodeJS.ProcessEnv} baseEnv
 * @param {string} cwd
 * @param {{ hostToolsDirectory?: string }} [options]
 * @returns {{ env: NodeJS.ProcessEnv, stubPaths: string[] }}
 */
export function buildOiRuntimeEnv(parsed, baseEnv = process.env, cwd = process.cwd(), options = {}) {
  const env = { ...baseEnv };
  const hostToolsDirectory = options.hostToolsDirectory ?? hostToolsDir;
  let stubPaths = [];

  if (parsed.dataPath === undefined) {
    return { env, stubPaths };
  }

  const dataRoot = resolve(cwd, parsed.dataPath);
  env.REPOSITORY_FOLDER = dataRoot;

  if (!hasArg(parsed.args, "--tools-dir")) {
    stubPaths = prepareDataRepoToolStubs(hostToolsDirectory, join(dataRoot, "tools"));
    if (stubPaths.length > 0) {
      env.OI_HOST_ROOT = projectRoot;
      env.NODE_OPTIONS = appendNodeOption(
        env.NODE_OPTIONS,
        `--import=${pathToFileURL(hostNodeModulesHook).href}`
      );
    }
  }

  return { env, stubPaths };
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

  const { env, stubPaths } = buildOiRuntimeEnv(parsed);
  let exitCode = 1;

  try {
    const result = spawnSync(process.execPath, [cli, ...forwarded], {
      cwd: projectRoot,
      env,
      stdio: "inherit"
    });
    exitCode = result.status ?? 1;
  } finally {
    removeGeneratedToolStubs(stubPaths);
  }

  process.exit(exitCode);
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
