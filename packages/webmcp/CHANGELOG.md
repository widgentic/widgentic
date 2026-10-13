# @widgentic/webmcp

## 0.2.2

### Patch Changes

- 7d7a66b: The authoring guide states core's `LABEL_STYLE_RULE`: labels in Title Case unless the user asks for another style or language, for template literals and the built-in card and table's `hints.labels`.
- 7c68517: The designers refuse at import what saving would refuse, and warn about what the store accepts but an author likely did not mean.
  
  - **`SAFE_IDENTIFIER`** (core, `./catalog`) is the pattern the store enforces for widget kinds and theme, schema and action names. `@widgentic/mcp` and `@widgentic/webmcp` re-export it from core.
  - **`auditDataSchema(schema, path?)` and `DATA_SCHEMA_TYPES`** (core, `./catalog`) name what the data validator would silently ignore: a `type` outside the supported names, a `pattern` it will not run, and an `enum`, `required`, `properties` or `items` of the wrong shape. Validation itself is unchanged.
  - **Designer.** The widget designer refuses a definition whose kind is malformed (`INVALID_IDENTIFIER`) or built in (`RESERVED_KIND`). The theme designer refuses a malformed or built-in name (`RESERVED_THEME`) and flags it under the Name field while you type. The widget designer warns under the data-shape field while the shape is empty, because agents listing the widget would see a placeholder. The schema designer, and the widget designer for an inline `dataSchema`, show `auditDataSchema`'s warnings.
  - **Identity checks apply only to a change.** `loadWidget` and `loadTheme` refuse a kind or name that saving would refuse only when the load changes it, so reloading a draft or entry with new data or tokens is never refused for a kind or name the person typed. The widget designer's diagnostics flag a malformed kind as it is typed. `importWidgetJson` and `checkThemeEntry` take the current kind or name as an optional second argument.
  - **Diagnostics with the host's shared entries.** The widget designer's handle gains `getDiagnostics()` (the current draft's) and `checkWidget(definition)` (what a load would accept and report, without touching the draft), both resolved against the schemas and actions the host supplied. Without supplied schemas, a `dataSchemaRef` is no longer reported as unknown. A descriptor carrying both `dataSchema` and `dataSchemaRef` is refused at import and load, as Save refuses it.
  - **Malformed schema fields.** A `dataSchemaRef` that is not a schema name, and a `dataSchema` that is not an object, are refused at import and load. A designer mounted without `schemas` no longer calls a reference unknown; an explicit list still does.
  - **Retired `extends`.** The theme designer drops an `extends` field from an entry it opens or loads, so `getTheme`, Export, Save and `theme_get` never hand it back.
  - **Preview containment.** Every style a designer preview emits — the widget's own as well as the theme's — is scoped to that preview, so a widget's `.wg-title` rule no longer restyles matching elements elsewhere on the host page.
  - **Settings element.** `<widgentic-settings-designer>` keeps a `themes` value set before the element was defined.
  - **Styles panel.** The JSON tab's parse error clears once a valid value arrives through the Tree view or a load.
  - **Messages.** The style and token-value messages read core's `STYLE_RULES` and `TOKEN_VALUE_RULE`, and a skipped declaration's message names the part at fault: the property name or the value. `auditStyles` is exported.
  - **Preview theme.** The person's choice in the preview-theme selector now sticks: it is the draft's `previewTheme`, and `loadTheme` layers tokens over the chosen theme (keeping its styles) instead of replacing it, so `loadTheme({})` returns to it exactly. A token map never selects a theme by its content.
  - **WebMCP.** `draft_load`, `definition_check` and `theme_load` therefore return `REJECTED` for these definitions instead of loading them only for Save to fail, and `definition_check` reports a missing `dataShape` and an inline schema's ignored keywords as diagnostics. `schema_load` returns `warnings` for its schema. `widget_theme_set` layers over the person's preview theme and reports its name as `previewTheme`. `widget_example_data_set` and `theme_tokens_set` are no longer refused for a kind or name the person gave the draft. `widget_draft_get`, the editing tools and `widget_definition_check` now return the designer's own diagnostics, so a saved shared schema reference is no longer reported as unknown and the example is checked against it; `diagnosticsDerived` appears only when the check runs with no designer mounted. **New source:** `DesignerSources.widgetIfMounted`, a getter that returns the widget designer without showing or mounting anything; `widget_definition_check` reads only that, so a read-only check never moves the person's view. `theme_get`, `theme_load` and `theme_tokens_set` return `diagnostics.styles`, the style entries the renderer would drop, as widget diagnostics do. The guide and `theme_load` describe the token rule from core's `TOKEN_VALUE_RULE`, and the guide's style rules come from core's `STYLE_RULES`. The authoring guide calls `dataShape` strongly recommended.
- 7c68517: The authoring guide's theme section documents a theme's shared `styles` and that default themes are a setting chosen in Settings, in step with the MCP server's guide. `theme_get` and `theme_load` describe the entry's `styles`, and `theme_load` warns that it replaces the whole entry. The styles rules in the guide derive from the same constants as the MCP guide's.
- Updated dependencies [7d7a66b]
- Updated dependencies [34c0ad5]
- Updated dependencies [34c0ad5]
- Updated dependencies [7c68517]
- Updated dependencies [7c68517]
- Updated dependencies [7c68517]
  - @widgentic/core@0.11.0
  - @widgentic/designer@0.11.0

## 0.2.1

### Patch Changes

- c2aba69: The authoring guide's `each` form documents the optional `key` path, in step with the
  MCP server's guide.
- Updated dependencies [c2aba69]
- Updated dependencies [c2aba69]
  - @widgentic/core@0.8.0
  - @widgentic/designer@0.8.0

## 0.2.0

### Minor Changes

- 3ebac20: Two reference tools, always present: `<prefix>_authoring_guide` returns the complete
  authoring contract (the MCP guide's structure, derived from the core validators, with the
  workflow rewritten for the browser) and `<prefix>_widget_definition_check` validates a
  definition without touching the designer. Every editing tool's description now carries a
  summary of the template DSL — `bind`/`each`/`when`, the `map`/`prefix`/`format`
  transforms, forbidden tags, `.wg-` styles with tokens, required descriptor fields — and
  tells an agent that can operate the page to leave Save to the person unless asked.
  Fourteen tools in all.

## 0.1.0

### Minor Changes

- 5150875: First beta release. `exposeDesigners()` registers the mounted widget, theme, schema and
  action designers as WebMCP tools on `document.modelContext` (or `navigator.modelContext`),
  so a browser-side agent — ChatGPT Desktop's browser, Chrome/Edge in the WebMCP origin
  trial — can read and edit the drafts the person is looking at. Twelve tools under a
  configurable prefix (default `widgentic_`), MCP-shaped text results with structured
  refusals, feature-detected registration that is a reported no-op without an agent-capable
  browser, one `dispose()` for all. No save tool: agents edit, people save.
