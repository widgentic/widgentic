# @widgentic/designer

## 0.7.0

### Minor Changes

- c07dcb9: Path completion now descends arrays, and bind rows can author a value format.

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

### Patch Changes

- Updated dependencies [c07dcb9]
- Updated dependencies [3e84d9e]
  - @widgentic/core@0.7.0

## 0.6.0

### Minor Changes

- 1befff4: `chromeReferences(prefix = "--host")` — the full `chrome` map of `var()`
  references over `CHROME_TOKENS`, the return trip of `chromeCss`: paint the page
  with the derived palette, hand the designers the references, and they match by
  construction — an explicit scheme toggle reaches MOUNTED designers through the
  cascade with no remount and no event. Spread-override individual entries
  (`{ ...chromeReferences(), font: "..." }`). Caveat, stated in the docs: a
  reference to a property the page never defines is invalid at computed-value
  time and does not fall back to the built-in defaults — always pair the map
  with `chromeCss` under the same prefix.

## 0.4.1

### Patch Changes

- eb40c8e: Testing a standalone http action no longer applies a widget's output fold.

  `testHttpAction` validated the response and then folded it with the
  binding-level default (`merge`), which requires object shapes — but `mode`
  and `map` belong to a WIDGET'S binding, authored later; no binding exists at
  action-authoring time. An action whose API returns an array or scalar could
  therefore never pass its test (and, behind a test-gated save, never be
  saved). The test now validates against the action's own output schema and
  hands back the redacted response; binding-time folding keeps its own
  validation where the mode is actually authored.

  Designer: the action editor's Kind and Method selects share one row. Secrets:
  the value refusals say "characters (UTF-8 bytes)" instead of bare "bytes".

## 0.3.0

### Minor Changes

- 1bfb2b2: The designers now wear the widgentic palette by default, light and dark.

  Every colour sits on the logo mark's hue and is contrast-checked in both
  schemes: text pairs at WCAG AA (4.5:1), and the borders that identify an
  input, a focused tag or a banner at 3:1 — so `border`, `accent-line` and
  `danger-line` are noticeably stronger than before. Typography is unchanged
  (system stacks, 13/12/11px); radii move to 4/6/8px.

  **This is a visual change for hosts that pass no `chrome`.** Nothing in the
  API changed and nothing stops compiling. There is one default palette and no
  second one to fall back to: a host that wants a different look passes its own
  values through `chrome`.

  Also new: `CHROME_DEFAULTS` (the applied palette — the injected stylesheet is
  generated from it, so a host painting its page from the export cannot drift)
  and `chromeCss(palette, options?)`, which renders a palette as light and dark
  custom-property blocks under a prefix you choose.

## 0.2.0

### Minor Changes

- e79291b: Designers accept `chrome`: a host passes a partial map over the exported `CHROME_TOKENS` (28 `--wgd-*` tokens — the 18 colours plus `font`, `font-mono`, `font-size`, `font-size-sm`, `font-size-xs`, `radius-sm`, `radius`, `radius-lg`, `gap`, `shadow`) to every factory (`options.chrome`) and custom element (`chrome` attribute, JSON). Values are applied inline on the designer root and may be `var()` references to the host's own properties; unknown tokens, non-strings and CSS-wide keywords are ignored. Typography, radii and the menu shadow are now tokens with unchanged defaults, and the stylesheet's dead `var(…, #hex)` fallbacks are gone.

## 0.1.0

### Minor Changes

- c157db8: First published versions: `@widgentic/core` (contract, adapters, mapper, catalog, theming, templates, actions, reactive rendering), `@widgentic/designer` (widget, theme, schema and action designers, custom elements, browser bundle) and `@widgentic/mcp` (tool-output convention, server building blocks and official-SDK assembly, per-principal store and secrets with Cosmos and Key Vault adapters behind subpaths).

### Patch Changes

- Updated dependencies [c157db8]
  - @widgentic/core@0.1.0
