# Widgentic.Mcp

Versions share their major.minor with the `@widgentic/mcp` release whose host bundle they embed:
`Widgentic.Mcp` X.Y.* runs `@widgentic/mcp` X.Y.*. The patch moves on its own for .NET-only fixes.

## 0.13.0

Embeds the `@widgentic/mcp` 0.13.0 host bundle.

- **Card field order.** The built-in `card` takes `hints.fields`, an array of field keys that
  chooses which fields render and in what order, as `hints.columns` does for the table.
  - Keys the data lacks are skipped, and a repeated key renders once.
  - A malformed value keeps data order, and a card without the hint renders unchanged.
  - Object key order does not survive every host's serializer, so an array is the only reliable
    order.
- **Steering.** `list_widgets` carries the field-order rule in the card's `fields` hint and the
  table's `columns` hint.
- **Hint notes.** A `render_widget` result reports unmatched or malformed `fields`.

## 0.12.0

Embeds the `@widgentic/mcp` 0.12.0 host bundle.

- **Text formats in templates.** Widget templates (from `UseWidgets` or a catalog source) may
  present a bound value through four more `format` types:
  - `count`: a list's length;
  - `join`: a list's items with author separators, an optional last separator and an optional
    per-item `field`;
  - `truncate`: by code point, with an author ellipsis;
  - `pluralize`: author forms chosen by the locale's plural rules, with `{count}` replaced by the
    number.

  They render on V8 exactly as on Node, Polish `few`/`many` rules included.
- **Markdown text binds.** `{ "bind": "notes", "markdown": true }` renders a fixed Markdown subset
  into one `div.wg-md`: paragraphs, line breaks, emphasis, inline code, links and flat lists.
  - The parser, not the value, chooses the tags, and raw HTML, images and code fences stay
    literal text.
  - Links face the template URL guard.
  - The rendered CSS styles `.wg-md` from the theme tokens.
- **The authoring guide** (`get_authoring_guide`) teaches both features, with limits read from
  the engine's constants.
- **The sample's seed** gains `project-status-widget`, which uses all of them.
- **Upgrading.** Entries that use the new forms are refused by a 0.11 host, which skips and logs
  them. Upgrade hosts before serving widgets authored in a 0.12 designer.

## 0.11.1

Embeds the `@widgentic/mcp` 0.11.1 host bundle.

- **Tool annotations.** Every widgentic tool lists `readOnlyHint`, `destructiveHint`,
  `idempotentHint` and `openWorldHint`, copied from the bundle's definitions. The discovery tools
  and `preview_widget` are read-only, non-destructive, idempotent and closed-world, so hosts can
  group them as read-only and skip write prompts. `render_widget` is the same but open-world,
  because the Node assembly inlines agent-supplied images; this package does not inline, so here
  the hint overstates on the safe side.

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
- **Resource domains from options and settings.** The app resource declares
  `ResourceDomains` followed by the settings record's `resourceDomains` section, as canonical
  `https://` origins read by the bundle's rule.
  - `cdn.example.com` and `*.example.com` are accepted, with or without `https://`. A refused
    entry (another scheme, a port, a path, an IP address, a single-label host) stops startup.
    `ResourceDomains` entries used to be declared as given and are now canonical origins.
  - With a catalog source, the declaration follows the caller on `resources/list` and
    `resources/read` alike: the caller's section replaces the startup one in `Merge`. A refused
    caller domain is skipped and logged, and a failing source leaves the startup declaration.
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
