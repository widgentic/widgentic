## MODIFIED Requirements

### Requirement: WithWidgentic wires the widgentic surface onto the C# SDK
The package SHALL extend the C# SDK's server builder with `WithWidgentic(Action<WidgenticOptions>? configure = null)`. The call SHALL enable the SDK's MCP Apps extension and register:
- the selected widgentic tools, each answering through the bundle's `call`;
- `render_widget` with `_meta.ui.resourceUri` set to `ui://widgentic/app.html`, and the template's own `preview_widget` with the same URI and `_meta.ui.visibility: ["app"]`, both also carrying the legacy `_meta["ui/resourceUri"]` key as the Node assembly's tools do;
- the app template resource at that URI, with MIME type `text/html;profile=mcp-app` and content equal to the bundle's `appTemplate()`;
- unless `IncludeWidgetPages` is false, the `ui://widgentic/page/{kind}` resource template, serving the bundle's `widgetPage(kind)`.

The app resource's `_meta.ui` — on the declaration and on its read content alike — SHALL carry `prefersBorder` as the bundle's `resources()` gives it (`false`). `WidgenticOptions.ResourceDomains` and the startup settings record's `resourceDomains` section SHALL be passed to the bundle, which reads them with the store's resource-domain rule. The app resource SHALL declare the list the bundle's `resources()` reports as `_meta.ui.csp.resourceDomains`, in canonical `https://` origin form, with the key absent when the list is empty. A domain the bundle refuses SHALL stop startup with a `WidgenticConfigurationException` naming the section (`resourceDomains` or `settings`), the source and the code, like a refused entry. With a catalog source registered, the declaration follows the caller (see "Resource domains come from options and settings"). Only the operator and the settings records can extend the list: no widget, theme or render input can. Model-facing output SHALL be slimmed exactly when the call's client advertised the Apps UI capability with the app MIME type. That capability is read from the session's negotiated capabilities when there are any. Otherwise it is read from the capabilities the request carries in `_meta["io.modelcontextprotocol/clientCapabilities"]`, as stateless MCP 2026-07-28 requests do; that revision is the C# SDK's default over HTTP. Only a call revealing neither SHALL fall back to `WidgenticOptions.AssumeUi` (default false), the equivalent of the Node assembly's `WIDGENTIC_ASSUME_UI`.

#### Scenario: The tool declares its template
- **WHEN** a C# SDK client lists tools
- **THEN** `render_widget` SHALL carry `_meta.ui.resourceUri: "ui://widgentic/app.html"`
- **AND** `preview_widget` SHALL carry the same URI with `_meta.ui.visibility: ["app"]`, and no other widgentic tool SHALL carry `_meta.ui`

#### Scenario: The template is the bundle's
- **WHEN** the client reads `ui://widgentic/app.html`
- **THEN** the content SHALL equal the bundle's `appTemplate()` and the MIME type SHALL be `text/html;profile=mcp-app`

#### Scenario: Declared domains reach the resource
- **WHEN** the server is configured with `ResourceDomains = ["cdn.example.com"]` and the client lists resources and reads the app resource
- **THEN** the declaration and the read content SHALL both carry `_meta.ui.csp.resourceDomains: ["https://cdn.example.com"]`
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

#### Scenario: A refused operator domain stops startup
- **WHEN** the server is configured with `ResourceDomains = ["http://cdn.example.com"]`
- **THEN** startup SHALL fail with a `WidgenticConfigurationException` listing section `resourceDomains` and code `INVALID_DOMAIN`

### Requirement: Hosts resolve a catalog per principal
The package SHALL let a host serve each caller (principal) its own catalog through an `IWidgenticCatalogSource` it registers. Given the caller's `ClaimsPrincipal` and the request's services, the source SHALL return either `null` or a catalog of widget, theme and schema entries, as JSON in the designer's export shapes, and optionally the principal's settings record (see "Default themes come from settings, at startup and per principal"). `null` means the startup catalog serves the caller. How the host stores or fetches catalogs SHALL be up to the implementer.

A catalog SHALL combine with the startup entries according to its composition mode. `WidgenticOptions.PrincipalComposition` sets the default mode, and a returned catalog MAY override it for its principal.
- `Merge` SHALL compose the startup entries together with the principal's. A principal entry SHALL replace the startup entry with the same identifier (a widget's `kind`, a theme's or schema's `name`), so no identifier is ever served twice. The remaining startup entries compose before the principal's, so a principal widget MAY reference a startup schema.
- `Replace` SHALL compose the built-ins and the principal's entries only.

Built-in kinds and the `light`/`dark` themes SHALL stay reserved in both modes. A catalog that repeats an identifier within itself SHALL serve the first occurrence, and each later one SHALL be refused and logged.

`list_widgets`, `render_widget`, `preview_widget`, `list_themes` and `list_schemas`, the `ui://widgentic/page/{kind}` pages, and `IWidgenticRenderer`'s `RequestContext` overload SHALL resolve the caller's catalog. `tools/list`, `list_theme_tokens` and `get_authoring_guide` SHALL stay the same for every caller and SHALL NOT consult the source. The app template's content SHALL stay the same for every caller. Only its `_meta.ui.csp` declaration, on `resources/list` and `resources/read`, SHALL follow the caller's resource domains (see "Resource domains come from options and settings").

If the source throws, the call SHALL return an `isError` result with code `CATALOG_UNAVAILABLE`. That result SHALL NOT carry the exception's message, and the exception SHALL be logged. Without a registered source, behavior SHALL be exactly as before.

#### Scenario: Without a source nothing changes
- **WHEN** no `IWidgenticCatalogSource` is registered
- **THEN** every caller SHALL be served the startup catalog, as before this change

#### Scenario: An unknown caller gets the startup catalog
- **WHEN** the source returns `null` for a caller
- **THEN** that caller's `list_widgets` SHALL equal the startup catalog's

#### Scenario: Principals never see each other's entries
- **WHEN** principals A and B, each with a widget the other lacks, call `list_widgets` and `render_widget` concurrently against a pool of 4
- **THEN** each SHALL list and render its own widget, and neither SHALL list or render the other's

#### Scenario: In Merge the principal's entry wins
- **WHEN** the startup entries define widget `email-inbox-widget` and schema `email-inbox`, and a principal in Merge mode defines its own `email-inbox-widget` and a widget of another kind whose `dataSchemaRef` is `email-inbox`
- **THEN** that principal's `list_widgets` SHALL list `email-inbox-widget` exactly once, with the principal's descriptor, and SHALL list the other startup widgets
- **AND** the principal's other widget SHALL be listed with the startup schema resolved into its `dataSchema`, and nothing SHALL be refused

#### Scenario: In Replace only the principal's entries join the built-ins
- **WHEN** a principal in Replace mode defines one widget
- **THEN** its `list_widgets` SHALL list the built-in kinds and that widget, and none of the startup widgets

#### Scenario: A catalog overrides the default mode
- **WHEN** `PrincipalComposition` is `Merge` and a principal's catalog declares `Replace`
- **THEN** that principal SHALL be composed in Replace mode, and other principals in Merge mode

#### Scenario: Duplicates within a catalog are refused
- **WHEN** a principal's catalog holds two widgets of the same kind
- **THEN** the first SHALL be served, and the second SHALL be refused and logged

#### Scenario: A refused principal entry still replaces the startup entry
- **WHEN** a principal in Merge mode defines a widget with the same kind as a startup widget, and that principal widget is refused by validation
- **THEN** that kind SHALL be served for this principal from neither entry, and the refusal SHALL be logged

#### Scenario: A failing source is a result
- **WHEN** the source throws for a caller
- **THEN** that caller's `list_widgets` SHALL return `isError: true` with code `CATALOG_UNAVAILABLE`, without the exception's message, the exception SHALL be logged, and the host SHALL keep serving other callers

#### Scenario: Global surfaces stay global
- **WHEN** a source is registered and two principals list tools and read `ui://widgentic/app.html`
- **THEN** both SHALL receive identical `tools/list` results and identical template content
- **AND** when no resource domains are configured anywhere, their app resource declarations SHALL be identical too
- **AND** `list_theme_tokens` and `get_authoring_guide` SHALL be served without calling the source

#### Scenario: Preview pages follow the caller
- **WHEN** a principal reads `ui://widgentic/page/{kind}` for a kind only its catalog defines
- **THEN** the page SHALL render that kind's example, and another principal reading the same URI SHALL get the page for an unknown kind

### Requirement: Render-only in this version
The package SHALL make no outbound network request. It SHALL NOT register `execute_action` or emit `load` descriptors. Http actions in templates SHALL render disabled for the `unresolved` reason, so the bridge shows them as unavailable. Prompt actions SHALL work unchanged, because the bridge proposes them to the host's composer. Server-side image inlining SHALL NOT be performed: in Apps hosts whose sandbox blocks external images, images SHALL display only when served from a declared resource domain (from `ResourceDomains` or a settings record's `resourceDomains`) or given as `data:` URIs. The package README SHALL state these limits.

#### Scenario: No egress
- **WHEN** the test suite renders every corpus input with outbound networking unavailable to the process
- **THEN** every render SHALL succeed with output equal to the corpus, and no network attempt SHALL be recorded

#### Scenario: Prompt actions survive
- **WHEN** a widget whose template binds a prompt action is rendered
- **THEN** the element SHALL carry the prompt descriptor with no `disabled` key

## ADDED Requirements

### Requirement: Resource domains come from options and settings
For each caller, the app resource SHALL declare `WidgenticOptions.ResourceDomains` followed by the caller's effective `resourceDomains` settings section, as the bundle's `resources()` reports them for that combination. The effective section SHALL follow the settings combination of "Default themes come from settings, at startup and per principal":
- In `Merge`, a principal's `resourceDomains` section replaces the startup record's whole, and a section the principal's record omits is the startup record's.
- In `Replace`, only the principal's record applies.
- Without a source, or for a caller the source returns `null` for, the startup record applies.

`ResourceDomains` SHALL apply to every caller. The caller's list SHALL be declared on the app resource's `resources/list` entry and on its `resources/read` content alike. A principal's refused domain SHALL be skipped and logged with section `settings`, its name and its code, and SHALL never fail the request. If the source throws while the app resource is listed or read, the startup declaration SHALL be served and the exception logged, so the template never fails to list or read because of the source. Because the package performs no image inlining, a declared domain is the only way an external image displays in a host that enforces `img-src`.

#### Scenario: Startup settings declare their domains
- **WHEN** the server is configured with `ResourceDomains = ["assets.example.org"]` and a startup record `{ "resourceDomains": ["cdn.example.com"] }`, and a client lists resources and reads the app resource
- **THEN** both SHALL carry `_meta.ui.csp.resourceDomains: ["https://assets.example.org", "https://cdn.example.com"]`

#### Scenario: In Merge a principal's section replaces the startup one
- **WHEN** on that server a principal in Merge mode returns a catalog whose settings are `{ "resourceDomains": ["img.tenant.example"] }`, and another principal returns a catalog with no settings record
- **THEN** the first principal's app resource SHALL declare `["https://assets.example.org", "https://img.tenant.example"]`, and the second's SHALL declare the startup list

#### Scenario: In Replace the startup section never applies
- **WHEN** on that server a principal in Replace mode returns a catalog with no settings record
- **THEN** its app resource SHALL declare `["https://assets.example.org"]` only

#### Scenario: A principal's refused domain is skipped and logged
- **WHEN** a principal's settings are `{ "resourceDomains": ["http://old.example.com", "img.tenant.example"] }`
- **THEN** its app resource SHALL declare the operator list followed by `https://img.tenant.example`, the request SHALL succeed, and a log entry SHALL name the section `settings` and the code `INVALID_DOMAIN`

#### Scenario: Principals see only their own domains
- **WHEN** principals A and B, each with a domain the other lacks, read the app resource concurrently against a pool of 4
- **THEN** each declaration SHALL carry its own principal's domain and not the other's

#### Scenario: A failing source keeps the template
- **WHEN** the source throws while a caller reads the app resource
- **THEN** the content SHALL equal the bundle's `appTemplate()`, the declaration SHALL carry the startup list, and the exception SHALL be logged
