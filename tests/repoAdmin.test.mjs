import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseSyncManifest } from "../lib/oi/repoAdmin/manifest.mjs";
import { shaEquals } from "../lib/oi/repoAdmin/sha.mjs";
import { applyContentSync, getRepoStatusPayload } from "../lib/oi/repoAdmin/syncContent.mjs";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));

describe("repoAdmin manifest", () => {
  test("parseSyncManifest accepts github metadata", () => {
    const parsed = parseSyncManifest({
      repository: "firstandthird/FT-Intelligence",
      ref: "primary",
      sha: "abc123def456",
      baseSha: "def456abc123"
    });
    assert.equal(parsed.ok, true);
    assert.equal(parsed.manifest?.repository, "firstandthird/FT-Intelligence");
  });

  test("shaEquals accepts short and long shas", () => {
    assert.equal(shaEquals("abc1234", "abc1234567890"), true);
  });
});

describe("applyContentSync", () => {
  /** @type {string} */
  let base;
  /** @type {string} */
  let repoRoot;
  /** @type {string | undefined} */
  let previousReadOnly;

  before(() => {
    previousReadOnly = process.env.OI_READ_ONLY;
    delete process.env.OI_READ_ONLY;
    rmSync(join(projectRoot, ".oi"), { recursive: true, force: true });
    base = mkdtempSync(join(tmpdir(), "oi-repo-admin-"));
    repoRoot = join(base, "FT-Intelligence");
    mkdirSync(join(repoRoot, "prompts"), { recursive: true });
    mkdirSync(join(repoRoot, "sharedContext"), { recursive: true });
    writeFileSync(
      join(repoRoot, "prompts", "alpha.md"),
      `---
name: alpha
description: Alpha prompt
model: openai:gpt-4o-mini
tools: []
allowed_agents: []
memory: thread
---
Alpha body.
`,
      "utf8"
    );
    process.env.REPOSITORY_FOLDER = repoRoot;
    process.env.GITHUB_REPOSITORY = "firstandthird/FT-Intelligence";
  });

  after(() => {
    if (previousReadOnly === undefined) {
      delete process.env.OI_READ_ONLY;
    } else {
      process.env.OI_READ_ONLY = previousReadOnly;
    }
    rmSync(base, { recursive: true, force: true });
  });

  test("applyContentSync updates prompts and records revision", async () => {
    const bundleRoot = join(base, "bundle");
    mkdirSync(join(bundleRoot, "prompts"), { recursive: true });
    mkdirSync(join(bundleRoot, "sharedContext"), { recursive: true });
    mkdirSync(join(bundleRoot, "tools"), { recursive: true });
    writeFileSync(
      join(bundleRoot, "prompts", "alpha.md"),
      `---
name: alpha
description: Alpha prompt updated
model: openai:gpt-4o-mini
tools: []
allowed_agents: []
memory: thread
---
Alpha body updated.
`,
      "utf8"
    );

    const tarballPath = join(base, "content.tar.gz");
    const tar = spawnSync("tar", ["-czf", tarballPath, "-C", bundleRoot, "prompts", "sharedContext", "tools"], {
      encoding: "utf8"
    });
    assert.equal(tar.status, 0, tar.stderr);

    const first = await applyContentSync(
      projectRoot,
      {
        repository: "firstandthird/FT-Intelligence",
        ref: "primary",
        sha: "abc1234567890",
        baseSha: ""
      },
      readFileSync(tarballPath)
    );
    assert.equal(first.noop, false);
    assert.equal(first.revision, "abc1234567890");

    const status = await getRepoStatusPayload(projectRoot);
    assert.equal(status.revision, "abc1234567890");
    assert.match(readFileSync(join(repoRoot, "prompts", "alpha.md"), "utf8"), /Alpha body updated/);

    const second = await applyContentSync(
      projectRoot,
      {
        repository: "firstandthird/FT-Intelligence",
        ref: "primary",
        sha: "abc1234567890",
        baseSha: "abc1234567890"
      },
      readFileSync(tarballPath)
    );
    assert.equal(second.noop, true);
  });
});
