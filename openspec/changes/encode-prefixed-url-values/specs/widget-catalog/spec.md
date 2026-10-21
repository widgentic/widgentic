## MODIFIED Requirements

### Requirement: Card data handling
The `card` renderer SHALL use `data.title`, `data.subtitle`, and `data.fields` when present; for other plain objects it SHALL render each entry as a field key/value pair; for primitives and `null` it SHALL render the stringified value. When `data` provides no title/subtitle, `meta.title`/`meta.subtitle` SHALL be used instead. `hints.fieldFormat: Record<string, string>` SHALL format matching field values by substituting `{value}` in the pattern (a pattern without the placeholder appends the value); unmatched keys and non-string patterns are ignored, and formatted output is escaped like any text. `hints.links: Record<string, boolean | string>` SHALL render linked fields: `true` links a string value that is itself an explicitly-schemed safe URL (http, https, mailto, tel); a string value acts as an author-supplied prefix composed with the raw value to build the `href` (e.g. `{ email: "mailto:" }`), the value encoded by the URL-value rule a template's `prefix` uses (`template-widgets`, "Template node forms and interpretation"), emitted only when the value is a non-empty string and the COMPOSED href passes the same guard. In both forms the anchor's text is the formatted value (`fieldFormat` still applies) — the display never shows the composed scheme. Values failing the guard, non-string values, and un-hinted values render as plain text, and image treatment wins over a link hint for the same key.

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

#### Scenario: A link prefix encodes the value it composes
- **WHEN** `card` renders `data: { fields: { place: "Main St & 5th #2" } }` with `hints: { links: { place: "https://maps.example.com/?q=" } }`
- **THEN** the field SHALL link `https://maps.example.com/?q=Main%20St%20%26%205th%20%232`, and its text SHALL be `Main St & 5th #2`

### Requirement: Table data handling
The `table` renderer SHALL detect columns as the union of record keys in first-seen order, render one row per record with empty cells for missing keys, and honor `hints.columns: string[]` as an override of column selection and order. Non-array `data` SHALL be treated as a single-record array. `meta.title`/`meta.subtitle` SHALL render as the table's caption chrome; without them no caption appears. `hints.fieldFormat: Record<string, string>` SHALL format matching cell values by column with the card's exact pattern semantics (substitute `{value}`, append when absent, escape like any text, ignore unmatched keys and non-string patterns); image treatment wins over `fieldFormat` for the same column. `hints.links: Record<string, boolean | string>` SHALL render linked cells: `true` links string cells that are themselves explicitly-schemed safe URLs (http, https, mailto, tel); a string value acts as an author-supplied prefix composed with the raw cell value to build the `href` (e.g. `{ email: "mailto:", phone: "tel:" }`), the value encoded by the URL-value rule a template's `prefix` uses, emitted only when the cell is a non-empty string and the COMPOSED href passes the same guard. In both forms the anchor's text is the formatted value — the display never shows the composed scheme. Values failing the guard, non-string values, and un-hinted values render as plain text, and image treatment wins over a link hint for the same column.

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

#### Scenario: A prefix link keeps the display clean
- **WHEN** `table` renders `data: [{ email: "a@b.c", phone: "+15551234" }]` with `hints: { links: { email: "mailto:", phone: "tel:" } }`
- **THEN** the cells SHALL contain anchors `href="mailto:a@b.c"` and `href="tel:+15551234"`
- **AND** the anchor text SHALL be `a@b.c` and `+15551234` — never the composed scheme

#### Scenario: Prefix links never emit bare or unsafe hrefs
- **WHEN** a prefix link targets an empty string, a non-string, or composes to a disallowed scheme
- **THEN** the cell SHALL render as plain text with no anchor

#### Scenario: Link cells render anchors for safe schemes only
- **WHEN** `table` renders `data: [{ site: "https://example.com" }, { site: "javascript:alert(1)" }]` with `hints: { links: { site: true } }`
- **THEN** the first row's cell SHALL contain an anchor with that `href`
- **AND** the second row's cell SHALL contain the value as plain text with no anchor

#### Scenario: A link prefix encodes each cell it composes
- **WHEN** `table` renders `data: [{ q: "a&b" }, { q: "c d" }]` with `hints: { links: { q: "https://search.example.com/?q=" } }`
- **THEN** the cells SHALL link `https://search.example.com/?q=a%26b` and `https://search.example.com/?q=c%20d`
