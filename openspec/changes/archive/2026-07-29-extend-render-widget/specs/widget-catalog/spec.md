## ADDED Requirements

### Requirement: Descriptor data schemas
`WidgetDescriptor` SHALL accept an optional `dataSchema` object using the documented JSON-Schema subset (`type`, `properties`, `required`, `items`, `enum`; unknown keywords ignored). When a kind has a `dataSchema`, `catalog.render` SHALL validate `data` against it before rendering, returning `{ ok: false, error }` with the existing vocabulary — `MISSING_FIELD` for missing required properties, `INVALID_TYPE` for type or enum violations — and a dotted path into the data (e.g. `data.lines.0.qty`). Kinds without a schema SHALL keep today's lenient behavior.

#### Scenario: Schema violation fails before rendering
- **WHEN** a kind with `dataSchema: { type: "object", required: ["lines"] }` renders `data: {}`
- **THEN** the result SHALL be `{ ok: false, error }` with `error.code: "MISSING_FIELD"` and `error.path: "data.lines"`

#### Scenario: Nested violations carry dotted paths
- **WHEN** the schema requires `lines` items to have numeric `qty` and `data.lines[0].qty` is a string
- **THEN** `error.path` SHALL be `"data.lines.0.qty"` with `error.code: "INVALID_TYPE"`

#### Scenario: Valid data renders normally
- **WHEN** the data satisfies the schema
- **THEN** rendering SHALL proceed exactly as without a schema

#### Scenario: Schema-less kinds stay lenient
- **WHEN** a kind has no `dataSchema`
- **THEN** any `data` value SHALL render via the kind's documented fallbacks

#### Scenario: Schemas are listed for discovery
- **WHEN** a kind with a `dataSchema` appears in `list()`
- **THEN** its descriptor SHALL include the schema verbatim

### Requirement: Registered widget styles
`WidgetDescriptor` SHALL accept optional `styles`: a map of CSS selectors to property/value maps, letting custom kinds ship their look as data. Every selector part SHALL target a `.wg-`-prefixed class; selectors, property names, and values are guarded (no braces, semicolons, angle brackets, `url(`, or `expression(`), and values MAY reference theme tokens via `var(--wg-*)`. Invalid entries SHALL be skipped, never emitted. `widgetStylesToCss(styles)` SHALL generate the CSS, and styles SHALL be exposed through `describe`/`list` so hosts can inject them.

#### Scenario: Styles registered as data generate CSS
- **WHEN** a kind registers `styles: { ".wg-invoice": { border: "1px solid var(--wg-border, #e2e8f0)" } }`
- **THEN** `widgetStylesToCss` SHALL emit a `.wg-invoice { border: ... }` rule
- **AND** `describe(kind).styles` SHALL return the map

#### Scenario: Unsafe style entries are dropped
- **WHEN** styles contain a non-`.wg-` selector (e.g. `body`), a value with `url(`, or a property with `{`
- **THEN** the generated CSS SHALL contain none of them
- **AND** safe sibling entries SHALL still be emitted

## MODIFIED Requirements

### Requirement: Card data handling
The `card` renderer SHALL use `data.title`, `data.subtitle`, and `data.fields` when present; for other plain objects it SHALL render each entry as a field key/value pair; for primitives and `null` it SHALL render the stringified value. When `data` provides no title/subtitle, `meta.title`/`meta.subtitle` SHALL be used instead. `hints.fieldFormat: Record<string, string>` SHALL format matching field values by substituting `{value}` in the pattern (a pattern without the placeholder appends the value); unmatched keys and non-string patterns are ignored, and formatted output is escaped like any text.

#### Scenario: Arbitrary object renders as fields
- **WHEN** `card` renders `data: { name: "Ada", role: "eng" }`
- **THEN** the output SHALL contain field pairs `name`/`Ada` and `role`/`eng`

#### Scenario: Meta supplies missing chrome
- **WHEN** `card` renders `data: { a: 1 }` with `meta: { title: "T" }`
- **THEN** the output SHALL contain the title `"T"`

#### Scenario: Primitive data renders as a value
- **WHEN** `card` renders `data: 42`
- **THEN** the output SHALL contain the text `"42"`

#### Scenario: fieldFormat patterns format values
- **WHEN** `card` renders `data: { fields: { price: 9.99, rating: 2.56 } }` with `hints: { fieldFormat: { price: "${value}", rating: "{value} / 5" } }`
- **THEN** the output SHALL contain `$9.99` and `2.56 / 5`

#### Scenario: fieldFormat cannot inject markup
- **WHEN** a pattern contains `<b>` around the placeholder
- **THEN** the serialized output SHALL contain the escaped text, not an element
