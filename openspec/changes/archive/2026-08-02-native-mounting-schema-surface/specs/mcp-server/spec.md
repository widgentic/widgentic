# mcp-server — Delta: native tree mounting

## MODIFIED Requirements

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
