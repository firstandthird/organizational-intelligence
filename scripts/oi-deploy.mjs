#!/usr/bin/env node
import { spawn } from "node:child_process";
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const deployPath = path.join(projectRoot, "node_modules/ai-agent-framework/scripts/deploy.js");
const deployBackupPath = `${deployPath}.oi-backup`;

function assertDeployFilesPresent() {
  const required = ["server.mjs", "lib/oi/mountRepoAdminRoutes.mjs"];
  const missing = required.filter((relativePath) => !existsSync(path.join(projectRoot, relativePath)));
  if (missing.length === 0) {
    return;
  }
  throw new Error(
    [
      "Cannot deploy OI: required files are missing from the deploy source tree:",
      ...missing.map((file) => `  - ${file}`),
      "",
      "Commit and push these files before running npm run deploy."
    ].join("\n")
  );
}

function patchDeployScript(source) {
  let patched = source.replace(
    /start: `node \.\/node_modules\/\$\{packageName\}\/dist\/cli\.js`/,
    'start: "node server.mjs"'
  );
  patched = patched.replace(
    /"mcp:validate": `node \.\/node_modules\/\$\{packageName\}\/dist\/cli\.js --validate`/,
    '"mcp:validate": "node server.mjs --validate"'
  );

  if (!patched.includes("ADMIN_BEARER_TOKEN:")) {
    patched = patched.replace(
      /SLACK_BOT_TOKEN: env\("SLACK_BOT_TOKEN", ""\)/,
      [
        'SLACK_BOT_TOKEN: env("SLACK_BOT_TOKEN", ""),',
        '    ADMIN_BEARER_TOKEN: env("ADMIN_BEARER_TOKEN", ""),',
        '    GITHUB_REPOSITORY: env("GITHUB_REPOSITORY", ""),',
        '    REPOSITORY_FOLDER: env("REPOSITORY_FOLDER", ""),',
        '    GH_TOKEN: env("GH_TOKEN", ""),',
        '    MCP_PROXY_SERVERS: env("MCP_PROXY_SERVERS", ""),',
        '    OI_READ_ONLY: env("OI_READ_ONLY", ""),',
        '    ORG_INTEL_READ_ONLY: env("ORG_INTEL_READ_ONLY", "")'
      ].join("\n    ")
    );
  }

  if (!patched.includes('"ADMIN_BEARER_TOKEN"')) {
    patched = patched.replace(
      /const SECRET_KEYS = new Set\(\[\s*\n\s*"MCP_AUTH_BEARER_TOKEN",/,
      'const SECRET_KEYS = new Set([\n  "ADMIN_BEARER_TOKEN",\n  "MCP_AUTH_BEARER_TOKEN",'
    );
  }

  if (patched === source) {
    throw new Error("Failed to patch ai-agent-framework deploy script for OI server.mjs entrypoint.");
  }

  return patched;
}

function runNodeDeploy(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [deployPath, ...args], {
      cwd: projectRoot,
      stdio: "inherit",
      env: process.env
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if ((code ?? 1) === 0) {
        resolve(undefined);
        return;
      }
      reject(new Error(`deploy.js exited with status ${code ?? 1}`));
    });
  });
}

async function main() {
  assertDeployFilesPresent();

  if (!existsSync(deployPath)) {
    throw new Error(`Missing deploy script: ${deployPath}`);
  }

  const original = readFileSync(deployPath, "utf8");
  const patched = patchDeployScript(original);

  cpSync(deployPath, deployBackupPath);
  writeFileSync(deployPath, patched, "utf8");

  try {
    await runNodeDeploy(process.argv.slice(2));
  } finally {
    writeFileSync(deployPath, original, "utf8");
    rmSync(deployBackupPath, { force: true });
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
