# Widgentic.Mcp

Versions share their major.minor with the `@widgentic/mcp` release whose host bundle they embed:
`Widgentic.Mcp` X.Y.* runs `@widgentic/mcp` X.Y.*. The patch moves on its own for .NET-only fixes.

## 0.11.0

Embeds the `@widgentic/mcp` 0.11.0 host bundle.

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
- **Default themes from settings.** `UseSettings(json)` and `UseSettingsFromFile(path)` take a
  settings record in the store's shape, `{ "defaultThemes": { "light"?, "dark"? } }`.
  - Each default must name a configured theme, and a refused setting stops startup.
  - A caller's catalog may carry its own record (`WidgenticCatalog.Settings`). In `Merge`, each
    section it defines replaces the startup one. In `Replace`, it is the only record.
  - A caller's refused setting is skipped and logged, keeping that mode's built-in.
- **The sample** serves two demo principals over HTTP (`merge-demo`, `replace-demo`), keyed by
  `x-api-key` or `?key=` from configuration. It also loads the demo seed's default themes,
  and `merge-demo` chooses a dark default of its own.
- From the 0.11 bundle: `render_widget` and `preview_widget` called with `kind` instead of
  `widget` say so in their error.
- The app template resource asks MCP Apps hosts for no border or background:
  `_meta.ui.prefersBorder: false`, on the resource declaration and on its read content, taken
  from the bundle.
- **Breaking:** theme entries lose `extends`. An entry is registered as given, so merge a base
  theme's tokens and styles into it before passing it to `AddTheme` (startup or a caller's catalog).

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
