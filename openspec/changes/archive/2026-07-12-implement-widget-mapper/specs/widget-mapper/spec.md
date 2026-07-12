## ADDED Requirements

### Requirement: Mapper programmatic surface
The package SHALL export `mapToWidget(input: MapperInput): WidgetPayload` from a `./mapper` entry, where `MapperInput` is a `WidgetPayload` with `kind` optional (`data` required). When `kind` is absent, the mapper SHALL fill it using shape inference; when present as a non-empty string, it SHALL be preserved unchanged.

#### Scenario: Raw data is wrapped and mapped
- **WHEN** `mapToWidget({ data: [{ a: 1 }, { a: 2 }] })` is called
- **THEN** the result SHALL be a payload with `kind: "table"` and the same `data`

#### Scenario: Explicit kind is not re-inferred
- **WHEN** `mapToWidget({ kind: "tree", data: { a: 1 } })` is called
- **THEN** the result SHALL have `kind: "tree"`

### Requirement: Kind inference surface
The package SHALL export `inferKind(data: unknown): WidgetKind` returning the widget kind the selection rules choose for the given data, without constructing a payload.

#### Scenario: Records array infers table
- **WHEN** `inferKind([{ id: 1 }, { id: 2 }])` is called
- **THEN** the result SHALL be `"table"`

#### Scenario: Primitive infers card
- **WHEN** `inferKind("hello")` is called
- **THEN** the result SHALL be `"card"`

### Requirement: Mapper is total
`mapToWidget` SHALL NOT throw and SHALL NOT return an error result. Every call SHALL return a payload whose `kind` is a non-empty string. An input `kind` that is not a non-empty string SHALL be treated as absent and replaced by inference.

#### Scenario: Null data maps to fallback
- **WHEN** `mapToWidget({ data: null })` is called
- **THEN** the result SHALL be a payload with `kind: "card"` and `data: null`

#### Scenario: Non-string kind is replaced by inference
- **WHEN** `mapToWidget({ kind: 42 as any, data: [{ a: 1 }] })` is called
- **THEN** the result SHALL have `kind: "table"`

#### Scenario: Empty-string kind is replaced by inference
- **WHEN** `mapToWidget({ kind: "", data: { a: 1 } })` is called
- **THEN** the result SHALL have `kind: "card"`

### Requirement: Field passthrough and non-mutation
`mapToWidget` SHALL return a new top-level object, SHALL NOT mutate its input, and SHALL preserve `hints`, `meta`, and unknown top-level fields on the output. `data` SHALL be passed through by reference, not cloned.

#### Scenario: Hints, meta, and unknown fields survive
- **WHEN** `mapToWidget({ data: { a: 1 }, hints: { density: "compact" }, meta: { title: "T" }, custom: 1 })` is called
- **THEN** the output SHALL contain the same `hints`, `meta`, and `custom` values

#### Scenario: Input object is not mutated
- **WHEN** `mapToWidget(input)` is called with an `input` lacking `kind`
- **THEN** `input` SHALL still have no `kind` property after the call
- **AND** the returned payload SHALL NOT be the same reference as `input`

#### Scenario: Data is the same reference
- **WHEN** `mapToWidget({ data: rows })` is called
- **THEN** the output `data` SHALL be the same reference as `rows`

### Requirement: Inference precedence and edge cases
Inference SHALL check tree before table before card. A tree node is a plain object with an array-valued `children` property; data SHALL infer `tree` when it is a tree node or a non-empty array whose every element is a tree node. A records array SHALL infer `table` only when all elements are plain objects and either the array has exactly one element or all elements share at least one common key. Shapes matching no rule SHALL infer `card`.

#### Scenario: Tree wins over table
- **WHEN** `inferKind([{ label: "a", children: [] }, { label: "b", children: [] }])` is called
- **THEN** the result SHALL be `"tree"`

#### Scenario: Empty array falls back to card
- **WHEN** `inferKind([])` is called
- **THEN** the result SHALL be `"card"`

#### Scenario: Records with optional fields still infer table
- **WHEN** `inferKind([{ id: 1, name: "a" }, { id: 2 }])` is called
- **THEN** the result SHALL be `"table"`

#### Scenario: Records with no shared keys fall back to card
- **WHEN** `inferKind([{ a: 1 }, { b: 2 }])` is called
- **THEN** the result SHALL be `"card"`

#### Scenario: Mixed-type array falls back to card
- **WHEN** `inferKind([{ a: 1 }, "x", 2])` is called
- **THEN** the result SHALL be `"card"`
