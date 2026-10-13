---
"@widgentic/mcp": minor
---

`@widgentic/mcp/sdk` registers every tool with its exported definition's input schema, and lets the handlers validate the arguments.

- **Wire schemas are the exported definitions.** `tools/list` now carries `RENDER_WIDGET_TOOL.inputSchema` and the rest exactly as exported, with nothing added or removed. These are the schemas the `./host` bundle, and with it `Widgentic.Mcp`, already serves. Compared with 0.10, the three formerly zod-backed schemas (`render_widget`, `execute_action`, `preview_widget`) drop the `$schema` stamp and gain the definitions' own details, such as `additionalProperties: false`. The six tools without input advertise their exported empty-object schema.
- **One validation path on every host.** The assembly no longer validates arguments before the handler, so a malformed call gets the handler's structured error (`MISSING_FIELD`, `INVALID_TYPE`, …, in the tool's own vocabulary) instead of the SDK's generic input-validation message. That is the same answer the .NET host gives.
- **The `kind`/`widget` mix-up is named.** A `render_widget` or `preview_widget` call that omits `widget` but carries a string `kind` gets the `MISSING_FIELD` error on `widget`. Its message says that `kind` is the payload's field and that the value belongs in `widget`.
- **`execute_action` refuses mistyped optional arguments.** These are a non-object `args`, or a non-string `at` or `item`; they used to be silently ignored. They now get `INVALID_TYPE` on that path, before anything runs.
- **`zod` is no longer a peer.** The assembly imports no schema library. `@modelcontextprotocol/ext-apps` 2 still requires `zod` 4.2+ as its own peer.
