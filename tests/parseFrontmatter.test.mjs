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

  test("parses prompt discovery metadata", () => {
    const raw = `---
name: code-review
title: Code Review
description: Review code against standards
model: openai:gpt-4o-mini
tools: []
allowed_agents: []
tags:
  - engineering
  - code-review
audience:
  - developers
use_when:
  - Reviewing code changes
context:
  - coding-standards
arguments:
  - diff
memory: thread
---
Review the supplied diff.
`;
    const parsed = parsePromptMarkdown(raw);
    assert.equal(parsed.ok, true);
    const entry = promptEntryFromParsed(parsed.fields, parsed.body, "prompts/code-review.md");

    assert.equal(entry.title, "Code Review");
    assert.deepEqual(entry.tags, ["engineering", "code-review"]);
    assert.deepEqual(entry.audience, ["developers"]);
    assert.deepEqual(entry.useWhen, ["Reviewing code changes"]);
    assert.deepEqual(entry.context, ["coding-standards"]);
    assert.deepEqual(entry.arguments, ["diff"]);

    const again = parsePromptMarkdown(serializePromptMarkdown(entry));
    assert.equal(again.ok, true);
    const e2 = promptEntryFromParsed(again.fields, again.body, entry.sourceRelPath);
    assert.equal(e2.title, entry.title);
    assert.deepEqual(e2.useWhen, entry.useWhen);
    assert.deepEqual(e2.context, entry.context);
    assert.deepEqual(e2.arguments, entry.arguments);
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

  test("parses shared context discovery metadata", () => {
    const raw = `---
name: coding-standards
title: Coding Standards
description: Engineering standards for implementation and review
tags:
  - engineering
  - code-review
audience:
  - developers
use_when:
  - Implementing code
  - Reviewing code
context:
  - agent-usage
---
Standards content.
`;
    const parsed = parsePromptMarkdown(raw);
    assert.equal(parsed.ok, true);
    const entry = sharedContextEntryFromParsed(parsed.fields, parsed.body, "sharedContext/coding-standards.md");

    assert.equal(entry.title, "Coding Standards");
    assert.deepEqual(entry.tags, ["engineering", "code-review"]);
    assert.deepEqual(entry.audience, ["developers"]);
    assert.deepEqual(entry.useWhen, ["Implementing code", "Reviewing code"]);
    assert.deepEqual(entry.context, ["agent-usage"]);

    const again = parsePromptMarkdown(serializeSharedContextMarkdown(entry));
    assert.equal(again.ok, true);
    const e2 = sharedContextEntryFromParsed(again.fields, again.body, entry.sourceRelPath);
    assert.equal(e2.title, entry.title);
    assert.deepEqual(e2.audience, entry.audience);
    assert.deepEqual(e2.useWhen, entry.useWhen);
    assert.deepEqual(e2.context, entry.context);
  });
});
