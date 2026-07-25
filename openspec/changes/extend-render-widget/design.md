## Context

Every item here was earned empirically during the `add-widgentic-mcp-server` testing round: variant C (double-encoding) motivated schema-driven rejection; the coercion fix created a documented ambiguity only schemas can resolve; the "why is everything plain" question motivated one-call styled output; the Essence Mascara card motivated formatting hints; the mismatched-total invoice showed descriptors alone cannot enforce structure. The catalog, theming, and mcp-server modules all exist — this change composes them.

## Goals / Non-Goals

**Goals:**
- Structural data validation that speaks the existing error vocabulary and fails *before* a lenient renderer can mask the problem.
- Resolve the coercion ambiguity via schemas rather than heuristics.
- One-call styled output (`format: "page"`) with optional theming; zero new dependencies.
- Formatting affordances for card without inventing a locale/i18n engine.

**Non-Goals:**
- No full JSON Schema compliance (`$ref`, `oneOf`, patterns, formats) — the subset is `type`, `properties`, `required`, `items`, `enum`, validated recursively; anything else in a schema object is ignored (forward-compatible).
- No registration-over-the-wire; no per-request custom CSS (themes are token maps only — the injection-safety model from widget-theming carries over unchanged).

## Decisions

### Decision 1: Schemas live on descriptors; enforcement lives in `catalog.render`
`dataSchema` is part of `WidgetDescriptor` — authored where documentation lives, listed by `list_widgets`, and enforced centrally in `catalog.render` (not just the MCP path), so hosts using the catalog directly get the same protection. Kinds without a schema behave exactly as today: leniency remains the default, schemas are opt-in strictness. *Alternative*: validate only in `handleRenderWidget` — rejected; the MCP server would be safer than the library, backwards.

### Decision 2: Subset validator, existing error vocabulary, dotted data paths
A ~100-line recursive checker maps violations to `MISSING_FIELD` (required) and `INVALID_TYPE` (type/enum) with paths like `data.lines.0.qty`. No new error codes means agents, tests, and the contract spec are untouched; the path grammar extends naturally from the payload fields agents already see. *Alternative*: adopt a schema library (ajv) — rejected: first runtime dependency, and the subset covers descriptor-authored schemas by construction.

### Decision 3: Schema-aware coercion consults the schema *before* peeling
In `handleRenderWidget`: if the kind's schema exists and its root `type` includes `"string"` (and neither object nor array), string `data` is passed through verbatim — literal JSON-shaped text becomes expressible for exactly the kinds that declare string data. Without a schema, today's commit-only-on-structured peeling stands. This closes the documented ambiguity precisely where the author has stated intent.

### Decision 4: `format` is additive; `"page"` composes the theming module
`"both"` (default) preserves today's dual block; `"html"`/`"widget"` drop one block for size-sensitive callers. `"page"` replaces the fragment text block with a complete document — `<!doctype html>`, inlined `baseStylesheet`, the fragment, and (when `theme` is given) `themeToCss(theme, ":root")` — while keeping the widgentic resource block so aware hosts can still mount natively. Theme validation failures return `INVALID_TYPE` at `path: "theme.<token>"`; `theme` without `format: "page"` is accepted and ignored-with-note in the descriptor (not an error — forward-lenient like hints).

### Decision 5: `fieldFormat` is a text pattern, not a formatter
`{value}` substitution in a plain string covers the observed needs (currency prefix, unit suffix, scale context) with zero locale machinery; the substituted result flows through the normal escaping path. Formatting stays presentation-side data, so a widget designer can author it. *Alternative*: typed formatters (`{ type: "currency", locale }`) — deferred until a real locale requirement exists.

## Risks / Trade-offs

- [Subset validator diverges from full JSON Schema semantics users expect] → the subset is spec'd, `list_widgets` exposes the schema verbatim, and unknown keywords are ignored rather than misinterpreted.
- [Schemas on built-ins could reject data the lenient renderers accepted yesterday] → built-in schemas are written permissively (documenting the lenient contract, e.g. table accepts any array OR any value); strictness is for kinds that opt in, like `invoice`.
- [`"page"` output size (stylesheet inlined per response)] → ~3 KB of CSS; acceptable for the use case (open-in-browser), and `"both"`/`"html"` remain for compact needs.
- [Pattern hint invites `{value}`-less patterns that drop the value] → pattern without placeholder appends the value (documented), so data is never silently lost.
