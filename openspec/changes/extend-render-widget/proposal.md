## Why

Live multi-agent testing of the Widgentic MCP server validated the core but surfaced four correctable gaps, each with a concrete motivating incident: shape-blind validation let a double-encoded payload render a plausible empty table (and its coercion fix made literal JSON-shaped text inexpressible); styled output requires a multi-step host recipe; card values carry no formatting affordances; and themes cannot travel with a render request. This change closes all four, turning the round's deferred items into spec'd behavior.

## What Changes

- **Per-kind data schemas** (the principled form of "reject wrong-shaped data"):
  - `WidgetDescriptor.dataSchema?: object` — a documented JSON-Schema *subset* (`type`, `properties`, `required`, `items`, `enum`), validated by a new zero-dependency checker in the catalog.
  - `catalog.render` and `render_widget` validate `data` against the kind's schema when present, returning existing-vocabulary errors (`INVALID_TYPE`/`MISSING_FIELD`) with dotted data paths (e.g. `data.lines.0.qty`) — no new error codes.
  - **Schema-aware marshalling**: when a kind's schema declares string-typed `data`, string peeling is skipped — making literal JSON-shaped text expressible again (closes the documented coercion ambiguity).
  - Built-ins and the demo `invoice` gain schemas; kinds without one keep today's lenient behavior.
- **Card formatting hints**: `hints.fieldFormat: Record<fieldKey, pattern>` where pattern is plain text with a `{value}` placeholder (`"${value}"`, `"{value} / 5"`, `"{value} °C"`) — covers currency/units/scales without a locale engine; unknown keys ignored; output escaped as usual.
- **`render_widget` output selection**: `format?: "both" | "html" | "widget" | "page"` (default `"both"`, today's behavior). `"page"` returns a self-contained styled HTML document — base stylesheet inlined — so an agent gets browsable output in one call, no host recipe.
- **`render_widget` theming**: `theme?: <token map>` validated by `validateTheme` and applied to `"page"` output via `themeToCss`; invalid themes return a structured error naming the offending token.
- Wire schema + zod mirror extended for the new inputs; descriptors document them; tests for every scenario incl. regression cases from the testing round.

Out of scope (deliberately, again): registration-over-the-wire (own change — security review required), locale-aware formatting, full JSON Schema draft compliance (the subset is documented and validated as such).

## Capabilities

### New Capabilities
<!-- None. Both touched capabilities exist. -->

### Modified Capabilities
- `widget-catalog`: descriptor `dataSchema` + subset validator + schema enforcement in `render`; `fieldFormat` hint added to Card data handling.
- `mcp-server`: `render_widget` gains `format` and `theme` inputs; marshalling becomes schema-aware; rendering-tool and marshalling requirements updated accordingly.

## Impact

- Code: `src/catalog/` (schema validator, descriptor field, card hint), `src/mcp-server/` (inputs, page composition reusing `widgentic/theming`), `examples/mcp-server/main.ts` (zod mirror, invoice schema).
- No new dependencies of any kind; theming module reused as-is.
- Downstream: agents get one-call styled output and pre-flight data validation; the widget designer later authors `dataSchema` alongside templates.
