# mcp-server — Delta: capability-aware slimming + hint diagnostics

## ADDED Requirements

### Requirement: Capability-aware default output
`handleRenderWidget` SHALL accept `options.slim: boolean` (default false). In slim mode, the default-format result's `content` SHALL be a one-line text block — naming the rendered kind, stating that the visual is already displayed to the user, and instructing that the data not be restated as text — followed by the widgentic payload block; the full-HTML text block SHALL be omitted. Explicit `format` values (`html`, `widget`, `page`, `app`) SHALL keep their exact non-slim contracts regardless of `options.slim`, and `structuredContent` SHALL be identical between slim and full modes. The runnable server SHALL resolve the slim signal as: session-negotiated UI capability when available (either direction), else the `WIDGENTIC_ASSUME_UI` environment default (`1`/`true` enables), else full output.

#### Scenario: Slim default output for Apps hosts
- **WHEN** `handleRenderWidget(catalog, { widget: "card", data: { a: 1 } }, { slim: true })` runs
- **THEN** the content SHALL be exactly one short text block (naming `card`, and stating the data must not be restated) plus the widgentic payload block
- **AND** no content block SHALL contain the rendered HTML
- **AND** `structuredContent` SHALL deep-equal the non-slim render's `structuredContent`

#### Scenario: Explicit formats are never slimmed
- **WHEN** the same call adds `format: "html"` (or `page`, `app`, `widget`)
- **THEN** the output SHALL match the existing format contract exactly, `options.slim` notwithstanding

#### Scenario: Default resolution preserves current behavior
- **WHEN** no UI capability was negotiated and `WIDGENTIC_ASSUME_UI` is unset
- **THEN** the served default-format output SHALL carry the full-HTML text block as today

### Requirement: Hint diagnostics surfacing
`handleRenderWidget` SHALL run the catalog's hint-coherence analysis on every successful render and, when diagnostics exist: append a compact `Hint notes:` section listing each `hint: message` to the model-facing text block (in both slim and full modes; the `format: "page"` text is a browser-facing document and the `widget` format has no text block — those carry diagnostics via `structuredContent` only), and include the structured diagnostics array as `structuredContent.diagnostics`. Diagnostics SHALL never set `isError`, never alter the rendered markup, and never appear when the analysis is empty (no `Hint notes:` text and no `structuredContent.diagnostics` key).

#### Scenario: Misaimed hint produces a note without failing
- **WHEN** `render_widget` renders a valid table with `hints: { colums: ["a"] }`
- **THEN** the result SHALL have `isError` unset, the text SHALL contain `Hint notes:` with a `did you mean` suggestion for `columns`
- **AND** `structuredContent.diagnostics[0].code` SHALL be `"UNKNOWN_HINT"`

#### Scenario: Clean hints leave output untouched
- **WHEN** a render's hints are fully coherent
- **THEN** the text SHALL contain no `Hint notes:` and `structuredContent` SHALL have no `diagnostics` key

## MODIFIED Requirements

### Requirement: Structured content for app templates
Every successful `render_widget` result SHALL carry `structuredContent: { html, css, payload }` — the rendered fragment, the generated theme/kind CSS, and the validated payload — so a host-mounted app template can render any call's result via the MCP Apps `ui/notifications/tool-result` flow, regardless of the requested `format`. Per the Apps convention, `structuredContent` is presentation data, not model context. When hint diagnostics exist for the render, `structuredContent` SHALL additionally carry them as a `diagnostics` array; the key SHALL be absent when there are none.

#### Scenario: Structured content on default renders
- **WHEN** `render_widget` runs with no `format` and a valid payload
- **THEN** the result SHALL include `structuredContent.html` containing the widget markup
- **AND** `structuredContent.payload.kind` SHALL match the rendered widget

#### Scenario: Theme and styles reach the template channel
- **WHEN** a render includes a valid `theme` and the kind has registered styles
- **THEN** `structuredContent.css` SHALL contain the `--wg-*` declarations and the kind's style rules

#### Scenario: Diagnostics ride the template channel when present
- **WHEN** a render produces hint diagnostics
- **THEN** `structuredContent.diagnostics` SHALL be the same array surfaced in the `Hint notes:` text
