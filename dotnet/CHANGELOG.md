# Widgentic.Mcp

Versions share their major.minor with the `@widgentic/mcp` release whose host bundle they embed:
`Widgentic.Mcp` X.Y.* runs `@widgentic/mcp` X.Y.*. The patch moves on its own for .NET-only fixes.

## 0.11.0 (unreleased)

Embeds the `@widgentic/mcp` 0.11.0 host bundle once it is published; the version and the pin
move together then.

- **A catalog per caller.** Register an `IWidgenticCatalogSource` to serve each caller its own
  widgets, themes and schemas. It is given the caller's `ClaimsPrincipal` and the request's
  services and returns a `WidgenticCatalog`, or `null` for the startup catalog. Storage is the
  implementer's.
  - `WidgenticOptions.PrincipalComposition` and `WidgenticCatalog.Composition` choose `Merge` (the
    default) or `Replace`. In `Merge` a caller's entry replaces the startup entry with the same
    identifier.
  - The catalog is composed inside each call and dropped with it; nothing is cached.
  - A caller's refused entries are skipped and logged without their contents, and a source that
    throws answers `CATALOG_UNAVAILABLE`.
  - `tools/list`, `list_theme_tokens`, `get_authoring_guide` and the app template stay global.
- **The sample** serves two demo principals over HTTP (`merge-demo`, `replace-demo`), keyed by
  `x-api-key` or `?key=` from configuration.
- From the 0.11 bundle: `render_widget` and `preview_widget` called with `kind` instead of
  `widget` say so in their error.

## 0.10.0

Embeds the `@widgentic/mcp` 0.10.0 host bundle. No behavior change: the bundle's code is
0.9.0's, and only its version stamp moves. `@widgentic/mcp` 0.10 moves its Node server assembly
(`@widgentic/mcp/sdk`) to the MCP TypeScript SDK 2.x. This package runs on the C# SDK instead,
and already reads a stateless request's own client capabilities when deciding whether to slim.

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
- Widgets, themes and shared schemas load from JSON strings or from directories
  (`AddWidgetsFromDirectory`, `AddThemesFromDirectory`, `AddSchemasFromDirectory`). Any refused
  entry stops startup with a `WidgenticConfigurationException`.
- Http actions render disabled; there is no `execute_action`, no `load`, and no outbound
  network access.
