# data-adapters — honest parse-position wording

## MODIFIED Requirements

### Requirement: JSON adapter
The system SHALL accept either a JSON string or an already-parsed JS value and produce a normalized widget payload `data` body.

#### Scenario: Parse JSON string
- **WHEN** the JSON adapter receives `'{"a":1}'`
- **THEN** it SHALL return `{ a: 1 }` as `data`

#### Scenario: Pass-through parsed value
- **WHEN** the JSON adapter receives an object that is already parsed
- **THEN** it SHALL return that object unchanged

#### Scenario: Invalid JSON is reported
- **WHEN** the JSON adapter receives an unparseable string
- **THEN** it SHALL return a structured error, including the parse position when the engine's message reports one (position extraction is best-effort; the error itself is unconditional)
