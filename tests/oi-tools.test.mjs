import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  GetPromptResultSchema,
  ListPromptsResultSchema
} from "@modelcontextprotocol/sdk/types.js";

/** @type {Awaited<ReturnType<typeof import("../tools/oi.mjs")>>["default"]} */
let mod;
/** @type {string} */
let base;
/** @type {string | undefined} */
let previousRepositoryFolder;

function tool(name) {
  const t = mod.tools.find((x) => x.name === name);
  assert.ok(t, `tool ${name}`);
  return t;
}

describe("tools/oi.mjs", () => {
  before(async () => {
    previousRepositoryFolder = process.env.REPOSITORY_FOLDER;
    base = await mkdtemp(join(tmpdir(), "oi-tools-"));
    await mkdir(join(base, "prompts"), { recursive: true });
    await mkdir(join(base, "sharedContext"), { recursive: true });
    await writeFile(
      join(base, "sharedContext", "styleguide.md"),
      `---
name: styleguide
title: Styleguide
description: Tone and writing guidance
tags:
  - tone
audience:
  - agents
use_when:
  - Writing in the organization voice
---
Use this styleguide for tone.
`,
      "utf8"
    );
    await writeFile(
      join(base, "prompts", "calc.md"),
      `---
name: calc
title: Calculator Prompt
description: Calc Agent
model: openai:gpt-4o-mini
tools:
  - basic_math
allowed_agents: []
tags:
  - math
audience:
  - developers
use_when:
  - Solving arithmetic tasks
context:
  - styleguide
arguments:
  - request
memory: thread
---
Calc Agent prompt body for {{ request }}.
`,
      "utf8"
    );
    await writeFile(
      join(base, "prompts", "unsplash.md"),
      `---
name: unsplash
description: Unsplash search prompt
model: openai:gpt-4o-mini
tools: []
allowed_agents: []
tags:
  - images
memory: thread
---
Find images from Unsplash.
`,
      "utf8"
    );

    process.env.REPOSITORY_FOLDER = base;
    mod = (await import(`../tools/oi.mjs?fixture=${Date.now()}`)).default;
  });

  after(async () => {
    if (previousRepositoryFolder === undefined) {
      delete process.env.REPOSITORY_FOLDER;
    } else {
      process.env.REPOSITORY_FOLDER = previousRepositoryFolder;
    }
    await rm(base, { recursive: true, force: true });
  });

  test("oi_manifest returns available context and prompts", async () => {
    const r = await tool("oi_manifest").run({ operation: "get" });

    assert.ok(r.data.packageRoot);
    assert.ok(Array.isArray(r.data.sharedContext));
    assert.ok(Array.isArray(r.data.prompts));
    assert.ok(Array.isArray(r.data.recommendedWorkflow));
    assert.ok(r.data.sharedContext.some((i) => i.id === "styleguide"));
    assert.ok(r.data.prompts.some((i) => i.id === "calc"));
  });

  test("exports MCP-native prompt list", async () => {
    assert.ok(mod.prompts);
    const r = await mod.prompts.list();

    ListPromptsResultSchema.parse(r);
    const calc = r.prompts.find((p) => p.name === "calc");

    assert.ok(calc);
    assert.equal(calc.title, "Calculator Prompt");
    assert.equal(calc.description, "Calc Agent");
    assert.deepEqual(calc.arguments, [
      {
        name: "request",
        description: "Value for request.",
        required: false
      }
    ]);
    assert.deepEqual(calc._meta.tools, ["basic_math"]);
    assert.deepEqual(calc._meta.tags, ["math"]);
    assert.deepEqual(calc._meta.useWhen, ["Solving arithmetic tasks"]);
  });

  test("exports MCP-native prompt get result", async () => {
    const r = await mod.prompts.get({
      name: "calc",
      arguments: {
        request: "2 + 2"
      }
    });

    GetPromptResultSchema.parse(r);
    assert.equal(r.description, "Calc Agent");
    assert.equal(r.messages.length, 1);
    assert.equal(r.messages[0].role, "user");
    assert.equal(r.messages[0].content.type, "text");
    assert.equal(r.messages[0].content.text.trim(), "Calc Agent prompt body for 2 + 2.");
    assert.deepEqual(r.messages[0].content._meta.arguments, { request: "2 + 2" });
    assert.deepEqual(r._meta.context, ["styleguide"]);
  });

  test("oi_manifest can omit recommended workflow", async () => {
    const r = await tool("oi_manifest").run({
      operation: "get",
      includeWorkflow: false
    });

    assert.equal(r.data.recommendedWorkflow, undefined);
    assert.ok(r.data.prompts.some((i) => i.id === "unsplash"));
  });

  test("oi_shared_context list includes styleguide", async () => {
    const r = await tool("oi_shared_context").run({ operation: "list" });
    assert.equal(r.data.notImplemented, undefined);
    const ids = r.data.items.map((i) => i.id);
    assert.ok(ids.includes("styleguide"));
  });

  test("oi_shared_context list with tagsAny", async () => {
    const r = await tool("oi_shared_context").run({
      operation: "list",
      tagsAny: ["tone"]
    });
    assert.ok(r.data.items.some((i) => i.id === "styleguide"));
  });

  test("oi_shared_context fetch returns entry", async () => {
    const r = await tool("oi_shared_context").run({
      operation: "fetch",
      id: "styleguide"
    });
    assert.equal(r.data.notFound, undefined);
    assert.equal(r.data.entry.id, "styleguide");
    assert.ok(r.data.entry.content.includes("styleguide"));
  });

  test("oi_prompt_repository fetch calc", async () => {
    const r = await tool("oi_prompt_repository").run({
      operation: "fetch",
      id: "calc"
    });
    assert.equal(r.data.notFound, undefined);
    assert.deepEqual(r.data.entry.tools, ["basic_math"]);
    assert.ok(r.data.entry.text.includes("Calc Agent"));
  });

  test("oi_prompt_repository search", async () => {
    const r = await tool("oi_prompt_repository").run({
      operation: "search",
      query: "unsplash"
    });
    assert.ok(r.data.items.some((i) => i.id === "unsplash"));
  });

  test("oi_sub_mcp_proxy list_servers with empty MCP_PROXY_SERVERS", async () => {
    const prev = process.env.MCP_PROXY_SERVERS;
    delete process.env.MCP_PROXY_SERVERS;
    try {
      const r = await tool("oi_sub_mcp_proxy").run({ operation: "list_servers" });
      assert.ok(Array.isArray(r.data.servers));
      assert.equal(r.data.servers.length, 0);
    } finally {
      if (prev !== undefined) {
        process.env.MCP_PROXY_SERVERS = prev;
      } else {
        delete process.env.MCP_PROXY_SERVERS;
      }
    }
  });

  test("oi_sub_mcp_proxy listServers returns same shape", async () => {
    const prev = process.env.MCP_PROXY_SERVERS;
    delete process.env.MCP_PROXY_SERVERS;
    try {
      const r = await tool("oi_sub_mcp_proxy").run({ operation: "listServers" });
      assert.ok(Array.isArray(r.data.servers));
      assert.equal(r.data.servers.length, 0);
    } finally {
      if (prev !== undefined) {
        process.env.MCP_PROXY_SERVERS = prev;
      } else {
        delete process.env.MCP_PROXY_SERVERS;
      }
    }
  });

  test("oi_sub_mcp_proxy list_tools rejects unknown server when config empty", async () => {
    const prev = process.env.MCP_PROXY_SERVERS;
    delete process.env.MCP_PROXY_SERVERS;
    try {
      const r = await tool("oi_sub_mcp_proxy").run({
        operation: "list_tools",
        serverId: "0"
      });
      assert.equal(r.data.error, "UNKNOWN_SERVER");
    } finally {
      if (prev !== undefined) {
        process.env.MCP_PROXY_SERVERS = prev;
      } else {
        delete process.env.MCP_PROXY_SERVERS;
      }
    }
  });

  test("invalid operation input is rejected by zod", async () => {
    await assert.rejects(
      () => tool("oi_shared_context").run({ operation: "delete" }),
      /Invalid (discriminator value|input)/i
    );
  });
});
