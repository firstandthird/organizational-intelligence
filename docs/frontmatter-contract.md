# Markdown Frontmatter Contract

Organizational Intelligence reads Markdown files from a content repository and
uses frontmatter to expose those files consistently to MCP clients.

This contract is intentionally small. Content repositories can add richer
conventions later, but these fields are the portable baseline for discovery,
search, manifests, and native MCP prompt exposure.

## Shared Fields

These fields can be used in both `sharedContext/*.md` and `prompts/*.md`.

```yaml
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
```

### `name`

Stable identifier for the entry. If omitted, the filename is used.

### `title`

Optional human-readable display title.

### `description`

Short summary used in lists, search results, and client-facing discovery.

### `tags`

Topic and capability labels. Use short lowercase terms such as `engineering`,
`voice`, `sales`, `code-review`, or `security`.

### `audience`

Who the content is primarily for, such as `developers`, `marketers`,
`project-managers`, or `clients`.

### `use_when`

Short phrases describing when an agent or user should consider this entry.
These are discovery hints, not strict routing rules.

### `context`

Related context ids that are commonly useful with this entry.

## Prompt Fields

Prompt files also support the existing prompt metadata:

```yaml
model: openai:gpt-4o-mini
tools:
  - http_request
allowed_agents: []
memory: thread
arguments:
  - request
```

### `model`

Preferred model for this prompt when a client chooses to honor it.

### `tools`

Tool names the prompt expects. Clients should verify those tools are actually
available before relying on them.

### `allowed_agents`

Reserved for agent routing constraints.

### `memory`

Prompt memory preference. Existing prompt files use `thread`.

### `arguments`

Simple argument names the prompt expects. Keep this as a flat list for now.
Nested argument metadata is intentionally out of scope for the first metadata
contract.

## Current Parser Limits

The built-in parser supports:

- Scalar fields: `key: value`
- Block lists:

  ```yaml
  tags:
    - engineering
    - code-review
  ```

- Inline lists: `tags: [engineering, code-review]`
- Empty inline arrays: `allowed_agents: []`

It does not support nested objects yet. Prefer flat lists and plain strings.

## Design Guidance

Do not create one central routing file that names every possible document and
prompt. Each Markdown file should describe itself with metadata, and the runtime
should generate discovery surfaces from that metadata.

Organization-specific content belongs in the content repository. Generic
runtime behavior and field contracts belong in `organizational-intelligence`.

## Manifest

The `oi_manifest` tool returns a generated map of the mounted content
repository. It uses the fields in this contract to expose shared context,
prompts, and a generic recommended workflow.

Use the manifest as the first discovery call when a client connects cold:

```json
{ "operation": "get" }
```

The manifest is generated from Markdown metadata. Do not hardcode
organization-specific routing into `organizational-intelligence`; add metadata
to the relevant Markdown files instead.

## Native MCP Prompts

The runtime also exposes `prompts/*.md` through an MCP-shaped prompt registry.
Each Markdown prompt maps to:

- MCP prompt `name`: the frontmatter `name`, or the filename when omitted
- MCP prompt `title`: frontmatter `title`
- MCP prompt `description`: frontmatter `description`
- MCP prompt `arguments`: frontmatter `arguments`
- `_meta`: source path, model, tools, tags, audience, use_when, context, and memory

When a client asks for a prompt, the markdown body is returned as a single user
message. Simple placeholders in the body are replaced from MCP prompt arguments:

```md
Review this change for {{ request }}.
```

The registry intentionally stays generic. Add organization-specific routing and
usage hints as frontmatter on the prompt files, not as custom code in the host
runtime.
