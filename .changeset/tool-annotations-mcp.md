---
"@widgentic/mcp": patch
---

Tools declare MCP tool annotations.

- Every exported tool definition carries `annotations` (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`), all four set, typed as the new `McpToolAnnotations`. `McpToolDefinition.annotations` is optional, so definitions built elsewhere still compile.
- The discovery tools (`list_widgets`, `list_theme_tokens`, `list_themes`, `list_schemas`, `list_actions`, `get_authoring_guide`) and `preview_widget` are read-only, non-destructive, idempotent and closed-world. `render_widget` is the same but open-world, since the server inlines agent-supplied images. `execute_action` alone declares a write: not read-only, possibly destructive, not idempotent and open-world.
- `createWidgenticServer` registers each tool with its definition's annotations, so `tools/list` carries them. The `./host` bundle's `definitions()` returns them for embedding hosts.
