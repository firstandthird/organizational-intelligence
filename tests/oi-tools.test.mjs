import { describe, test } from "node:test";
import assert from "node:assert/strict";
import mod from "../tools/oi.mjs";

function tool(name) {
  const t = mod.tools.find((x) => x.name === name);
  assert.ok(t, `tool ${name}`);
  return t;
}

describe("tools/oi.mjs", () => {
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
