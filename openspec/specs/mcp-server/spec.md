# mcp-server Specification

## Purpose
The Widgentic MCP server: exposes the widget catalog to any MCP client via `list_widgets` (descriptor discovery) and `render_widget` (validate, render, return HTML plus the embedded widgentic payload). Handlers are pure, SDK-free functions over a catalog; errors are structured and agent-correctable in the tool's input vocabulary; client marshalling artifacts (string-encoded data) are recovered safely. Hardened by live multi-agent testing.
## Requirements
### Requirement: Server module programmatic surface
The package SHALL export from a `./mcp-server` entry: tool definitions as plain data (`LIST_WIDGETS_TOOL`, `RENDER_WIDGET_TOOL`, `LIST_THEME_TOKENS_TOOL` — each with `name`, `description`, and a JSON-Schema `inputSchema` object) and pure handlers `handleListWidgets(catalog)`, `handleRenderWidget(catalog, input: unknown)`, and `handleListThemeTokens()` returning MCP-shaped tool results. The module SHALL NOT depend on an MCP SDK.

#### Scenario: Tool definitions are serializable data
- **WHEN** `LIST_WIDGETS_TOOL`, `RENDER_WIDGET_TOOL`, and `LIST_THEME_TOKENS_TOOL` are inspected
- **THEN** each SHALL be JSON-serializable with `name` (`"list_widgets"` / `"render_widget"` / `"list_theme_tokens"`), a non-empty `description`, and an object-typed `inputSchema`
- **AND** `RENDER_WIDGET_TOOL.inputSchema` SHALL require `widget` and `data`
- **AND** the `data` property SHALL declare the JSON value types (`array`, `object`, `string`, `number`, `boolean`, `null`) so clients marshal structured values instead of serialized strings

### Requirement: Widget listing tool
`handleListWidgets(catalog)` SHALL return a non-error result whose text content is the JSON array of the catalog's descriptors, so agents can discover available widgets, their purpose, and the expected `data` input.

#### Scenario: Listing reflects the catalog
- **WHEN** `handleListWidgets` runs on a catalog with the built-ins and a registered `invoice` template kind
- **THEN** parsing the result text SHALL yield descriptors for `card`, `table`, `tree`, `custom`, and `invoice`

#### Scenario: Listing carries agent-usable metadata
- **WHEN** the built-in `table` descriptor is read from the listing
- **THEN** it SHALL include `description`, `dataShape`, and a `dataExample` an agent can imitate

### Requirement: Widget rendering tool
`handleRenderWidget(catalog, input)` SHALL accept `{ widget, data, hints?, meta?, format?, theme? }`, validate the widget id against the catalog, the assembled payload against the contract, and `data` against the kind's `dataSchema` when present, render on success, and return content per the selected `format` — by default the rendered HTML as a text block **and** the validated payload as a widgentic resource block (extractable by `extractWidgetPayload`).

#### Scenario: Valid request renders dual-format
- **WHEN** `handleRenderWidget(catalog, { widget: "table", data: [{ a: 1 }] })` runs
- **THEN** the result SHALL NOT be an error
- **AND** its text content SHALL contain `class="wg-table"`
- **AND** `extractWidgetPayload(result)` SHALL return the payload with `kind: "table"`

#### Scenario: Hints and meta pass through
- **WHEN** the input includes `hints: { columns: ["b"] }` and `meta: { title: "T" }`
- **THEN** the rendered HTML SHALL honor the hint
- **AND** the extracted payload SHALL carry the same `hints` and `meta`

#### Scenario: Registered template kinds render
- **WHEN** the catalog has a registered `invoice` template kind and `handleRenderWidget` is called with `widget: "invoice"` and matching data
- **THEN** the result SHALL contain the template's rendered HTML

#### Scenario: Schema violations surface as structured errors
- **WHEN** the demo `invoice` kind declares a `dataSchema` requiring `lines` and the input omits it
- **THEN** the result SHALL be `isError: true` with `code: "MISSING_FIELD"` and `path: "data.lines"`

### Requirement: Structured data marshalling
When `data` arrives as a string that encodes a JSON object or array (a client-side marshalling artifact), `handleRenderWidget` SHALL parse it before payload assembly, so the rendered output and the embedded payload carry the structured value. Multiply-encoded strings (a JSON string encoding a JSON string encoding a structured value) SHALL be unwrapped the same way, to a bounded depth. Unwrapping SHALL commit only when it reaches an object or array; strings that do not (including quoted plain text and stringified primitives) SHALL pass through unchanged and verbatim as literal string data. When the target kind's `dataSchema` declares string-typed `data` (and neither object nor array), string `data` SHALL bypass unwrapping entirely, making literal JSON-shaped text expressible.

#### Scenario: String-encoded array renders as the array
- **WHEN** `handleRenderWidget(catalog, { widget: "table", data: "[{\"a\":1},{\"a\":2}]" })` runs
- **THEN** the rendered table SHALL contain one row per record, identical to passing the real array
- **AND** the extracted payload's `data` SHALL be the parsed array, not the string

#### Scenario: Double-encoded array renders as the array
- **WHEN** `data` arrives as `JSON.stringify(JSON.stringify(rows))` for a `table` widget
- **THEN** the rendered table SHALL contain one row per record, identical to passing the real array

#### Scenario: Literal strings stay literal
- **WHEN** `data` is `"hello"`, `"[not json"`, or a quoted text like `"\"hello\""` for a `card` widget
- **THEN** the string SHALL pass through verbatim (no partial unwrapping) and render as the card's value

#### Scenario: Marshalled data through the protocol
- **WHEN** an SDK client sends `data` as a JSON-serialized array over the wire
- **THEN** the delivered result SHALL contain the fully rendered rows, not a single fallback row

#### Scenario: String-schema kinds skip unwrapping
- **WHEN** a kind's `dataSchema` is `{ type: "string" }` and `data` is the literal text `"[{\"a\":1}]"`
- **THEN** the rendered output and extracted payload SHALL carry that exact string

### Requirement: Rendering error contract
Failures SHALL be returned as `isError: true` results whose text content is the JSON of a structured error using the existing contract vocabulary: unknown `widget` → `UNKNOWN_KIND`; missing or non-object input, missing `widget`/`data`, or invalid `hints`/`meta` → the corresponding `MISSING_FIELD`/`INVALID_TYPE` error. Error `path`s SHALL use the tool's input vocabulary (`widget`, not the payload's `kind`), and unknown-widget errors SHALL list the available kinds so recovery requires no extra round trip. Handlers SHALL never throw regardless of input.

#### Scenario: Unknown widget id is correctable in one step
- **WHEN** `handleRenderWidget(catalog, { widget: "nope", data: 1 })` runs
- **THEN** the result SHALL have `isError: true`
- **AND** the parsed error SHALL have `code: "UNKNOWN_KIND"` and `path: "widget"`
- **AND** its message SHALL list the catalog's available kinds

#### Scenario: Missing data is a structured error
- **WHEN** `handleRenderWidget(catalog, { widget: "card" })` runs
- **THEN** the parsed error SHALL have `code: "MISSING_FIELD"` and `path: "data"`

#### Scenario: Garbage input never throws
- **WHEN** `handleRenderWidget(catalog, x)` runs for `null`, `42`, `"str"`, and `[]`
- **THEN** each SHALL return an `isError: true` result with a structured error

### Requirement: Runnable server and SDK interoperability
The repository SHALL provide `examples/mcp-server/main.ts` wiring the definitions and handlers onto an official-SDK MCP server over stdio (with the invoice template registered), started by `npm run mcp` using devDependencies only. The test suite SHALL verify via the SDK's in-memory transport that `list_widgets` and `render_widget` round-trip through the real protocol, including the `isError` path for an unknown widget.

#### Scenario: Protocol round trip
- **WHEN** an in-memory SDK client calls `render_widget` with `{ widget: "card", data: { title: "T" } }`
- **THEN** the delivered result SHALL contain HTML with `class="wg-card"` and an extractable widgentic payload

#### Scenario: Discovery through the protocol
- **WHEN** an in-memory SDK client calls `list_widgets`
- **THEN** the delivered result SHALL parse to the catalog's descriptor list

#### Scenario: Error result through the protocol
- **WHEN** an in-memory SDK client calls `render_widget` with an unknown widget id
- **THEN** the delivered result SHALL have `isError: true` with the `UNKNOWN_KIND` JSON error

#### Scenario: Dependencies stay dev-only
- **WHEN** `package.json` is inspected after this change
- **THEN** the SDK and tsx SHALL appear only under `devDependencies` and no `dependencies` section SHALL exist

### Requirement: Output format selection
`render_widget` SHALL accept `format?: "both" | "html" | "widget" | "page"` (default `"both"`, the current dual-block behavior). `"html"` SHALL return only the fragment text block; `"widget"` only the widgentic resource block; `"page"` SHALL return a self-contained styled HTML document (doctype, inlined base stylesheet, the rendered fragment) as the text block, keeping the widgentic resource block. An unrecognized `format` SHALL return `INVALID_TYPE` at `path: "format"`.

#### Scenario: Page output is self-contained and styled
- **WHEN** `render_widget` runs with `format: "page"`
- **THEN** the text block SHALL start with `<!doctype html>` and contain the base stylesheet and the widget markup
- **AND** the document SHALL style `body` background, text color, and font from the `--wg-*` tokens, so themes recolor the whole page
- **AND** the result SHALL still contain the widgentic resource block

#### Scenario: Registered kind styles are included
- **WHEN** a kind registered with `styles` renders with `format: "page"`
- **THEN** the document SHALL contain the CSS generated from that kind's styles

#### Scenario: Single-block formats
- **WHEN** `format: "html"` or `format: "widget"` is used
- **THEN** the result SHALL contain only the corresponding block

### Requirement: Themed page output
`render_widget` SHALL accept `theme?: <token map>` validated by the theming capability's rules. With `format: "page"`, valid themes SHALL be applied to the document via generated `--wg-*` declarations; invalid themes SHALL return `INVALID_TYPE` at `path: "theme.<token>"` naming the offending token. A valid `theme` SHALL also be embedded as a top-level `theme` field in the widgentic payload block regardless of format — riding the contract's unknown-field passthrough — so natively mounting hosts can honor it (advisory; hosts own their scope).

#### Scenario: Dark-themed page
- **WHEN** `render_widget` runs with `format: "page"` and `theme: { bg: "#0f131c" }`
- **THEN** the document SHALL contain `--wg-bg: #0f131c`

#### Scenario: Theme travels in the payload for native hosts
- **WHEN** `render_widget` runs with a valid `theme` and any format
- **THEN** the extracted payload SHALL carry that `theme` as a top-level field
- **AND** contract validation of the payload SHALL still succeed (unknown-field passthrough)

#### Scenario: Unsafe theme values are structured errors
- **WHEN** `theme` contains `{ bg: "url(https://evil.example)" }`
- **THEN** the result SHALL be `isError: true` with `error.path: "theme.bg"`

### Requirement: Theme discovery tool
The server SHALL expose `list_theme_tokens` (no input): a discovery tool returning the theming vocabulary as JSON — every token name with its light default, ready-made presets (at least `dark`), and the value rules (CSS strings only; unsafe values rejected) — so remote agents can construct valid themes without reading source. `handleListThemeTokens()` SHALL be a pure, catalog-free handler.

#### Scenario: Tokens, defaults, and presets are discoverable
- **WHEN** `handleListThemeTokens()` runs
- **THEN** the parsed result SHALL list every registry token with its default value
- **AND** SHALL include a `dark` preset that passes theme validation
- **AND** SHALL state the value rules

#### Scenario: Discoverable through the protocol
- **WHEN** an SDK client lists tools and calls `list_theme_tokens`
- **THEN** the tool SHALL appear alongside `list_widgets` and `render_widget`
- **AND** the delivered result SHALL parse to the token listing
