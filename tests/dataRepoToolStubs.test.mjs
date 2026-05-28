import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  collectToolModuleFiles,
  generateDataRepoToolStubs,
  prepareDataRepoToolStubs,
  removeGeneratedToolStubs
} from "../lib/oi/dataRepoToolStubs.mjs";
import { buildOiRuntimeEnv } from "../oi.mjs";

describe("dataRepoToolStubs", () => {
  /** @type {string} */
  let base;

  before(() => {
    base = mkdtempSync(join(tmpdir(), "oi-data-tools-"));
    mkdirSync(join(base, "host", "tools"), { recursive: true });
    mkdirSync(join(base, "data", "tools", "nested"), { recursive: true });
    cpSync(new URL("../tools/oi.mjs", import.meta.url), join(base, "host", "tools", "oi.mjs"));
    cpSync(
      new URL("../tools/gitHistory.mjs", import.meta.url),
      join(base, "data", "tools", "portfolioPageBuilder.mjs")
    );
    cpSync(
      new URL("../tools/gitHistory.mjs", import.meta.url),
      join(base, "data", "tools", "nested", "extra.mjs")
    );
  });

  after(() => {
    rmSync(base, { recursive: true, force: true });
  });

  test("collectToolModuleFiles finds nested data-repo tool modules", () => {
    const files = collectToolModuleFiles(join(base, "data", "tools"));
    assert.equal(files.length, 2);
    assert.ok(files.some((file) => file.endsWith("portfolioPageBuilder.mjs")));
    assert.ok(files.some((file) => file.endsWith("extra.mjs")));
  });

  test("generateDataRepoToolStubs writes re-export stubs into the host tools dir", () => {
    const stubPaths = generateDataRepoToolStubs(join(base, "data", "tools"), join(base, "host", "tools"));

    assert.equal(stubPaths.length, 2);
    assert.ok(stubPaths.every((stubPath) => stubPath.includes("zz-data-")));

    const stubSource = readFileSync(stubPaths[0], "utf8");
    assert.match(stubSource, /export \{ name, tools, default \} from "file:\/\//);

    removeGeneratedToolStubs(stubPaths);
    assert.ok(stubPaths.every((stubPath) => !existsSync(stubPath)));
  });
});

describe("buildOiRuntimeEnv", () => {
  /** @type {string} */
  let base;

  before(() => {
    base = mkdtempSync(join(tmpdir(), "oi-runtime-env-"));
    mkdirSync(join(base, "tools"), { recursive: true });
    cpSync(new URL("../tools/gitHistory.mjs", import.meta.url), join(base, "tools", "dataTool.mjs"));
  });

  after(() => {
    rmSync(base, { recursive: true, force: true });
  });

  test("sets REPOSITORY_FOLDER and generates data-repo tool stubs when --data is provided", () => {
    const hostToolsDirectory = join(base, "host-tools");
    mkdirSync(hostToolsDirectory, { recursive: true });
    const { env, stubPaths } = buildOiRuntimeEnv(
      { args: [], dataPath: "." },
      {},
      base,
      { hostToolsDirectory }
    );

    assert.equal(env.REPOSITORY_FOLDER, base);
    assert.equal(stubPaths.length, 1);
    assert.ok(stubPaths[0].startsWith(hostToolsDirectory));
    removeGeneratedToolStubs(stubPaths);
  });

  test("does not generate stubs when --tools-dir is explicitly passed", () => {
    const { env, stubPaths } = buildOiRuntimeEnv(
      { args: ["--tools-dir", "/custom/tools"], dataPath: "." },
      { TOOLS_DIR: "/custom/tools" },
      base
    );

    assert.equal(env.REPOSITORY_FOLDER, base);
    assert.equal(stubPaths.length, 0);
  });
});
