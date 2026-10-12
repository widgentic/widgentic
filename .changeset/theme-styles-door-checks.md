---
"@widgentic/core": minor
"@widgentic/designer": minor
"@widgentic/webmcp": patch
---

The designers refuse at import what saving would refuse.

- **`SAFE_IDENTIFIER`** (core, `./catalog`) is the pattern the store enforces for widget kinds and theme, schema and action names. `@widgentic/mcp` and `@widgentic/webmcp` re-export it from core.
- **Designer.** The widget designer refuses a definition whose kind is malformed (`INVALID_IDENTIFIER`) or built in (`RESERVED_KIND`). The theme designer refuses a malformed or built-in name (`RESERVED_THEME`) and flags it under the Name field while you type. The widget designer warns under the data-shape field while the shape is empty, because agents listing the widget would see a placeholder. An empty token map no longer selects the built-in Light theme in the preview selector.
- **WebMCP.** `draft_load`, `definition_check` and `theme_load` therefore return `REJECTED` for these definitions instead of loading them only for Save to fail, and `definition_check` reports a missing `dataShape` as a diagnostic. The authoring guide calls `dataShape` strongly recommended.
