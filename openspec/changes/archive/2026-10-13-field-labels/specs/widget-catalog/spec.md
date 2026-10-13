## ADDED Requirements

### Requirement: Field and column labels
The `card` and `table` renderers SHALL honor `hints.labels: Record<string, string>`, which maps a card field's key or a table column's key to the label the reader sees. A card field SHALL show its label as the `wg-card-field-key` text, and a table column its label as the `wg-table-header` text, for the columns `hints.columns` selects as for detected ones. A key without a label, or whose label is not a non-empty string, SHALL show the key, so a render without `labels` is byte-identical to one made before labels existed. A label SHALL be plain text, escaped like any value, and SHALL change nothing else: the data, the payload's keys, `fieldFormat`, `images`, `links` and column order still address fields and columns by key. The `card` and `table` descriptors SHALL document `labels` among their hints, and that documentation SHALL include the label-style rule the core package exports. The rule tells agents to write labels in Title Case ("First Name") unless the user asks for another style or language, and to leave the data's keys as they are. The catalog SHALL export the rule so every surface that steers agents derives it.

#### Scenario: A card shows its labels
- **WHEN** `card` renders `data: { fields: { first_name: "Ada", order_total: 42 } }` with `hints: { labels: { first_name: "First Name", order_total: "Order Total" } }`
- **THEN** the field keys SHALL read `First Name` and `Order Total`, and the values `Ada` and `42`
- **AND** the extracted payload SHALL still carry `first_name` and `order_total` as keys

#### Scenario: A table shows its labels in the selected columns
- **WHEN** `table` renders `data: [{ first_name: "Ada", last_name: "Lovelace", id: 1 }]` with `hints: { columns: ["last_name", "first_name"], labels: { first_name: "First Name", last_name: "Last Name" } }`
- **THEN** the headers SHALL read `Last Name` then `First Name`, and the cells SHALL follow the same column order

#### Scenario: An unlabelled key shows the key
- **WHEN** `card` renders `data: { a: 1, b: 2 }` with `hints: { labels: { a: "Alpha", b: "" } }`
- **THEN** the field keys SHALL read `Alpha` and `b`
- **AND** a render of the same data without `labels` SHALL be byte-identical to today's output

#### Scenario: A label cannot inject markup
- **WHEN** a label is `<b>Total</b>`
- **THEN** the serialized output SHALL contain the escaped text, not an element

#### Scenario: Labels leave the other hints keyed by data
- **WHEN** `card` renders `data: { fields: { unit_price: 9.99 } }` with `hints: { labels: { unit_price: "Unit Price" }, fieldFormat: { unit_price: "${value}" } }`
- **THEN** the field SHALL read `Unit Price` with the value `$9.99`

#### Scenario: The descriptors carry the steering rule
- **WHEN** the built-in `card` and `table` descriptors are read
- **THEN** each SHALL document a `labels` hint whose text contains the exported label-style rule

## MODIFIED Requirements

### Requirement: Image rendering in card and table
The `card` and `table` renderers SHALL render a string value as an image element when it is a safe image source and either auto-detection or a hint selects image treatment. A value auto-detects as an image when `isSafeImageSrc` passes and the value is a `data:image/*` URI or an `http(s)` URL whose pathname ends in `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.avif`, or `.svg` (query strings tolerated). `hints.images: Record<string, "avatar" | "thumb" | "hero" | true | false>` SHALL override per card-field / table-column key: a shape string forces image treatment with that shape, `true` forces the context default shape, and `false` suppresses detection so the value renders as text. Hints SHALL NOT bypass safety: a value failing `isSafeImageSrc` renders as text regardless of hints. The default shape SHALL be `avatar` in table cells and `thumb` in card fields. The emitted element SHALL be `img` with classes `wg-img wg-img-<shape>`, the value as `src`, the field's or column's label as `alt` when `hints.labels` gives one and its key otherwise, and `loading="lazy"` / `decoding="async"`; image treatment takes precedence over `hints.fieldFormat` for the same key.

#### Scenario: Avatar URL auto-detects in a table cell
- **WHEN** `table` renders `data: [{ user: "Ada", avatar: "https://cdn.example/a/ada.png" }]`
- **THEN** the `avatar` cell SHALL contain an `img` element with class `wg-img wg-img-avatar`, `src` equal to the URL, and `alt` `"avatar"`
- **AND** the `user` cell SHALL render text as before

#### Scenario: Card field renders a thumbnail by default
- **WHEN** `card` renders `data: { fields: { photo: "https://cdn.example/p.jpg" } }`
- **THEN** the `photo` field value SHALL contain an `img` element with class `wg-img wg-img-thumb`

#### Scenario: Hint forces a shape for an extensionless URL
- **WHEN** `card` renders `data: { fields: { cover: "https://images.example/id/12345" } }` with `hints: { images: { cover: "hero" } }`
- **THEN** the `cover` field SHALL contain an `img` element with class `wg-img wg-img-hero` even though the URL has no image extension

#### Scenario: Hint false suppresses detection
- **WHEN** `table` renders a column of `.png` URLs with `hints: { images: { screenshot: false } }`
- **THEN** the `screenshot` cells SHALL contain the URL as text and no `img` element

#### Scenario: Unsafe source never renders as an image
- **WHEN** a field value is `javascript:alert(1)` and `hints: { images: { x: "avatar" } }` targets it
- **THEN** the output SHALL contain no `img` element for that field and the value renders as escaped text

#### Scenario: data URI image renders
- **WHEN** a field value is `data:image/png;base64,iVBORw0KGgo=` (any valid `data:image/*` payload)
- **THEN** the field SHALL contain an `img` element with that value as `src`

#### Scenario: A labelled image takes its label as alt text
- **WHEN** `table` renders `data: [{ avatar_url: "https://cdn.example/a/ada.png" }]` with `hints: { labels: { avatar_url: "Avatar" } }`
- **THEN** the cell's `img` SHALL carry `alt` `"Avatar"`

### Requirement: Hint-coherence analysis
The catalog SHALL export a pure `analyzeHints(kind, data, hints, descriptor)` that inspects a render request without rendering it and returns an array of never-fatal diagnostics `{ hint, code, message, suggestion? }` with codes `UNKNOWN_HINT`, `NO_MATCH`, `INVALID_VALUE`, `UNSAFE_IMAGE_SOURCE`, and `UNSAFE_LINK_TARGET`. It SHALL report: top-level hint keys not advertised in the descriptor's `hints` (adding a `suggestion` when an advertised key is within Levenshtein distance 2); `columns`, `fieldFormat`, `images`, `links`, and `labels` entries whose key matches no column or field in the supplied `data` (`fieldFormat` and `labels` validated against columns when `kind` is `"table"`, fields otherwise); `labels` values that are not non-empty strings; `images` values outside `"avatar" | "thumb" | "hero" | true | false`; `links` values that are neither booleans nor strings; values targeted by an image hint that fail `isSafeImageSrc`; values targeted by a `true` link hint that are not strings passing the URL scheme guard, and prefix link hints whose target is not a non-empty string or whose composed href fails the guard; non-number `expandDepth`; and for `kind: "group"`, `layout`/`gap` values outside their preset vocabularies, non-number or out-of-range `columns`, and `columns` supplied without `layout: "grid"`. Analysis SHALL never throw, never mutate inputs, and never affect rendering; renderers SHALL remain unaware of it. An empty or absent `hints` SHALL produce no diagnostics.

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
