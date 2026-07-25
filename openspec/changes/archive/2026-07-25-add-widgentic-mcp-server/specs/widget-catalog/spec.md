## ADDED Requirements

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

## MODIFIED Requirements

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
