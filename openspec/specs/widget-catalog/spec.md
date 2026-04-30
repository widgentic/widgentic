# widget-catalog Specification

## Purpose
TBD - created by archiving change widget-rendering-foundation. Update Purpose after archive.
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
The catalog SHALL expose a registration API so hosts can add new widget kinds without modifying the core.

#### Scenario: Register and render a custom kind
- **WHEN** a host registers `kind: "timeline"` with a renderer function
- **AND** an agent emits a payload with `kind: "timeline"`
- **THEN** the registered renderer SHALL be invoked with the payload

#### Scenario: Duplicate registration is rejected
- **WHEN** a host registers a `kind` that already exists
- **THEN** the catalog SHALL raise a clear duplicate-registration error

