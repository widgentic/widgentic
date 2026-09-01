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

## Risks / Trade-offs

- [Intl output drifts across ICU versions] → the gated assertions use en-US integer
  grouping and fixed decimals — stable across engines in practice; the date engine is
  our own tokens, fully deterministic. If an ICU drift ever bites, the changeset that
  bumps Node pins the affected assertion.
- [Per-item map surprises an author who wanted root paths against an array] → root
  paths against an array were `undefined`-projections before (never useful), the `"."`
  escape keeps index addressing, and the designer's dropdowns teach the item
  vocabulary.
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
