# widget-contract Specification

## Purpose
Defines the normalized payload `{ kind, data, hints?, meta? }` that agents and MCP tools emit and widget renderers consume. This is the stable contract between producers (adapters, agents, tools) and consumers (catalog renderers), with forward-compatible unknown-field tolerance and structured validation errors.
## Requirements
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

### Requirement: TypeScript type exports
The package SHALL export TypeScript types `WidgetPayload`, `WidgetKind`, `WidgetHints`, and `WidgetMeta` describing the contract `{ kind, data, hints?, meta? }` from the `widgentic/contract` entry — the package's `exports` map is the single resolution authority, and it deliberately exposes named entries only (there is no `"."` root export).

#### Scenario: Import types from the package entry
- **WHEN** a consumer imports `WidgetPayload` from the package's contract entry (`widgentic/contract`, resolved through the `exports` map)
- **THEN** the type SHALL be available and resolve to a discriminated object containing at minimum `kind: string` and `data: unknown`

#### Scenario: Optional fields are typed optional
- **WHEN** a consumer constructs a `WidgetPayload` without `hints` or `meta`
- **THEN** the TypeScript compiler SHALL NOT raise an error

### Requirement: Programmatic validator
The package SHALL export `validateWidgetPayload(input: unknown)` that returns a discriminated result `{ ok: true, payload: WidgetPayload } | { ok: false, error: WidgetContractError }`.

#### Scenario: Valid payload returns ok
- **WHEN** `validateWidgetPayload({ kind: "card", data: { title: "Hi" } })` is called
- **THEN** the result SHALL be `{ ok: true, payload: <input> }`

#### Scenario: Missing required field returns error
- **WHEN** `validateWidgetPayload({ data: {} })` is called (no `kind`)
- **THEN** the result SHALL be `{ ok: false, error: { code: "MISSING_FIELD", path: "kind", message: <string> } }`

#### Scenario: Wrong type for kind returns error
- **WHEN** `validateWidgetPayload({ kind: 42, data: {} })` is called
- **THEN** the result SHALL be `{ ok: false, error: { code: "INVALID_TYPE", path: "kind", message: <string> } }`

#### Scenario: Non-object input returns error
- **WHEN** `validateWidgetPayload(null)` or `validateWidgetPayload("x")` is called
- **THEN** the result SHALL be `{ ok: false, error: { code: "INVALID_TYPE", path: "", message: <string> } }`

### Requirement: Structured error shape
The package SHALL export a `WidgetContractError` type with fields `code: string`, `message: string`, and optional `path: string` for the offending field path.

#### Scenario: Error includes machine-readable code
- **WHEN** validation fails
- **THEN** `error.code` SHALL be one of a documented set including `INVALID_TYPE`, `MISSING_FIELD`, and `UNKNOWN_KIND`

### Requirement: Kind registry injection
The validator SHALL accept an optional `knownKinds: ReadonlySet<string>` parameter. When provided and non-empty, payloads whose `kind` is not in the set SHALL fail with `code: "UNKNOWN_KIND"`.

#### Scenario: Known kind passes
- **WHEN** `validateWidgetPayload({ kind: "card", data: {} }, { knownKinds: new Set(["card"]) })` is called
- **THEN** the result SHALL be `{ ok: true, ... }`

#### Scenario: Unknown kind fails with UNKNOWN_KIND
- **WHEN** `validateWidgetPayload({ kind: "xyz", data: {} }, { knownKinds: new Set(["card"]) })` is called
- **THEN** the result SHALL be `{ ok: false, error: { code: "UNKNOWN_KIND", path: "kind", message: <string> } }`

#### Scenario: Empty or omitted registry skips kind check
- **WHEN** `validateWidgetPayload({ kind: "anything", data: {} })` is called with no `knownKinds`
- **THEN** the result SHALL be `{ ok: true, ... }` (kind format is still validated, but membership is not)

### Requirement: Unknown fields preserved
The validator SHALL preserve unknown top-level fields on the returned `payload` rather than stripping them, to honor forward compatibility.

#### Scenario: Future field round-trips
- **WHEN** `validateWidgetPayload({ kind: "card", data: {}, futureField: 1 })` is called
- **THEN** the returned `payload.futureField` SHALL equal `1`
