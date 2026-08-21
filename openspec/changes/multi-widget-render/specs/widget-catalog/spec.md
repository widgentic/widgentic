# Widget Catalog — multi-widget render delta

## MODIFIED Requirements

### Requirement: Built-in widget kinds
The system SHALL provide built-in widgets: `card`, `table`, `tree`, `custom`, and `group`. Each built-in widget MUST document the shape of `data` and supported `hints`.

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

## ADDED Requirements

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
