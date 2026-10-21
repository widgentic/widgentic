# widget-catalog Specification

## Purpose
Provides the built-in widgets (`card`, `table`, `tree`, `group`) and the registration API hosts use to add kinds without modifying the core. Renderers are pure functions producing a plain-data render tree; separate output layers serialize it to escaped HTML or mount it into the DOM. Rendering validates payloads against the contract using the catalog's registered kinds.

## Requirements

### Requirement: Built-in widget kinds
The system SHALL provide built-in widgets: `card`, `table`, `tree`, and `group`. Each built-in widget MUST document the shape of `data` and supported `hints`.

#### Scenario: Card renders an object
- **WHEN** a `card` payload is rendered with `data: { title, subtitle, fields }`
- **THEN** the output SHALL display title, subtitle, and field key/value pairs

#### Scenario: Table renders an array of records
- **WHEN** a `table` payload is rendered with `data: [{ ... }, { ... }]`
- **THEN** the output SHALL display one row per record and one column per detected field

#### Scenario: Tree renders nested nodes
- **WHEN** a `tree` payload is rendered with nested `{ label, children[] }` nodes
- **THEN** the output SHALL display a collapsible tree honoring `hints.expandDepth`

#### Scenario: Group renders several widgets in one call
- **WHEN** a `group` payload is rendered with `data.items` holding sub-widgets of mixed kinds
- **THEN** the output SHALL contain each item's rendering inside one layout container

### Requirement: Group composition rendering
The `group` kind SHALL render `data.items` — an array of sub-widgets, each `{ kind, data, hints?, meta? }` — through the same catalog render entry as top-level calls, so built-ins, registered kinds, and composed custom widgets all participate. Group-level `hints` SHALL select the layout from author-controlled presets: `layout` (`stack` default, `row`, `grid`), `gap` (`none`, `sm`, `md` default, `lg`), and `columns` (grid only, bounded). Hint values SHALL only ever select from fixed class names — item data never contributes class characters. Each item's failure SHALL surface as a structured error whose path is prefixed `data.items[<index>]`; a group inside a group SHALL be refused; item counts above the documented cap SHALL be refused with a structured error naming the cap.

#### Scenario: Mixed kinds compose
- **WHEN** a `group` renders items of kinds `card` and `table`
- **THEN** the output SHALL contain both `wg-card` and `wg-table` markup inside the group container

#### Scenario: Layout hints select presets
- **WHEN** a `group` renders with `hints: { layout: "grid", columns: 2, gap: "lg" }`
- **THEN** the group container's classes SHALL reflect the grid preset, the column count, and the gap
- **AND** an unknown `layout` value SHALL fall back to `stack` and surface a hint diagnostic

#### Scenario: Item errors carry indexed paths
- **WHEN** the third item's data violates its kind's `dataSchema`
- **THEN** the render SHALL fail with the underlying error code and a path beginning `data.items[2].`

#### Scenario: Nested groups are refused
- **WHEN** any item has `kind: "group"`
- **THEN** the render SHALL fail with a structured error at `data.items[<index>].kind`

#### Scenario: Item cap is enforced
- **WHEN** `data.items` exceeds the documented maximum
- **THEN** the render SHALL fail with a structured error naming the cap

#### Scenario: Custom template widgets render inside groups
- **WHEN** a composed catalog carries a stored template widget and a `group` item uses that kind
- **THEN** the item SHALL render exactly as it would at top level, budget rules included

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
The package SHALL export `createCatalog(): WidgetCatalog` from a `./catalog` entry. A catalog instance SHALL expose `register(kind, renderer)`, `has(kind)`, `resolve(kind)`, `kinds()`, and `render(payload)`. The built-ins (`card`, `table`, `tree`, `group`) SHALL be pre-registered on every new instance.

#### Scenario: New catalog has the built-ins
- **WHEN** `createCatalog().kinds()` is called
- **THEN** the result SHALL contain `"card"`, `"table"`, `"tree"`, and `"group"`, and SHALL NOT contain `"custom"`

#### Scenario: Instances are independent
- **WHEN** a kind is registered on one catalog instance
- **THEN** a separately created instance SHALL NOT have that kind

#### Scenario: kinds returns a fresh array
- **WHEN** the array returned by `kinds()` is mutated by the caller
- **THEN** the catalog's registry SHALL be unaffected

### Requirement: Renderers produce a pure render tree
A renderer SHALL be a pure function `(payload: WidgetPayload) => WidgetNode`, where `WidgetNode` is either a string or a plain object `{ tag, attrs?, children?, key? }` containing no DOM or framework types. `key`, when present, SHALL be a string that identifies the element among its siblings for in-place patching; it is render-tree data only. Built-in renderers SHALL NOT throw for any `data` value.

#### Scenario: Render tree is plain data
- **WHEN** any built-in renderer runs on a valid payload
- **THEN** the result SHALL be JSON-serializable (strings and `{ tag, attrs?, children?, key? }` objects only)

#### Scenario: Built-ins are total
- **WHEN** a built-in renderer receives `data` of an unexpected shape (e.g., `null` for `table`)
- **THEN** it SHALL return a fallback render tree rather than throw

### Requirement: Catalog render entry point
`render(payload)` SHALL validate the payload with the contract validator using the catalog's current kinds as `knownKinds`, and SHALL return `{ ok: true, node }` on success or `{ ok: false, error: WidgetContractError }` on failure without throwing. A registered renderer that throws SHALL be caught and surfaced as `{ ok: false, error }` with `error.code: "RENDER_FAILED"`, `error.path: "widget"`, and a message naming the kind — never a propagated exception (built-ins are total by construction; this guards the extension point).

#### Scenario: Valid payload renders
- **WHEN** `catalog.render({ kind: "card", data: { title: "T" } })` is called
- **THEN** the result SHALL be `{ ok: true, node: <WidgetNode> }`

#### Scenario: Unknown kind is a structured error
- **WHEN** `catalog.render({ kind: "nope", data: 1 })` is called
- **THEN** the result SHALL be `{ ok: false, error }` with `error.code: "UNKNOWN_KIND"`

#### Scenario: Invalid payload is a structured error
- **WHEN** `catalog.render({ data: 1 })` is called without `kind`
- **THEN** the result SHALL be `{ ok: false, error }` with `error.code: "MISSING_FIELD"`

#### Scenario: A throwing custom renderer is a structured error
- **WHEN** a registered renderer for kind `boom` throws and `catalog.render({ kind: "boom", data: 1 })` is called
- **THEN** the result SHALL be `{ ok: false, error }` with `error.code: "RENDER_FAILED"` and `boom` named in the message
- **AND** the call SHALL NOT throw

### Requirement: Partial-data renders
`render(payload, options?)` SHALL accept `options.partialData: boolean` (default `false`). When `true`, the catalog SHALL skip the descriptor data-schema check for the payload's kind and for every item of a `group`, while still validating the payload contract (kind known, required fields present, value types) and still bounding template interpretation; everything else about the render SHALL be unchanged. It exists for previews of input that is still arriving, where a required field may simply not have streamed yet. Without the option, renders SHALL behave exactly as before.

#### Scenario: A partial payload previews instead of failing
- **WHEN** a kind whose data schema requires `name` and `email` is rendered with `data: { name: "Ada" }` and `partialData: true`
- **THEN** the result SHALL be `{ ok: true, node }` showing `Ada`
- **AND** the same call without the option SHALL fail with the data-schema error it returns today

#### Scenario: Group items inherit the option
- **WHEN** a `group` whose item is that kind with incomplete data renders with `partialData: true`
- **THEN** the group SHALL render, including that item

#### Scenario: The contract still applies
- **WHEN** `render({ data: 1 }, { partialData: true })` is called without `kind`
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
The `card` renderer SHALL use `data.title`, `data.subtitle`, and `data.fields` when present; for other plain objects it SHALL render each entry as a field key/value pair; for primitives and `null` it SHALL render the stringified value. When `data` provides no title/subtitle, `meta.title`/`meta.subtitle` SHALL be used instead. `hints.fieldFormat: Record<string, string>` SHALL format matching field values by substituting `{value}` in the pattern (a pattern without the placeholder appends the value); unmatched keys and non-string patterns are ignored, and formatted output is escaped like any text. `hints.links: Record<string, boolean | string>` SHALL render linked fields: `true` links a string value that is itself an explicitly-schemed safe URL (http, https, mailto, tel); a string value acts as an author-supplied prefix composed with the raw value to build the `href` (e.g. `{ email: "mailto:" }`), the value composed by the URL-value rule a template's `prefix` uses (`template-widgets`, "Template node forms and interpretation"), emitted only when the value is a non-empty string and the COMPOSED href passes the same guard. In both forms the anchor's text is the formatted value (`fieldFormat` still applies) — the display never shows the composed scheme. Values failing the guard, non-string values, and un-hinted values render as plain text, and image treatment wins over a link hint for the same key.

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
The `table` renderer SHALL detect columns as the union of record keys in first-seen order, render one row per record with empty cells for missing keys, and honor `hints.columns: string[]` as an override of column selection and order. Non-array `data` SHALL be treated as a single-record array. `meta.title`/`meta.subtitle` SHALL render as the table's caption chrome; without them no caption appears. `hints.fieldFormat: Record<string, string>` SHALL format matching cell values by column with the card's exact pattern semantics (substitute `{value}`, append when absent, escape like any text, ignore unmatched keys and non-string patterns); image treatment wins over `fieldFormat` for the same column. `hints.links: Record<string, boolean | string>` SHALL render linked cells: `true` links string cells that are themselves explicitly-schemed safe URLs (http, https, mailto, tel); a string value acts as an author-supplied prefix composed with the raw cell value to build the `href` (e.g. `{ email: "mailto:", phone: "tel:" }`), the value composed by the URL-value rule a template's `prefix` uses, emitted only when the cell is a non-empty string and the COMPOSED href passes the same guard. In both forms the anchor's text is the formatted value — the display never shows the composed scheme. Values failing the guard, non-string values, and un-hinted values render as plain text, and image treatment wins over a link hint for the same column.

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

### Requirement: Tree data handling
The `tree` renderer SHALL render nested `{ label, icon?, children[] }` nodes, using a JSON-snippet fallback label for nodes without a usable `label` (the fallback excludes `children` and `icon`), recursing only into array-valued `children`. `meta.title` SHALL render as a title line above the tree; without it no title appears.

A node with at least one child SHALL render as a NATIVE disclosure — a `details` element whose `summary` carries the node's label — so a person can expand and collapse branches in every context the HTML reaches (the Apps iframe, a `page` document, a plain fragment) with no script, and the toggle is keyboard-operable by the platform. Leaves SHALL render as plain labels with no disclosure element, so the presence of the disclosure alone identifies an expandable branch. `hints.expandDepth` (default unlimited) SHALL select the INITIAL state: nodes at depth less than the value carry the `open` attribute, deeper branches do not; a negative value SHALL behave as `0` (everything collapsed), keeping `depth < value` monotone. Nodes deeper than the documented bound (64) SHALL render as leaves, so a hostile nesting cannot overflow the recursive renderer or the serializers — the renderer stays total. Collapsing stays presentational: the full subtree remains in the output and the collapsed children are hidden by the disclosure's native semantics, not removed.

A visitor's toggles SHALL survive in-place re-renders: because the initial state is a pure function of data and hints, a re-render of unchanged data emits the same attributes, and the in-place patchers touch only attributes that changed — so an expansion or collapse the visitor made is not reset by an action's re-render of the same branches.

A node's optional `icon` SHALL render before its label: a string that passes the same image-safety gate card and table use (`isSafeImageSrc` plus the image-source detection rule) renders as an image element with classes `wg-img wg-img-icon`, an empty `alt` (the icon is decorative; the label carries the meaning), `loading="lazy"` and `decoding="async"`, participating in server-side image inlining exactly as card and table images do; any other string renders as a text span (an emoji, a glyph) with a stable class; a value failing the safety gate renders as text, never as an image.

#### Scenario: Nested nodes render recursively
- **WHEN** `tree` renders `{ label: "root", children: [{ label: "leaf", children: [] }] }`
- **THEN** the output SHALL contain `"root"` with a nested node containing `"leaf"`

#### Scenario: expandDepth limits expanded state
- **WHEN** the same data renders with `hints: { expandDepth: 1 }`
- **THEN** the root branch SHALL carry the `open` attribute and a depth-1 branch SHALL NOT

#### Scenario: Leaves carry no expansion attribute
- **WHEN** `tree` renders a three-level hierarchy with `hints: { expandDepth: 1 }`
- **THEN** only the nodes with children SHALL render a disclosure element
- **AND** the collapsed branch's children SHALL still be present in the output

#### Scenario: Meta supplies the tree title
- **WHEN** `tree` renders any hierarchy with `meta: { title: "Regions" }`
- **THEN** the output SHALL contain a title line `"Regions"` above the root nodes

#### Scenario: A branch toggles without script
- **WHEN** the rendered HTML of a collapsed branch is opened in a browsing context with no JavaScript
- **THEN** activating the branch's summary SHALL reveal its children, and activating it again SHALL hide them

#### Scenario: A visitor's expansion survives an action re-render
- **WHEN** a visitor expands a branch the server emitted collapsed, and an action then re-renders the widget with that branch unchanged
- **THEN** the in-place patch SHALL leave the branch expanded

#### Scenario: A safe image icon renders through the shared gate
- **WHEN** a node carries `icon: "https://cdn.example/folder.png"`
- **THEN** the output SHALL contain an `img` with classes `wg-img wg-img-icon`, that URL as `src`, an empty `alt`, `loading="lazy"` and `decoding="async"`, before the node's label

#### Scenario: An emoji icon renders as text
- **WHEN** a node carries `icon: "📁"`
- **THEN** the output SHALL contain the emoji in a stable-classed span before the label, and no image element

#### Scenario: An unsafe icon source never renders as an image
- **WHEN** a node carries `icon: "javascript:alert(1)"` or an `http(s)` URL that fails the safety gate
- **THEN** the value SHALL render as text, never as an `img`

#### Scenario: Icon stays out of the fallback label
- **WHEN** a node has no `label` but carries `icon` and other fields
- **THEN** the JSON-snippet fallback SHALL exclude `icon` (and `children`) from the snippet
- **AND WHEN** `icon` and `children` are the node's ONLY properties
- **THEN** the fallback SHALL still exclude them rather than printing the whole node

#### Scenario: Hostile depth renders as leaves, not a crash
- **WHEN** a payload nests children beyond the documented depth bound
- **THEN** nodes past the bound SHALL render as plain leaves and the render SHALL complete

#### Scenario: A negative expandDepth collapses everything
- **WHEN** a tree renders with `hints: { expandDepth: -1 }`
- **THEN** no branch SHALL carry the `open` attribute

### Requirement: Element keys from record identity
The `table` renderer SHALL key each body row with its record's `id` when every record in `data` is an object whose `id` is a string or a finite number and those values are distinct as strings; the key SHALL be the `id`'s string form. Otherwise no row SHALL carry a key. The `tree` renderer SHALL apply the same rule to each sibling list independently: every node element in a list (the root list or a branch's children) SHALL carry its node's `id` as key when all nodes in that list have distinct string or finite-number `id` values, and none SHALL otherwise. No other built-in element SHALL carry a key. Keys SHALL change nothing a reader sees: the HTML output layer and the DOM output layer SHALL NOT emit a key as an attribute or as text, so `renderToHtml` of a keyed tree equals that of the same tree without keys.

#### Scenario: Table rows carry their record ids
- **WHEN** `table` renders `data: [{ id: 7, name: "A" }, { id: "x9", name: "B" }]`
- **THEN** the two body rows SHALL carry keys `"7"` and `"x9"`

#### Scenario: Missing or repeated ids leave rows unkeyed
- **WHEN** `table` renders records where one lacks `id`, or two share an `id` (including `1` and `"1"`)
- **THEN** no body row SHALL carry a key

#### Scenario: Tree siblings are keyed list by list
- **WHEN** `tree` renders a root list whose nodes carry distinct `id` values, one of which has children without `id`
- **THEN** the root-level node elements SHALL carry their ids as keys
- **AND** that branch's child node elements SHALL carry no key

#### Scenario: Keys are invisible in the HTML
- **WHEN** a keyed table renders through `renderToHtml`
- **THEN** the output SHALL equal `renderToHtml` of the same tree with every `key` property removed
- **AND** the output SHALL contain no attribute carrying a key

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
`WidgetDescriptor` SHALL accept an optional `dataSchema` object using the documented JSON-Schema subset (`type`, `properties`, `required`, `items`, `enum`, `pattern`; unknown keywords ignored). When a kind has a `dataSchema`, `catalog.render` SHALL validate `data` against it before rendering, returning `{ ok: false, error }` with the existing vocabulary — `MISSING_FIELD` for missing required properties, `INVALID_TYPE` for type, enum, or pattern violations — and a dotted path into the data (e.g. `data.lines.0.qty`). `pattern` SHALL apply only when both the data value and the pattern are strings, and SHALL be bounded against pathological input: patterns longer than 256 characters, patterns rejected by the RegExp constructor, and patterns matching a nested-quantifier heuristic SHALL be ignored rather than enforced (the subset's never-misinterpret policy); tested strings SHALL be capped at 10 000 characters (longer values validate their prefix). Kinds without a schema SHALL keep today's lenient behavior.

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

#### Scenario: Pattern violations report the dotted path
- **WHEN** a property schema `{ type: "string", pattern: "^[A-Z]{3}$" }` validates `data.currency: "usd!"`
- **THEN** the result SHALL be `{ ok: false, error }` with `error.code: "INVALID_TYPE"` and `error.path: "data.currency"`
- **AND** `"USD"` SHALL pass

#### Scenario: Unsafe or invalid patterns are ignored, not enforced
- **WHEN** a schema carries `pattern: "(a+)+$"` (nested quantifier) or an unparsable pattern
- **THEN** validation SHALL behave as if `pattern` were absent and rendering SHALL proceed

#### Scenario: Pattern never applies to non-strings
- **WHEN** a schema with `pattern` validates a number
- **THEN** `pattern` SHALL produce no violation (type checking is `type`'s concern)

### Requirement: Registered widget styles
`WidgetDescriptor` SHALL accept optional `styles`: a map of CSS selectors to property/value maps, letting custom kinds ship their look as data. Every selector part — split on top-level commas, read outside brackets and quoted strings, so the commas inside `:is()`, `:not()`, `:has()`, `:where()` or an attribute value belong to it — SHALL be held to `.wg-` classes: one of its compounds SHALL name a `.wg-`-prefixed class itself, or through `:is()` or `:where()` whose every argument is so held, nested at most 16 levels so the check is bounded and the generator never throws (a `.wg-` class only inside `:not()`, `:has()`, an attribute test or a string does not count), and no part SHALL open with a combinator; selectors, property names, and values are guarded (no braces, semicolons, angle brackets, `@`, backslashes, comment markers `/*` or `*/`, unclosed brackets or strings — a newline ends a string unclosed, as in CSS — and in values no `url(`, `expression(`, `image-set(` or `src(`), and values MAY reference theme tokens via `var(--wg-*)`. The rules SHALL also be exported as text, `STYLE_RULES`, built from the constants that enforce them, for guides and designer messages to read. Invalid entries SHALL be skipped, never emitted. `widgetStylesToCss(styles)` SHALL generate the CSS, and styles SHALL be exposed through `describe`/`list` so hosts can inject them.

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
- **WHEN** styles hold the selectors `.wg-a:is(`, `.wg-a[title` and `.wg-a[title="a⏎b"]` (a newline inside the string), and the values `calc(1px + (2px`, `foo(`, `1px)`, `"open` and `"a⏎b"`
- **THEN** the generated CSS SHALL contain none of them, and a rule after them in the same sheet SHALL still apply

#### Scenario: Deep nesting is refused without throwing
- **WHEN** a selector nests `:is(` 2,000 levels deep around `.wg-a`
- **THEN** `widgetStylesToCss` SHALL return without throwing and SHALL NOT emit it

#### Scenario: Selectors held through :is() and :where() are kept
- **WHEN** styles hold `:is(.wg-btn, .wg-link):hover`, `:where(.wg-card) h3` and `.wg-a[title="("]` with the value `"("`
- **THEN** the generated CSS SHALL contain each rule unchanged

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

### Requirement: Group items keep their action identity
When a `group` render composes an item, every action descriptor in that item's rendered subtree SHALL be stamped with `at`: the dotted path of the item's payload within the group payload (`data.items.<i>`). Descriptors keep the `widget` their own template set, so a host can execute an item's binding against the item's kind and fold the result back into the right item. Items without descriptors SHALL render exactly as before, and the `tree`/`html` equivalence of the group render SHALL hold.

#### Scenario: A bound item inside a group is addressable
- **WHEN** a `group` renders a bound `weather` item at position 0 followed by a plain card
- **THEN** the weather element's descriptor SHALL carry `widget: "weather"` and `at: "data.items.0"`, and the card's subtree SHALL carry no descriptor

#### Scenario: Plain items are untouched
- **WHEN** a `group` renders items without any action binding
- **THEN** no subtree SHALL carry a `data-wg-action` attribute and the render SHALL equal a pre-actions group render

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
