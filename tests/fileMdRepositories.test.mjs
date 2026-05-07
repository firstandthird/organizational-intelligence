import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { createFileMdRepositories } from "../lib/oi/fileMdRepositories.mjs";

describe("FileMdRepositories (temp dirs)", () => {
  /** @type {string} */
  let base;
  /** @type {string | undefined} */
  let previousRepositoryFolder;

  before(async () => {
    previousRepositoryFolder = process.env.REPOSITORY_FOLDER;
    base = await mkdtemp(join(tmpdir(), "oi-md-repo-"));
    await mkdir(join(base, "prompts"), { recursive: true });
    await mkdir(join(base, "sharedContext"), { recursive: true });
    await writeFile(
      join(base, "prompts", "alpha.md"),
      `---
name: alpha
title: Alpha Prompt
description: Alpha prompt
model: openai:gpt-4o-mini
tools:
  - tool_a
allowed_agents: []
tags:
  - engineering
audience:
  - developers
use_when:
  - Testing prompt metadata
context:
  - beta
arguments:
  - request
memory: thread
---
Alpha body.
`,
      "utf8"
    );
    await writeFile(
      join(base, "sharedContext", "beta.md"),
      `---
name: beta
title: Beta Context
description: Beta ctx
tags:
  - sales
  - tone
audience:
  - marketers
use_when:
  - Writing sales copy
context:
  - alpha
---
Beta content.
`,
      "utf8"
    );
  });

  after(async () => {
    if (previousRepositoryFolder === undefined) {
      delete process.env.REPOSITORY_FOLDER;
    } else {
      process.env.REPOSITORY_FOLDER = previousRepositoryFolder;
    }
    await rm(base, { recursive: true, force: true });
  });

  test("loads prompts and shared context", async () => {
    const r = await createFileMdRepositories(base);
    const p = await r.prompts.fetch("alpha");
    assert.ok(p);
    assert.equal(p.text.trim(), "Alpha body.");
    assert.deepEqual(p.tools, ["tool_a"]);
    assert.equal(p.title, "Alpha Prompt");
    assert.deepEqual(p.tags, ["engineering"]);
    assert.deepEqual(p.audience, ["developers"]);
    assert.deepEqual(p.useWhen, ["Testing prompt metadata"]);
    assert.deepEqual(p.context, ["beta"]);
    assert.deepEqual(p.arguments, ["request"]);

    const s = await r.sharedContext.fetch("beta");
    assert.ok(s);
    assert.equal(s.content.trim(), "Beta content.");
    assert.deepEqual(s.tags, ["sales", "tone"]);
    assert.equal(s.title, "Beta Context");
    assert.deepEqual(s.audience, ["marketers"]);
    assert.deepEqual(s.useWhen, ["Writing sales copy"]);
    assert.deepEqual(s.context, ["alpha"]);
  });

  test("loads plain markdown files without frontmatter", async () => {
    await writeFile(
      join(base, "prompts", "plain-prompt.md"),
      "Plain prompt title\n\nPrompt body without frontmatter.\n",
      "utf8"
    );
    await writeFile(
      join(base, "sharedContext", "plain-context.md"),
      "Plain context title\n\nContext body without frontmatter.\n",
      "utf8"
    );

    const r = await createFileMdRepositories(base);
    const prompt = await r.prompts.fetch("plain-prompt");
    const shared = await r.sharedContext.fetch("plain-context");

    assert.ok(prompt);
    assert.ok(shared);
    assert.equal(prompt.description, "Plain prompt title");
    assert.equal(prompt.text.trim(), "Plain prompt title\n\nPrompt body without frontmatter.");
    assert.deepEqual(prompt.tools, []);
    assert.equal(shared.description, "Plain context title");
    assert.equal(shared.content.trim(), "Plain context title\n\nContext body without frontmatter.");
    assert.deepEqual(shared.tags, []);
  });

  test("search finds by substring", async () => {
    const r = await createFileMdRepositories(base);
    const pr = await r.prompts.search({ query: "tool_a" });
    assert.ok(pr.items.some((i) => i.id === "alpha"));
    const prMetadata = await r.prompts.search({ query: "Testing prompt metadata" });
    assert.ok(prMetadata.items.some((i) => i.id === "alpha"));
    const sc = await r.sharedContext.search({ query: "sales" });
    assert.ok(sc.items.some((i) => i.id === "beta"));
    const scMetadata = await r.sharedContext.search({ query: "marketers" });
    assert.ok(scMetadata.items.some((i) => i.id === "beta"));
  });

  test("list filters shared context by tagsAny", async () => {
    const r = await createFileMdRepositories(base);
    const hit = await r.sharedContext.list({ tagsAny: ["tone"] });
    assert.ok(hit.items.some((i) => i.id === "beta"));
    const miss = await r.sharedContext.list({ tagsAny: ["nonexistent-tag"] });
    assert.equal(miss.items.length, 0);
  });

  test("default package root resolves REPOSITORY_FOLDER to the staged app copy", async () => {
    const sourceRoot = await mkdtemp(join(tmpdir(), "oi-source-repo-"));
    const stagedCopyRoot = join(process.cwd(), basename(sourceRoot));
    await mkdir(join(stagedCopyRoot, "prompts"), { recursive: true });
    await mkdir(join(stagedCopyRoot, "sharedContext"), { recursive: true });
    await writeFile(
      join(stagedCopyRoot, "prompts", "alpha.md"),
      `---
name: alpha
description: Alpha prompt
model: openai:gpt-4o-mini
tools:
  - tool_a
allowed_agents: []
memory: thread
---
Alpha body from staged copy.
`,
      "utf8"
    );
    await writeFile(
      join(stagedCopyRoot, "sharedContext", "beta.md"),
      `---
name: beta
description: Beta ctx
tags:
  - sales
---
Beta content from staged copy.
`,
      "utf8"
    );

    process.env.REPOSITORY_FOLDER = sourceRoot;

    try {
      const r = await createFileMdRepositories();
      const p = await r.prompts.fetch("alpha");
      const s = await r.sharedContext.fetch("beta");

      assert.ok(p);
      assert.ok(s);
      assert.equal(p.text.trim(), "Alpha body from staged copy.");
      assert.equal(s.content.trim(), "Beta content from staged copy.");
      assert.equal(r.packageRoot, stagedCopyRoot);
    } finally {
      await rm(stagedCopyRoot, { recursive: true, force: true });
      await rm(sourceRoot, { recursive: true, force: true });
    }
  });
});
