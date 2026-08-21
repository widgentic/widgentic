# Widget Catalog — built-in meta, formats, and links delta

## MODIFIED Requirements

### Requirement: Card data handling
The `card` renderer SHALL use `data.title`, `data.subtitle`, and `data.fields` when present; for other plain objects it SHALL render each entry as a field key/value pair; for primitives and `null` it SHALL render the stringified value. When `data` provides no title/subtitle, `meta.title`/`meta.subtitle` SHALL be used instead. `hints.fieldFormat: Record<string, string>` SHALL format matching field values by substituting `{value}` in the pattern (a pattern without the placeholder appends the value); unmatched keys and non-string patterns are ignored, and formatted output is escaped like any text. `hints.links: Record<string, boolean>` SHALL render a `true`-keyed field's string value as an anchor when the value's scheme passes the URL guard (http, https, mailto, tel); values failing the guard, non-string values, and un-hinted values render as plain text, and image treatment wins over a link hint for the same key. The anchor's text is the formatted value (`fieldFormat` still applies); its `href` is the raw value.

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

#### Scenario: A link hint renders an anchor for safe schemes
- **WHEN** `card` renders `data: { fields: { site: "https://example.com", mail: "mailto:a@b.c" } }` with `hints: { links: { site: true, mail: true } }`
- **THEN** the output SHALL contain anchors with those `href` values

#### Scenario: Unsafe link targets stay text
- **WHEN** a `true` link hint targets a field whose value is `javascript:alert(1)` or a non-string
- **THEN** the output SHALL contain the value as plain text with no anchor

### Requirement: Table data handling
The `table` renderer SHALL detect columns as the union of record keys in first-seen order, render one row per record with empty cells for missing keys, and honor `hints.columns: string[]` as an override of column selection and order. Non-array `data` SHALL be treated as a single-record array. `meta.title`/`meta.subtitle` SHALL render as the table's caption chrome; without them no caption appears. `hints.fieldFormat: Record<string, string>` SHALL format matching cell values by column with the card's exact pattern semantics (substitute `{value}`, append when absent, escape like any text, ignore unmatched keys and non-string patterns); image treatment wins over `fieldFormat` for the same column. `hints.links: Record<string, boolean>` SHALL render a `true`-keyed column's string cells as anchors when the value's scheme passes the URL guard (http, https, mailto, tel); values failing the guard, non-string values, and un-hinted values render as plain text, image treatment wins over a link hint for the same column, and the anchor's text is the formatted value while its `href` is the raw value.

#### Scenario: Column union preserves first-seen order
- **WHEN** `table` renders `data: [{ a: 1, b: 2 }, { a: 3, c: 4 }]`
- **THEN** the columns SHALL be `a`, `b`, `c` in that order
- **AND** the second row's `b` cell SHALL be empty

#### Scenario: hints.columns overrides detection
- **WHEN** `table` renders the same data with `hints: { columns: ["c", "a"] }`
- **THEN** the columns SHALL be exactly `c`, `a` in that order

#### Scenario: Meta renders as caption chrome
- **WHEN** `table` renders rows with `meta: { title: "Holdings", subtitle: "as of Q3" }`
- **THEN** the output SHALL contain a caption with `"Holdings"` and `"as of Q3"`
- **AND** without `meta` the output SHALL contain no caption

#### Scenario: fieldFormat formats cells by column
- **WHEN** `table` renders `data: [{ total: 11471334.78 }]` with `hints: { fieldFormat: { total: "${value}" } }`
- **THEN** the rendered cell SHALL contain `$11471334.78`
- **AND** the extracted payload SHALL still carry the typed number

#### Scenario: Link cells render anchors for safe schemes only
- **WHEN** `table` renders `data: [{ site: "https://example.com" }, { site: "javascript:alert(1)" }]` with `hints: { links: { site: true } }`
- **THEN** the first row's cell SHALL contain an anchor with that `href`
- **AND** the second row's cell SHALL contain the value as plain text with no anchor

### Requirement: Tree data handling
The `tree` renderer SHALL render nested `{ label, children[] }` nodes, using a JSON-snippet fallback label for nodes without a usable `label`, recursing only into array-valued `children`. `meta.title` SHALL render as a title line above the tree; without it no title appears. `hints.expandDepth` (default unlimited) SHALL mark nodes at depth less than the value as expanded via a `data-expanded` attribute. The attribute SHALL be present only on nodes with at least one child, so its presence alone identifies an expandable branch; leaves carry no expansion attribute. Collapsing is presentational: the full subtree remains in the output and hosts (or the widgentic base stylesheet) hide collapsed children via the attribute.

#### Scenario: Nested nodes render recursively
- **WHEN** `tree` renders `{ label: "root", children: [{ label: "leaf", children: [] }] }`
- **THEN** the output SHALL contain `"root"` with a nested node containing `"leaf"`

#### Scenario: expandDepth limits expanded state
- **WHEN** the same data renders with `hints: { expandDepth: 1 }`
- **THEN** the root node SHALL be marked expanded and the `"leaf"` node SHALL NOT be

#### Scenario: Leaves carry no expansion attribute
- **WHEN** `tree` renders a three-level hierarchy with `hints: { expandDepth: 1 }`
- **THEN** only the nodes with children SHALL have a `data-expanded` attribute
- **AND** the collapsed branch's children SHALL still be present in the output

#### Scenario: Meta supplies the tree title
- **WHEN** `tree` renders any hierarchy with `meta: { title: "Regions" }`
- **THEN** the output SHALL contain a title line `"Regions"` above the root nodes

### Requirement: Hint-coherence analysis
The catalog SHALL export a pure `analyzeHints(kind, data, hints, descriptor)` that inspects a render request without rendering it and returns an array of never-fatal diagnostics `{ hint, code, message, suggestion? }` with codes `UNKNOWN_HINT`, `NO_MATCH`, `INVALID_VALUE`, `UNSAFE_IMAGE_SOURCE`, and `UNSAFE_LINK_TARGET`. It SHALL report: top-level hint keys not advertised in the descriptor's `hints` (adding a `suggestion` when an advertised key is within Levenshtein distance 2); `columns`, `fieldFormat`, `images`, and `links` entries whose key matches no column or field in the supplied `data` (`fieldFormat` validated against columns when `kind` is `"table"`, fields otherwise); `images` values outside `"avatar" | "thumb" | "hero" | true | false`; `links` values that are not booleans; values targeted by an image hint that fail `isSafeImageSrc`; values targeted by a `true` link hint that are not strings passing the URL scheme guard; non-number `expandDepth`; and for `kind: "group"`, `layout`/`gap` values outside their preset vocabularies, non-number or out-of-range `columns`, and `columns` supplied without `layout: "grid"`. Analysis SHALL never throw, never mutate inputs, and never affect rendering; renderers SHALL remain unaware of it. An empty or absent `hints` SHALL produce no diagnostics.

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
- **WHEN** `links: { site: "yes" }` targets an existing column, `links: { missing: true }` matches nothing, and `links: { bad: true }` targets a `javascript:` value
- **THEN** they SHALL yield `INVALID_VALUE`, `NO_MATCH`, and `UNSAFE_LINK_TARGET` respectively

#### Scenario: Group hint vocabularies are enforced
- **WHEN** `analyzeHints("group", { items: [] }, { layout: "mosaic", gap: "huge", columns: 2 }, groupDescriptor)` is called
- **THEN** `layout` and `gap` SHALL yield `INVALID_VALUE` diagnostics
- **AND** `columns` SHALL yield `NO_MATCH` because the layout is not `"grid"`
