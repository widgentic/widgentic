# @widgentic/designer

## 0.13.0

### Patch Changes

- Updated dependencies [6c53a3c]
  - @widgentic/core@0.13.0

## 0.12.0

### Minor Changes

- cc2c139: The template tree's format control offers `count`, `join`, `truncate` and `pluralize` with their fields, committing a valid spec on every type switch; editing plural forms keeps the categories and locale the row does not show. A text bind row gains a Markdown toggle that hides `map` and `format` while it is on. A bind whose format reads a list (count, join, pluralize) completes the schema's array paths instead of marking them off-schema.

### Patch Changes

- Updated dependencies [cc2c139]
  - @widgentic/core@0.12.0

## 0.11.0

### Minor Changes

- 34c0ad5: The settings designer gains a **Resource domains** subsection: the domains a person's MCP Apps frames may load images from directly.
  
  - Entries are added, edited and removed in place, each checked as it is typed by core's `parseResourceDomain`. A valid entry is recorded and shown in its canonical `https://` form. An invalid one is kept as typed and marked with the rule's reason, so the save's `INVALID_DOMAIN` names it.
  - Adding stops at `RESOURCE_DOMAIN_LIMIT`. The text states the accepted forms, the limit and the trust a declaration grants: any render may load from a listed domain in the viewer's browser, so list only domains you control.
  - `getSettings()` carries `resourceDomains` once the supplied record had it or the person edited the list (possibly empty, so a save clears it). `loadSettings` refuses a `resourceDomains` that is not a list of strings, and read-only mode makes the list inert.
- 7c68517: Theme styles in the designers, and a fifth designer for settings.
  
  - **Theme designer.** It edits a theme's `styles` with the widget designer's own Styles panel (Tree and JSON tabs, the same audit). Its preview applies them beneath the previewed kind's styles, and export and import carry them.
  - **Widget designer.** The preview applies the selected preview theme's styles beneath the draft's, so a shared class looks in the draft as it will in a render. A new `previewTheme` option opens the designer with one of the supplied themes selected (pass the person's light default), and loading a widget keeps the preview theme's styles as well as its tokens.
  - **Settings designer.** `createSettingsDesigner` / `defineSettingsDesignerElement` (`<widgentic-settings-designer>`) edits the principal's settings record. Its Default themes subsection picks the theme light and dark hosts get when a render names none, among the built-in and the themes you pass. A name you did not pass shows as unavailable, and sections it does not edit pass through.
  - **Review fixes.** `loadTheme` replaces the preview theme whole, dropping the previous entry's styles. The Styles panel's JSON tab admits only the styles shape and treats `{}` as no styles. The theme designer's Styles section sits under the preview, as in the widget designer. The settings designer gains `setThemes`, and `<widgentic-settings-designer>` a `themes` property. Preview scopes stay distinct across bundles on one page.
- 7c68517: The designers refuse at import what saving would refuse, and warn about what the store accepts but an author likely did not mean.
  
  - **`SAFE_IDENTIFIER`** (core, `./catalog`) is the pattern the store enforces for widget kinds and theme, schema and action names. `@widgentic/mcp` and `@widgentic/webmcp` re-export it from core.
  - **`auditDataSchema(schema, path?)` and `DATA_SCHEMA_TYPES`** (core, `./catalog`) name what the data validator would silently ignore: a `type` outside the supported names, a `pattern` it will not run, and an `enum`, `required`, `properties` or `items` of the wrong shape. Validation itself is unchanged.
  - **Designer.** The widget designer refuses a definition whose kind is malformed (`INVALID_IDENTIFIER`) or built in (`RESERVED_KIND`). The theme designer refuses a malformed or built-in name (`RESERVED_THEME`) and flags it under the Name field while you type. The widget designer warns under the data-shape field while the shape is empty, because agents listing the widget would see a placeholder. The schema designer, and the widget designer for an inline `dataSchema`, show `auditDataSchema`'s warnings.
  - **Identity checks apply only to a change.** `loadWidget` and `loadTheme` refuse a kind or name that saving would refuse only when the load changes it, so reloading a draft or entry with new data or tokens is never refused for a kind or name the person typed. The widget designer's diagnostics flag a malformed kind as it is typed. `importWidgetJson` and `checkThemeEntry` take the current kind or name as an optional second argument.
  - **Diagnostics with the host's shared entries.** The widget designer's handle gains `getDiagnostics()` (the current draft's) and `checkWidget(definition)` (what a load would accept and report, without touching the draft), both resolved against the schemas and actions the host supplied. Without supplied schemas, a `dataSchemaRef` is no longer reported as unknown. A descriptor carrying both `dataSchema` and `dataSchemaRef` is refused at import and load, as Save refuses it.
  - **Malformed schema fields.** A `dataSchemaRef` that is not a schema name, and a `dataSchema` that is not an object, are refused at import and load. A designer mounted without `schemas` no longer calls a reference unknown; an explicit list still does.
  - **Retired `extends`.** The theme designer drops an `extends` field from an entry it opens or loads, so `getTheme`, Export, Save and `theme_get` never hand it back.
  - **Preview containment.** Every style a designer preview emits — the widget's own as well as the theme's — is scoped to that preview, so a widget's `.wg-title` rule no longer restyles matching elements elsewhere on the host page.
  - **Settings element.** `<widgentic-settings-designer>` keeps a `themes` value set before the element was defined.
  - **Styles panel.** The JSON tab's parse error clears once a valid value arrives through the Tree view or a load.
  - **Messages.** The style and token-value messages read core's `STYLE_RULES` and `TOKEN_VALUE_RULE`, and a skipped declaration's message names the part at fault: the property name or the value. `auditStyles` is exported.
  - **Preview theme.** The person's choice in the preview-theme selector now sticks: it is the draft's `previewTheme`, and `loadTheme` layers tokens over the chosen theme (keeping its styles) instead of replacing it, so `loadTheme({})` returns to it exactly. A token map never selects a theme by its content.
  - **WebMCP.** `draft_load`, `definition_check` and `theme_load` therefore return `REJECTED` for these definitions instead of loading them only for Save to fail, and `definition_check` reports a missing `dataShape` and an inline schema's ignored keywords as diagnostics. `schema_load` returns `warnings` for its schema. `widget_theme_set` layers over the person's preview theme and reports its name as `previewTheme`. `widget_example_data_set` and `theme_tokens_set` are no longer refused for a kind or name the person gave the draft. `widget_draft_get`, the editing tools and `widget_definition_check` now return the designer's own diagnostics, so a saved shared schema reference is no longer reported as unknown and the example is checked against it; `diagnosticsDerived` appears only when the check runs with no designer mounted. **New source:** `DesignerSources.widgetIfMounted`, a getter that returns the widget designer without showing or mounting anything; `widget_definition_check` reads only that, so a read-only check never moves the person's view. `theme_get`, `theme_load` and `theme_tokens_set` return `diagnostics.styles`, the style entries the renderer would drop, as widget diagnostics do. The guide and `theme_load` describe the token rule from core's `TOKEN_VALUE_RULE`, and the guide's style rules come from core's `STYLE_RULES`. The authoring guide calls `dataShape` strongly recommended.

### Patch Changes

- Updated dependencies [7d7a66b]
- Updated dependencies [34c0ad5]
- Updated dependencies [7c68517]
- Updated dependencies [7c68517]
  - @widgentic/core@0.11.0

## 0.8.0

### Minor Changes

- c2aba69: The template tree's `each` rows author the optional `key` path beside the array path,
  completing from the item's paths; choosing "no key" or emptying the input removes it.

### Patch Changes

- Updated dependencies [c2aba69]
  - @widgentic/core@0.8.0

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
