## MODIFIED Requirements

### Requirement: Designer chrome is themeable by the host
The designers SHALL paint their chrome exclusively through a documented set of custom properties — the chrome tokens — exported as `CHROME_TOKENS` (with the `ChromeToken` type): the colour tokens `bg`, `panel`, `border`, `line`, `text`, `muted`, `accent`, `accent-bg`, `accent-line`, `danger`, `danger-bg`, `danger-line`, `hover`, `hl-key`, `hl-str`, `hl-num`, `hl-bool`, `hl-punct`; the typography tokens `font` (labels, buttons, controls), `font-mono` (code panes and code-like values), `font-size` (base), `font-size-sm` (compact rows), `font-size-xs` (badges, tags and inline meta); the shape tokens `radius-sm`, `radius`, `radius-lg`, `gap`; and the elevation token `shadow`; each `--wgd-<token>`. Every factory SHALL accept `options.chrome`, a partial map from token to CSS value, and SHALL apply the given values on the designer's root element so they take precedence over the built-in light and dark defaults; values MAY be `var()` references to the host's own custom properties. Unknown token names, non-string values and CSS-wide keywords (`inherit`, `initial`, `unset`, `revert`) SHALL be ignored, never thrown — a host that wants its own typeface passes its variable with a fallback stack. The custom elements SHALL accept the same map as a `chrome` attribute holding JSON, read when the element connects; unparseable JSON SHALL be ignored. The injected stylesheet SHALL contain no colour, typeface, font-size, radius or shadow literal outside the token declaration blocks, and no `var()` fallback for a token those blocks or the widget base stylesheet define.

With no `chrome` given, the designers SHALL render in the widgentic palette — the product's own colours and shape, light and dark — so that our app, the examples and any host that configures nothing all look like one product. The colour and shape tokens SHALL carry those values; the typography tokens SHALL NOT, remaining the system stacks and sizes a library can guarantee without fetching a font. The default palette SHALL be exported as data alongside the tokens, and SHALL be the very object the stylesheet is generated from, so a host can paint its own surfaces to match instead of restating the values. Exactly one palette SHALL ship: a host that does not want the product look supplies its own values through `chrome` and owns their contrast, rather than reaching for a second palette the package maintains. A helper SHALL render any palette as light and dark custom-property declaration blocks under a caller-chosen prefix, so a host page's palette is derived rather than copied. Every foreground/background pair among the default tokens SHALL meet the WCAG contrast threshold for its role in both schemes, checked by a test over computed values rather than by inspection.

`chrome` SHALL NOT affect widget previews, whose `--wg-*` theme tokens are governed by the widget-theming capability.

#### Scenario: A host palette replaces the defaults
- **WHEN** `createDesigner(container, { chrome: { bg: "#101820", accent: "var(--brand)", font: "Inter, sans-serif" } })` is called
- **THEN** the root element SHALL carry `--wgd-bg`, `--wgd-accent` and `--wgd-font` as inline custom properties with those values, and the chrome's background, accent and typeface SHALL resolve to them

#### Scenario: Host scheme switching flows through
- **WHEN** a host passes `var()` references that change with its own `prefers-color-scheme` handling
- **THEN** the chrome SHALL follow the host's scheme without the designer being recreated, because the references resolve at the host

#### Scenario: Invalid values are ignored at the door
- **WHEN** `chrome` names an unknown token, carries a non-string value, or gives a CSS-wide keyword such as `inherit`
- **THEN** the designer SHALL mount normally, set nothing for those entries, and keep the built-in defaults for the affected tokens

#### Scenario: Elements accept the map as an attribute
- **WHEN** `<widgentic-designer chrome='{"accent":"#40A0C8"}'>` is attached
- **THEN** its root SHALL carry `--wgd-accent: #40A0C8`
- **AND WHEN** the attribute is not valid JSON or names an unknown token
- **THEN** the designer SHALL mount normally with the defaults for the affected tokens

#### Scenario: Nothing changes for hosts that pass nothing
- **WHEN** a designer is created without `chrome`
- **THEN** it SHALL need no configuration and its typography and spacing SHALL be unchanged — the system stacks, sizes 13px, 12px and 11px, gap 16px — and the root token block SHALL declare every documented default so no token falls back to a browser value

#### Scenario: Hosts that pass nothing get the product look
- **WHEN** a designer is created without `chrome`, in each scheme
- **THEN** its computed colour tokens SHALL be the exported default palette for that scheme and its radii SHALL be 4/6/8px

#### Scenario: The exported palette is the applied palette
- **WHEN** the exported default palette is compared with the tokens a designer computes with no `chrome`
- **THEN** every token SHALL match, so a host painting its page from the export cannot drift from the designers

#### Scenario: A host page derives its palette
- **WHEN** the helper is called with a custom-property prefix
- **THEN** it SHALL return light and dark declaration blocks defining every token under that prefix, suitable for a stylesheet, with no value restated by hand

#### Scenario: A host that wants another look brings its own
- **WHEN** a host passes a full palette of its own as `chrome`
- **THEN** every token SHALL take the host's value, and the package SHALL offer no alternative palette of its own for the host to fall back to

#### Scenario: Every default pair meets contrast
- **WHEN** the default palettes are checked pair by pair in both schemes
- **THEN** text on its surface SHALL meet the WCAG AA threshold for body text, and accent, border and line pairs SHALL meet the threshold for their role, with the check failing the build otherwise

#### Scenario: The stylesheet has no stray literals
- **WHEN** the injected chrome stylesheet is inspected outside its token declaration blocks
- **THEN** it SHALL contain no colour literal, no typeface literal, no `px` font size, no `px` border radius and no shadow literal — only `var(--wgd-…)` references (and `calc()` over them)

#### Scenario: Previews are untouched
- **WHEN** `chrome` is set and a widget is previewed
- **THEN** the preview's `--wg-*` tokens SHALL be those of the selected preview theme, unaffected by `chrome`
