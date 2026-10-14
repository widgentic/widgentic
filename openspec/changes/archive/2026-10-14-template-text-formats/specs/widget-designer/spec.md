## MODIFIED Requirements

### Requirement: Bind rows offer the transforms their position allows
A bind-mode ATTRIBUTE row SHALL offer all three value transforms — a literal `prefix`, a value→literal
`map` with its `default`, and a presentation `format` — and SHALL hide the other two once one is set,
mirroring the validator's mutual exclusion. A TEXT bind row SHALL offer `format`, `map` (with its `default`) and a Markdown toggle, hiding the others once one is set; it SHALL NOT offer `prefix`, an attribute-value transform the renderer ignores in a text position. The format control SHALL offer every type the validator accepts. Choosing a type SHALL commit a complete, valid spec, and each type SHALL reveal its own fields:
- currency: code, decimals and display;
- number: decimals;
- date: the pattern;
- count: no field;
- join: separator, last separator and item field;
- truncate: length and ellipsis;
- pluralize: the `zero`, `one` and `other` forms. Any other plural category the spec carries SHALL be kept when those forms are edited.

No transform SHALL be
restricted by attribute name or element tag; attribute-level safety belongs to validation and rendering,
not to hiding editors. Every control a row offers SHALL be REACHABLE: a hover- or focus-revealed control SHALL be revealed by
ONE rule that names every row type hosting it (so a new row type cannot ship present-but-invisible
controls), and a row SHALL wrap rather than clip its trailing controls, so an added control can never
push another out of reach.

#### Scenario: A text bind row offers format and map, never prefix
- **WHEN** a `{ bind }` child node's row is inspected
- **THEN** it SHALL carry a format control and a `map` control and SHALL NOT carry a `prefix` input
- **AND WHEN** `map` is set
- **THEN** the format control SHALL disappear and the map block (value → label rows plus a default) SHALL appear under the node

#### Scenario: A bound attribute row offers all three, each reachable
- **WHEN** a bind-mode attribute row is inspected
- **THEN** it SHALL carry a `prefix` input, a `map` control and a format control
- **AND** the `map` control SHALL become visible when its row is hovered or focused, and SHALL sit within the row's own width

#### Scenario: One transform at a time
- **WHEN** a `map`, a `prefix` or a `format` is set on an attribute row
- **THEN** the other two controls SHALL disappear from that row

#### Scenario: No per-attribute or per-element restriction
- **WHEN** bind-mode rows are inspected across different attribute names and element tags
- **THEN** each SHALL offer the same three transforms

#### Scenario: A text bind row offers the Markdown toggle
- **WHEN** a `{ bind }` child node's row is inspected and its Markdown toggle is switched on
- **THEN** the node SHALL become `{ bind, markdown: true }`, and the format and `map` controls SHALL disappear from the row
- **AND** switching it off SHALL restore `{ bind }` with both controls

#### Scenario: Every format type is offered with its fields
- **WHEN** the format control of a bind row is opened
- **THEN** it SHALL list `number`, `currency`, `date`, `count`, `join`, `truncate` and `pluralize`
- **AND** choosing `truncate` SHALL commit a spec that passes validation and reveal a length and an ellipsis input, and choosing `pluralize` SHALL reveal `zero`, `one` and `other` inputs

#### Scenario: Editing plural forms keeps the categories the row does not show
- **WHEN** a bind whose format is `{ type: "pluralize", locale: "pl", forms: { one: "{count} plik", few: "{count} pliki", many: "{count} plików", other: "{count} pliku" } }` has its `one` form edited in the row
- **THEN** the committed spec SHALL still carry `few`, `many` and `locale` unchanged

### Requirement: Schema-driven path completion descends arrays
The designer's path completions — the bind/each/when dropdowns in the template tree, attribute binds, action input mappings, and both output-map columns — SHALL derive candidate paths from the effective data schema by descending OBJECT properties; an ARRAY is offered as ITSELF and never descended by the enumerator, because neither the template resolver nor the projection steps into an array by name. Each consumer whose scope IS the item asks for the item schema: the scope inside `{ each: <path> }` SHALL be the item schema of the array that path resolves to — `each: "."` over a root-array schema included — so binds inside the each complete from the item's properties; the output-map editor SHALL complete an array side (widget data or action response) from that side's item schema, the per-item projection's vocabulary; and an array SCOPE itself (the template root over a root-array schema) SHALL offer only `"."` — nothing else resolves there, so no item property is advertised where it would render empty. A bind whose `format` reads a list (`count`, `join` or `pluralize`, as core exports them) SHALL be offered the scope's ARRAY paths as well as its scalar ones, in the template tree and in attribute binds alike; any other bind keeps scalar paths only, since a list bound raw renders its JSON. The free-text fallback SHALL appear only when the draft has NO effective schema; a root-array schema is a schema, not the fallback case. Off-schema values stay selectable and marked as today.

#### Scenario: A root-array schema completes inside each "."
- **WHEN** a widget's data schema is `{ type: "array", items: { type: "object", properties: { ask, bid, book, date } } }` and the template contains `{ each: "." }` with a bind inside it
- **THEN** the each dropdown SHALL offer `"."` and the bind dropdown inside the each SHALL offer `ask`, `bid`, `book` and `date`
- **AND** a bind at the template ROOT (outside the each) SHALL offer `"."` only — not `ask`

#### Scenario: Nested array items are reachable through their each
- **WHEN** an object schema carries `lines: { type: "array", items: { properties: { qty } } }` and the template nests a bind inside `{ each: "lines" }`
- **THEN** the bind SHALL complete with `qty`, and outside the each `lines` SHALL be offered for `each`, not for a plain `bind`

#### Scenario: No schema still falls back to free text
- **WHEN** a draft declares neither `dataSchema` nor `dataSchemaRef`
- **THEN** path inputs SHALL be free-text, exactly as before

#### Scenario: A list-reading format completes array paths
- **WHEN** a schema declares `tasks: { type: "array" }` and `name: { type: "string" }`, and a text bind on `tasks` carries `format: { type: "pluralize", ... }`, and an attribute bind on `tasks` carries `format: { type: "join" }`
- **THEN** both path dropdowns SHALL offer `tasks` without the off-schema mark, and `name` as well
- **AND** a bind on `tasks` with no format or a `truncate` format SHALL show `tasks` marked off-schema
