# mcp-server — Delta: validated image references in emitted pages

## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: Server-side image inlining for iframe surfaces
Because Apps-host sandboxes block external `img-src` while permitting `data:`, the runnable server SHALL, when inlining is enabled (the default; `WIDGENTIC_INLINE_IMAGES=0` disables), rewrite `img` sources on the iframe-facing surfaces of a `render_widget` result — the `structuredContent` HTML fragment and the `ui://widgentic/page/<kind>` embedded resource — replacing each `http(s)` source whose fetch succeeds with a `data:<content-type>;base64,` URI. The model-facing HTML text block and `format: "page"` output SHALL keep original URLs. Each unique URL SHALL be fetched at most once per render. The fetch SHALL be guarded: `https` scheme only; hostnames resolving to loopback, private (RFC1918), link-local (including 169.254.169.254), carrier-grade NAT, or IPv6 unique-local/link-local addresses SHALL be rejected, re-validated on every redirect hop (at most 3); the response `Content-Type` MUST be `image/*`; per-image size SHALL be capped (1 MiB) and the fetch SHALL time out (~4 s); at most 8 images SHALL be inlined per render. Any failure SHALL leave the original URL in place (alt-text fallback) without failing the render.

#### Scenario: External image becomes a data URI in iframe surfaces only
- **WHEN** `render_widget` renders a table whose cell is a fetchable `https` image URL and inlining is enabled
- **THEN** the `structuredContent` fragment and the `ui://` resource SHALL carry the image as `data:image/...;base64,` with no `http(s)` `img` source remaining
- **AND** the plain HTML text block SHALL still reference the original URL

#### Scenario: Private-network targets are refused
- **WHEN** a widget value is `https://169.254.169.254/latest/meta-data.png` or an `https` URL whose hostname resolves to a private address
- **THEN** no request body SHALL be consumed from the target and the original URL SHALL remain in the output

#### Scenario: Non-image and oversized responses are not inlined
- **WHEN** the fetched response has a non-`image/*` content type, or exceeds the size cap
- **THEN** the original URL SHALL remain and the render SHALL still succeed

#### Scenario: Inlining can be disabled
- **WHEN** `WIDGENTIC_INLINE_IMAGES=0` is set
- **THEN** all surfaces SHALL keep original image URLs
