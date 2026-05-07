import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  splitFrontmatter,
  parseYamlSubset,
  parsePromptMarkdown,
  promptEntryFromParsed,
  sharedContextEntryFromParsed,
  serializePromptMarkdown,
  serializeSharedContextMarkdown
} from "../lib/oi/parseFrontmatter.mjs";

describe("splitFrontmatter", () => {
  test("rejects file without opening ---", () => {
    const r = splitFrontmatter("# Hello\n---\n");
    assert.equal(r.ok, false);
    assert.equal(r.error, "MISSING_OPEN_DELIM");
  });

  test("rejects missing closing delimiter", () => {
    const r = splitFrontmatter("---\nname: x\n");
    assert.equal(r.ok, false);
    assert.equal(r.error, "MISSING_CLOSE_DELIM");
  });

  test("splits frontmatter and body", () => {
    const raw = "---\na: b\n---\n\nHello\n";
    const r = splitFrontmatter(raw);
    assert.equal(r.ok, true);
    assert.equal(r.frontmatter, "a: b");
    assert.equal(r.body.trim(), "Hello");
  });
});

describe("parseYamlSubset", () => {
  test("parses scalars and list block", () => {
    const yaml = `name: calc
model: openai:gpt-4o-mini
tools:
  - basic_math
  - other
allowed_agents: []
memory: thread`;
    const o = parseYamlSubset(yaml);
    assert.equal(o.name, "calc");
    assert.equal(o.model, "openai:gpt-4o-mini");
    assert.deepEqual(o.tools, ["basic_math", "other"]);
    assert.deepEqual(o.allowed_agents, []);
    assert.equal(o.memory, "thread");
  });
});

describe("parsePromptMarkdown + serialization", () => {
  test("accepts plain markdown without frontmatter", () => {
    const parsed = parsePromptMarkdown("Plain title\n\nBody paragraph.\n");
    assert.equal(parsed.ok, true);
    const promptEntry = promptEntryFromParsed(parsed.fields, parsed.body, "prompts/plain-file.md");
    const sharedEntry = sharedContextEntryFromParsed(
      parsed.fields,
      parsed.body,
      "sharedContext/plain-context.md"
    );

    assert.equal(promptEntry.id, "plain-file");
    assert.equal(promptEntry.description, "Plain title");
    assert.equal(promptEntry.text.trim(), "Plain title\n\nBody paragraph.");
    assert.deepEqual(promptEntry.tools, []);
    assert.equal(sharedEntry.id, "plain-context");
    assert.equal(sharedEntry.description, "Plain title");
    assert.equal(sharedEntry.content.trim(), "Plain title\n\nBody paragraph.");
    assert.deepEqual(sharedEntry.tags, []);
  });

  test("keeps malformed frontmatter strict", () => {
    const parsed = parsePromptMarkdown("---\nname: broken\nBody without closing");
    assert.equal(parsed.ok, false);
    assert.equal(parsed.error, "MISSING_CLOSE_DELIM");
  });

  test("round-trips a minimal prompt", () => {
    const raw = `---
name: p1
description: Desc
model: openai:gpt-4o-mini
tools:
  - t1
allowed_agents: []
memory: thread
---
Body line 1
`;
    const parsed = parsePromptMarkdown(raw);
    assert.equal(parsed.ok, true);
    const entry = promptEntryFromParsed(parsed.fields, parsed.body, "prompts/p1.md");
    assert.equal(entry.id, "p1");
    assert.deepEqual(entry.tools, ["t1"]);
    assert.ok(entry.text.includes("Body line 1"));
    const again = parsePromptMarkdown(serializePromptMarkdown(entry));
    assert.equal(again.ok, true);
    const e2 = promptEntryFromParsed(again.fields, again.body, entry.sourceRelPath);
    assert.deepEqual(e2.tools, entry.tools);
    assert.equal(e2.text.trim(), entry.text.trim());
  });

  test("round-trips shared context with tags", () => {
    const raw = `---
name: doc
description: D
tags:
  - tone
  - style
---
Content here.
`;
    const parsed = parsePromptMarkdown(raw);
    assert.equal(parsed.ok, true);
    const entry = sharedContextEntryFromParsed(parsed.fields, parsed.body, "sharedContext/doc.md");
    assert.deepEqual(entry.tags, ["tone", "style"]);
    const md = serializeSharedContextMarkdown(entry);
    const p2 = parsePromptMarkdown(md);
    assert.equal(p2.ok, true);
    const e2 = sharedContextEntryFromParsed(p2.fields, p2.body, entry.sourceRelPath);
    assert.deepEqual(e2.tags, entry.tags);
    assert.equal(e2.content.trim(), "Content here.");
  });
});
