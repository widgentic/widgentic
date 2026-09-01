---
"@widgentic/designer": minor
---

Path completion now descends arrays, and bind rows can author a value format.

**Root-array schemas complete where their item is in scope.** The path enumerator bailed on
any non-object root, so a `{ type: "array", items: { … } }` data schema — the shape most REST
endpoints return — yielded zero candidates and every path input degraded to free text. The
enumerator stays context-free (an array is offered as itself, never descended, because neither
the template resolver nor the projection steps into an array by name); the consumers whose scope
IS the item now ask for the item schema: `each: "."` over a root array scopes to its item like any
other each, so the each dropdown offers `"."` and binds inside it complete from the item's fields,
and both output-map columns complete from their side's item schema. An array scope itself — the
template root over a root-array schema, a root-level input mapping, the widget-level `load` —
offers only `"."`, since nothing else resolves there.

**The output-map editor speaks the per-item vocabulary.** When either side's schema is an
array, the editor offers that side's ITEM properties, a source/target type mismatch of two array
sides is judged by their item types instead of passing every `array`-vs-`array` pair, a
per-item projection left on the default `merge` mode is flagged in place — it would only fail at
execution (`merge` needs an object) — and a `"."` row completes from the response root while the
rows after it complete from the selected value's items, so an enveloped list authors as easily
as a bare one.

**The `map` button is reachable at last.** On every attribute row the `map` control sat in a
hover-revealed icon group whose only reveal rules were child combinators on other row types, so it was
present in the DOM and permanently `visibility: hidden` — a status→class mapping was unauthorable in the
tree. One `:is()` rule now names every row type that hosts the group, and the row wraps instead of
clipping, so a trailing control can never be pushed out of reach.

**A compact format editor on bind rows.** Text binds and bound attribute values gain a
`raw | number | currency | date` select that reveals that type's fields (decimals, ISO-4217
code, currency display, date pattern). Switching type commits a COMPLETE spec, so the draft is
never momentarily invalid, and the editor hides itself while `map` or `prefix` is active —
one transform per value, mirroring the validator. A TEXT bind row offers `format` and `map` (with its
default, in a block under the node) and never `prefix`, the attribute-only transform.

**Polish from live use.** The output map's `"."` selection row is offered as an on-schema target
(it was marked off-schema). The widget designer's Export section offers `Export widget entry` and
`Copy as TypeScript` only — the theme-JSON button is gone (themes export from the theme designer;
`exportThemeJson` stays exported for hosts). The styles section legend reads `(.wg- selectors
only)`.
