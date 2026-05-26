## ADDED Requirements

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
