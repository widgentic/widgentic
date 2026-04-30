# widget-mapper Specification

## Purpose
TBD - created by archiving change widget-rendering-foundation. Update Purpose after archive.
## Requirements
### Requirement: Default widget selection by data shape
The system SHALL choose a default widget kind from the data shape when the agent does not specify `kind`.

#### Scenario: Array of records maps to table
- **WHEN** input data is a non-empty array of plain objects with consistent keys
- **THEN** the mapper SHALL select `kind: "table"`

#### Scenario: Plain object maps to card
- **WHEN** input data is a plain object without a `children` array
- **THEN** the mapper SHALL select `kind: "card"`

#### Scenario: Nested children map to tree
- **WHEN** input data contains nodes with a `children` array (recursively)
- **THEN** the mapper SHALL select `kind: "tree"`

### Requirement: Explicit kind overrides inference
When the payload provides a `kind`, the mapper SHALL NOT change it.

#### Scenario: Explicit kind is preserved
- **WHEN** an agent emits `{ kind: "card", data: [...] }`
- **THEN** the mapper SHALL return `kind: "card"` even though the data is an array

### Requirement: Ambiguous shape falls back to card
When data shape does not match any rule, the mapper SHALL select `card` as a safe default.

#### Scenario: Primitive value
- **WHEN** input data is a string or number
- **THEN** the mapper SHALL select `kind: "card"`

