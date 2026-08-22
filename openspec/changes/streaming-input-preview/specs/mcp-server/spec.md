# MCP Server — streaming input preview delta

## MODIFIED Requirements

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
