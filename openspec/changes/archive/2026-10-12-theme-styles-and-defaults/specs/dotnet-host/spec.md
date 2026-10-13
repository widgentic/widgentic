## MODIFIED Requirements

### Requirement: WithWidgentic wires the widgentic surface onto the C# SDK
The package SHALL extend the C# SDK's server builder with `WithWidgentic(Action<WidgenticOptions>? configure = null)`. The call SHALL enable the SDK's MCP Apps extension and register:
- the selected widgentic tools, each answering through the bundle's `call`;
- `render_widget` with `_meta.ui.resourceUri` set to `ui://widgentic/app.html`, and the template's own `preview_widget` with the same URI and `_meta.ui.visibility: ["app"]`, both also carrying the legacy `_meta["ui/resourceUri"]` key as the Node assembly's tools do;
- the app template resource at that URI, with MIME type `text/html;profile=mcp-app` and content equal to the bundle's `appTemplate()`;
- unless `IncludeWidgetPages` is false, the `ui://widgentic/page/{kind}` resource template, serving the bundle's `widgetPage(kind)`.

The app resource's `_meta.ui` — on the declaration and on its read content alike — SHALL carry `prefersBorder` as the bundle's `resources()` gives it (`false`). `WidgenticOptions.ResourceDomains` SHALL be declared as `_meta.ui.csp.resourceDomains` on the app resource, and the key SHALL be absent when the list is empty. The list is deployment configuration: no widget, theme or render input can extend it. Model-facing output SHALL be slimmed exactly when the call's client advertised the Apps UI capability with the app MIME type. That capability is read from the session's negotiated capabilities when there are any. Otherwise it is read from the capabilities the request carries in `_meta["io.modelcontextprotocol/clientCapabilities"]`, as stateless MCP 2026-07-28 requests do; that revision is the C# SDK's default over HTTP. Only a call revealing neither SHALL fall back to `WidgenticOptions.AssumeUi` (default false), the equivalent of the Node assembly's `WIDGENTIC_ASSUME_UI`.

#### Scenario: The tool declares its template
- **WHEN** a C# SDK client lists tools
- **THEN** `render_widget` SHALL carry `_meta.ui.resourceUri: "ui://widgentic/app.html"`
- **AND** `preview_widget` SHALL carry the same URI with `_meta.ui.visibility: ["app"]`, and no other widgentic tool SHALL carry `_meta.ui`

#### Scenario: The template is the bundle's
- **WHEN** the client reads `ui://widgentic/app.html`
- **THEN** the content SHALL equal the bundle's `appTemplate()` and the MIME type SHALL be `text/html;profile=mcp-app`

#### Scenario: Declared domains reach the resource
- **WHEN** the server is configured with `ResourceDomains = ["cdn.example.com"]` and the client lists resources
- **THEN** the app resource SHALL carry `_meta.ui.csp.resourceDomains: ["cdn.example.com"]`
- **AND** with no domains configured the key SHALL be absent

#### Scenario: Slimming follows the session
- **WHEN** a client that advertised the Apps UI capability calls `render_widget` with default format, and a client that did not makes the same call
- **THEN** the first result SHALL be the slim output and the second the full output, with identical `structuredContent`

#### Scenario: A stateless request's own capabilities decide
- **WHEN** a stateless request (no session) carries the Apps UI capability in its `_meta` on a server with `AssumeUi` left false
- **THEN** `render_widget` with default format SHALL return the slim output
- **AND** a stateless request whose `_meta` capabilities lack the UI extension SHALL return the full output even with `AssumeUi = true`

#### Scenario: Requests revealing no capabilities follow AssumeUi
- **WHEN** a call reveals no client capabilities at all, neither from a session nor in its `_meta`, on a server configured with `AssumeUi = true`
- **THEN** `render_widget` with default format SHALL return the slim output
- **AND** with `AssumeUi` left at its default the same call SHALL return the full output

#### Scenario: Preview pages serve the dataExample
- **WHEN** the client reads `ui://widgentic/page/card`
- **THEN** the content SHALL equal the bundle's `widgetPage("card")`

#### Scenario: The host is asked for no border
- **WHEN** a C# SDK client lists resources and reads `ui://widgentic/app.html`
- **THEN** the declaration and the read content SHALL both carry `_meta.ui.prefersBorder: false`, and the read content no `csp` when no domains are configured
