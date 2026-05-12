# Agent Usage Guide

This document explains how agents should use the Organizational Intelligence MCP.
It is generic runtime guidance, not guidance for any one organization or content
pack.

## Purpose

Organizational Intelligence exposes file-backed organizational knowledge,
reusable prompts, and optional proxied MCP tools through a small set of MCP
tools.

Use it to:

- Discover and fetch shared organizational context.
- Discover and fetch reusable prompts.
- Check whether any downstream MCP servers are available.
- Add or update repository content only when explicitly asked.

## Content Root

The runtime reads Markdown content from the configured repository folder.

The expected structure is:

- `sharedContext/*.md` for shared knowledge, standards, style guides, and usage
  guidance.
- `prompts/*.md` for reusable prompts and agent definitions.

The runtime resolves this folder from `REPOSITORY_FOLDER`. In production, the
host deployment should point this at the deployed content repository. For local
development, point it at the adjacent content checkout.

## Tools

### `oi_shared_context`

Use this for durable organizational context.

Supported operations:

- `list`: discover available context documents.
- `search`: find context by topic, audience, tag, or keyword.
- `fetch`: load a specific context document by id.
- `upsert`: create or update a context document.

Prefer `search` when the user gives a specific topic. Prefer `list` when you do
not yet know what context exists.

Search is simple keyword matching, not semantic retrieval. Use short concrete
terms such as `sales`, `voice`, `security`, or `proposal` rather than long
natural-language queries.

### `oi_prompt_repository`

Use this for reusable prompts and agent definitions.

Supported operations:

- `list`: discover available prompts.
- `search`: find prompts by topic, required tool, tag, or keyword.
- `fetch`: load a specific prompt by id.
- `upsert`: create or update a prompt.

Prompt entries can include metadata such as model, required tools, allowed
agents, tags, and memory behavior.

### `oi_sub_mcp_proxy`

Use this to discover and invoke downstream MCP servers configured through
`MCP_PROXY_SERVERS`.

Default workflow:

1. Call `list_servers`.
2. If servers exist, call `list_tools` for the relevant server.
3. Invoke a downstream tool only after confirming the server and tool exist.

If no servers are configured, do not claim access to Slack, Drive, Sheets,
GitHub, or any other downstream system through this MCP.

## Recommended Agent Workflow

For most tasks:

1. Search or list `oi_shared_context`.
2. Fetch the most relevant context documents.
3. Search or list `oi_prompt_repository` if the task may match a reusable
   prompt.
4. Check `oi_sub_mcp_proxy` only when the task requires external systems beyond
   the content and prompt repositories.
5. Answer or act using the fetched context as the source of truth.

## Tool Call Examples

The examples below are tool inputs. Choose the matching OI tool first, then pass
the JSON object shown.

List available context:

```json
{ "operation": "list", "limit": 20 }
```

Search context:

```json
{ "operation": "search", "query": "sales", "limit": 10 }
```

Fetch a specific context document:

```json
{ "operation": "fetch", "id": "core" }
```

List reusable prompts:

```json
{ "operation": "list", "limit": 20 }
```

Check downstream MCP servers:

```json
{ "operation": "list_servers" }
```

## Write Safety

Treat `upsert` as a write operation.

Do not use `upsert` unless the user explicitly asks you to create or update
repository content. When updating content, keep changes scoped to the requested
document and preserve unrelated repository content.

There is intentionally no delete operation.

## Guidance Boundaries

This runtime guide does not define organization-specific brand voice,
positioning, policies, or process. Those belong in the active content
repository, usually under `sharedContext`.

When connected to a content repository, prefer the content repository's own
usage guide for organization-specific context priority and tone rules.
