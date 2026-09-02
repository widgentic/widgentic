# @widgentic/webmcp

## 0.1.0

### Minor Changes

- 5150875: First beta release. `exposeDesigners()` registers the mounted widget, theme, schema and
  action designers as WebMCP tools on `document.modelContext` (or `navigator.modelContext`),
  so a browser-side agent — ChatGPT Desktop's browser, Chrome/Edge in the WebMCP origin
  trial — can read and edit the drafts the person is looking at. Twelve tools under a
  configurable prefix (default `widgentic_`), MCP-shaped text results with structured
  refusals, feature-detected registration that is a reported no-op without an agent-capable
  browser, one `dispose()` for all. No save tool: agents edit, people save.
