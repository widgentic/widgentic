# widget-catalog Specification

## Purpose
Provides the built-in widgets (`card`, `table`, `tree`, `custom`) and the registration API hosts use to add kinds without modifying the core. Renderers are pure functions producing a plain-data render tree; separate output layers serialize it to escaped HTML or mount it into the DOM. Rendering validates payloads against the contract using the catalog's registered kinds.
## Requirements
### Requirement: Built-in widget kinds
The system SHALL provide built-in widgets: `card`, `table`, `tree`, and `custom`. Each built-in widget MUST document the shape of `data` and supported `hints`.

#### Scenario: Card renders an object
- **WHEN** a `card` payload is rendered with `data: { title, subtitle, fields }`
- **THEN** the output SHALL display title, subtitle, and field key/value pairs

#### Scenario: Table renders an array of records
- **WHEN** a `table` payload is rendered with `data: [{ ... }, { ... }]`
- **THEN** the output SHALL display one row per record and one column per detected field

#### Scenario: Tree renders nested nodes
- **WHEN** a `tree` payload is rendered with nested `{ label, children[] }` nodes
- **THEN** the output SHALL display a collapsible tree honoring `hints.expandDepth`

### Requirement: Custom widget extension point
The catalog SHALL expose a registration API so hosts can add new widget kinds without modifying the core. `register(kind, renderer, descriptor?)` SHALL accept an optional `WidgetDescriptor` (with the `kind` field filled from the registration when omitted from the descriptor).

#### Scenario: Register and render a custom kind
- **WHEN** a host registers `kind: "timeline"` with a renderer function
- **AND** an agent emits a payload with `kind: "timeline"`
- **THEN** the registered renderer SHALL be invoked with the payload

#### Scenario: Duplicate registration is rejected
- **WHEN** a host registers a `kind` that already exists
- **THEN** the catalog SHALL raise a clear duplicate-registration error

#### Scenario: Registration stores the descriptor
- **WHEN** `register("timeline", renderer, { description: "Chronological events", dataShape: "array of { when, what }" })` is called
- **THEN** `describe("timeline")` SHALL return that descriptor with `kind: "timeline"`

### Requirement: Catalog programmatic surface
The package SHALL export `createCatalog(): WidgetCatalog` from a `./catalog` entry. A catalog instance SHALL expose `register(kind, renderer)`, `has(kind)`, `resolve(kind)`, `kinds()`, and `render(payload)`. The four built-ins (`card`, `table`, `tree`, `custom`) SHALL be pre-registered on every new instance.

#### Scenario: New catalog has the built-ins
- **WHEN** `createCatalog().kinds()` is called
- **THEN** the result SHALL contain `"card"`, `"table"`, `"tree"`, and `"custom"`

#### Scenario: Instances are independent
- **WHEN** a kind is registered on one catalog instance
- **THEN** a separately created instance SHALL NOT have that kind

#### Scenario: kinds returns a fresh array
- **WHEN** the array returned by `kinds()` is mutated by the caller
- **THEN** the catalog's registry SHALL be unaffected

### Requirement: Renderers produce a pure render tree
A renderer SHALL be a pure function `(payload: WidgetPayload) => WidgetNode`, where `WidgetNode` is either a string or a plain object `{ tag, attrs?, children? }` containing no DOM or framework types. Built-in renderers SHALL NOT throw for any `data` value.

#### Scenario: Render tree is plain data
- **WHEN** any built-in renderer runs on a valid payload
- **THEN** the result SHALL be JSON-serializable (strings and `{ tag, attrs?, children? }` objects only)

#### Scenario: Built-ins are total
- **WHEN** a built-in renderer receives `data` of an unexpected shape (e.g., `null` for `table`)
- **THEN** it SHALL return a fallback render tree rather than throw

### Requirement: Catalog render entry point
`render(payload)` SHALL validate the payload with the contract validator using the catalog's current kinds as `knownKinds`, and SHALL return `{ ok: true, node }` on success or `{ ok: false, error: WidgetContractError }` on failure without throwing.

#### Scenario: Valid payload renders
- **WHEN** `catalog.render({ kind: "card", data: { title: "T" } })` is called
- **THEN** the result SHALL be `{ ok: true, node: <WidgetNode> }`

#### Scenario: Unknown kind is a structured error
- **WHEN** `catalog.render({ kind: "nope", data: 1 })` is called
- **THEN** the result SHALL be `{ ok: false, error }` with `error.code: "UNKNOWN_KIND"`

#### Scenario: Invalid payload is a structured error
- **WHEN** `catalog.render({ data: 1 })` is called without `kind`
- **THEN** the result SHALL be `{ ok: false, error }` with `error.code: "MISSING_FIELD"`

### Requirement: Duplicate registration error shape
`register(kind, renderer)` SHALL throw a `DuplicateKindError` (an `Error` subclass with `code: "DUPLICATE_KIND"` and the offending kind in its message) when the kind is already registered, including the built-in kinds.

#### Scenario: Re-registering a custom kind throws
- **WHEN** `register("timeline", r)` is called twice on the same instance
- **THEN** the second call SHALL throw `DuplicateKindError` naming `"timeline"`

#### Scenario: Built-ins cannot be overridden
- **WHEN** `register("card", r)` is called
- **THEN** the call SHALL throw `DuplicateKindError`

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

### Requirement: Table data handling
The `table` renderer SHALL detect columns as the union of record keys in first-seen order, render one row per record with empty cells for missing keys, and honor `hints.columns: string[]` as an override of column selection and order. Non-array `data` SHALL be treated as a single-record array.

#### Scenario: Column union preserves first-seen order
- **WHEN** `table` renders `data: [{ a: 1, b: 2 }, { a: 3, c: 4 }]`
- **THEN** the columns SHALL be `a`, `b`, `c` in that order
- **AND** the second row's `b` cell SHALL be empty

#### Scenario: hints.columns overrides detection
- **WHEN** `table` renders the same data with `hints: { columns: ["c", "a"] }`
- **THEN** the columns SHALL be exactly `c`, `a` in that order

### Requirement: Tree data handling
The `tree` renderer SHALL render nested `{ label, children[] }` nodes, using a JSON-snippet fallback label for nodes without a usable `label`, recursing only into array-valued `children`. `hints.expandDepth` (default unlimited) SHALL mark nodes at depth less than the value as expanded via a `data-expanded` attribute. The attribute SHALL be present only on nodes with at least one child, so its presence alone identifies an expandable branch; leaves carry no expansion attribute. Collapsing is presentational: the full subtree remains in the output and hosts (or the widgentic base stylesheet) hide collapsed children via the attribute.

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

### Requirement: Custom escape hatch rendering
The built-in `custom` renderer SHALL render `data` as pretty-printed JSON inside a preformatted block, falling back to `String(data)` when serialization fails.

#### Scenario: Custom renders JSON
- **WHEN** `custom` renders `data: { any: ["shape"] }`
- **THEN** the output SHALL contain the pretty-printed JSON of `data`

### Requirement: HTML output layer
The package SHALL export `renderToHtml(node: WidgetNode): string` producing HTML in which all text and attribute values from the render tree are escaped (`&`, `<`, `>`, `"`, `'`). The render tree SHALL provide no mechanism to emit raw HTML.

#### Scenario: Text content is escaped
- **WHEN** a payload whose data contains `<script>alert(1)</script>` is rendered to HTML
- **THEN** the output SHALL contain `&lt;script&gt;` and SHALL NOT contain `<script>`

#### Scenario: Attribute values are escaped
- **WHEN** a render-tree attribute value contains `"` or `<`
- **THEN** the serialized attribute SHALL contain their escaped forms

### Requirement: DOM output layer
The package SHALL export `mountNode(node: WidgetNode, container: Element): void` that materializes the tree using `container.ownerDocument`, sets text via `textContent`, and replaces the container's previous children (idempotent re-mount).

#### Scenario: Mount builds real DOM
- **WHEN** a card render tree is mounted into an empty container
- **THEN** the container SHALL contain the corresponding elements with the expected text content

#### Scenario: Re-mount replaces content
- **WHEN** `mountNode` is called twice on the same container with different trees
- **THEN** the container SHALL contain only the second tree's elements

### Requirement: Stable class names
Built-in renderers SHALL emit stable `wg-` prefixed class names (e.g., `wg-card`, `wg-card-title`, `wg-table`, `wg-tree-node`) so hosts can style output without relying on markup structure.

#### Scenario: Card exposes wg- classes
- **WHEN** `card` output is serialized to HTML
- **THEN** it SHALL contain `class="wg-card"` and `class="wg-card-title"` elements

### Requirement: Widget metadata and listing
The catalog SHALL store a `WidgetDescriptor` per kind — `{ kind, description, dataShape, dataExample?, hints? }` where `dataShape` is a human-readable description of the expected `data` input and `hints` documents supported hint keys. `describe(kind)` SHALL return the descriptor (or `undefined` for unknown kinds); `list()` SHALL return a fresh array of all descriptors. Built-in widgets SHALL ship descriptors including a `dataExample`; a registration without a descriptor SHALL receive a generated minimal descriptor so every renderable kind is listed.

#### Scenario: Built-ins are documented
- **WHEN** `createCatalog().list()` is called
- **THEN** it SHALL contain descriptors for `card`, `table`, `tree`, and `custom`
- **AND** each SHALL have a non-empty `description`, `dataShape`, and `dataExample`

#### Scenario: Built-in examples are honest
- **WHEN** each built-in descriptor's `dataExample` is rendered as that kind's payload data
- **THEN** `catalog.render` SHALL return `{ ok: true }` for every one

#### Scenario: Undocumented registration gets a minimal descriptor
- **WHEN** `register("timeline", renderer)` is called without a descriptor
- **THEN** `describe("timeline")` SHALL return a descriptor with `kind: "timeline"` and a non-empty generated `description`

#### Scenario: list returns a fresh array
- **WHEN** the array returned by `list()` is mutated by the caller
- **THEN** the catalog's stored descriptors SHALL be unaffected

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

### Requirement: Image rendering in card and table
The `card` and `table` renderers SHALL render a string value as an image element when it is a safe image source and either auto-detection or a hint selects image treatment. A value auto-detects as an image when `isSafeImageSrc` passes and the value is a `data:image/*` URI or an `http(s)` URL whose pathname ends in `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.avif`, or `.svg` (query strings tolerated). `hints.images: Record<string, "avatar" | "thumb" | "hero" | true | false>` SHALL override per card-field / table-column key: a shape string forces image treatment with that shape, `true` forces the context default shape, and `false` suppresses detection so the value renders as text. Hints SHALL NOT bypass safety: a value failing `isSafeImageSrc` renders as text regardless of hints. The default shape SHALL be `avatar` in table cells and `thumb` in card fields. The emitted element SHALL be `img` with classes `wg-img wg-img-<shape>`, the value as `src`, the field/column key as `alt`, and `loading="lazy"` / `decoding="async"`; image treatment takes precedence over `hints.fieldFormat` for the same key.

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

### Requirement: Hint-coherence analysis
The catalog SHALL export a pure `analyzeHints(kind, data, hints, descriptor)` that inspects a render request without rendering it and returns an array of never-fatal diagnostics `{ hint, code, message, suggestion? }` with codes `UNKNOWN_HINT`, `NO_MATCH`, `INVALID_VALUE`, and `UNSAFE_IMAGE_SOURCE`. It SHALL report: top-level hint keys not advertised in the descriptor's `hints` (adding a `suggestion` when an advertised key is within Levenshtein distance 2); `columns`, `fieldFormat`, and `images` entries whose key matches no column or field in the supplied `data`; `images` values outside `"avatar" | "thumb" | "hero" | true | false`; values targeted by an image hint that fail `isSafeImageSrc`; and non-number `expandDepth`. Analysis SHALL never throw, never mutate inputs, and never affect rendering; renderers SHALL remain unaware of it. An empty or absent `hints` SHALL produce no diagnostics.

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

