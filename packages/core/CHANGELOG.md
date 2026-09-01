# @widgentic/core

## 0.7.0

### Minor Changes

- c07dcb9: Two additions for list-shaped APIs and typed values: a `format` transform on binds, and
  per-item projection of array action responses.

  **`{ bind, format }` — presentation at render time.** A text bind or an attribute value may
  carry one `format`, joining `map` and `prefix` as the DSL's third value transform (all three
  are mutually exclusive on one value). The vocabulary is closed and data-only — the author
  supplies every literal, data only flows through:

  - `{ type: "number", decimals?: 0-8, locale? }`
  - `{ type: "currency", currency: <ISO-4217>, decimals?: 0-8, currencyDisplay?: "narrowSymbol" | "symbol" | "code", locale? }`
  - `{ type: "date", pattern: <yyyy MM dd HH mm ss plus separators> }`

  Formatting is deliberately render-time, not fold-time: the payload keeps the typed value, so
  the initial render, a preview and an action's re-render all present the same data the same
  way, and a second fold never formats an already-formatted string. Numeric STRINGS parse — the
  shape every JSON API that fears float precision returns — so `"3206.9905920000"` as COP with
  0 decimals renders `$3,207`, and `"2026-09-01T02:04:47.257871358"` under `dd-MM-yyyy HH:mm`
  renders `01-09-2026 02:04`. A value the format cannot parse renders raw: a format never hides
  data and never throws.

  Determinism is guaranteed, not incidental: the default locale is fixed at `en-US` (an author
  locale must be one the runtime knows), an unzoned ISO value is read as UTC and formatted in
  UTC, epoch numbers are seconds below 1e11 and milliseconds above, numeric output uses ordinary
  spaces where ICU builds differ in their no-break variants, and dates go through an in-house
  token engine rather than `new Date()` (ECMAScript reads unzoned date-times as LOCAL time). A
  date pattern must carry at least one token and no stray letter — `d/M/yy` would render a
  constant, not a date. Server render, designer preview and in-frame
  re-render agree byte for byte — anything else would make the in-place patcher see phantom
  text changes.

  **`map` now works on a TEXT bind.** `{ bind: "status", map: { "do-not-contact": "Do not contact" }, default: "Unknown" }`
  as a child node renders the label the value selects — the attribute form's exact discipline,
  applied to text. A text bind carries `map` or `format`, never both. `prefix` stays an
  attribute-value transform (it composes a scheme): on a text bind it remains accepted and inert,
  so nothing stored is refused on read.

  **Per-item projection.** An http action's `output.map` previously resolved every entry against
  the response ROOT, so for an array response the entries resolved to `undefined` and a list
  could only be `replace`d raw. When the response is an array, the map carries no `"."` entry and no
  source starts with an index, the entries now resolve against EACH ITEM and the projection is
  the array of per-item results — selecting and renaming fields out of a list response without
  replacing it (pair it with `replace` or `patch`; `merge` still refuses arrays). Root vocabulary
  keeps its meaning: any index-addressed source (`0.ask`) resolves against the response itself,
  so a positional pick that worked before still works. A `"."` target now SELECTS first — alone it
  is the whole projection, as before; beside other entries it names the value they map, so an
  enveloped list projects per item: `{ ".": "data", ask: "ask" }`. That shape was forbidden until
  now, so no stored binding changes meaning.

  New exports from `@widgentic/core` and `@widgentic/core/catalog`: `formatBoundValue` plus the
  constants and guards the validator, the designer and the authoring guide derive their vocabulary
  from (`FORMAT_TYPES`, `isFormatType`, `FORMAT_DECIMALS_MIN`/`MAX`, `CURRENCY_DISPLAYS`,
  `isCurrencyDisplay`, `CURRENCY_CODE`, `DATE_TOKENS`, `DATE_PATTERN_SEPARATORS`,
  `DATE_PATTERN_ALLOWED`, `DATE_PATTERN_MAX`, `EPOCH_SECONDS_BELOW`, `DEFAULT_FORMAT_LOCALE`,
  `LOCALE_TAG`, `isKnownLocale`, `tokenizeDatePattern`, `parseFormatSpec`, `compileFormat`), the
  `FormatSpec` types, and `TRANSFORM_KEYS`/`activeTransform` for the one-transform-per-value rule.

- 3e84d9e: Tree branches are now native `<details>`/`<summary>` disclosures, and the `custom`
  kind is gone. Both are breaking in 0.x.

  **Tree interactivity.** A node with children renders as
  `li.wg-tree-node > details.wg-tree-branch > summary.wg-tree-label + ul.wg-tree-children`,
  so a visitor can expand and collapse branches — by click and by keyboard — in every
  context the HTML reaches, with no script: the Apps iframe, a `format: "page"`
  document, or a plain fragment. Leaves stay plain labels with no disclosure, so the
  presence of the disclosure alone marks an expandable branch. `hints.expandDepth`
  keeps selecting the INITIAL state, now through the `open` attribute. **The
  `data-expanded` attribute and the stylesheet rule that hid `[data-expanded="false"]`
  children are removed** — a host styling `[data-expanded]` must move to
  `details.wg-tree-branch` and `[open]`. Because the initial state is a pure function
  of data and hints, and the in-place patcher diffs the previous render tree rather
  than the live DOM, a visitor's own toggles survive an action's re-render of the
  branches it leaves IN PLACE — the diff is positional, so a result that reorders
  or prepends siblings re-pairs states by index, as any unkeyed patcher does.

  **Node icons.** A tree node takes an optional `icon` string, rendered before its
  label. A value passing the same image gate card and table use renders as
  `img.wg-img.wg-img-icon` — decorative (empty `alt`), `loading="lazy"`,
  `decoding="async"`, participating in server-side image inlining; any other string
  (an emoji, a glyph) renders as `span.wg-tree-icon` text; an unsafe source renders as
  text, never as an image. `icon` joins `children` in the JSON-snippet fallback's
  exclusions.

  **The `custom` kind is REMOVED.** It pretty-printed `data` as JSON in a `<pre>` —
  not styleable, and its name collided with the product's real custom widgets
  (template widgets built in the designer). `createCatalog()` now pre-registers
  exactly `card`, `table`, `tree` and `group`; a payload naming `custom` gets the
  usual `UNKNOWN_KIND` error listing the available kinds. Reserved kinds derive from
  the catalog, so `custom` is now claimable as a stored template kind. Render
  structured data through `card`, `table`, `tree` or `group` instead.

  **Stylesheet.** The `.wg-custom` block is renamed `.wg-code`, a neutral monospace
  block utility no built-in emits (it keeps the `font-mono` token consumed and is a
  styling surface template authors can opt into); the theme token registry is
  unchanged at 32 tokens. New rules style the branch chevron and size `.wg-tree-icon`
  and `.wg-img-icon` to a shared em-box.

## 0.1.0

### Minor Changes

- c157db8: First published versions: `@widgentic/core` (contract, adapters, mapper, catalog, theming, templates, actions, reactive rendering), `@widgentic/designer` (widget, theme, schema and action designers, custom elements, browser bundle) and `@widgentic/mcp` (tool-output convention, server building blocks and official-SDK assembly, per-principal store and secrets with Cosmos and Key Vault adapters behind subpaths).
