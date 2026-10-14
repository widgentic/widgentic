## ADDED Requirements

### Requirement: Card field order and selection
The `card` renderer SHALL honor `hints.fields: string[]`, which chooses which fields render and in what order, as `hints.columns` does for `table`.
- The fields SHALL render in the listed order, and only those listed.
- A listed key the card's data does not carry SHALL be skipped.
- A key listed twice SHALL render once, at its first position.
- `title` and `subtitle` are chrome, not fields: `fields` neither adds nor removes them.
- A `fields` value that is not an array of strings SHALL be ignored, and the card SHALL render its fields in data order.
- Every other hint (`labels`, `fieldFormat`, `images`, `links`) SHALL still address a field by its key.
- A card without `fields` SHALL render byte-identically to one made before the hint existed.

The catalog SHALL export a field-order rule: object key order does not survive every host, so an agent lists the keys in `fields` (card) or `columns` (table) whenever their order matters. The `card` descriptor SHALL document `fields` and the `table` descriptor `columns`, each with that rule, so every surface that lists widgets steers by it.

#### Scenario: Fields render in the hinted order
- **WHEN** `card` renders `data: { title: "Olivia", fields: { avatar: "x", company: "Northwind", email: "o@example.com", role: "Designer" } }` with `hints: { fields: ["role", "company", "email"] }`
- **THEN** the field keys SHALL read `role`, `company` and `email`, in that order, with no `avatar` row, and the title SHALL read `Olivia`

#### Scenario: Missing and repeated keys
- **WHEN** `card` renders `data: { a: 1, b: 2 }` with `hints: { fields: ["b", "zzz", "b", "a"] }`
- **THEN** the field keys SHALL read `b` then `a`

#### Scenario: A malformed order falls back to data order
- **WHEN** `card` renders `data: { b: 2, a: 1 }` with `hints: { fields: "a" }`, then with `hints: { fields: ["a", 3] }`
- **THEN** both SHALL render `b` then `a`, byte-identical to the render without `fields`

#### Scenario: The other hints keep addressing keys
- **WHEN** `card` renders `data: { fields: { unit_price: 9.99, sku: "A1" } }` with `hints: { fields: ["unit_price", "sku"], labels: { unit_price: "Unit Price" }, fieldFormat: { unit_price: "${value}" } }`
- **THEN** the first field SHALL read `Unit Price` with the value `$9.99`, and the second `sku` with `A1`

#### Scenario: The descriptors carry the field-order rule
- **WHEN** the built-in `card` and `table` descriptors are read
- **THEN** the card's `fields` hint and the table's `columns` hint SHALL each contain the exported field-order rule

## MODIFIED Requirements

### Requirement: Hint-coherence analysis
The catalog SHALL export a pure `analyzeHints(kind, data, hints, descriptor)` that inspects a render request without rendering it and returns an array of never-fatal diagnostics `{ hint, code, message, suggestion? }` with codes `UNKNOWN_HINT`, `NO_MATCH`, `INVALID_VALUE`, `UNSAFE_IMAGE_SOURCE`, and `UNSAFE_LINK_TARGET`. It SHALL report: top-level hint keys not advertised in the descriptor's `hints` (adding a `suggestion` when an advertised key is within Levenshtein distance 2); `columns`, `fields`, `fieldFormat`, `images`, `links`, and `labels` entries whose key matches no column or field in the supplied `data` (`fieldFormat` and `labels` validated against columns when `kind` is `"table"`, fields otherwise; `fields` against the card's fields); a `columns` or `fields` value that is not an array of strings (`INVALID_VALUE`); `labels` values that are not non-empty strings; `images` values outside `"avatar" | "thumb" | "hero" | true | false`; `links` values that are neither booleans nor strings; values targeted by an image hint that fail `isSafeImageSrc`; values targeted by a `true` link hint that are not strings passing the URL scheme guard, and prefix link hints whose target is not a non-empty string or whose composed href fails the guard; non-number `expandDepth`; and for `kind: "group"`, `layout`/`gap` values outside their preset vocabularies, non-number or out-of-range `columns`, and `columns` supplied without `layout: "grid"`. Analysis SHALL never throw, never mutate inputs, and never affect rendering; renderers SHALL remain unaware of it. An empty or absent `hints` SHALL produce no diagnostics.

#### Scenario: Unknown hint gets a spelling suggestion
- **WHEN** `analyzeHints("table", [{ a: 1 }], { colums: ["a"] }, tableDescriptor)` is called
- **THEN** the result SHALL contain a diagnostic with `code: "UNKNOWN_HINT"`, `hint: "colums"`, and `suggestion: "columns"`

#### Scenario: Hint keys that match no data are reported
- **WHEN** `analyzeHints("card", { fields: { price: 1 } }, { fieldFormat: { cost: "${value}" } }, cardDescriptor)` is called
- **THEN** the result SHALL contain a diagnostic with `code: "NO_MATCH"` for `fieldFormat.cost`

#### Scenario: Invalid image shape and unsafe source are distinct codes
- **WHEN** `images: { photo: "big" }` targets an existing field, and `images: { x: "avatar" }` targets a field whose value is `javascript:alert(1)`
- **THEN** the first SHALL yield `INVALID_VALUE` and the second `UNSAFE_IMAGE_SOURCE`

#### Scenario: Coherent hints are silent
- **WHEN** `analyzeHints("table", [{ a: 1, avatar: "https://cdn.example/a.png" }], { columns: ["a", "avatar"], images: { avatar: true } }, tableDescriptor)` is called
- **THEN** the result SHALL be an empty array

#### Scenario: Analysis is total
- **WHEN** `analyzeHints` receives garbage (`data: null`, `hints: 42`, missing descriptor)
- **THEN** it SHALL return an array without throwing

#### Scenario: Table fieldFormat validates against columns
- **WHEN** `analyzeHints("table", [{ total: 1 }], { fieldFormat: { totl: "${value}" } }, tableDescriptor)` is called
- **THEN** the result SHALL contain a diagnostic with `code: "NO_MATCH"` for `fieldFormat.totl`
- **AND** the same hint aimed at `total` SHALL produce no diagnostic

#### Scenario: Link hints are checked end to end
- **WHEN** `links: { site: 7 }` targets an existing column, `links: { missing: true }` matches nothing, and `links: { bad: true }` targets a `javascript:` value
- **THEN** they SHALL yield `INVALID_VALUE`, `NO_MATCH`, and `UNSAFE_LINK_TARGET` respectively

#### Scenario: Prefix link hints are checked on the composed href
- **WHEN** `links: { email: "mailto:" }` targets a non-empty string field, and `links: { note: "x-" }` composes to a disallowed scheme
- **THEN** the first SHALL produce no diagnostic and the second SHALL yield `UNSAFE_LINK_TARGET`

#### Scenario: Group hint vocabularies are enforced
- **WHEN** `analyzeHints("group", { items: [] }, { layout: "mosaic", gap: "huge", columns: 2 }, groupDescriptor)` is called
- **THEN** `layout` and `gap` SHALL yield `INVALID_VALUE` diagnostics
- **AND** `columns` SHALL yield `NO_MATCH` because the layout is not `"grid"`

#### Scenario: Label hints are checked against the fields
- **WHEN** `analyzeHints("card", { fields: { first_name: "Ada" } }, { labels: { first_name: "First Name", last_name: "Last Name", age: 7 } }, cardDescriptor)` is called
- **THEN** `labels.last_name` SHALL yield `NO_MATCH`, `labels.age` SHALL yield `NO_MATCH`, and `labels.first_name` SHALL produce no diagnostic
- **AND** `labels: { first_name: "" }` or `labels: { first_name: 1 }` SHALL yield `INVALID_VALUE` for `labels.first_name`, and a non-object `labels` SHALL yield `INVALID_VALUE` for `labels`

#### Scenario: Card field order entries are checked like columns
- **WHEN** `analyzeHints("card", { fields: { price: 1, stock: 2 } }, { fields: ["stock", "cost"] }, cardDescriptor)` is called, and again with `{ fields: "stock" }`
- **THEN** the first SHALL contain one `NO_MATCH` diagnostic for `fields.cost`, and the second one `INVALID_VALUE` diagnostic for `fields`
