## ADDED Requirements

### Requirement: Normalized widget payload
The system SHALL define a normalized payload that any agent or MCP tool emits to render a widget. The payload MUST include a `kind` (widget identifier), a `data` body, and MAY include `hints` (renderer guidance) and `meta` (title, source, timestamps).

#### Scenario: Minimum viable payload
- **WHEN** an agent emits `{ "kind": "card", "data": { "title": "Hello" } }`
- **THEN** the renderer SHALL accept the payload and render a `card` widget

#### Scenario: Unknown widget kind is rejected
- **WHEN** an agent emits a payload with `kind` not present in the widget catalog
- **THEN** the renderer SHALL return a structured error identifying the unknown kind

### Requirement: Hints override defaults
The system SHALL allow `hints` in the payload to override default rendering decisions (column order, expansion depth, density, etc.) without changing `data`.

#### Scenario: Hint changes column order
- **WHEN** a `table` payload includes `hints.columns: ["name","email"]`
- **THEN** the rendered table SHALL display columns in that order

### Requirement: Forward compatibility
The contract SHALL ignore unknown fields rather than fail, so agents written against newer versions remain renderable by older hosts.

#### Scenario: Unknown field is ignored
- **WHEN** a payload includes a field not defined in the current contract
- **THEN** the renderer SHALL render successfully and SHALL NOT raise a validation error
