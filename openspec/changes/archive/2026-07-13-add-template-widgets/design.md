## Context

The catalog accepts renderer *functions*; the product goal is widgets defined by *users* (ultimately through a designer UI). User-authored artifacts must be data: storable, transmittable, validatable, and safe to evaluate. The existing stack makes this a thin layer — a template is interpreted into the same pure `WidgetNode` trees that the catalog, HTML serializer, DOM mounter, and reactive patcher already handle. The threat model changes, though: template authors are *untrusted*, unlike the developers who write renderer functions.

## Goals / Non-Goals

**Goals:**
- A JSON-serializable DSL expressive enough for real custom widgets: structure, text/attr bindings, repetition, conditionals.
- Total interpretation (garbage data renders as blanks, never throws) and validated authoring (structured, path-addressed errors a designer UI can surface inline).
- Safety against malicious templates: no code execution, no event handlers, no script-scheme URLs, no raw HTML.
- Full composition with existing layers — compiled templates are ordinary `WidgetRenderer`s.

**Non-Goals:**
- No expression language (no arithmetic, comparisons, formatting filters, i18n). Paths only; richer expressions are a compatible future extension of the node forms.
- No designer UI, template storage, or template-over-MCP convention (future changes).
- No `$index`/`$key` loop variables yet — YAGNI until a designer needs them.
- No style/theming primitives in templates (that's `add-widget-theming`; templates use `class` attrs like built-ins do).

## Decisions

### Decision 1: Templates are a superset-shaped sibling of `WidgetNode`, not `WidgetNode` itself
`TemplateNode = string | { bind } | { tag, attrs?, children? } | { each, template, empty? } | { when, template, else? }`, where attr values are `string | { bind }`. Directive nodes are discriminated by their unique key (`bind`/`each`/`when` — objects without `tag`), so the format stays plain JSON with no type tags to mistype. Interpretation maps `TemplateNode → WidgetNode` and directives disappear in the output.

*Alternative considered*: string micro-syntax inside text (`"Hello {{name}}"`) — rejected for v1: it needs escaping rules for literal braces, complicates validation error positions, and a designer UI composes structured nodes more naturally than it splices strings. A future extension can add it as sugar that desugars to `bind` nodes.

### Decision 2: Paths resolve against `data`, with `"."` and `"$meta."` escapes
Dot-notation segments walk plain objects (and array indices) starting at `payload.data`; inside `each`, the scope is the current item; `"."` yields the scope value itself; a `"$meta."` prefix reads from `payload.meta` (e.g. titles). Missing or non-traversable paths yield `""` for binds, empty lists for `each`, falsy for `when` — totality mirrors the mapper and built-ins. Resolved bind values stringify with the same discipline as the built-ins (strings pass through, primitives stringify, structured values become compact JSON).

### Decision 3: Validation is strict, interpretation is lenient
`validateTemplate` enforces node shapes, attr-value types, path syntax, and a nesting-depth cap (64) — returning `{ ok: false, error: TemplateError }` with `code` (`INVALID_TEMPLATE_NODE`, `INVALID_PATH`, `FORBIDDEN_ATTRIBUTE`, `TEMPLATE_TOO_DEEP`) and a dotted `path` into the template, so a designer can highlight the offending node. `compileTemplate` assumes a validated template but its interpreter still never throws on data (defense in depth); `registerTemplate` runs validation and throws on invalid templates — registration is host setup, where the codebase's convention is to fail loudly.

### Decision 4: Safety is enforced at two layers
Untrusted authors get exactly three write surfaces — tags, attribute names/values, text — and each is constrained:
- **Event handlers**: attribute names matching `/^on/i` fail validation (`FORBIDDEN_ATTRIBUTE`) *and* are skipped by the interpreter even if an unvalidated template reaches it. In a real browser `onclick="…"` is code execution; this is the template counterpart of the render tree's no-raw-HTML rule.
- **URL schemes**: when an attribute named `href`, `src`, `action`, `formaction`, or `xlink:href` resolves (literal or bound) to a value whose scheme is not http(s), mailto, tel, or relative, the attribute is dropped at render time. Bound data influencing URLs is the classic `javascript:` vector.
- **Markup**: bindings only produce text nodes and attr strings; `renderToHtml`/`mountNode` escaping applies unchanged, and the existing tag/attr-name allowlists in `renderToHtml` remain the outer wall.

### Decision 5: `registerTemplate` is a module function, not a catalog method
`registerTemplate(catalog, kind, template)` validates, compiles, and calls `catalog.register(kind, renderer)`. Keeping it out of `WidgetCatalog` leaves the spec'd widget-catalog surface untouched (no Modified Capabilities), keeps the catalog dependency-free of template concerns, and preserves the option of alternative template engines registering through the same public API.

### Decision 6: Compiled renderers close over the template; no caching layer
`compileTemplate` returns a closure interpreting the template per render. Interpretation is O(template × data) with no allocation beyond the output tree — the reactive layer's diffing already de-duplicates DOM work, which is where update cost actually lands. Pre-compilation to specialized functions (à la template JIT) is premature.

## Risks / Trade-offs

- [URL allowlist may block legitimate custom schemes (e.g. `vscode:`)] → conservative default is correct for untrusted input; a host-level opt-in (`compileTemplate(t, { allowSchemes })`) can be added compatibly if demanded.
- [Depth cap 64 could reject pathological-but-legitimate templates] → generous for hand-built and designer-built widgets; the error is explicit and addressable.
- [No loop index/empty-state ergonomics may frustrate template authors] → `each.empty` covers the common case; `$index` is a compatible additive extension.
- [Two enforcement layers (validate + interpret) can drift] → both are driven by shared constants (forbidden-attr regex, scheme allowlist) in one module; tests assert both layers independently.
- [Designer-generated templates could bind huge JSON blobs into text] → same exposure the `custom` widget already has; bounded rendering is a host concern, noted for the theming/designer changes.
