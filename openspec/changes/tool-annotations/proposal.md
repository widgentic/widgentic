## Why

widgentic's MCP tools carry no tool annotations (`readOnlyHint`, `destructiveHint`,
`idempotentHint`, `openWorldHint`). The MCP spec's defaults for a tool without them are the
most cautious ones: it may write, it may destroy, it is not idempotent, and it reaches an
open world. Hosts use the hints for permission prompts, auto-approval and the read-only
grouping of a connector's tools. So every widgentic tool, which only reads or renders,
looks as risky as one that deletes data. This was raised while integrating
`Widgentic.Mcp` 0.11.0 into a real .NET MCP server.

## What Changes

- **Annotations as data.** Each exported tool definition (`definitions.ts`) carries
  `annotations: { readOnlyHint, destructiveHint, idempotentHint, openWorldHint }`. As with
  descriptions and input schemas, every surface derives them:
  - the Node assembly registers each tool with its definition's annotations;
  - the host bundle's `definitions()` returns them;
  - `Widgentic.Mcp` copies them into each tool it registers.
- **The values:**
  - The discovery tools (`list_widgets`, `list_theme_tokens`, `list_themes`,
    `list_schemas`, `list_actions`, `get_authoring_guide`) and the app-only
    `preview_widget` are read-only, non-destructive and idempotent, with a closed world.
  - `render_widget` is read-only, non-destructive and idempotent. Its world is open,
    because the Node assembly fetches agent-supplied image sources to inline them.
  - The app-only `execute_action` is the exception. It is not read-only, it may be
    destructive, and it is not idempotent, with an open world: an http action may `POST`
    to the author's API. It is served only by the Node assembly.
- **Release.** A `@widgentic/mcp` patch (0.11.1). Then `Widgentic.Mcp` 0.11.1 with its pin
  moved to 0.11.1, so the .NET host serves the annotations from the bundle with no C#
  restatement.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `mcp-server`:
  - A new requirement covers tool annotations: their values, the assembly registering
    them, and the bundle returning them.
  - The host bundle requirement lists annotations among `definitions()`' fields.
- `dotnet-host`: a new requirement says each registered widgentic tool carries the
  bundle's annotations.

## Impact

- **Code:** `packages/mcp/src/server/definitions.ts` (the type and the values),
  `server.ts` (registration), `dotnet/src/Widgentic.Mcp/Mcp/WidgenticTool.cs`, and tests in
  both. The host bundle's `definitions()` carries the annotations with no code of its own.
- **Surface:** `McpToolDefinition` gains an optional `annotations`, so existing consumers
  compile unchanged. `tools/list` gains `annotations` on every tool in both runtimes.
- **Docs:** the generated MCP tools reference shows each tool's hints. The .NET README and
  CHANGELOG get the 0.11.1 entry.
- **Release:** one `@widgentic/mcp` patch changeset, then `Widgentic.Mcp` 0.11.1 after the
  npm publish, per the pin rule.
