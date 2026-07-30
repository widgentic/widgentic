## ADDED Requirements

### Requirement: App format output
`render_widget` SHALL accept `format: "app"`, returning content composed of: a one-line text fallback naming the widget, an embedded resource block with `uri: "ui://widgentic/page/<kind>"` and the MCP Apps mime type `"text/html;profile=mcp-app"` whose text is the self-contained styled page (identical composition to `format: "page"` — themed body, registered kind styles, theme tokens) for legacy embedded-resource hosts, and the widgentic JSON payload block. The emitted page SHALL contain no scripts and no external references. `WIDGENTIC_UI_URI_PREFIX` and `WIDGENTIC_APP_MIME_TYPE` SHALL be exported for interop.

#### Scenario: App result carries all three blocks
- **WHEN** `render_widget` runs with `format: "app"` and a valid payload
- **THEN** the content SHALL contain a text block, a `text/html;profile=mcp-app` resource block under the `ui://widgentic/page/` prefix, and the widgentic payload block
- **AND** `extractWidgetPayload` SHALL still return the payload

#### Scenario: The html resource is the themed page
- **WHEN** `format: "app"` runs with a `theme` and a kind with registered styles
- **THEN** the html resource text SHALL start with `<!doctype html>` and contain the theme's `--wg-*` declarations and the kind's style rules

#### Scenario: App pages are sandbox-safe
- **WHEN** the html resource text is inspected for any `app` render
- **THEN** it SHALL contain no `<script>`, no `http(s)://` references, and no `url(` values

#### Scenario: Deterministic URI per kind
- **WHEN** the same kind renders twice with `format: "app"`
- **THEN** both results SHALL use the same `ui://widgentic/page/<kind>` URI

### Requirement: Structured content for app templates
Every successful `render_widget` result SHALL carry `structuredContent: { html, css, payload }` — the rendered fragment, the generated theme/kind CSS, and the validated payload — so a host-mounted app template can render any call's result via the MCP Apps `ui/notifications/tool-result` flow, regardless of the requested `format`. Per the Apps convention, `structuredContent` is presentation data, not model context.

#### Scenario: Structured content on default renders
- **WHEN** `render_widget` runs with no `format` and a valid payload
- **THEN** the result SHALL include `structuredContent.html` containing the widget markup
- **AND** `structuredContent.payload.kind` SHALL match the rendered widget

#### Scenario: Theme and styles reach the template channel
- **WHEN** a render includes a valid `theme` and the kind has registered styles
- **THEN** `structuredContent.css` SHALL contain the `--wg-*` declarations and the kind's style rules

### Requirement: Formal Apps declaration at the wiring layer
The runnable server SHALL declare the tool↔UI linkage per the MCP Apps specification using the official `@modelcontextprotocol/ext-apps` server helpers: `render_widget` registered with `_meta.ui.resourceUri: "ui://widgentic/app.html"`, and the app template registered as a resource with mime type `"text/html;profile=mcp-app"`. The server SHALL detect the client's Apps capability (`extensions["io.modelcontextprotocol/ui"]`) after initialization and note the outcome on stderr. `src/mcp-server/` SHALL remain free of SDK and host-flavor specifics.

#### Scenario: Tool declares its template
- **WHEN** an SDK client lists tools
- **THEN** `render_widget` SHALL carry `_meta.ui.resourceUri` pointing at the app template resource

#### Scenario: Non-Apps hosts keep working
- **WHEN** a client without the Apps capability connects
- **THEN** all tools SHALL behave exactly as before (text/page/widget outputs), with the template simply unmounted

### Requirement: App template loader
The repository SHALL provide the app template (`ui://widgentic/app.html`): a self-contained document with the widgentic base stylesheet and a minimal inline bridge implementing the MCP Apps iframe protocol — the `ui/initialize` handshake (protocol version `2026-01-26`), the `ui/notifications/initialized` notification, `ping`/`ui/resource-teardown` responders, a `ui/notifications/tool-input` placeholder state, and a `ui/notifications/tool-result` listener that renders `structuredContent` (`css` via style text, `html` into the root), with ResizeObserver-driven `ui/notifications/size-changed` reporting. The template SHALL integrate host context (from the initialize result and `host-context-changed`): theme applied as `data-theme`/`color-scheme`, host style variables set on the document root and flowing into the `--wg-*` tokens with widgentic's light literals as final fallback, and safe-area insets applied as body padding. The template SHALL reference no external resources and declare no CSP domains (strictest sandbox).

#### Scenario: Host context is honored
- **WHEN** the host's initialize result or a `host-context-changed` notification carries theme, style variables, or safe-area insets
- **THEN** the template SHALL apply them
- **AND** an explicit widgentic `theme` in `structuredContent.css` SHALL override host-derived token values

#### Scenario: Error results replace the placeholder
- **WHEN** a `tool-result` notification arrives with `isError` or without `structuredContent`
- **THEN** the template SHALL replace any pending placeholder with the result's error message text
- **AND** SHALL never remain in a stale "Rendering…" state

#### Scenario: Template serves with the Apps mime type
- **WHEN** an SDK client reads `ui://widgentic/app.html`
- **THEN** the contents SHALL have `mimeType: "text/html;profile=mcp-app"`, start with `<!doctype html>`, and contain the `ui/initialize` handshake and `tool-result` listener

#### Scenario: Template is network-isolated
- **WHEN** the template is inspected
- **THEN** it SHALL contain no `http(s)://` references and no imports — the bridge is inline

## MODIFIED Requirements

### Requirement: Output format selection
`render_widget` SHALL accept `format?: "both" | "html" | "widget" | "page" | "app"` (default `"both"`, the current dual-block behavior). `"html"` SHALL return only the fragment text block; `"widget"` only the widgentic resource block; `"page"` SHALL return a self-contained styled HTML document (doctype, inlined base stylesheet, the rendered fragment) as the text block, keeping the widgentic resource block; `"app"` SHALL return the app composition (text fallback, `text/html` `ui://` resource, widgentic payload block). An unrecognized `format` SHALL return `INVALID_TYPE` at `path: "format"`.

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
