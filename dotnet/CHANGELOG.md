# Widgentic.Mcp

Versions share their major.minor with the `@widgentic/mcp` release whose host bundle they embed:
`Widgentic.Mcp` X.Y.* runs `@widgentic/mcp` X.Y.*. The patch moves on its own for .NET-only fixes.

## 0.9.0

First release, beta and render-only. Embeds the `@widgentic/mcp` 0.9.0 host bundle.

- Runs the `@widgentic/mcp` host bundle on ClearScript V8, in a bounded pool of isolated
  runtimes with per-call timeouts and heap limits. Renders are byte-identical to the Node
  server's (except that images are not inlined), checked against the repository's conformance
  corpus.
- `WithWidgentic(...)` on the C# MCP SDK's server builder registers the selected widgentic tools,
  the MCP Apps template resource (with operator-declared CSP resource domains), and the
  per-kind preview pages. It slims model-facing output for MCP Apps hosts.
- `IWidgenticRenderer` lets a server's own tools return widgentic results.
- Widgets, themes and shared schemas load from designer-exported JSON. Any refused entry stops
  startup with a `WidgenticConfigurationException`.
- Http actions render disabled; there is no `execute_action`, no `load`, and no outbound
  network access.
