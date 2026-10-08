## ADDED Requirements

### Requirement: Widget preview tool
The server SHALL expose an app-only tool, `preview_widget`, registered with `_meta.ui.resourceUri: "ui://widgentic/app.html"` and `_meta.ui.visibility: ["app"]` so Apps hosts hide it from the model and let the mounted template call it; its description SHALL state that the app template calls it while a render's input streams and that agents should not. Its input SHALL be `{ widget: string, data?: unknown, hints?: object, meta?: object, theme?: string | object }`. The handler SHALL compose the caller's catalog exactly as `render_widget` does, render through it with `partialData: true`, and return `structuredContent: { tree, css }` — the render tree and the kind's (or, for a `group`, every distinct item kind's) registered styles with the resolved theme's declarations — plus a one-line text naming the kind. It SHALL NOT inline images, compute hint diagnostics, emit `load`, or attach the payload; a `theme` that fails to resolve SHALL be ignored rather than fail the preview, since the tool result decides. Contract failures SHALL follow the rendering error contract (`UNKNOWN_KIND`, `MISSING_FIELD`, `INVALID_TYPE`, …). Previewing requires no scope beyond the caller's composed catalog: an anonymous caller previews the built-in kinds. The tool's wire schema descriptions SHALL derive from its exported definition as the other tools' do. The assembly SHALL accept a preview rate gate as it accepts the execution gate; the runnable HTTP server SHALL enforce a per-principal limit on `preview_widget` (default 240 calls per minute, `WIDGENTIC_PREVIEW_RATE`), answering excess calls with `RATE_LIMITED` without rendering, and a non-numeric or non-finite value SHALL fall back to the default.

#### Scenario: The tool is declared for apps only
- **WHEN** an SDK client lists tools
- **THEN** `preview_widget` SHALL carry `_meta.ui.resourceUri` for the app template and `_meta.ui.visibility: ["app"]`

#### Scenario: Incomplete data previews a stored kind
- **WHEN** a principal whose stored kind `person` requires `name` and `email` calls `preview_widget` with `{ widget: "person", data: { name: "Ada" } }`
- **THEN** the result SHALL carry `structuredContent.tree` rendering `Ada` and `structuredContent.css` with the kind's styles
- **AND** `render_widget` with the same input SHALL still fail the data-schema check

#### Scenario: Previews never fetch
- **WHEN** a previewed payload carries an `https` image source
- **THEN** no request SHALL be made for it and the tree SHALL keep the original URL

#### Scenario: Another principal's kind cannot be previewed
- **WHEN** principal B calls `preview_widget` for a kind only principal A owns
- **THEN** the result SHALL be `UNKNOWN_KIND`

#### Scenario: Excess previews are limited, not rendered
- **WHEN** a principal exceeds the configured previews per minute
- **THEN** further calls in that window SHALL return `RATE_LIMITED` immediately

#### Scenario: A misconfigured preview rate never fails closed
- **WHEN** `WIDGENTIC_PREVIEW_RATE=garbage`
- **THEN** previews SHALL proceed under the default rate

### Requirement: App template size budget
The served app template SHALL stay within explicit size budgets — 44 KiB of UTF-8 bytes raw and 13 KiB gzipped at the highest compression level — pinned by a test in the default gate. Exceeding either budget SHALL fail the gate, and raising one SHALL be a deliberate, reviewed change to the pinned values, never a side effect.

#### Scenario: The template fits its budgets
- **WHEN** the gate runs
- **THEN** `buildAppTemplate()` SHALL measure at most 45,056 bytes raw and at most 13,312 bytes gzipped

#### Scenario: Growth past a budget fails the gate
- **WHEN** a change makes the template exceed either budget
- **THEN** the size test SHALL fail, naming the measured size and the budget

## MODIFIED Requirements

### Requirement: App template loader
The repository SHALL provide the app template (`ui://widgentic/app.html`): a self-contained document with the widgentic base stylesheet and a minimal inline bridge implementing the MCP Apps iframe protocol — the `ui/initialize` handshake (protocol version `2026-01-26`), the `ui/notifications/initialized` notification, `ping`/`ui/resource-teardown` responders, a streaming input preview — on `ui/notifications/tool-input-partial` (and `tool-input`), built-in kinds (`card`, `table`, `tree`, and `group`s whose items are built-ins) SHALL mount a client-built preview tree from the partial `{ widget, data, hints }` through the same native mounter, marked visibly in-progress, with successive partials patching in place; custom and unknown kinds SHALL show a generating-state skeleton naming the kind, never a client-built guess, until a SERVER preview arrives: when the host advertises `serverTools`, the template SHALL request the app-only `preview_widget` tool for any render that names a kind outside the built-ins (alone or as a `group` item) — at most one request in flight per frame, the latest input snapshot sent once the previous request settles, and no request once the tool result has arrived — and SHALL mount each successful answer's `tree` (applying its `css`) through the same native mounter, marked in progress like any preview; an error answer (`RATE_LIMITED` included), a request the host rejects, or a host without `serverTools` SHALL leave the skeleton (or the last successful server preview) on screen and end preview requests for that render, and an answer arriving after the tool result SHALL be discarded; previews use the built-ins' `wg-*` classes and content but skip image inlining, diagnostics, and validation (the tool result stays the only authority), and the preview state SHALL be replaced by the `tool-result` render (or restored to the placeholder on `tool-cancelled`) — and a `ui/notifications/tool-result` listener that renders `structuredContent` (`css` via style text; the widget mounted natively from `structuredContent.tree` when present — DOM built with `createElement`/`createTextNode`, tag and attribute names held to the serializer's allowlists, `on*` attributes skipped — with subsequent tool-results patching the mounted DOM in place, preserving node identity where shape matches and pairing sibling elements by `key` under exactly the rules of the reactive-rendering patcher — keyed when every child of both lists is a uniquely keyed element, by position otherwise — so a reordering result moves DOM nodes instead of re-pairing them; `html` injected into the root only as the fallback when `tree` is absent), with ResizeObserver-driven `ui/notifications/size-changed` reporting. Anchor clicks SHALL NEVER navigate the frame — the frame is the widget, and an in-frame navigation to an external origin is sandbox-blocked, replacing the widget with an error page: the template SHALL intercept every anchor click, prevent the default, and ask the host to open http(s)/mailto/tel URLs via a `ui/open-link` request, staying intact when the host denies or does not support it. The template SHALL integrate host context (from the initialize result and `host-context-changed`): theme applied as `data-theme`/`color-scheme`, host style variables set on the document root and flowing into the `--wg-*` tokens with widgentic's light literals as final fallback, and safe-area insets applied as body padding. For registry tokens the host bridge does NOT map, the template SHALL flip to the dark preset's values when the host theme is dark (keyed on the applied `data-theme`), so custom widget styles stay coherent in both modes — host-bridged tokens keep their host-derived values, and an explicit widgentic `theme` SHALL still override in both modes. The template SHALL reference no external resources and declare no CSP domains (strictest sandbox).

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
- **THEN** the frame SHALL show a generating-state skeleton naming that kind until a `preview_widget` answer arrives
- **AND** the frame SHALL never build a client-side render for that kind

#### Scenario: The result replaces the preview
- **WHEN** the `tool-result` arrives after previews
- **THEN** the authoritative render SHALL replace the preview through the patcher and the in-progress treatment SHALL be gone

#### Scenario: Hosts without input notifications see no change
- **WHEN** a host sends no input notifications before the result
- **THEN** the template SHALL behave exactly as before for every existing scenario

#### Scenario: Custom kinds preview through the server
- **WHEN** the host advertises `serverTools` and partial input names a stored custom kind
- **THEN** the template SHALL call `tools/call` `preview_widget` with the snapshot's `widget`, `data`, `hints` and `meta`
- **AND** SHALL mount the answer's `tree` marked in progress, applying its `css`
- **AND** the tool result SHALL replace that preview through the patcher

#### Scenario: One preview request in flight
- **WHEN** three further input snapshots arrive while a `preview_widget` request is outstanding
- **THEN** exactly one further request SHALL be sent after it settles, carrying the latest of the three snapshots

#### Scenario: Preview failures keep the skeleton
- **WHEN** `preview_widget` answers with `isError` (including `RATE_LIMITED`), or the host lacks `serverTools`
- **THEN** the skeleton (or the last successful server preview) SHALL stay on screen
- **AND** no further `preview_widget` request SHALL be sent for that render

#### Scenario: Previews stop at the result
- **WHEN** the tool result has arrived
- **THEN** no `preview_widget` request SHALL be sent, and an answer to an earlier request SHALL be discarded without touching the mounted result

#### Scenario: Groups with custom items preview through the server
- **WHEN** partial input for a `group` includes an item of a stored custom kind and the host advertises `serverTools`
- **THEN** the template SHALL request a server preview for the whole group, showing the client-built group preview with that item's skeleton until the answer arrives

#### Scenario: Keyed results reorder in place
- **WHEN** two tool results carry a table whose records have unique `id` values, the second in a different order
- **THEN** each row element SHALL keep its DOM identity at its new position

#### Scenario: The template's patcher agrees with the core patcher
- **WHEN** the same sequence of render trees — keyed lists, unkeyed lists, duplicate keys, reorders, insertions and removals — is applied through the core reactive patcher and through the template's mounter
- **THEN** both SHALL produce the same DOM and preserve the identity of the same elements

### Requirement: Server-side image inlining for iframe surfaces
Because Apps-host sandboxes block external `img-src` while permitting `data:`, the runnable server SHALL, when inlining is enabled (the default; `WIDGENTIC_INLINE_IMAGES=0` disables), rewrite `img` sources on the iframe-facing surfaces of a `render_widget` result — the `structuredContent` HTML fragment, the `structuredContent.tree` render tree (element nodes with `tag: "img"`), and the `ui://widgentic/page/<kind>` embedded resource — replacing each `http(s)` source whose fetch succeeds with a `data:<content-type>;base64,` URI; the tree and HTML projections SHALL be rewritten from the same fetch results and never disagree. The model-facing HTML text block and `format: "page"` output SHALL keep original URLs. Each unique URL SHALL be fetched at most once per render. The fetch SHALL be guarded: `https` scheme only; hostnames resolving to loopback, private (RFC1918), link-local (including 169.254.169.254), carrier-grade NAT, or IPv6 unique-local/link-local addresses SHALL be rejected, re-validated on every redirect hop (at most 3); the connection SHALL be made to the exact address that passed validation — the fetch SHALL NOT perform its own name resolution, so a DNS answer that changes between validation and connection has no effect — while TLS server-name and the `Host` header keep the original hostname; the response `Content-Type` MUST be `image/*`; per-image size SHALL be capped (1 MiB) and the fetch SHALL time out (~4 s); at most 24 unique sources SHALL be fetched per render, chosen in PRIORITY order: sources used by a `wg-img-hero` image first; then sources used by a `wg-img-thumb` or `wg-img-avatar` image or by an image carrying no `wg-img-*` shape class; then sources used only by `wg-img-icon` images — each source ranked by its highest-priority occurrence, ties broken by its first occurrence in document order. Fetched sources SHALL then be admitted in that same order while the bytes they SUBSTITUTE stay within a per-render budget of 3 MiB, where a source costs the length of its `data:` URI times the number of `img` occurrences it has in the render tree (in the fragment when no tree is present); a source that would exceed the remaining budget SHALL keep its original URL, while later sources that still fit SHALL be admitted. A render that leaves fetchable sources external, under either bound, SHALL write one note to stderr carrying counts only (no URLs); nothing about it SHALL reach the model-facing output. URLs whose hostname is among the deployment's declared resource domains SHALL be left un-inlined — the frame is allowed to load them natively. Any failure SHALL leave the original URL in place (alt-text fallback) without failing the render.

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
- **THEN** the 24 highest-priority sources (document order within a priority) SHALL be fetched and the rest SHALL keep their original URLs (alt-text fallback in sandboxed frames)

#### Scenario: A hero outranks earlier icons
- **WHEN** a `group` renders a tree with 30 distinct image icons followed by a card whose hero image is a fetchable `https` URL
- **THEN** the hero SHALL be fetched and inlined
- **AND** exactly 23 of the icons, the first 23 in document order, SHALL be fetched

#### Scenario: Repeated sources are charged per occurrence
- **WHEN** one icon URL appears on 200 tree nodes and its `data:` URI is 20,000 characters, and the same render carries a 100 KB hero image
- **THEN** the icon SHALL keep its original URL on all 200 nodes (4,000,000 characters exceed the 3 MiB budget)
- **AND** the hero SHALL still be inlined

#### Scenario: Overflow stays out of the model's view
- **WHEN** a render leaves fetchable sources external under either bound
- **THEN** stderr SHALL carry one note with the counts and no URL
- **AND** the model-facing text and `structuredContent.diagnostics` SHALL be unchanged by it
