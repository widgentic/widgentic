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

### Requirement: App format output
`render_widget` SHALL accept `format: "app"`, returning content composed of: a one-line text fallback naming the widget, an embedded resource block with `uri: "ui://widgentic/page/<kind>"` and the MCP Apps mime type `"text/html;profile=mcp-app"` whose text is the self-contained styled page (identical composition to `format: "page"` — themed body, registered kind styles, theme tokens) for legacy embedded-resource hosts, and the widgentic JSON payload block. The emitted page SHALL contain no scripts; the only external references permitted are image sources inside widget content that passed the shared `isSafeImageSrc` guard (`http(s)` or `data:image/*`). `WIDGENTIC_UI_URI_PREFIX` and `WIDGENTIC_APP_MIME_TYPE` SHALL be exported for interop.

#### Scenario: App result carries all three blocks
- **WHEN** `render_widget` runs with `format: "app"` and a valid payload
- **THEN** the content SHALL contain a text block, a `text/html;profile=mcp-app` resource block under the `ui://widgentic/page/` prefix, and the widgentic payload block
- **AND** `extractWidgetPayload` SHALL still return the payload

#### Scenario: Validated image sources may appear in the page
- **WHEN** `render_widget` runs with `format: "app"` for a `card` whose field value is `https://cdn.example/logo.png`
- **THEN** the emitted page SHALL contain an `img` element referencing that URL
- **AND** the page SHALL still contain no `script` elements and no other external references (no external stylesheets, fonts, or frames)

#### Scenario: The html resource is the themed page
- **WHEN** `format: "app"` runs with a `theme` and a kind with registered styles
- **THEN** the html resource text SHALL start with `<!doctype html>` and contain the theme's `--wg-*` declarations and the kind's style rules

#### Scenario: App pages are sandbox-safe
- **WHEN** the html resource text is inspected for any `app` render
- **THEN** it SHALL contain no `<script>` and no `url(` values
- **AND** any `http(s)://` reference SHALL appear only as the `src` of an `img` element

#### Scenario: Deterministic URI per kind
- **WHEN** the same kind renders twice with `format: "app"`
- **THEN** both results SHALL use the same `ui://widgentic/page/<kind>` URI

### Requirement: Structured content for app templates
Every successful `render_widget` result SHALL carry `structuredContent: { html, css, payload, tree }` — the rendered fragment, the generated theme/kind CSS, the validated payload, and the render tree (`WidgetNode`, JSON-serializable) the fragment was serialized from — so a host-mounted app template can render any call's result via the MCP Apps `ui/notifications/tool-result` flow, regardless of the requested `format`. `tree` and `html` SHALL be projections of the same render (never divergent). Per the Apps convention, `structuredContent` is presentation data, not model context. When hint diagnostics exist for the render, `structuredContent` SHALL additionally carry them as a `diagnostics` array; the key SHALL be absent when there are none.

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

#### Scenario: Tree and html are the same render
- **WHEN** any successful render is inspected
- **THEN** serializing `structuredContent.tree` with `renderToHtml` SHALL reproduce `structuredContent.html` exactly

### Requirement: Formal Apps declaration at the wiring layer
The runnable server SHALL declare the tool↔UI linkage per the MCP Apps specification using the official `@modelcontextprotocol/ext-apps` server helpers: `render_widget` registered with `_meta.ui.resourceUri: "ui://widgentic/app.html"`, and the app template registered as a resource with mime type `"text/html;profile=mcp-app"`. The server SHALL detect the client's Apps capability (`extensions["io.modelcontextprotocol/ui"]`) after initialization and note the outcome on stderr. `src/mcp-server/` SHALL remain free of SDK and host-flavor specifics.

#### Scenario: Tool declares its template
- **WHEN** an SDK client lists tools
- **THEN** `render_widget` SHALL carry `_meta.ui.resourceUri` pointing at the app template resource

#### Scenario: Non-Apps hosts keep working
- **WHEN** a client without the Apps capability connects
- **THEN** all tools SHALL behave exactly as before (text/page/widget outputs), with the template simply unmounted

### Requirement: App template loader
The repository SHALL provide the app template (`ui://widgentic/app.html`): a self-contained document with the widgentic base stylesheet and a minimal inline bridge implementing the MCP Apps iframe protocol — the `ui/initialize` handshake (protocol version `2026-01-26`), the `ui/notifications/initialized` notification, `ping`/`ui/resource-teardown` responders, a `ui/notifications/tool-input` placeholder state, and a `ui/notifications/tool-result` listener that renders `structuredContent` (`css` via style text; the widget mounted natively from `structuredContent.tree` when present — DOM built with `createElement`/`createTextNode`, tag and attribute names held to the serializer's allowlists, `on*` attributes skipped — with subsequent tool-results patching the mounted DOM in place, preserving node identity where shape matches; `html` injected into the root only as the fallback when `tree` is absent), with ResizeObserver-driven `ui/notifications/size-changed` reporting. The template SHALL integrate host context (from the initialize result and `host-context-changed`): theme applied as `data-theme`/`color-scheme`, host style variables set on the document root and flowing into the `--wg-*` tokens with widgentic's light literals as final fallback, and safe-area insets applied as body padding. The template SHALL reference no external resources and declare no CSP domains (strictest sandbox).

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

#### Scenario: Native mount matches the serialized fragment
- **WHEN** a tool-result with a `tree` is mounted by the template's builder
- **THEN** the mounted container SHALL be DOM-equivalent to the render's `html` fragment (identical once both are parsed — serializer escaping differences aside)

#### Scenario: Successive results patch in place
- **WHEN** two tool-results for same-shaped trees arrive in sequence
- **THEN** the second SHALL patch the existing DOM (the root element object is preserved) rather than rebuilding it

#### Scenario: Mounter skips unsafe names
- **WHEN** a (tampered) tree carries an `onclick` attribute or an invalid tag name
- **THEN** the mounted DOM SHALL contain neither

### Requirement: Server-side image inlining for iframe surfaces
Because Apps-host sandboxes block external `img-src` while permitting `data:`, the runnable server SHALL, when inlining is enabled (the default; `WIDGENTIC_INLINE_IMAGES=0` disables), rewrite `img` sources on the iframe-facing surfaces of a `render_widget` result — the `structuredContent` HTML fragment, the `structuredContent.tree` render tree (element nodes with `tag: "img"`), and the `ui://widgentic/page/<kind>` embedded resource — replacing each `http(s)` source whose fetch succeeds with a `data:<content-type>;base64,` URI; the tree and HTML projections SHALL be rewritten from the same fetch results and never disagree. The model-facing HTML text block and `format: "page"` output SHALL keep original URLs. Each unique URL SHALL be fetched at most once per render. The fetch SHALL be guarded: `https` scheme only; hostnames resolving to loopback, private (RFC1918), link-local (including 169.254.169.254), carrier-grade NAT, or IPv6 unique-local/link-local addresses SHALL be rejected, re-validated on every redirect hop (at most 3); the response `Content-Type` MUST be `image/*`; per-image size SHALL be capped (1 MiB) and the fetch SHALL time out (~4 s); at most 8 images SHALL be inlined per render. Any failure SHALL leave the original URL in place (alt-text fallback) without failing the render.

#### Scenario: External image becomes a data URI in iframe surfaces only
- **WHEN** `render_widget` renders a table whose cell is a fetchable `https` image URL and inlining is enabled
- **THEN** the `structuredContent` fragment and the `ui://` resource SHALL carry the image as `data:image/...;base64,` with no `http(s)` `img` source remaining
- **AND** the plain HTML text block SHALL still reference the original URL

#### Scenario: The tree is rewritten in lockstep with the html
- **WHEN** inlining succeeds for a render that carries `structuredContent.tree`
- **THEN** every `img` element node in the tree SHALL carry the same `data:` URI as the corresponding `img` in `structuredContent.html`

#### Scenario: Private-network targets are refused
- **WHEN** a widget value is `https://169.254.169.254/latest/meta-data.png` or an `https` URL whose hostname resolves to a private address
- **THEN** no request body SHALL be consumed from the target and the original URL SHALL remain in the output

#### Scenario: Non-image and oversized responses are not inlined
- **WHEN** the fetched response has a non-`image/*` content type, or exceeds the size cap
- **THEN** the original URL SHALL remain and the render SHALL still succeed

#### Scenario: Inlining can be disabled
- **WHEN** `WIDGENTIC_INLINE_IMAGES=0` is set
- **THEN** all surfaces SHALL keep original image URLs

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
