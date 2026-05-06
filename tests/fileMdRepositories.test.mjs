import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFileMdRepositories } from "../lib/oi/fileMdRepositories.mjs";

describe("FileMdRepositories (temp dirs)", () => {
  /** @type {string} */
  let base;

  before(async () => {
    base = await mkdtemp(join(tmpdir(), "oi-md-repo-"));
    await mkdir(join(base, "prompts"), { recursive: true });
    await mkdir(join(base, "sharedContext"), { recursive: true });
    await writeFile(
      join(base, "prompts", "alpha.md"),
      `---
name: alpha
description: Alpha prompt
model: openai:gpt-4o-mini
tools:
  - tool_a
allowed_agents: []
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
description: Beta ctx
tags:
  - sales
  - tone
---
Beta content.
`,
      "utf8"
    );
  });

  after(async () => {
    await rm(base, { recursive: true, force: true });
  });

  test("loads prompts and shared context", async () => {
    const r = await createFileMdRepositories(base);
    const p = await r.prompts.fetch("alpha");
    assert.ok(p);
    assert.equal(p.text.trim(), "Alpha body.");
    assert.deepEqual(p.tools, ["tool_a"]);

    const s = await r.sharedContext.fetch("beta");
    assert.ok(s);
    assert.equal(s.content.trim(), "Beta content.");
    assert.deepEqual(s.tags, ["sales", "tone"]);
  });

  test("search finds by substring", async () => {
    const r = await createFileMdRepositories(base);
    const pr = await r.prompts.search({ query: "tool_a" });
    assert.ok(pr.items.some((i) => i.id === "alpha"));
    const sc = await r.sharedContext.search({ query: "sales" });
    assert.ok(sc.items.some((i) => i.id === "beta"));
  });

  test("list filters shared context by tagsAny", async () => {
    const r = await createFileMdRepositories(base);
    const hit = await r.sharedContext.list({ tagsAny: ["tone"] });
    assert.ok(hit.items.some((i) => i.id === "beta"));
    const miss = await r.sharedContext.list({ tagsAny: ["nonexistent-tag"] });
    assert.equal(miss.items.length, 0);
  });
});
