# data-adapters Specification

## Purpose
TBD - created by archiving change widget-rendering-foundation. Update Purpose after archive.
## Requirements
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
- **THEN** it SHALL return a structured error including the parse position

### Requirement: CSV adapter
The system SHALL accept CSV text and produce an array of records suitable for the `table` widget.

#### Scenario: Header row drives keys
- **WHEN** CSV input has a header row `name,email`
- **THEN** the adapter SHALL produce records keyed by `name` and `email`

#### Scenario: Quoted fields and commas
- **WHEN** a CSV value is quoted and contains a comma
- **THEN** the adapter SHALL preserve the comma inside the value

#### Scenario: Type inference is opt-in
- **WHEN** the adapter is invoked with `inferTypes: true`
- **THEN** numeric and boolean strings SHALL be coerced to native types
- **AND** otherwise all values SHALL remain strings

