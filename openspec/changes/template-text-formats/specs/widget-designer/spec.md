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
