## MODIFIED Requirements

### Requirement: Registered widget styles
`WidgetDescriptor` SHALL accept optional `styles`: a map of CSS selectors to property/value maps, letting custom kinds ship their look as data. Every selector part — split on top-level commas, read outside brackets and quoted strings, so the commas inside `:is()`, `:not()`, `:has()`, `:where()` or an attribute value belong to it — SHALL be held to `.wg-` classes: one of its compounds SHALL name a `.wg-`-prefixed class itself, or through `:is()` or `:where()` whose every argument is so held (a `.wg-` class only inside `:not()`, `:has()`, an attribute test or a string does not count), and no part SHALL open with a combinator; selectors, property names, and values are guarded (no braces, semicolons, angle brackets, `@`, backslashes, comment markers `/*` or `*/`, unclosed brackets or strings, and in values no `url(`, `expression(`, `image-set(` or `src(`), and values MAY reference theme tokens via `var(--wg-*)`. The rules SHALL also be exported as text, `STYLE_RULES`, built from the constants that enforce them, for guides and designer messages to read. Invalid entries SHALL be skipped, never emitted. `widgetStylesToCss(styles)` SHALL generate the CSS, and styles SHALL be exposed through `describe`/`list` so hosts can inject them.

#### Scenario: Styles registered as data generate CSS
- **WHEN** a kind registers `styles: { ".wg-invoice": { border: "1px solid var(--wg-border, #e2e8f0)" } }`
- **THEN** `widgetStylesToCss` SHALL emit a `.wg-invoice { border: ... }` rule
- **AND** `describe(kind).styles` SHALL return the map

#### Scenario: Unsafe style entries are dropped
- **WHEN** styles contain a non-`.wg-` selector (e.g. `body`), a value with `url(`, or a property with `{`
- **THEN** the generated CSS SHALL contain none of them
- **AND** safe sibling entries SHALL still be emitted

#### Scenario: Structural tricks and URL carriers are dropped
- **WHEN** styles hold `html /* .wg-x */`, `body:not(.wg-x)`, `:is(.wg-a, body)`, `body[data-a=".wg-"]`, `.wg-a, ~ .wg-b`, a value `red /*`, and values calling `image-set(` or `src(`, beside a safe `.wg-row:has(.wg-ok, .wg-warn)` rule
- **THEN** the generated CSS SHALL contain only the safe rule

#### Scenario: Quoted brackets cannot shift the structure
- **WHEN** styles hold `.wg-a[title="("], body`, `body:not([title=")"] .wg-x)` and `body:not([x="]].wg-"])`
- **THEN** the generated CSS SHALL contain none of them
- **AND** `.wg-a[title="("], .wg-b` scoped to a mode SHALL scope both parts

#### Scenario: Unclosed brackets and strings are dropped
- **WHEN** styles hold the selectors `.wg-a:is(` and `.wg-a[title`, and the values `calc(1px + (2px`, `foo(`, `1px)` and `"open`
- **THEN** the generated CSS SHALL contain none of them

#### Scenario: Selectors held through :is() and :where() are kept
- **WHEN** styles hold `:is(.wg-btn, .wg-link):hover`, `:where(.wg-card) h3` and `.wg-a[title="("]` with the value `"("`
- **THEN** the generated CSS SHALL contain each rule unchanged

## ADDED Requirements

### Requirement: Data schemas can be audited for what validation ignores
The catalog SHALL export `DATA_SCHEMA_TYPES` — the `type` names the data validator checks — and `auditDataSchema(schema, path?)`, which returns, without throwing, a warning per thing the validator would silently ignore: a `type` name outside `DATA_SCHEMA_TYPES` (or a `type` that is neither a name nor a list of names), a `pattern` it refuses to run, and an `enum`, `required`, `properties` or `items` of the wrong shape, recursing into `properties` and `items` with dotted paths from `path` (default `schema`). Unknown keywords SHALL produce no warning (they are forward compatible), and validation itself SHALL stay unchanged.

#### Scenario: An unknown type is named, and validation still ignores it
- **WHEN** a schema's property `kind` has `type: "banana"`
- **THEN** `auditDataSchema` SHALL return a warning naming `schema.properties.kind.type` and `'banana'`, and `validateDataAgainstSchema` SHALL accept any value there

#### Scenario: Unrunnable patterns and misshapen keywords are named through items
- **WHEN** an array schema's `items` has a string `required`, a string `enum`, a nested-quantifier `pattern` on a property, and a property whose schema is a string
- **THEN** `auditDataSchema(schema, "dataSchema")` SHALL return one warning for each, with paths under `dataSchema.items`

#### Scenario: Supported schemas are silent
- **WHEN** a schema uses only `DATA_SCHEMA_TYPES`, a runnable `pattern`, well-shaped keywords and an unknown `x-note` keyword
- **THEN** `auditDataSchema` SHALL return no warnings
