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
- **THEN** parsing the result text SHALL yield descriptors for `card`, `table`, `tree`, `group`, and `invoice`

#### Scenario: Listing carries agent-usable metadata
- **WHEN** the built-in `table` descriptor is read from the listing
- **THEN** it SHALL include `description`, `dataShape`, and a `dataExample` an agent can imitate

### Requirement: Widget rendering tool
`handleRenderWidget(catalog, input)` SHALL accept `{ widget, data, hints?, meta?, format?, theme? }`, validate the widget id against the catalog, the assembled payload against the contract, and `data` against the kind's `dataSchema` when present, render on success, and return content per the selected `format` — by default the rendered HTML as a text block **and** the validated payload as a widgentic resource block (extractable by `extractWidgetPayload`). The tool description SHALL steer callers who need several widgets in one response toward a single `group` render instead of repeated calls.

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

#### Scenario: A group of mixed kinds renders in one call
- **WHEN** `handleRenderWidget` is called with `widget: "group"` and items of kinds `card` and a stored custom template kind
- **THEN** the result SHALL contain both items' markup in one response
- **AND** the tool description SHALL mention the group steering

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
The repository SHALL provide `examples/mcp-server/main.ts` wiring the library's server assembly onto stdio with that example's compiled-in custom widgets registered (the invoice template among them) — a self-contained demonstration of hosting widgentic with your own widgets, importing only public `@widgentic/*` entries — started by `npm run mcp` using devDependencies only. The test suite SHALL verify via the SDK's in-memory transport that `list_widgets` and `render_widget` round-trip through the real protocol against the library assembly, including the `isError` path for an unknown widget.

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
- **WHEN** the `@widgentic/mcp` manifest is inspected
- **THEN** the MCP SDK packages SHALL appear only as optional `peerDependencies` (for the `./sdk` entry), `@widgentic/core` as its sole `dependencies` entry, and tsx only under the workspace's `devDependencies`

### Requirement: Server assembly is a library export
The package SHALL export `createWidgenticServer(options?: { catalog?, themes? })` from the `@widgentic/mcp/sdk` entry, producing a connectable official-SDK `McpServer` with the full wiring: the tools, the formal Apps declaration, the app-template resource, capability-aware slimming, and image inlining. Its MCP SDK packages SHALL be optional peer dependencies — installed only by hosts importing this entry — and the base `@widgentic/mcp` entry SHALL remain importable without any SDK present. With no options the assembly SHALL serve exactly the built-in kinds and built-in themes; compiled-in extras are the host's explicit choice via `catalog`.

#### Scenario: One assembly serves every transport
- **WHEN** the HTTP entry, the stdio example, and the in-memory interop tests construct their servers
- **THEN** each SHALL use the library's `createWidgenticServer`, differing only in the catalog/themes they pass and the transport they connect

#### Scenario: The default is the built-ins
- **WHEN** `createWidgenticServer()` is constructed with no options and `list_widgets` is called
- **THEN** the descriptor list SHALL contain exactly the built-in kinds

#### Scenario: The base entry stays SDK-free
- **WHEN** the modules reachable from the `@widgentic/mcp` entry are inspected
- **THEN** none SHALL import from an MCP SDK package — the SDK surface exists only behind `@widgentic/mcp/sdk`

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
`render_widget` SHALL accept `theme?: <token map> | <registered theme name>` — an object validated by the theming capability's rules, or a string resolved against the server's theme registry. An unknown theme name SHALL return `UNKNOWN_THEME` at `path: "theme"` with a message listing the available names, so recovery needs no second round trip. With `format: "page"`, the resolved theme SHALL be applied to the document via generated `--wg-*` declarations; invalid theme objects SHALL return `INVALID_TYPE` at `path: "theme.<token>"` naming the offending token. A resolved `theme` SHALL also be embedded as a top-level `theme` field in the widgentic payload block regardless of format — riding the contract's unknown-field passthrough — so natively mounting hosts can honor it (advisory; hosts own their scope); the payload SHALL carry the resolved token map, not the name.

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

#### Scenario: A registered name resolves to its tokens
- **WHEN** `render_widget` runs with `theme: "dark"` and `format: "page"`
- **THEN** the document SHALL contain the dark preset's `--wg-bg` value
- **AND** the payload's `theme` field SHALL be the resolved token map

#### Scenario: Unknown theme names are self-sufficient errors
- **WHEN** `render_widget` runs with `theme: "midnight"` and no such entry is registered
- **THEN** the result SHALL be `isError: true` with `error.code: "UNKNOWN_THEME"`, `error.path: "theme"`, and a message listing the registered names

### Requirement: Theme discovery tool
The server SHALL expose `list_theme_tokens` (no input): a discovery tool returning the theming vocabulary as JSON — every token with its light default, its value `type` (`color`, `dimension`, `number`, `font-family`, `font-weight`, `shadow`) and a one-line `use`, ready-made presets (at least `dark`), the value rules (CSS strings only; unsafe values rejected), and the custom-variable rule (`x-*` keys are accepted and emitted as `--wg-x-*`) — so remote agents can construct valid themes without reading source. `handleListThemeTokens()` SHALL be a pure, catalog-free handler.

#### Scenario: Tokens, defaults, and presets are discoverable
- **WHEN** `handleListThemeTokens()` runs
- **THEN** the parsed result SHALL list every registry token with its default value, declared `type`, and `use`
- **AND** SHALL include a `dark` preset that passes theme validation
- **AND** SHALL state the value rules

#### Scenario: Discoverable through the protocol
- **WHEN** an SDK client lists tools and calls `list_theme_tokens`
- **THEN** the tool SHALL appear alongside `list_widgets` and `render_widget`
- **AND** the delivered result SHALL parse to the token listing

#### Scenario: The custom-variable rule is documented
- **WHEN** `handleListThemeTokens()` runs
- **THEN** the rules text SHALL explain that `x-*` keys are accepted as custom variables

### Requirement: Named theme listing tool
The server SHALL expose `list_themes` (no input): a discovery tool returning every registered theme as `{ name, label?, description?, extends?, tokens }` so an agent can pick a theme by name instead of composing tokens. `handleListThemes(registry)` SHALL be a pure handler taking the registry explicitly, mirroring `handleListWidgets(catalog)`.

#### Scenario: Registered themes are listed with their tokens
- **WHEN** `handleListThemes(registry)` runs on a registry holding `light`, `dark`, and a registered `brand`
- **THEN** the parsed result SHALL contain all three entries with their token maps
- **AND** each listed name SHALL be usable as `render_widget`'s `theme` input

#### Scenario: Discoverable through the protocol
- **WHEN** an SDK client lists tools
- **THEN** `list_themes` SHALL appear alongside `list_widgets`, `list_theme_tokens`, and `render_widget`

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
Every successful `render_widget` result SHALL carry `structuredContent: { html, css, payload, tree }` — the rendered fragment, the generated theme/kind CSS, the validated payload, and the render tree (`WidgetNode`, JSON-serializable) the fragment was serialized from — so a host-mounted app template can render any call's result via the MCP Apps `ui/notifications/tool-result` flow, regardless of the requested `format`. `tree` and `html` SHALL be projections of the same render (never divergent). For `group` renders, `css` SHALL union the registered styles of the group and every distinct item kind, each kind's block exactly once. Per the Apps convention, `structuredContent` is presentation data, not model context. When hint diagnostics exist for the render, `structuredContent` SHALL additionally carry them as a `diagnostics` array; the key SHALL be absent when there are none. When the rendered kind declares a `load` binding and the caller holds the `execute` scope, `structuredContent` SHALL additionally carry `load: { id: "load", widget, args }` with the binding's input mapping resolved against the rendered payload; the key SHALL be absent otherwise. For a `group` render, each item whose kind declares `load` SHALL contribute a descriptor to `structuredContent.loads` (an array; each entry stamped with the item's `widget` and `at`), which the frame executes one after another. `execute_action` results SHALL carry the same `structuredContent` shape.

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

#### Scenario: Group renders union item styles
- **WHEN** a `group` render includes items of two custom kinds with registered styles
- **THEN** `structuredContent.css` SHALL contain both kinds' style rules exactly once each

#### Scenario: Group items load one after another
- **WHEN** a `group` renders two items whose kinds declare `load`, for a caller with `execute`
- **THEN** `structuredContent.loads` SHALL carry two descriptors with `at: "data.items.0"` and `at: "data.items.1"`, and the frame SHALL execute the second only after the first has settled

#### Scenario: Load descriptors ride the template channel
- **WHEN** a kind with a `load` binding mapping `{ id: "record.id" }` renders `{ record: { id: 42 } }` for a caller with `execute`
- **THEN** `structuredContent.load` SHALL be `{ id: "load", widget: <kind>, args: { id: 42 } }`
- **AND** for a caller without `execute`, or a kind without `load`, the key SHALL be absent

### Requirement: Formal Apps declaration at the wiring layer
The server assembly SHALL declare the tool↔UI linkage per the MCP Apps specification using the official `@modelcontextprotocol/ext-apps` server helpers: `render_widget` registered with `_meta.ui.resourceUri: "ui://widgentic/app.html"`, and the app template registered as a resource with mime type `"text/html;profile=mcp-app"`. When the assembly is given `resourceDomains` (a list of hostnames the operator trusts the frame to load assets from), the app resource SHALL declare them as `_meta.ui.csp.resourceDomains` (the Apps CSP block) and the same list SHALL govern the inliner's declared-domain skip; with none given, nothing is declared and every external image faces inlining. The list is deployment configuration — stored widgets and render inputs SHALL have no way to extend it. The assembly SHALL detect the client's Apps capability (`extensions["io.modelcontextprotocol/ui"]`) after initialization and note the outcome on stderr. SDK and host-flavor specifics SHALL live only behind the `@widgentic/mcp/sdk` entry; the base `@widgentic/mcp` entry remains SDK-free (per the server-assembly requirement).

#### Scenario: Tool declares its template
- **WHEN** an SDK client lists tools
- **THEN** `render_widget` SHALL carry `_meta.ui.resourceUri` pointing at the app template resource

#### Scenario: Non-Apps hosts keep working
- **WHEN** a client without the Apps capability connects
- **THEN** all tools SHALL behave exactly as before (text/page/widget outputs), with the template simply unmounted

#### Scenario: Declared domains reach the resource metadata
- **WHEN** the assembly is created with `resourceDomains: ["cdn.example.com"]` and an SDK client reads the app resource
- **THEN** the resource SHALL carry `_meta.ui.csp.resourceDomains: ["cdn.example.com"]`
- **AND** with no domains configured the key SHALL be absent

### Requirement: App template loader
The repository SHALL provide the app template (`ui://widgentic/app.html`): a self-contained document with the widgentic base stylesheet and a minimal inline bridge implementing the MCP Apps iframe protocol — the `ui/initialize` handshake (protocol version `2026-01-26`), the `ui/notifications/initialized` notification, `ping`/`ui/resource-teardown` responders, a streaming input preview — on `ui/notifications/tool-input-partial` (and `tool-input`), built-in kinds (`card`, `table`, `tree`, and `group`s whose items are built-ins) SHALL mount a client-built preview tree from the partial `{ widget, data, hints }` through the same native mounter, marked visibly in-progress, with successive partials patching in place; custom and unknown kinds SHALL show a generating-state skeleton naming the kind, never a guessed render; previews use the built-ins' `wg-*` classes and content but skip image inlining, diagnostics, and validation (the tool result stays the only authority), and the preview state SHALL be replaced by the `tool-result` render (or restored to the placeholder on `tool-cancelled`) — and a `ui/notifications/tool-result` listener that renders `structuredContent` (`css` via style text; the widget mounted natively from `structuredContent.tree` when present — DOM built with `createElement`/`createTextNode`, tag and attribute names held to the serializer's allowlists, `on*` attributes skipped — with subsequent tool-results patching the mounted DOM in place, preserving node identity where shape matches; `html` injected into the root only as the fallback when `tree` is absent), with ResizeObserver-driven `ui/notifications/size-changed` reporting. Anchor clicks SHALL NEVER navigate the frame — the frame is the widget, and an in-frame navigation to an external origin is sandbox-blocked, replacing the widget with an error page: the template SHALL intercept every anchor click, prevent the default, and ask the host to open http(s)/mailto/tel URLs via a `ui/open-link` request, staying intact when the host denies or does not support it. The template SHALL integrate host context (from the initialize result and `host-context-changed`): theme applied as `data-theme`/`color-scheme`, host style variables set on the document root and flowing into the `--wg-*` tokens with widgentic's light literals as final fallback, and safe-area insets applied as body padding. For registry tokens the host bridge does NOT map, the template SHALL flip to the dark preset's values when the host theme is dark (keyed on the applied `data-theme`), so custom widget styles stay coherent in both modes — host-bridged tokens keep their host-derived values, and an explicit widgentic `theme` SHALL still override in both modes. The template SHALL reference no external resources and declare no CSP domains (strictest sandbox).

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

#### Scenario: Unbridged tokens follow the host theme
- **WHEN** the host applies `data-theme="dark"` and a custom widget style reads `var(--wg-surface)` with no render theme set
- **THEN** the value SHALL be the dark preset's `surface`, not the light default
- **AND** host-bridged tokens (`bg`, `fg`, `accent`, …) SHALL keep their host-derived values
- **AND** a render theme setting `surface` SHALL win over the dark preset

#### Scenario: Links open through the host, never in the frame
- **WHEN** a mounted widget's anchor is clicked
- **THEN** the frame SHALL NOT navigate (default prevented, widget untouched)
- **AND** for an http(s), mailto or tel href the template SHALL send a `ui/open-link` request carrying that URL
- **AND** a denied or unanswered request SHALL leave the widget rendered

#### Scenario: Partial input draws the widget as it streams
- **WHEN** the frame receives successive `tool-input-partial` notifications for a `table` whose `data` grows row by row
- **THEN** each notification SHALL mount/patch a preview table showing the rows received so far, marked as in progress

#### Scenario: The preview approximates the real renderer
- **WHEN** a preview is built for a complete built-in payload
- **THEN** its tree SHALL carry the same `wg-*` structural classes and cell/field content the catalog renderer produces for that payload

#### Scenario: Group previews compose built-in items progressively
- **WHEN** partial input for a `group` streams items of built-in kinds
- **THEN** completed items SHALL preview in the group container while a custom-kind item shows its skeleton

#### Scenario: Custom kinds never get a guessed preview
- **WHEN** partial input names a kind that is not a built-in
- **THEN** the frame SHALL show a generating-state skeleton naming that kind

#### Scenario: The result replaces the preview
- **WHEN** the `tool-result` arrives after previews
- **THEN** the authoritative render SHALL replace the preview through the patcher and the in-progress treatment SHALL be gone

#### Scenario: Hosts without input notifications see no change
- **WHEN** a host sends no input notifications before the result
- **THEN** the template SHALL behave exactly as before for every existing scenario

### Requirement: App template builder is a library export
The `./mcp-server` entry SHALL export `buildAppTemplate(): string`, producing the app template document (`ui://widgentic/app.html`) described by the app template loader requirement. The builder SHALL depend only on other widgentic public entries — no MCP SDK, no deployment code — so any host can serve the loader without copying files out of a deployment.

#### Scenario: The export produces the served template
- **WHEN** `buildAppTemplate()` is called and an SDK client reads `ui://widgentic/app.html` from the runnable server
- **THEN** the resource contents SHALL equal the builder's output

#### Scenario: The builder stays dependency-free
- **WHEN** the module providing `buildAppTemplate` is inspected
- **THEN** it SHALL import only from widgentic public entries and SHALL NOT import from an MCP SDK or from `apps/`

### Requirement: Server-side image inlining for iframe surfaces
Because Apps-host sandboxes block external `img-src` while permitting `data:`, the runnable server SHALL, when inlining is enabled (the default; `WIDGENTIC_INLINE_IMAGES=0` disables), rewrite `img` sources on the iframe-facing surfaces of a `render_widget` result — the `structuredContent` HTML fragment, the `structuredContent.tree` render tree (element nodes with `tag: "img"`), and the `ui://widgentic/page/<kind>` embedded resource — replacing each `http(s)` source whose fetch succeeds with a `data:<content-type>;base64,` URI; the tree and HTML projections SHALL be rewritten from the same fetch results and never disagree. The model-facing HTML text block and `format: "page"` output SHALL keep original URLs. Each unique URL SHALL be fetched at most once per render. The fetch SHALL be guarded: `https` scheme only; hostnames resolving to loopback, private (RFC1918), link-local (including 169.254.169.254), carrier-grade NAT, or IPv6 unique-local/link-local addresses SHALL be rejected, re-validated on every redirect hop (at most 3); the connection SHALL be made to the exact address that passed validation — the fetch SHALL NOT perform its own name resolution, so a DNS answer that changes between validation and connection has no effect — while TLS server-name and the `Host` header keep the original hostname; the response `Content-Type` MUST be `image/*`; per-image size SHALL be capped (1 MiB) and the fetch SHALL time out (~4 s); at most 24 images SHALL be inlined per render, the first N unique fetchable sources in document order. URLs whose hostname is among the deployment's declared resource domains SHALL be left un-inlined — the frame is allowed to load them natively. Any failure SHALL leave the original URL in place (alt-text fallback) without failing the render.

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

#### Scenario: Rebinding between validation and connection is ineffective
- **WHEN** a hostname's resolution passes validation but a subsequent resolution of the same name would return a private address
- **THEN** the connection SHALL still be made to the validated address
- **AND** no request SHALL ever reach the privately-resolved address

#### Scenario: Non-image and oversized responses are not inlined
- **WHEN** the fetched response has a non-`image/*` content type, or exceeds the size cap
- **THEN** the original URL SHALL remain and the render SHALL still succeed

#### Scenario: Declared resource domains are not inlined
- **WHEN** the deployment declares `cdn.example.com` as a resource domain and a widget image source is `https://cdn.example.com/a.png`
- **THEN** the URL SHALL remain in all surfaces (no fetch, no data URI)
- **AND** an image on an undeclared host in the same render SHALL still be inlined

#### Scenario: Inlining can be disabled
- **WHEN** `WIDGENTIC_INLINE_IMAGES=0` is set
- **THEN** all surfaces SHALL keep original image URLs

#### Scenario: Overflow beyond the cap is deterministic
- **WHEN** a render carries more unique fetchable image sources than the cap
- **THEN** the first 24 in document order SHALL be inlined and the rest SHALL keep their original URLs (alt-text fallback in sandboxed frames)

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

### Requirement: Per-request principal resolution
When a store is configured, the runnable server SHALL resolve the caller's principal from the presented API key **before** constructing the request's server, and SHALL serve that principal's composed catalog and theme registry for the whole request. `createWidgenticServer(options?)` SHALL accept the composed `catalog` and `themes` rather than building its own, so the composition (and therefore the trust decision) happens at the transport edge where the key is read. A key that resolves to no principal SHALL fall back to the anonymous catalog — built-ins plus any entries the deployment supplies — never an error, and the server SHALL note the unresolved-key event on stderr **without** logging the key. With no store configured, the server SHALL serve the assembly's catalog to every caller — the library default (built-ins only) unless the host passes its own composed catalog, as the compiled-in example deployment does.

#### Scenario: Two keys see two catalogs
- **WHEN** a request presents principal A's key and another presents principal B's key
- **THEN** `list_widgets` SHALL return A's kinds for the first and B's for the second
- **AND** neither listing SHALL contain the other's kinds
- **AND** both SHALL contain every built-in kind

#### Scenario: A principal's widget renders only for that principal
- **WHEN** principal A owns kind `report` and principal B calls `render_widget` with `widget: "report"`
- **THEN** B's result SHALL be `isError: true` with `code: "UNKNOWN_KIND"` and `report` absent from the available-kinds list

#### Scenario: Themes are resolved per principal too
- **WHEN** principal A owns a `brand` theme
- **THEN** `list_themes` SHALL include it for A and omit it for B
- **AND** `render_widget` with `theme: "brand"` SHALL resolve for A and return `UNKNOWN_THEME` for B

#### Scenario: Unknown keys degrade to anonymous, not to failure
- **WHEN** a request presents a key no principal owns
- **THEN** the tools SHALL still work over the anonymous catalog
- **AND** the key SHALL NOT appear in any log line

#### Scenario: No store configured preserves today's behavior
- **WHEN** the server runs without a store
- **THEN** every caller SHALL see the same catalog: the built-ins, plus exactly the extras the host compiled into the catalog it passed (none, in the hosted deployment; the example's own widgets, in the stdio example)

### Requirement: Composed catalogs never leak between requests
Each request SHALL compose fresh catalog and theme-registry instances; the server SHALL NOT hold a mutable catalog across requests or cache composed instances keyed by anything less specific than the principal. Registration performed while serving one request SHALL NOT be observable in another.

#### Scenario: Sequential requests do not accumulate kinds
- **WHEN** a request for principal A is served, then a request for the anonymous principal
- **THEN** the anonymous listing SHALL NOT contain A's kinds

#### Scenario: Concurrent requests stay isolated
- **WHEN** requests for principals A and B are served concurrently
- **THEN** each response SHALL reflect only its own principal's catalog

### Requirement: Authoring guide tool
The server SHALL expose a read-only `get_authoring_guide` tool whose result is a structured JSON guide containing everything an external agent needs to draft valid widget and theme JSON for its user: the `CustomWidget` shape (`{ kind, template, descriptor }` with the descriptor's fields, including `dataSchemaRef` — a saved shared schema referenced by name IN PLACE of an inline `dataSchema`, never both), the theme entry shape (`{ name, label?, description?, tokens }`), the shared-schema entry shape (`{ name, label?, description?, schema }` — what the user imports in the Data schemas section), the shared-ACTION entry shape (`{ name, label?, description?, definition }` — what the user imports in the Actions section, with both definition kinds and the action name pattern, which is stricter than the identifier charset used for widgets, themes and schemas), the template DSL's node forms (text, `bind`, `each`/`empty`, `when`/`else`, elements with attrs including `{ bind }` values and the attr transforms `{ bind, map, default? }` / `{ bind, prefix }` and the value transform `{ bind, format }` with its closed number/currency/date vocabulary, each taught with its motivating recipe — a status value selecting a `wg-status-*` class, `mailto:`/`tel:` links from bound addresses, and a numeric-string price formatted as a currency) and safety rules (no `on*` attributes, URL scheme allowlist, base64 `data:image/*` on `img src` only, depth and node bounds), the identifier charset and the reserved built-in kinds, the styles rules (`.wg-` selectors, banned constructs), the `dataSchema` subset including its `pattern` bounds, a data-modeling preference (bind only schema-declared properties; `$meta.*` is outside `dataSchema` validation and SHALL be discouraged rather than promoted), a shared-schema rule — when the user names a saved schema, reference it with `dataSchemaRef` and discover its shape with `list_schemas`; do NOT reconstruct it inline, since the copy forks the moment the user edits the shared one —, a shared-ACTION rule — an element binds one with `action: { "ref": "<name>", input?, output? }` and a widget loads one at first render with a `load` binding (http `GET` only); discover what exists with `list_actions` and reference it by name, and when nothing fits DESCRIBE the action the user should author and test in the designer rather than drafting an inline definition with a URL or credentials the agent cannot know —, the token registry with each token's type and use, the per-principal limits — including the caps on shared schemas and shared actions, so an agent can see the ceiling it drafts against —, and a `workflow` section stating that agents draft JSON while users import, validate, and save it in the authenticated designer — registration over MCP does not exist by design. Facts with a live source of truth SHALL be derived from it at call time — including the custom-variable name pattern, the banned style substrings, the style property allowlist, the schema `pattern` length cap, and the action name pattern, each read from its owning constant (reserved kinds from the catalog, limits from the store defaults, tokens from the token registry), never duplicated as prose.

#### Scenario: The guide is discoverable and structured
- **WHEN** an SDK client lists tools and calls `get_authoring_guide`
- **THEN** the tool SHALL appear in the listing with a description telling agents when to use it
- **AND** the result text SHALL parse as JSON containing `widget`, `theme`, `rules`, `limits`, and `workflow` sections

#### Scenario: Derived facts match their sources
- **WHEN** the guide is compared against the live system
- **THEN** its reserved kinds SHALL equal the catalog's built-in kinds, its limits SHALL equal the store's documented defaults, and its token list SHALL equal the token registry's names and types

#### Scenario: A draft built from the guide imports cleanly
- **WHEN** a widget and a theme are constructed following only the guide's shapes and rules
- **THEN** the widget SHALL pass the store's write validation and the designer's import, and the theme SHALL pass theme validation — with no corrections needed

#### Scenario: The guide teaches the write boundary
- **WHEN** the `workflow` section is read
- **THEN** it SHALL state that saving happens in the authenticated designer by the user and that no MCP registration tool exists

#### Scenario: The guide steers away from unvalidated meta binds
- **WHEN** the template rules are read
- **THEN** they SHALL prefer schema-declared properties and mark `$meta.*` as outside `dataSchema` validation, to be avoided or reserved for out-of-band display

#### Scenario: Theme-building tools point at the save path
- **WHEN** `list_theme_tokens` or `list_themes` rules are read
- **THEN** they SHALL tell agents that a theme the user wants to keep is delivered as the importable entry (`{ name, label?, description?, tokens }`) for the designer at widgentic.dev, referencing `get_authoring_guide` — the inline token map styles only one render

#### Scenario: Every stated rule is read from its constant
- **WHEN** the guide's custom-variable pattern, style ban list, style property rule, and pattern length cap are compared with the constants that enforce them
- **THEN** each SHALL equal its source rather than restate it, so a change to the validator cannot leave the guide lying

#### Scenario: The guide teaches shared-schema references
- **WHEN** the widget entry shape and template rules are read
- **THEN** they SHALL document `dataSchemaRef` as referencing a saved schema by name in place of an inline `dataSchema` (never both)
- **AND** they SHALL steer agents to `list_schemas` for the schema's shape and to the reference over an inline reconstruction when the user names a saved schema

#### Scenario: The guide teaches the schema entry shape and its import path
- **WHEN** the guide's shared-schema section is read
- **THEN** it SHALL document the entry shape (`{ name, label?, description?, schema }`) and state that the user imports it in the Data schemas section at widgentic.dev

#### Scenario: The guide teaches the attr transforms with their recipes
- **WHEN** the template rules are read
- **THEN** they SHALL document `{ bind, map, default? }` with a status→class example and `{ bind, prefix }` with a `mailto:`/`tel:` example
- **AND** a widget drafted from the guide using both transforms SHALL pass the store's write validation and the designer's import unchanged

#### Scenario: The guide teaches the format transform
- **WHEN** the template rules are read
- **THEN** they SHALL document `{ bind, format }` with its number, currency and date specs and a currency recipe, deriving the bounds and token vocabulary from the validator's constants
- **AND** a widget drafted from the guide using a currency and a date format SHALL pass the store's write validation unchanged

#### Scenario: The guide teaches the standalone action entry shape and its import path
- **WHEN** the guide's shared-action section is read
- **THEN** it SHALL document the entry shape (`{ name, label?, description?, definition }`) with both definition kinds, SHALL state the action name pattern read from the constant that enforces it, and SHALL state that the user imports the entry in the Actions section at widgentic.dev

#### Scenario: The guide teaches referencing a saved action over inventing one
- **WHEN** the template rules are read
- **THEN** they SHALL document the `action: { "ref": "<name>" }` binding and the widget-level `load` (http `GET` only), SHALL steer agents to `list_actions` for what the user already has, and SHALL state that an action the user has not saved is DESCRIBED for the designer rather than drafted with an invented URL or credential

#### Scenario: The published limits cover every entry an agent drafts
- **WHEN** the `limits` section is read
- **THEN** it SHALL carry the caps on shared schemas and shared actions beside the widget and theme caps, each equal to the store's documented default

### Requirement: Schema listing tool
The server SHALL expose a read-only `list_schemas` tool returning the presented key's stored shared schemas — each entry's `name`, optional `label` and `description`, and the `schema` object itself, so an agent asked to build a widget "using schema xyz" can bind the schema's actual properties and draft a `dataExample` that validates. The listing SHALL serve the principal resolved from the request's key, exactly like `list_widgets`: an anonymous or unknown key sees an empty list, never an error. The tool's wire-visible description SHALL steer agents to reference a listed schema by name (`descriptor.dataSchemaRef`) rather than copying its body inline. The schemas listed are the STORED entries — unlike `list_widgets`, whose descriptors carry references already resolved. Reading the schemas SHALL cost nothing on renders: the store is consulted when the tool is called, not when the server is constructed.

#### Scenario: The listing serves the key's own schemas
- **WHEN** `list_schemas` is called with a key whose principal stores a `person` schema
- **THEN** the result SHALL parse as JSON containing that entry's `name` and `schema` object
- **AND** the same call with an unknown or absent key SHALL return an empty list, not an error

#### Scenario: The wire description steers to references
- **WHEN** an SDK client lists tools
- **THEN** `list_schemas` SHALL appear with a description telling agents to reference a saved schema by name via `dataSchemaRef` instead of reconstructing it inline

#### Scenario: Listing schemas never taxes renders
- **WHEN** `render_widget` is called on a server constructed with a schema source
- **THEN** the schema source SHALL NOT be read — only a `list_schemas` call reads it

### Requirement: Action listing tool
The server SHALL expose a read-only `list_actions` tool returning the presented key's stored shared actions, so an agent asked to wire "my weather action" can bind it by name and map its arguments from the widget's data. Each entry SHALL carry the action's `name`, its optional `label` and `description`, its `kind`, and — for an `http` action — its `method` and its `input` and `output` schemas; a `prompt` entry SHALL instead carry `binds`, the data paths its text references, because a prompt takes no input mapping and those paths are the contract a binding widget's data must satisfy. The listing SHALL be the action's CONTRACT and never its transport: `url`, `headers` and `query` SHALL be absent from every entry, because no binding an agent drafts needs them and a read-only key travels into prompt-injectable hosts, where an author's literal query or header value would otherwise become readable — the same reason `execute_action` refuses to let a request supply a URL, method, headers or schema. The listing SHALL serve the principal resolved from the request's key exactly like `list_widgets`: an anonymous or unknown key sees an empty list, never an error, and a stored action that fails validation on read SHALL be omitted rather than failing the call. The tool's wire-visible description and the result's own rules SHALL steer agents to bind a listed action by name (`action: { "ref": "<name>" }`), SHALL state that a prompt reference takes NO input mapping, and, when no listed action fits, SHALL tell them to DESCRIBE the action they would need so the user can author and test it in the designer, rather than drafting an inline definition with a URL or credentials the agent cannot know. Reading the actions SHALL cost nothing at server construction: the store is consulted when the tool is called.

#### Scenario: The listing serves the key's own actions
- **WHEN** `list_actions` is called with a key whose principal stores an http action `weather-current`
- **THEN** the result SHALL parse as JSON containing that entry's `name`, `kind`, `method` and its `input` and `output` schemas
- **AND** the same call with an unknown or absent key SHALL return an empty list, not an error

#### Scenario: The transport never leaves the server
- **WHEN** a listed action's stored definition carries a `url`, fixed `query` parameters and `headers` including a `{ secret }` reference
- **THEN** none of the URL, the header names or values, and the query names or values SHALL appear anywhere in the result

#### Scenario: A prompt's contract is its bound paths
- **WHEN** a stored prompt action's text is `["What should I wear in ", { "bind": "city" }, "?"]`
- **THEN** its entry SHALL carry `kind: "prompt"` and `binds: ["city"]` with no method or schemas
- **AND** the result's rules SHALL state that a prompt reference takes no input mapping

#### Scenario: The wire description steers to references
- **WHEN** an SDK client lists tools
- **THEN** `list_actions` SHALL appear with a description telling agents to bind a listed action by name and to describe — never invent — an action the user has not saved

#### Scenario: An invalid stored action does not break discovery
- **WHEN** one of a principal's stored actions fails validation on read
- **THEN** `list_actions` SHALL return the valid entries and omit the invalid one

#### Scenario: Listing actions costs nothing until it is called
- **WHEN** a server is constructed with an action source and `render_widget` is called
- **THEN** the source SHALL NOT be read for the listing — only a `list_actions` call reads it

### Requirement: Action execution tool
The server SHALL expose an app-only tool, `execute_action`, registered with `_meta.ui.resourceUri: "ui://widgentic/app.html"` and `_meta.ui.visibility: ["app"]` so Apps hosts hide it from the model and let the mounted widget call it; its description SHALL state that it is called by widgets, not by agents (non-Apps clients still list it — the SDK does not filter). Its input SHALL be `{ widget: string, action: string, args?: object, payload: WidgetPayload, at?: string, item?: string }` where `action` is a binding identifier (a dotted template path or `"load"`), `payload` is the ROOT payload as the frame holds it, and — when the bound element belongs to an item of a `group` render — `at` is the dotted path of that item's payload within the root (e.g. `data.items.2`) and `item` its kind. The handler SHALL: resolve the binding on the item's kind when `at` is given (otherwise on `widget`) from the caller's composed catalog (the stored template's binding at that path, or the referenced shared action) — never from the request; require the `execute` scope; validate `args` against the action's input schema; execute per the widget-actions capability (SSRF-guarded https fetch, secrets injected, response validated); apply the output mode to `payload.data`; re-validate and re-render the payload exactly as `render_widget` would; and return the same `structuredContent: { html, css, payload, tree, diagnostics? }` (with inlined images) plus the slim text line; for a group item the response folds into THAT item's data and the whole group re-renders. Failures SHALL follow the rendering error contract with codes `UNKNOWN_KIND`, `UNKNOWN_ACTION`, `ACTION_NOT_HTTP`, `FORBIDDEN_SCOPE`, `INVALID_ACTION_INPUT`, `UNKNOWN_SECRET`, `ACTION_FETCH_FAILED`, `INVALID_ACTION_OUTPUT`, `RATE_LIMITED`; every message SHALL be scrubbed of secret values. `action` SHALL be a non-empty string (`MISSING_FIELD` otherwise); `at` SHALL match `data.items.<i>` exactly (`INVALID_TYPE` otherwise); failure messages SHALL never forward store or vault error text — a fixed message is returned and the detail is logged server-side; the designer's test path (`testHttpAction`) SHALL validate the definition before doing anything and return a structured `{ ok: false, code, message, path? }` for malformed input instead of throwing. The tool's wire schema descriptions SHALL derive from `EXECUTE_ACTION_TOOL` exactly as `render_widget`'s do.

#### Scenario: The tool is declared for apps only
- **WHEN** an SDK client lists tools
- **THEN** `execute_action` SHALL carry `_meta.ui.resourceUri` for the app template and `_meta.ui.visibility: ["app"]`

#### Scenario: A refresh re-renders through the same pipeline
- **WHEN** a principal's stored widget `weather` binds a button at path `children.2` to a GET action, and `execute_action` is called with `{ widget: "weather", action: "children.2", args: { city: "Oslo" }, payload }`
- **THEN** the result's `structuredContent.tree` SHALL be the render of the merged payload and `renderToHtml(tree)` SHALL equal `structuredContent.html`
- **AND** `structuredContent.payload.data` SHALL reflect the response under the binding's output mode

#### Scenario: Unknown bindings and prompt bindings are refused
- **WHEN** `action` names a path that carries no binding, or one whose action is a `prompt`
- **THEN** the result SHALL be `isError: true` with `UNKNOWN_ACTION` or `ACTION_NOT_HTTP` respectively

#### Scenario: Another principal's widget cannot be executed
- **WHEN** principal B calls `execute_action` for a kind only principal A owns
- **THEN** the result SHALL be `UNKNOWN_KIND` and nothing SHALL be fetched

#### Scenario: An item inside a group executes against its own kind and the group re-renders
- **WHEN** a `group` renders a `weather` item whose Refresh descriptor carries `at: "data.items.0"` and `widget: "weather"`, and `execute_action` is called with `{ widget: "group", action: "children.1", at: "data.items.0", item: "weather", args, payload: <the group payload> }`
- **THEN** the binding SHALL resolve on `weather`, the response SHALL fold into `data.items[0].data`, and the result SHALL be the re-rendered GROUP with every other item unchanged

#### Scenario: Errors never carry secret values
- **WHEN** an action fails after resolving a secret and the failure text would include the value
- **THEN** the tool text SHALL contain `***` in its place

#### Scenario: Empty ids and stray locations are refused
- **WHEN** `execute_action` is called with `action: ""`, or with `at: "meta.x"`
- **THEN** the result SHALL be `MISSING_FIELD` / `INVALID_TYPE` and nothing SHALL be fetched

#### Scenario: Backend errors are not echoed
- **WHEN** secret resolution throws a vault error carrying a key identifier
- **THEN** the tool text SHALL read a fixed message (no identifier) and the detail SHALL appear only in the server log

#### Scenario: A malformed test definition yields a structured result
- **WHEN** `testHttpAction` receives `{ kind: "http" }` with no `url` or `input`
- **THEN** it SHALL return `{ ok: false, code: "INVALID_ACTION_INPUT", … }` rather than throwing

### Requirement: Execute scope and rate limiting at the edge
The runnable HTTP server SHALL derive the caller's scopes from the resolved key and SHALL refuse `execute_action` with `FORBIDDEN_SCOPE` for callers without `execute` — the anonymous principal included. It SHALL enforce a per-principal rate limit on `execute_action` (default 60 executions per minute, configurable by environment), answering excess calls with `RATE_LIMITED` without executing them, and SHALL note limited calls on stderr without key material. When the caller lacks `execute`, `render_widget` results SHALL still render http-bound elements but mark their descriptors `disabled: "scope"` and SHALL omit `structuredContent.load`, so the frame shows the affordance as unavailable instead of failing on click. A non-numeric or non-finite `WIDGENTIC_EXECUTE_RATE` SHALL fall back to the default rather than producing a limiter that refuses everything, and the limiter SHALL tolerate a clock stepping backwards.

#### Scenario: Anonymous callers cannot execute
- **WHEN** a request without a resolvable key calls `execute_action`
- **THEN** the result SHALL be `FORBIDDEN_SCOPE` and no outbound request SHALL be made

#### Scenario: Excess calls are limited, not executed
- **WHEN** a principal exceeds the configured executions per minute
- **THEN** further calls in that window SHALL return `RATE_LIMITED` immediately

#### Scenario: A read-only key sees disabled actions
- **WHEN** a key with only `read` renders a widget with an http button and a `load`
- **THEN** the button's descriptor SHALL carry `disabled: "scope"` and the result SHALL have no `structuredContent.load`

#### Scenario: A misconfigured rate never fails closed
- **WHEN** `WIDGENTIC_EXECUTE_RATE=garbage`
- **THEN** executions SHALL proceed under the default rate

### Requirement: App template action layer
The app template SHALL act on action descriptors the way it already acts on links: a delegated listener on `[data-wg-action]` elements (clicks; Enter/Space on any focused host — non-button hosts, action anchors included, SHALL be made focusable with `tabindex="0"` and `role="button"` by the template) that parses and validates the descriptor and never evaluates anything from it. Until the first complete `tool-result` has rendered, and during any streaming preview, descriptors SHALL be inert. For `kind: "prompt"` the template SHALL send `ui/message` with `role: "user"` and one text block carrying the descriptor's text — always enabled (the probe found hosts that support the method without advertising it), with a JSON-RPC error response (`-32601` included) surfacing as an inline alert inside the frame. For `kind: "http"` the template SHALL call `tools/call` `execute_action` with `{ widget: payload.kind, action: id, args, payload }` — enabled only when the initialize result advertised `hostCapabilities.serverTools`, otherwise rendered disabled with an explanatory `title`; descriptors marked `disabled` by the server SHALL render disabled with their reason. While a call is in flight the widget root SHALL carry `aria-busy="true"` and a `wg-busy` class (a pulsing overlay drawn from the status tokens) and the triggering element SHALL be disabled; concurrent activations SHALL be ignored. On success the returned `structuredContent` SHALL be rendered through the same in-place mounter as a tool-result, the frame's held payload SHALL be replaced, and one `ui/update-model-context` SHALL follow carrying both a text block and `structuredContent` (each capped at 8 KiB, truncated with a marker). On failure the previous render SHALL stay, the error text (from the tool result or the JSON-RPC error) SHALL appear in an inline `wg-app-alert` element that the next successful action clears, and the model-context update SHALL NOT be sent. When `structuredContent.load` is present on the first complete tool-result, the template SHALL execute it exactly once per widget instance (never on partial input, never again after a re-render), with the same in-flight, success and failure behavior. Actions on the `format: "app"` embedded page and any surface without the bridge SHALL be inert. The layer SHALL further: never lose a `load` because the first result arrived before the initialize response (the load fires once capabilities are known); discard an in-flight result whose cycle was reset by `tool-input`/`tool-cancelled`; time out a pending action request (30 s) into the alert, clearing the busy state; clear the alert on `tool-input`, `tool-cancelled` and any host-driven render; preserve an author-set `title` (restoring it when the element becomes live again) and remove a stale disabled tooltip; stop a handled activation from also reaching the link interceptor when the element sits inside an `<a href>`; and send one model-context update after a load chain rather than one per item.

#### Scenario: A prompt proposes a message
- **WHEN** a mounted button with a `prompt` descriptor is clicked
- **THEN** the template SHALL send `ui/message` `{ role: "user", content: [{ type: "text", text: <descriptor text> }] }`
- **AND** the widget SHALL remain rendered whatever the host answers

#### Scenario: An http action round-trips and updates the model
- **WHEN** a mounted button with an `http` descriptor is clicked on a host that advertised `serverTools`
- **THEN** the template SHALL call `tools/call` `execute_action` with the descriptor's id and args and the frame's current payload
- **AND** on success SHALL patch the DOM in place from the returned tree, hold the returned payload, and send one `ui/update-model-context` with a text block and `structuredContent`

#### Scenario: Missing serverTools disables http actions up front
- **WHEN** the initialize result carries no `serverTools`
- **THEN** every `http` descriptor element SHALL be rendered disabled with a `title` explaining the host cannot run widget actions, and prompt elements SHALL stay enabled

#### Scenario: Unsupported prompt surfaces an alert
- **WHEN** the host answers `ui/message` with a JSON-RPC error
- **THEN** the frame SHALL show a `wg-app-alert` with the message and keep the widget intact

#### Scenario: In-flight state blocks re-entry
- **WHEN** an http action is in flight and the same element is clicked again
- **THEN** no second `tools/call` SHALL be sent, the root SHALL carry `aria-busy="true"` and `wg-busy`, and the element SHALL be disabled until the call settles

#### Scenario: Failure keeps the old render
- **WHEN** `execute_action` returns `isError: true`
- **THEN** the DOM SHALL be unchanged, a `wg-app-alert` SHALL show the error text, and no model-context update SHALL be sent

#### Scenario: Load fires once
- **WHEN** the first complete tool-result carries `structuredContent.load` and a later in-place re-render occurs
- **THEN** `execute_action` SHALL have been called with `action: "load"` exactly once for the instance

#### Scenario: Descriptors are inert before the first result
- **WHEN** a click lands on a `[data-wg-action]` element during a streaming preview
- **THEN** nothing SHALL be sent to the host

#### Scenario: Action anchors are keyboard reachable
- **WHEN** an `a` element carries an action descriptor
- **THEN** it SHALL be focusable, expose `role="button"`, and Enter or Space SHALL activate it exactly like a click

#### Scenario: A result that beats initialize still loads
- **WHEN** `tool-result` with `structuredContent.load` arrives before the `ui/initialize` response
- **THEN** the load SHALL fire once the response advertises `serverTools`

#### Scenario: Stale results are dropped
- **WHEN** an execute call is in flight and `tool-input` starts a new cycle before it settles
- **THEN** the late result SHALL neither mount nor update the model context

#### Scenario: A silent host cannot freeze the widget
- **WHEN** the host never answers an action's `tools/call`
- **THEN** after the timeout the busy state SHALL clear and an alert SHALL explain the failure

#### Scenario: Titles and alerts are restored and cleared
- **WHEN** a disabled element becomes live (or carried an author `title` before being disabled)
- **THEN** its `title` SHALL be the author's again
- **AND WHEN** a new tool-input arrives after a failed action
- **THEN** the alert SHALL be hidden

### Requirement: Action notes in model-facing output
Because the model never sees the frame, every `render_widget` and `execute_action` text output SHALL end with an `Action notes:` tail whenever the rendered widget carries action descriptors, stating how many http and prompt actions it has and how they behave (http actions run server-side when the user activates them, the widget re-renders itself and posts its new data to the model's context; prompt actions propose a message in the user's composer; the model does not call `execute_action` itself), whether the widget loads data on first render, and — when http descriptors are disabled — the reason in plain terms: `scope` (this API key lacks `execute`; the user can create an execute key in the app) or `unresolved` (the widget references an action the user has not saved). Renders without actions SHALL carry no tail. The `list_widgets` tool description SHALL instruct agents to call it fresh whenever the user asks what is available or mentions saving in the designer, never answering from an earlier listing, because catalogs are per key and change between calls. The authoring guide SHALL document the action vocabulary, the `disabled` reasons and the `execute` scope. Counts SHALL be per BINDING (a descriptor repeated by `each` counts once) and the sentence SHALL agree grammatically in number.

#### Scenario: A read-only key's render explains the disabled buttons
- **WHEN** a key with only `read` renders a widget with one http and one prompt binding
- **THEN** the text output SHALL end with an `Action notes:` tail saying the http action is disabled because the key lacks the `execute` scope and that the prompt action still works

#### Scenario: An execute key's render explains the live actions
- **WHEN** a key with `execute` renders the same widget with a `load` binding
- **THEN** the tail SHALL say the http action runs server-side on activation and re-renders the widget, that the widget loads data on first render, and that the agent does not call `execute_action` itself

#### Scenario: Plain widgets carry no tail
- **WHEN** a widget without bindings renders
- **THEN** the text SHALL contain no `Action notes:`

#### Scenario: Repeated rows count once
- **WHEN** one bound button renders in twenty `each` rows
- **THEN** the tail SHALL say `1 http action`, not twenty

### Requirement: Request bodies are bounded at the edge
The runnable HTTP server SHALL cap request bodies (default 4 MiB, configurable) and answer `413` with a JSON-RPC error for larger ones, so a round-tripped payload cannot exhaust memory.

#### Scenario: An oversized body is refused
- **WHEN** a POST body exceeds the cap
- **THEN** the response SHALL be `413` and the body SHALL NOT be buffered further
