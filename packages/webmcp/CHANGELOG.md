# @widgentic/webmcp

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
