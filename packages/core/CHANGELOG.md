# @widgentic/core

## 0.15.0

### Minor Changes

- ed06286: The date format gains an optional `zone`: `{ type: "date", pattern, zone?: "utc" | "value" | "viewer" }`.
  - **`utc`** (the default) is unchanged: the instant in UTC.
  - **`value`** shows the time the value itself states. `2026-10-21T09:30:00-07:00` with `HH:mm` renders `09:30`; an unzoned value renders as written, and an epoch number in UTC. Every surface agrees.
  - **`viewer`** shows the viewer's local time inside MCP Apps frames. On a text bind the renderer emits `<time datetime="<instant, ISO UTC>" data-wg-date="<pattern>">` around the UTC text, which the app template rewrites in the viewer's zone. Every surface without a viewer shows the UTC text. On an attribute value, `viewer` is refused with `INVALID_TEMPLATE_NODE`, since a frame rewrites text only.
  
  New exports: `DATE_ZONES`, `DATE_ZONE_RULE` (the rule text every guide and designer derives from), `isDateZone` and the `DateZone` type.
- 181d2d9: A widget can name its own themes: `descriptor.themes: { light?, dark? }`, each a theme name (a built-in `light`/`dark` included). The catalog keeps them and returns them from `describe` and `list`. Whether a name exists is the caller's registry's business.
  
  New exports:
  - `checkWidgetThemes`, the one runtime-neutral shape check that the store, the designers' import and the host bundle all use;
  - `WIDGET_THEMES_RULE`, the rule text every guide and designer derives from;
  - the `WidgetThemes` type.

### Patch Changes

- fc662ed: A value composed behind an author's URL prefix is now percent-encoded, so data can no longer restructure a URL whose shape the prefix fixes. This applies to a template `{ bind, prefix }` and to a `hints.links` prefix string on cards and tables. The prefix decides how:
  - **Anything longer than a scheme** (`https://api.dicebear.com/9.x/initials/svg?seed=`): the value is one URI component, encoded as `encodeURIComponent` does. `Ada & Lin?x=1` becomes `Ada%20%26%20Lin%3Fx%3D1`; before, its `&` started a new query parameter.
  - **A bare `mailto:` or `tel:`** (any bare scheme other than the web ones): the value is the address. `ada@example.org` and `+15551234` are unchanged, a space becomes `%20`, and `?`, `#`, `&` and `%` are encoded, so a value cannot add `?subject=`.
  - **Exactly `http:`, `https:`, `http://` or `https://`**: the value is the rest of a URL. Spaces, control characters, quotes, `<>\^`, backtick, braces, `|` and non-ASCII are encoded, and its delimiters and escapes are kept.
  - **A `data:` prefix**: the value is kept as written. The image-source guard admits only base64.
  
  Non-ASCII characters are encoded as UTF-8. The new constant `PREFIX_ENCODING_RULE` states the rule, and every surface that documents a prefix derives from it. The `hints.links` analyzer checks the encoded href. Whole URLs bound with no prefix are unchanged.

## 0.14.0

### Minor Changes

- 995b54c: The stylesheet resource rule: `parseResource`, `parseResources`, `resourceCovered`, `resourceHost` and `RESOURCE_LIMIT` (8).
  - **An entry** is `{ type: "stylesheet", href, integrity? }`.
  - **The address** is `https://` on a host the resource-domain rule accepts, with no port, user name or wildcard, read by grammar, so every runtime reads it alike. Nothing that could leave an attribute value passes.
  - **Integrity** is one or more `sha256|sha384|sha512-<base64>` values.
  - **Coverage** follows CSP host-source matching: exact, or a `*.` wildcard for its subdomains, never its apex.
  
  The store, the server, the host bundle and the designers all use this one rule.

## 0.13.0

### Minor Changes

- 6c53a3c: `hints.fields` for the built-in `card`: an array of field keys that chooses which fields render and in what order, as `hints.columns` does for `table`. Keys the data lacks are skipped, a repeated key renders once, and a malformed value falls back to data order; a card without the hint renders unchanged. `analyzeHints` reports unmatched `fields` entries (`NO_MATCH`) and a malformed value (`INVALID_VALUE`).
  
  `FIELD_ORDER_RULE` is exported and ends the card's `fields` hint and the table's `columns` hint. Object key order does not survive every host's serializer, so agents list the keys whenever their order matters.

## 0.12.0

### Minor Changes

- cc2c139: Text formats and Markdown text binds in the template DSL.
  
  - The closed `format` vocabulary gains `count` (a list's length), `join` (a list's items with author separators, an optional last separator and an optional per-item `field`), `truncate` (code points kept, author ellipsis) and `pluralize` (author forms chosen by the locale's plural rules, `{count}` replaced by the number). They work on text binds and attribute values alike, under the one-transform-per-value rule. A value a format cannot read renders as its plain text.
  - `{ bind, markdown: true }` parses the bound text as a fixed Markdown subset into one `div.wg-md`: paragraphs, line breaks, emphasis, strong, inline code, links and flat lists. The parser, not the value, chooses tags; raw HTML and other syntax stay literal, link URLs face the template URL guard, every emitted node spends the render budget, and a value over `MARKDOWN_SOURCE_MAX` renders as one plain paragraph. Text binds only, exclusive with `map` and `format`.
  - The base stylesheet styles `.wg-md` paragraphs, lists, code and links from the theme tokens.
  - New exported constants: `JOIN_SEPARATOR_MAX`, `JOIN_DEFAULT_SEPARATOR`, `TRUNCATE_LENGTH_MIN`, `TRUNCATE_LENGTH_MAX`, `TRUNCATE_ELLIPSIS_MAX`, `TRUNCATE_DEFAULT_ELLIPSIS`, `PLURAL_CATEGORIES`, `PLURAL_FORM_MAX`, `PLURAL_COUNT_PLACEHOLDER`, `MARKDOWN_SOURCE_MAX`, `MARKDOWN_TAGS`, `LIST_FORMAT_TYPES` (the formats that read a list), with `isPluralCategory` and `isPlainDottedPath`. Every existing template validates and renders unchanged.

## 0.11.0

### Minor Changes

- 7d7a66b: Field and column labels for the built-in `card` and `table`: `hints.labels` maps a field's or column's key to the label the reader sees.
  
  - The card's field keys, the table's headers (including the columns `hints.columns` selects) and image `alt` text show the label. A key without one, or with a blank one, shows the key, so a render without `labels` is byte-identical.
  - Labels are escaped text; the data, the payload and every other hint keep addressing fields by key.
  - `analyzeHints` reports a label whose key matches no field or column (`NO_MATCH`), and one that is not a non-empty string (`INVALID_VALUE`).
  - `LABEL_STYLE_RULE`, the one steering text for labels (Title Case unless the user asks for another style or language, keys left as they are), is exported and included in the card and table descriptors' `labels` hint.
- 34c0ad5: One resource-domain rule for every door: `parseResourceDomain`, `parseResourceDomains`, `matchesResourceDomain` and `RESOURCE_DOMAIN_LIMIT` (20), exported from the root and `./contract`.
  
  - Accepts `cdn.example.com`, `*.example.com`, or either behind `https://`, with one optional trailing `/`, ignoring case and surrounding whitespace. Returns the canonical origin (`https://cdn.example.com`, `https://*.example.com`) or a readable reason.
  - Refuses other schemes, ports, paths, queries, fragments, userinfo, IP literals, single-label and `localhost` names, a wildcard anywhere but the whole first label (or before fewer than two labels), non-ASCII hosts (enter punycode), and whitespace, `;`, `,` or quotes, so no entry can inject into a CSP a host builds from it.
  - `matchesResourceDomain` follows CSP: a wildcard covers subdomains at any depth, never its apex.
- 7c68517: Themes gain shared styles and a default per host mode.
  
  - **`ThemeEntry.styles`.** A theme may carry `styles` in the same shape as a widget descriptor's: shared `.wg-` classes (`.wg-btn`, say) that any widget rendered under the theme can use. The registry refuses a malformed map with `INVALID_THEME`. Unsafe entries inside a well-shaped map are kept and dropped when CSS is generated, as for widgets.
  - **`themeStylesToCss(styles, scope?)`** (`./theming`) generates them under the widget-style guards. A `scope` prefixes every selector part with `:where(<scope>) `, so a scoped rule applies only inside the scope and keeps its author's weight.
  - **Registry defaults.** `setDefault(mode, name)`, `getDefault(mode)` and `defaults()` hold the theme each `ThemeMode` (`"light" | "dark"`) uses when a render names none. Both start as the built-ins.
  - **`isStyleMap(value)`** (`./catalog`) is the one shape check for widget and theme styles.
  - **Stricter style and token guards (widget styles included).**
    - Each selector part must be held to `.wg-` classes: one of its compounds names a `.wg-` class itself, or through `:is()`/`:where()` whose every argument does. So `:is(.wg-btn, .wg-link):hover` and `:where(.wg-card) h3` are kept, while `body:not(.wg-x)`, `body:has(.wg-x)` and `:is(.wg-a, body)` are dropped.
    - A part may not open with a combinator, and `:is()`/`:where()` may nest at most 16 levels, so the generator never throws.
    - Brackets and quotes are read as CSS: a parenthesis inside an attribute value can no longer hide a comma or close a pseudo-class, and a newline ends a string unclosed.
    - Selectors, properties and values may not hold comment markers (`/*`, `*/`) or an unclosed bracket or string.
    - Values and theme token values may not call `image-set(` or `src(`, which carry URLs like `url(`. Token values also refuse `\`, whose escapes can spell any refused call.
    - Scoped theme styles split on top-level commas and scope a root-anchored part (`:root[…] .wg-x`, `html .wg-x`) on its root compound.
  - **The rules as data.** `UNSAFE_FUNCTIONS` and `STYLE_RULES` (`./catalog`), and `TOKEN_VALUE_UNSAFE` and `TOKEN_VALUE_RULE` (`./theming`), let guides and tools derive the rules instead of restating them.
  - **Breaking: theme `extends` is removed.** `ThemeEntry.extends` and the `UNKNOWN_BASE_THEME` code are gone, and an entry is complete as registered. No designer, seed, guide or tool ever set it; "a theme based on another" is a one-time copy (`seedThemeEntry`).
    - **TypeScript:** an entry literal that sets `extends` no longer compiles.
    - **JSON:** an entry carrying `extends` is registered without its base, since the field is ignored like any unknown one.
    - **Migration:** merge the base's tokens and styles into the entry before registering, for example `{ ...base.tokens, ...own.tokens }`.
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

## 0.8.0

### Minor Changes

- c2aba69: Keyed patching. Render-tree elements may carry an optional `key` (data only; `renderToHtml`
  and the DOM layer never emit it). When every child of a sibling list carries a distinct
  key in both the old and the new tree, `mountWidget` updates pair children by key and move
  the existing DOM nodes, so a reordering update keeps each record's element and a
  disclosure the reader opened; any other list still pairs by position. `table` keys body
  rows and `tree` keys each sibling list from a distinct record `id`. Templates gain an
  optional `key` path on `each` (`{ "each": "lines", "key": "sku", … }`), validated like a
  bind path. `catalog.render(payload, { partialData: true })` skips the descriptor
  data-schema check for the payload and every group item, for previews of input that is
  still arriving.

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
