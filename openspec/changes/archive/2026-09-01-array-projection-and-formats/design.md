# Design — Arrays through the authoring loop, and value formats

## Context

See proposal.md — Why. What the research established:

- The completion defect is a two-point chain in the designer, both sides of an
  asymmetry: `schemaAt` (the path READER, `schema-paths.ts`) already traverses arrays
  and treats `"."` as identity, but `collectPaths` (the ENUMERATOR) bails on any
  non-object root — so a root-array schema yields zero candidates for every consumer
  (template bind/each/when, attr binds, action input mapping, both output-map columns) —
  and `itemScope` (`template-panel.ts`) early-returns `undefined` for `each: "."`
  unconditionally, hand-rolling a walk instead of using `schemaAt`. The runtime accepts
  `each: "."` (`parsePath(".")` is scope-identity), so this is purely an authoring gap.
- `pathControl` and `pathSelect` degrade to free text when options are empty — the
  symptom the user saw; the existing "no schema falls back to free text" test must be
  distinguished from "root-array schema", which is a schema.
- `applyOutput`'s `map` resolves every entry against the response ROOT; for an array
  response `getAtPath(response, "ask")` is `undefined`, so map-over-array is useless
  today, which makes per-item semantics backward-safe to introduce.
- The output-map editor derives targets via `allPaths(widgetSchema)` (rebased through
  `schemaAt` under `patch`) and sources via `allPaths(definition.output)`; fixing
  `collectPaths` repairs both columns at once. `typesConflict` compares `schemaType`
  only, so `array` vs `array` passes regardless of item types.
- `fieldFormat` (card/table hint) is `{value}` string substitution only — no numeric,
  currency or date semantics — and template binds render `formatValue(value)` raw.
  The descriptor's own words state the product's placement rule: "the payload keeps
  the typed value while the render gets its unit."

## Goals / Non-Goals

**Goals:** the list-shaped API — the most common REST response — authors as easily as
an object; a projection can reshape a list; a bind can present money and timestamps.

**Non-Goals:** formatting at fold time (rejected in D3); nested-array projection
(select an inner array THEN map its items — shape the action's output schema to the
array instead; noted for later if it recurs); locale-sensitive date text (month names
etc. — the token set is numeric); extending `fieldFormat` (the built-ins' hint stays
as is; converging it onto the new format engine is possible later); `$root`/`$parent`
completions in the template panel (a separate pre-existing gap, unchanged here).

## Decisions

**D1 — Fix the enumerator to match the reader.** `collectPaths` learns the array
branch `schemaAt` already has: an array schema contributes itself as a path (for
`each`/`when`) and descends into `items` for the item's properties where the context
is an each scope; `itemScope` collapses into `schemaAt(scope, eachPath)` + the
`.items` step, which makes `each: "."` work for free. The depth budget applies per
scope: an `each` resets it, since the item schema is a fresh root for its subtree.

**D2 — Per-item projection is implicit when the response is an array.** No new
grammar: `map` without a `"."` entry applies per item when the value being projected
is an array, building the array of per-item results. Backward-safe because those
entries previously resolved to `undefined` against an array root. `"."` alone keeps
root addressing (an element of the array stays reachable by index), and `merge` stays
object-only — arrays flow through `replace` and `patch`. The alternative — an explicit
`items: { map }` nesting — was rejected as a second shape for the same idea; the
designer shows which vocabulary is in play by offering item properties.

**D3 — Formatting is a render-time bind transform, not a fold transform.** The user's
ask ("the projection should support basic formatting") is served at the bind instead,
deliberately: formatting in the projection writes display strings into `payload.data`
— the initial render (dataExample, a load-less widget) stays unformatted, a second
fold formats an already-formatted string, and the model receives presentation instead
of data. A `format` on the bind formats every render of that value — initial, folded,
previewed — while the payload keeps the typed value, which is the rule the product
already states for `fieldFormat`. The transform is the template DSL's third transform,
same discipline as `map`/`prefix`: a closed vocabulary, author literals, data only
flows through.

**D4 — The format engine: Intl for numbers, tokens for dates, total by construction.**
`{ type: "number" | "currency", decimals 0–8, currency ISO-4217, locale literal
(default en-US) }` via `Intl.NumberFormat` (ECMA-402 — browser-safe, no `node:`);
`{ type: "date", pattern }` over an allowlisted token set (`yyyy MM dd HH mm ss` +
separators, bounded length) — numeric-only tokens need no locale. Determinism rules:
default locale en-US, unzoned ISO parsed as UTC, formatted in UTC — server render,
designer preview and app re-render must agree byte-for-byte or the patcher would see
phantom text changes. Numeric strings parse via `Number()` (finite or raw); anything
unparseable renders as the raw `formatValue` output — a format never hides data and
never throws. The engine lives beside `formatValue` in core so a later `fieldFormat`
convergence has one implementation to converge on.

**D5 — Designer surfaces.** The output-map editor offers item properties when either
schema is an array and compares ITEM types across two array sides (closing the
`array`-vs-`array` blind spot); bind rows (text and attr) gain a compact format editor
— a `none | number | currency | date` select revealing that type's fields — following
the binding editor's compact-chrome conventions. A dedicated `schema-paths` unit-test
file pins root-array, nested-array and depth semantics directly; today every
assertion goes through rendered DOM.

**D6 — Guide teaching derives from the validator's constants.** The format bounds
(decimals range, pattern tokens, currency shape) are read from the exported constants
that enforce them, per "derived, never restated"; the recipe is the ticker itself —
a numeric-string price as `COP` with 0 decimals.

**D7 — `currencyDisplay`, defaulting to `narrowSymbol` (owner decision during apply).** The
Why section names `$3,207` as the goal, but `Intl.NumberFormat("en-US", { style: "currency",
currency: "COP" })` defaults to `currencyDisplay: "symbol"`, which yields `COP 3,207` — only
`narrowSymbol` gives `$3,207`. The spec's scenario did not settle it. Resolved by exposing one
optional field, `currencyDisplay?: "narrowSymbol" | "symbol" | "code"`, defaulting to
`narrowSymbol`: the ticker reads `$3,207` out of the box, and an author showing two
dollar-denominated currencies side by side has the disambiguated form. Hard-coding
`narrowSymbol` would have left that author no escape; keeping Intl's default would have
contradicted the stated goal.

**D8 — The enumerator descends a ROOT array only, not every array (found during apply).**
D1 called for `collectPaths` to mirror `schemaAt`, which steps through an array into its item
schema for a NAMED segment too. Mirroring it literally would have offered `lines.qty` in the
outer scope's bind dropdown — and neither reader that matters resolves it: the template
resolver (`resolvePath`) and the projection's `getAtPath` both require an INDEX segment on an
array (`lines.qty` renders empty; `lines.0.qty` renders `2` — verified against the compiled
renderer). `schemaAt`'s named-array step is the anomaly, not the contract. So the descent is
scoped to the collection ROOT, where every consumer's context IS the item: a template inside
`each: "."`, an output map projecting a list response. A nested array is still offered as
itself for `each`, and its item's properties arrive through that each's own scope — which is
exactly what the spec's two completion scenarios describe.

**D9 — Two defects the live designer surfaced during apply.** Both were found by the user
driving the running designer:

- *`map`/`prefix` on a text bind validated and did nothing.* Apply first REFUSED them; the
  review reversed that (D10): the refusal was a persisted-shape tightening — stores re-validate
  on read, so a stored widget carrying one dead key would have vanished from every host — and
  the invariant is "nothing is ever saved but vanished". They stay accepted and ignored; the
  confusion is resolved where it arose, in the designer, whose text rows offer `format` only.
- *The `map` button was present but permanently invisible on every attribute row.* Its
  hover-revealed group had reveal rules only for other row types. One `:is()` rule now names
  every hosting row type, and the row wraps instead of clipping. Verified by computed value in
  headless Chrome; the unit test pins that the single rule lists every row type.

**D10 — Review closure (8-angle review on the implementation).** Behavior: per-item projection
hijacked INDEX-addressed sources (`0.ask` used to resolve at the root and is a valid, working
binding shape) — a source starting with an index now keeps root semantics; the root-array
descent lived in the SHARED enumerator and so advertised item properties at the template ROOT,
in `load` input mappings and in `$root.` helpers, where they resolve to nothing — the enumerator
is context-free again and each item-scoped consumer (`each`, both output-map columns) asks for
the item schema, while an array scope offers only `"."`; `schemaAt` stepped into an array by a
NAMED segment (D8 called it the anomaly and left it) — it now steps by index only, so the
mismatch check and the enumerator agree; the default `merge` mode over a per-item projection is
flagged in the editor instead of failing at execution; a date pattern with no token or a stray
letter (`d/M/yy`) rendered a constant — refused; epoch numbers were read as milliseconds only —
seconds below 1e11; a well-formed but unknown locale rendered raw — the validator asks the
runtime; numeric output normalizes no-break spaces so ICU builds agree. Reuse: the format
vocabulary is narrowed ONCE (`parseFormatSpec`, guards instead of casts) and compiled once per
spec object (`compileFormat`, `Intl.NumberFormat` and the tokenized pattern built per spec, not
per cell); the guide renders its example outputs through the engine; `select()` lives in `dom.ts`;
`activeTransform` decides both validation exclusivity and what a row shows. One finder claim
was refuted: prompt-text segments carrying `format` are already refused (`Prompt segments are
strings or { bind } objects`).

**D11 — Two backlog items pulled into scope (owner decision).** *Select-then-map:* a `"."`
target used to be valid only alone; it now SELECTS first — alone, the selection is the
projection (unchanged); beside other entries, those entries map the selected value, per item
when it is a list. Backward-compatible by construction: the shape was forbidden before, so no
stored binding changes meaning, and an enveloped list (`{ data: [...] }`) becomes reachable
without touching the output schema. *Text-bind `map`:* the value → authored-label select now
WORKS on text binds (a status becomes its wording), with the attribute form's exact
semantics; `prefix` stays attribute-only — it composes a scheme, which has no text meaning —
and remains accepted-and-inert there so nothing stored is refused. The designer's text rows
offer `format` and `map`, never `prefix`. Both land in this change because their vocabulary is
the vocabulary this change introduces.

**D12 — Live findings on the select-then-map build, routed in.** The `"."` selection row
rendered as off-schema because the target column enumerated only the widget's paths — `"."`
is always a valid target and is now offered first. Two unrelated designer findings from the
same session ride along as polish: the widget designer's Export section carried a theme-JSON
button (themes export from the theme designer; the function stays public for hosts) and its
entry button is now labelled `Export widget entry` like the other designers'; and the styles
section's legend "(.wg- selectors, guarded like the server)" said nothing a user could act on —
it now reads "(.wg- selectors only)", the inline diagnostics carrying the rest.

## Risks / Trade-offs

- [Intl output drifts across ICU versions] → the gated assertions use en-US integer
  grouping and fixed decimals — stable across engines in practice; the date engine is
  our own tokens, fully deterministic. If an ICU drift ever bites, the changeset that
  bumps Node pins the affected assertion.
- [Per-item map surprises an author who wanted root paths against an array] → root
  vocabulary is preserved: the `"."` escape and any index-addressed source keep root
  semantics; only index-free entries — which resolved to `undefined` before — go per item,
  and the designer's dropdowns teach the item vocabulary.
- [Select-then-map makes `"."` mean two things] → one thing, stated once: `"."` selects;
  whether the selection IS the projection depends only on whether other entries exist.
- [Format on attr values could build hrefs] → formats produce text and the existing
  URL-scheme allowlist on URL attributes is unchanged and runs after; `prefix` remains
  the sanctioned scheme-building transform, and `format` is mutually exclusive with it.
- [The archived `native-widgets-refresh` change also touches the guide requirement] →
  the two changes modify DIFFERENT requirements in `mcp-server` (widget listing vs
  authoring guide) and different core files; whichever archives second re-syncs its
  own requirement only.

## Migration Plan

Additive throughout: new transform, new completion behavior, per-item semantics where
the old behavior was useless. Minor changesets for core, designer and mcp. Acceptance
is the user's live ticker: root-array schema completing under `each: "."`, a per-item
projection over the array response, `ask`/`bid` bound as `COP` 0-decimals, `date` as
`dd-MM-yyyy HH:mm`.
