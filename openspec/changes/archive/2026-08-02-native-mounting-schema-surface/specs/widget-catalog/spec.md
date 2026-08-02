# widget-catalog — Delta: bounded pattern in data schemas

## MODIFIED Requirements

### Requirement: Descriptor data schemas
`WidgetDescriptor` SHALL accept an optional `dataSchema` object using the documented JSON-Schema subset (`type`, `properties`, `required`, `items`, `enum`, `pattern`; unknown keywords ignored). When a kind has a `dataSchema`, `catalog.render` SHALL validate `data` against it before rendering, returning `{ ok: false, error }` with the existing vocabulary — `MISSING_FIELD` for missing required properties, `INVALID_TYPE` for type, enum, or pattern violations — and a dotted path into the data (e.g. `data.lines.0.qty`). `pattern` SHALL apply only when both the data value and the pattern are strings, and SHALL be bounded against pathological input: patterns longer than 256 characters, patterns rejected by the RegExp constructor, and patterns matching a nested-quantifier heuristic SHALL be ignored rather than enforced (the subset's never-misinterpret policy); tested strings SHALL be capped at 10 000 characters (longer values validate their prefix). Kinds without a schema SHALL keep today's lenient behavior.

#### Scenario: Schema violation fails before rendering
- **WHEN** a kind with `dataSchema: { type: "object", required: ["lines"] }` renders `data: {}`
- **THEN** the result SHALL be `{ ok: false, error }` with `error.code: "MISSING_FIELD"` and `error.path: "data.lines"`

#### Scenario: Nested violations carry dotted paths
- **WHEN** the schema requires `lines` items to have numeric `qty` and `data.lines[0].qty` is a string
- **THEN** `error.path` SHALL be `"data.lines.0.qty"` with `error.code: "INVALID_TYPE"`

#### Scenario: Valid data renders normally
- **WHEN** the data satisfies the schema
- **THEN** rendering SHALL proceed exactly as without a schema

#### Scenario: Schema-less kinds stay lenient
- **WHEN** a kind has no `dataSchema`
- **THEN** any `data` value SHALL render via the kind's documented fallbacks

#### Scenario: Schemas are listed for discovery
- **WHEN** a kind with a `dataSchema` appears in `list()`
- **THEN** its descriptor SHALL include the schema verbatim

#### Scenario: Pattern violations report the dotted path
- **WHEN** a property schema `{ type: "string", pattern: "^[A-Z]{3}$" }` validates `data.currency: "usd!"`
- **THEN** the result SHALL be `{ ok: false, error }` with `error.code: "INVALID_TYPE"` and `error.path: "data.currency"`
- **AND** `"USD"` SHALL pass

#### Scenario: Unsafe or invalid patterns are ignored, not enforced
- **WHEN** a schema carries `pattern: "(a+)+$"` (nested quantifier) or an unparsable pattern
- **THEN** validation SHALL behave as if `pattern` were absent and rendering SHALL proceed

#### Scenario: Pattern never applies to non-strings
- **WHEN** a schema with `pattern` validates a number
- **THEN** `pattern` SHALL produce no violation (type checking is `type`'s concern)
