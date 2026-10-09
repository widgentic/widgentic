## MODIFIED Requirements

### Requirement: Renderers produce a pure render tree
A renderer SHALL be a pure function `(payload: WidgetPayload) => WidgetNode`, where `WidgetNode` is either a string or a plain object `{ tag, attrs?, children?, key? }` containing no DOM or framework types. `key`, when present, SHALL be a string that identifies the element among its siblings for in-place patching; it is render-tree data only. Built-in renderers SHALL NOT throw for any `data` value.

#### Scenario: Render tree is plain data
- **WHEN** any built-in renderer runs on a valid payload
- **THEN** the result SHALL be JSON-serializable (strings and `{ tag, attrs?, children?, key? }` objects only)

#### Scenario: Built-ins are total
- **WHEN** a built-in renderer receives `data` of an unexpected shape (e.g., `null` for `table`)
- **THEN** it SHALL return a fallback render tree rather than throw

## ADDED Requirements

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
