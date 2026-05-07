import { spawn } from "node:child_process";
import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, isAbsolute, relative, resolve } from "node:path";
import { tmpdir } from "node:os";

const projectRoot = resolve(new URL("..", import.meta.url).pathname);
const requiredEnv = ["GCLOUD_PROJECT_ID", "GCLOUD_REGION"];
const serviceName = process.env.GCLOUD_SERVICE || process.env.SERVICE_NAME;

if (!serviceName) {
  requiredEnv.push("GCLOUD_SERVICE or SERVICE_NAME");
}

const missing = requiredEnv.filter((name) => {
  if (name === "GCLOUD_SERVICE or SERVICE_NAME") {
    return !serviceName;
  }
  return !process.env[name];
});

if (missing.length > 0) {
  throw new Error(`Missing required deploy environment variable(s): ${missing.join(", ")}`);
}

const runtimeEnvKeys = [
  "MCP_AUTH_BEARER_TOKEN",
  "OPENAI_API_KEY",
  "REPOSITORY_FOLDER",
  "SLACK_BOT_TOKEN",
  "SLACK_SIGNING_SECRET"
];

const stageRoot = await mkdtemp(resolve(tmpdir(), "oi-cloud-run-"));
const envFile = resolve(stageRoot, "cloud-run-env.yaml");

try {
  await cp(projectRoot, stageRoot, {
    recursive: true,
    filter: (source) => {
      const rel = relative(projectRoot, source);
      return !rel.startsWith(".git") && !rel.startsWith("node_modules");
    }
  });

  await stageRepositoryFolder(stageRoot);
  await writeFile(envFile, toYaml(runtimeEnvKeys), "utf8");

  await run("gcloud", [
    "run",
    "deploy",
    serviceName,
    "--project",
    process.env.GCLOUD_PROJECT_ID,
    "--region",
    process.env.GCLOUD_REGION,
    "--source",
    stageRoot,
    "--allow-unauthenticated",
    "--env-vars-file",
    envFile
  ]);
} finally {
  await rm(stageRoot, { recursive: true, force: true });
}

async function stageRepositoryFolder(targetRoot) {
  const rawRepositoryFolder = process.env.REPOSITORY_FOLDER;

  if (!rawRepositoryFolder) {
    return;
  }

  const sourcePath = isAbsolute(rawRepositoryFolder)
    ? rawRepositoryFolder
    : resolve(projectRoot, rawRepositoryFolder);
  const sourceInsideProject = relative(projectRoot, sourcePath);

  if (
    !existsSync(sourcePath) ||
    (sourceInsideProject && !sourceInsideProject.startsWith("..") && !isAbsolute(sourceInsideProject))
  ) {
    return;
  }

  await cp(sourcePath, resolve(targetRoot, basename(sourcePath)), {
    recursive: true,
    filter: (source) => {
      const rel = relative(sourcePath, source);
      return !rel.startsWith(".git") && !rel.startsWith("node_modules");
    }
  });
}

function toYaml(keys) {
  return keys
    .filter((key) => process.env[key] !== undefined)
    .map((key) => `${key}: ${JSON.stringify(process.env[key])}`)
    .join("\n")
    .concat("\n");
}

function run(command, args) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      stdio: "inherit"
    });

    child.on("error", rejectRun);
    child.on("exit", (code) => {
      if (code === 0) {
        resolveRun();
        return;
      }
      rejectRun(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
    });
  });
}
