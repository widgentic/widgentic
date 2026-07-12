## ADDED Requirements

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
The `card` renderer SHALL use `data.title`, `data.subtitle`, and `data.fields` when present; for other plain objects it SHALL render each entry as a field key/value pair; for primitives and `null` it SHALL render the stringified value. When `data` provides no title/subtitle, `meta.title`/`meta.subtitle` SHALL be used instead.

#### Scenario: Arbitrary object renders as fields
- **WHEN** `card` renders `data: { name: "Ada", role: "eng" }`
- **THEN** the output SHALL contain field pairs `name`/`Ada` and `role`/`eng`

#### Scenario: Meta supplies missing chrome
- **WHEN** `card` renders `data: { a: 1 }` with `meta: { title: "T" }`
- **THEN** the output SHALL contain the title `"T"`

#### Scenario: Primitive data renders as a value
- **WHEN** `card` renders `data: 42`
- **THEN** the output SHALL contain the text `"42"`

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
The `tree` renderer SHALL render nested `{ label, children[] }` nodes, using a JSON-snippet fallback label for nodes without a usable `label`, recursing only into array-valued `children`. `hints.expandDepth` (default unlimited) SHALL mark nodes at depth less than the value as expanded via a `data-expanded` attribute.

#### Scenario: Nested nodes render recursively
- **WHEN** `tree` renders `{ label: "root", children: [{ label: "leaf", children: [] }] }`
- **THEN** the output SHALL contain `"root"` with a nested node containing `"leaf"`

#### Scenario: expandDepth limits expanded state
- **WHEN** the same data renders with `hints: { expandDepth: 1 }`
- **THEN** the root node SHALL be marked expanded and the `"leaf"` node SHALL NOT be

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
