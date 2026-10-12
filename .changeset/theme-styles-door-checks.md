---
"@widgentic/core": minor
"@widgentic/designer": minor
"@widgentic/webmcp": patch
---

The designers refuse at import what saving would refuse, and warn about what the store accepts but an author likely did not mean.

- **`SAFE_IDENTIFIER`** (core, `./catalog`) is the pattern the store enforces for widget kinds and theme, schema and action names. `@widgentic/mcp` and `@widgentic/webmcp` re-export it from core.
- **`auditDataSchema(schema, path?)` and `DATA_SCHEMA_TYPES`** (core, `./catalog`) name what the data validator would silently ignore: a `type` outside the supported names, a `pattern` it will not run, and an `enum`, `required`, `properties` or `items` of the wrong shape. Validation itself is unchanged.
- **Designer.** The widget designer refuses a definition whose kind is malformed (`INVALID_IDENTIFIER`) or built in (`RESERVED_KIND`). The theme designer refuses a malformed or built-in name (`RESERVED_THEME`) and flags it under the Name field while you type. The widget designer warns under the data-shape field while the shape is empty, because agents listing the widget would see a placeholder. The schema designer, and the widget designer for an inline `dataSchema`, show `auditDataSchema`'s warnings.
- **Preview theme.** The person's choice in the preview-theme selector now sticks: it is the draft's `previewTheme`, and `loadTheme` layers tokens over the chosen theme (keeping its styles) instead of replacing it, so `loadTheme({})` returns to it exactly. A token map never selects a theme by its content.
- **WebMCP.** `draft_load`, `definition_check` and `theme_load` therefore return `REJECTED` for these definitions instead of loading them only for Save to fail, and `definition_check` reports a missing `dataShape` and an inline schema's ignored keywords as diagnostics. `schema_load` returns `warnings` for its schema. `widget_theme_set` layers over the person's preview theme and reports its name as `previewTheme`. The authoring guide calls `dataShape` strongly recommended.
