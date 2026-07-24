## ADDED Requirements

### Requirement: MCP module programmatic surface
The package SHALL export the widgentic MCP convention from a `./mcp` entry: `toWidgetResult`, `toTextResult`, `extractWidgetPayload`, `isWidgetResult`, `hostSupportsWidgets`, `declareWidgetCapability`, and the constants `WIDGENTIC_MIME_TYPE` (`"application/vnd.widgentic+json"`), `WIDGENTIC_URI` (`"ui://widgentic/widget"`), `WIDGENTIC_CAPABILITY` (`"widgentic"`), and `WIDGENTIC_VERSION` (`1`). MCP shapes SHALL be structural local types; the module SHALL NOT depend on an MCP SDK.

#### Scenario: Constants are exported for interop
- **WHEN** `WIDGENTIC_MIME_TYPE` is imported from `widgentic/mcp`
- **THEN** it SHALL equal `"application/vnd.widgentic+json"`

### Requirement: Widget result emission
`toWidgetResult(payload, options?)` SHALL return an MCP-shaped tool result whose `content` contains a text fallback block followed by an embedded resource block with `mimeType: WIDGENTIC_MIME_TYPE`, `uri: WIDGENTIC_URI` (overridable via `options.uri`), and `text` holding the JSON-serialized payload. Unknown top-level payload fields SHALL survive the round trip. `options.text` SHALL override the generated fallback text. When the payload cannot be JSON-serialized, the result SHALL degrade to the text-only shape.

#### Scenario: Result carries the payload as a widgentic resource
- **WHEN** `toWidgetResult({ kind: "table", data: [{ a: 1 }] })` is called
- **THEN** the result content SHALL include a resource block with `mimeType: "application/vnd.widgentic+json"`
- **AND** parsing that block's `text` SHALL yield the original payload

#### Scenario: Fallback text block accompanies the widget
- **WHEN** `toWidgetResult(payload)` is called
- **THEN** the result content SHALL also include a `text` block whose text equals the `toTextResult` representation

#### Scenario: Unknown payload fields round-trip
- **WHEN** a payload with an extra top-level field is emitted and extracted
- **THEN** the extracted payload SHALL contain that field

### Requirement: Text fallback emission
`toTextResult(payload)` SHALL return a text-only MCP-shaped result whose text contains `meta.title` on the first line when present, followed by the pretty-printed JSON of `data`. Serialization failures SHALL fall back to `String(data)` rather than throw. Tools SHALL use this emission when the host has not advertised widgentic support.

#### Scenario: Text result contains title and data
- **WHEN** `toTextResult({ kind: "card", data: { a: 1 }, meta: { title: "T" } })` is called
- **THEN** the result SHALL contain exactly one `text` content block
- **AND** its text SHALL start with `"T"` and contain the pretty-printed JSON of `{ a: 1 }`

#### Scenario: Text result has no widgentic block
- **WHEN** `toTextResult(payload)` is passed to `isWidgetResult`
- **THEN** the result SHALL be `false`

### Requirement: Widget payload extraction
`extractWidgetPayload(result, options?)` SHALL return a three-state discriminated result: `{ found: false }` when no content block carries the widgentic mime type; `{ found: true, ok: true, payload }` when the first widgentic block parses and passes contract validation (honoring `options.knownKinds`); `{ found: true, ok: false, error }` when the block exists but its JSON is invalid or the payload fails validation. It SHALL never throw, treating malformed results (missing or non-array `content`) as `{ found: false }`. `isWidgetResult(result)` SHALL report whether a widgentic block is present.

#### Scenario: Emitted widget round-trips through extraction
- **WHEN** `extractWidgetPayload(toWidgetResult(payload))` is called
- **THEN** the result SHALL be `{ found: true, ok: true, payload }` deep-equal to the original

#### Scenario: Non-widget result is left alone
- **WHEN** `extractWidgetPayload({ content: [{ type: "text", text: "hi" }] })` is called
- **THEN** the result SHALL be `{ found: false }`

#### Scenario: Malformed widgentic block is a structured error
- **WHEN** a result contains a widgentic-mime resource whose `text` is not valid JSON
- **THEN** the result SHALL be `{ found: true, ok: false, error }` with `error.code: "INVALID_JSON"`

#### Scenario: Invalid payload in a widgentic block is a structured error
- **WHEN** a widgentic block's JSON parses but lacks `kind`
- **THEN** the result SHALL be `{ found: true, ok: false, error }` with `error.code: "MISSING_FIELD"`

#### Scenario: knownKinds is honored
- **WHEN** `extractWidgetPayload(result, { knownKinds: new Set(["card"]) })` reads a payload with `kind: "exotic"`
- **THEN** the result SHALL be `{ found: true, ok: false, error }` with `error.code: "UNKNOWN_KIND"`

#### Scenario: Garbage input does not throw
- **WHEN** `extractWidgetPayload(null)` or `extractWidgetPayload({})` is called
- **THEN** the result SHALL be `{ found: false }`

### Requirement: Capability negotiation helpers
`declareWidgetCapability(capabilities?)` SHALL return a new capabilities object with `experimental.widgentic: { version: WIDGENTIC_VERSION }` added, preserving existing keys and not mutating the input. `hostSupportsWidgets(capabilities)` SHALL return `true` only when `capabilities.experimental.widgentic` is present and truthy, and SHALL never throw on malformed input.

#### Scenario: Declared capability is detected
- **WHEN** `hostSupportsWidgets(declareWidgetCapability())` is called
- **THEN** the result SHALL be `true`

#### Scenario: Existing capabilities are preserved without mutation
- **WHEN** `declareWidgetCapability({ experimental: { other: true }, sampling: {} })` is called
- **THEN** the returned object SHALL retain `experimental.other` and `sampling`
- **AND** the input object SHALL be unchanged

#### Scenario: Absent or malformed capabilities mean no support
- **WHEN** `hostSupportsWidgets(undefined)`, `hostSupportsWidgets({})`, or `hostSupportsWidgets({ experimental: null })` is called
- **THEN** the result SHALL be `false`
