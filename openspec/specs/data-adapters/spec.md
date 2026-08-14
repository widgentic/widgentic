# data-adapters Specification

## Purpose
Turns raw input (JSON text or values, CSV text) into the `data` body of a widget payload via pure synchronous adapters. Adapters expose a discriminated result (`{ ok, value | records | error }`) mirroring the contract validator's pattern, so producers can normalize boundary input without exceptions and downstream consumers (mapper, table widget, MCP tools) can work against a consistent shape.
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
- **THEN** it SHALL return a structured error, including the parse position when the engine's message reports one (position extraction is best-effort; the error itself is unconditional)

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

### Requirement: JSON adapter programmatic surface
The package SHALL export `parseJson(input: unknown)` returning a discriminated result `{ ok: true, value: unknown } | { ok: false, error: AdapterError }`.

#### Scenario: Valid JSON string returns ok
- **WHEN** `parseJson('{"a":1}')` is called
- **THEN** the result SHALL be `{ ok: true, value: { a: 1 } }`

#### Scenario: Parsed value passes through
- **WHEN** `parseJson({ a: 1 })` is called with an already-parsed object
- **THEN** the result SHALL be `{ ok: true, value: { a: 1 } }`
- **AND** the returned `value` SHALL be the same reference as the input

#### Scenario: Invalid JSON returns structured error
- **WHEN** `parseJson('{not json')` is called
- **THEN** the result SHALL be `{ ok: false, error: { code: "INVALID_JSON", message: <string>, position?: <number> } }`

#### Scenario: Non-string non-object input is accepted as value
- **WHEN** `parseJson(42)` or `parseJson(null)` is called
- **THEN** the result SHALL be `{ ok: true, value: <input> }`

### Requirement: CSV adapter programmatic surface
The package SHALL export `parseCsv(input: string, options?: CsvOptions)` returning a discriminated result `{ ok: true, records: Record<string, unknown>[] } | { ok: false, error: AdapterError }`.

#### Scenario: Header row drives record keys
- **WHEN** `parseCsv("name,email\nAda,ada@x")` is called
- **THEN** the result SHALL be `{ ok: true, records: [{ name: "Ada", email: "ada@x" }] }`

#### Scenario: Quoted fields preserve commas
- **WHEN** `parseCsv('a,b\n"x,y",z')` is called
- **THEN** the first record SHALL be `{ a: "x,y", b: "z" }`

#### Scenario: Quoted fields preserve newlines
- **WHEN** a CSV value is quoted and contains a newline
- **THEN** the value SHALL preserve the newline inside the field

#### Scenario: Escaped double quotes
- **WHEN** `parseCsv('a\n"he said ""hi"""')` is called
- **THEN** the first record SHALL be `{ a: 'he said "hi"' }`

#### Scenario: CRLF line endings
- **WHEN** CSV input uses `\r\n` line endings
- **THEN** parsing SHALL succeed identically to `\n` input

#### Scenario: Trailing newline is tolerated
- **WHEN** CSV input ends with a trailing newline
- **THEN** no empty trailing record SHALL be produced

#### Scenario: Empty input
- **WHEN** `parseCsv("")` is called
- **THEN** the result SHALL be `{ ok: true, records: [] }`

#### Scenario: Ragged row returns error
- **WHEN** a data row has fewer or more fields than the header
- **THEN** the result SHALL be `{ ok: false, error: { code: "INVALID_CSV", message: <string>, line: <number> } }`

### Requirement: Opt-in CSV type inference
The CSV adapter SHALL accept `options.inferTypes: boolean` (default `false`). When `true`, numeric and boolean strings SHALL be coerced to native `number` and `boolean`; all other values remain strings.

#### Scenario: Inference enabled
- **WHEN** `parseCsv("n,b\n1,true", { inferTypes: true })` is called
- **THEN** the first record SHALL be `{ n: 1, b: true }`

#### Scenario: Inference disabled (default)
- **WHEN** `parseCsv("n,b\n1,true")` is called without options
- **THEN** the first record SHALL be `{ n: "1", b: "true" }`

#### Scenario: Empty cell stays empty string
- **WHEN** a CSV cell is empty and inference is enabled
- **THEN** the field SHALL be `""` (not coerced to `0` or `false`)

### Requirement: Structured adapter error shape
The package SHALL export an `AdapterError` type with fields `code: "INVALID_JSON" | "INVALID_CSV"`, `message: string`, and optional location fields (`position` for JSON, `line` for CSV).

#### Scenario: Error includes machine-readable code
- **WHEN** any adapter fails
- **THEN** `error.code` SHALL be one of the documented codes
- **AND** `error.message` SHALL be a non-empty human-readable string
