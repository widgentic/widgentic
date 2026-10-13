## Context

See proposal.md. Current state:

- Tool definitions are plain data in `packages/mcp/src/server/definitions.ts`
  (`McpToolDefinition`: `name`, `description`, `inputSchema`).
- The Node assembly registers them through the SDK's `registerTool` and ext-apps'
  `registerAppTool`, which both accept `annotations`.
- The host bundle's `definitions()` serializes the same constants (`SERVED_TOOLS`).
- `Widgentic.Mcp`'s `WidgenticTool` builds its `Tool` from that JSON (name, description,
  input schema), and its SDK type has `Tool.Annotations` (`ToolAnnotations`).
- Actions allow only `GET` and `POST` (`HTTP_METHODS`).

## Goals / Non-Goals

**Goals:**

- Every tool tells hosts what it does, with all four hints set explicitly. The defaults the
  spec assumes for an unannotated tool are the riskiest ones.
- Every runtime gets the hints from one place.

**Non-Goals:**

- The `title` annotation. The names are stable identifiers, and a display title is a
  separate copy decision.
- Per-binding annotations for `execute_action`. A tool declares one set.
- The WebMCP tools, which already carry `readOnlyHint` on their own descriptors.

## Decisions

### D1. Annotations live on the exported definitions

`McpToolDefinition` gains an optional `annotations`, and every shipped definition sets all
four hints. The Node assembly passes `definition.annotations` to its registration. The
bundle's `definitions()` already serializes the constants, so the hints reach it with no
code. `WidgenticTool` reads `annotations` from the definition JSON into
`Tool.Annotations`.

The field is optional in the type, so a consumer constructing its own `McpToolDefinition`
still compiles.

**Alternative:** set the annotations in each host (C# attributes, registration options).
Rejected: the values would be restated per runtime and could drift. That breaks the rule
that hosts embed the bundle and never port it.

### D2. The values, and why `render_widget` is open-world

- **Read-only tools.** The discovery tools and `preview_widget` read the caller's catalog
  and compose output; nothing outside the server is touched. They are read-only,
  non-destructive and idempotent, with a closed world.
- **`render_widget`** is read-only, non-destructive and idempotent: the same input renders
  the same output, inlined images aside. It is open-world because the Node assembly
  fetches agent-supplied image sources from the public web to inline them. The .NET host
  does not inline (NET-1), so there the hint overstates. It stays shared, because one
  definition serves both, and an overstated open world is the safe direction.
- **`execute_action`** runs an author's http action server-side, and a `POST` can create,
  change or remove things in the author's system. It therefore declares
  `readOnlyHint: false`, `destructiveHint: true` (the worst case of any binding),
  `idempotentHint: false` and `openWorldHint: true`. It is app-only (hidden from the model
  on Apps hosts) and absent from `Widgentic.Mcp`.

### D3. Release as a patch

The change adds metadata, and the type change is optional, so nothing a consumer does
changes meaning. It ships as `@widgentic/mcp` 0.11.1 (a patch changeset; core and designer
are untouched). `Widgentic.Mcp` 0.11.1 then pins 0.11.1, as the major.minor rule
allows. This is the owner's call, and a minor (0.12.0 for mcp and `Widgentic.Mcp`) is the
alternative if they prefer to signal new metadata.

## Risks / Trade-offs

- **[Hosts treating the hints as security]** → The spec calls the hints untrusted, and
  hosts use them for UX, not enforcement. The server's own guards are unchanged.
- **[`render_widget` open-world on .NET]** → It overstates rather than understates (D2).
- **[A host auto-approving read-only tools]** → That is the purpose. Every tool marked
  read-only changes no state in any system.

## Migration Plan

1. Merge to `staging`, deploy the demo, and check `tools/list` from the served bytes.
2. Promote to `main` and release `@widgentic/mcp` 0.11.1.
3. Bump `WidgenticMcpVersion` and `Widgentic.Mcp` to 0.11.1, then date the CHANGELOG.
4. Run `release-dotnet.yml`.

No stored shape changes.
