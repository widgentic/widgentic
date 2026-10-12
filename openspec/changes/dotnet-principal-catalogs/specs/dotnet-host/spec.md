## MODIFIED Requirements

### Requirement: A host's own tools render widgets
The package SHALL register an `IWidgenticRenderer` service. Its `RenderAsync` SHALL accept the `render_widget` arguments (`widget`, `data`, optional `hints`, `meta`, `format`, `theme`) plus either the calling session or the tool call's `RequestContext`. Only the `RequestContext` overload also sees the capabilities a stateless request carries and the caller's principal, so only it renders with the caller's catalog when a catalog source is configured; the session overload renders with the startup catalog. It SHALL return a C# SDK `CallToolResult` equal to the result `render_widget` would return for the same arguments in the same session. Invalid input SHALL become an `isError` result with the bundle's structured error, never an exception. The package SHALL expose the app template URI as a public constant, so a host tool declares `[McpAppUi(ResourceUri = ...)]` without restating it. The result's content SHALL keep the widgentic payload block, so the model still sees the data in slim mode.

#### Scenario: A host tool equals render_widget
- **WHEN** a host tool returns `renderer.RenderAsync(new WidgetRenderRequest("table", rows), session)`, and a client calls both that tool and `render_widget` with the same arguments
- **THEN** both results SHALL serialize to the same JSON

#### Scenario: A host tool mounts in Apps hosts
- **WHEN** a host tool declared with `[McpAppUi(ResourceUri = WidgenticResources.AppTemplateUri)]` is listed
- **THEN** it SHALL carry `_meta.ui.resourceUri: "ui://widgentic/app.html"`

#### Scenario: A host tool renders the caller's catalog
- **WHEN** a catalog source is configured and a host tool renders a kind that only the calling principal's catalog defines, through the `RequestContext` overload
- **THEN** the result SHALL equal `render_widget`'s for the same caller and arguments

#### Scenario: Bad input is a result
- **WHEN** a host tool renders an unknown widget kind
- **THEN** `RenderAsync` SHALL return `isError: true` with the `UNKNOWN_KIND` error naming the available kinds, and SHALL NOT throw

### Requirement: Widgets, themes and schemas load from designer JSON and are refused at the door
`WidgenticOptions` SHALL accept widget definitions in the designer's export shape, one per JSON document or as a JSON array, from strings and from every `*.json` file in a directory (`AddWidgetsFromDirectory`). Theme entries and shared schema entries SHALL be accepted the same two ways: as JSON strings, and from directories (`AddThemesFromDirectory`, `AddSchemasFromDirectory`) in ordinal file-name order, each file holding one entry or an array. Every entry SHALL be validated by the bundle at startup. If the bundle reports any problem, the host SHALL fail to start with a `WidgenticConfigurationException` listing each problem's section, source (file path when loaded from a file), index, code and message: no entry is ever accepted and then silently missing. A widget that declares a `load` binding SHALL be accepted, and the package SHALL log once at startup that the binding is inactive in this render-only version. Entries a catalog source resolves for a principal SHALL be validated by the same bundle on every call that composes them. Each refused entry SHALL be skipped and logged with its section, index, name and code, never its contents. A refused principal entry SHALL never fail the call or stop the host: the call proceeds with the entries that composed.

#### Scenario: A seed is served from directories
- **WHEN** the docker example's demo seed is loaded from its `schemas/`, `themes/` and `widgets/` directories and a client calls `list_widgets`, `list_themes` and `list_schemas`
- **THEN** `email-inbox-widget` SHALL be listed with its shared schema resolved into `dataSchema`, `google-dark` and `google-light` SHALL be listed, both schemas SHALL be listed, and rendering the widget's `dataExample` with the theme `google-dark` SHALL succeed

#### Scenario: A widget without its shared schema stops startup
- **WHEN** only the seed's `widgets/` directory is loaded, without the schemas its widgets reference
- **THEN** startup SHALL fail with `UNKNOWN_SCHEMA` for each widget file, naming the file

#### Scenario: Theme and schema directories name their files
- **WHEN** a theme directory holds a theme named `dark` and a schema directory holds an array whose second entry has an invalid name
- **THEN** startup SHALL fail listing `RESERVED_THEME` with that theme's file and `INVALID_IDENTIFIER` with the schema file and its index

#### Scenario: An invalid entry stops startup
- **WHEN** the configured directory holds a widget whose template uses a forbidden tag
- **THEN** the host SHALL fail to start with a `WidgenticConfigurationException` naming the file, the section `widgets`, and the structured code

#### Scenario: Reserved names are refused
- **WHEN** the configuration carries a widget of kind `card` or a theme named `light`
- **THEN** startup SHALL fail naming the reserved entry

#### Scenario: A principal's invalid entry is skipped and logged
- **WHEN** a principal's catalog holds a valid widget and a widget whose template uses a forbidden tag
- **THEN** that principal's `list_widgets` SHALL list the valid widget and not the refused one, the call SHALL succeed, and a log entry SHALL name the refused entry's section, index, name and code without its template

#### Scenario: A load binding is inactive, not fatal
- **WHEN** the example weather widget, which declares an http action, is loaded
- **THEN** startup SHALL succeed, a single startup log line SHALL say that the binding is inactive, and a render SHALL carry its http action with `disabled: "unresolved"`

### Requirement: The engine is isolated, bounded and stateless
The package SHALL run the bundle in a bounded pool of independent V8 runtimes. The default size is `Math.Min(Environment.ProcessorCount, 4)`; `EnginePoolSize` overrides it. Every runtime SHALL load the bundle and create its host at startup, so configuration problems surface before the first request. Only strings, and the boolean `slim` flag, SHALL cross between .NET and script. No .NET object, type, file system or network access SHALL be exposed to the script.

Each call SHALL be bounded by `CallTimeout` (default 2 seconds) and by a per-runtime heap limit. A call that exceeds either SHALL return an `isError` result with code `ENGINE_TIMEOUT` or `ENGINE_FAILURE`. The runtime that failed SHALL be discarded and replaced, and the host process SHALL keep serving. A runtime SHALL be used by one call at a time. Pooling SHALL carry no data between calls: the bundle keeps no per-call state. Without a catalog source, every call SHALL be served by the host the runtime created at startup. With a catalog source, each call whose caller resolves to a catalog SHALL compose that catalog in the leased runtime, within the call's `CallTimeout`, and SHALL drop it when the call ends. No composed catalog SHALL be cached, reused by a later call, or visible to another caller.

#### Scenario: Concurrent calls render correctly
- **WHEN** 64 renders of distinct payloads run concurrently against a pool of 4
- **THEN** every result SHALL equal the same payload rendered alone

#### Scenario: A runaway call is contained
- **WHEN** a call exceeds `CallTimeout` (forced in tests with a test-only slow configuration)
- **THEN** the call SHALL return `isError: true` with code `ENGINE_TIMEOUT`, the next call SHALL succeed, and the pool size SHALL be unchanged

#### Scenario: A composed catalog never outlives its call
- **WHEN** principal A's call and principal B's call run one after the other on the same runtime
- **THEN** B's `list_widgets` SHALL contain none of A's entries
- **AND** when the source returns a changed catalog for A, A's next call SHALL reflect the change

#### Scenario: Nothing leaks between callers
- **WHEN** payload A is rendered and then payload B on the same runtime
- **THEN** B's result SHALL equal B rendered on a fresh runtime, and SHALL contain no string that appears only in A

### Requirement: Protocol round trip and a runnable sample
`dotnet/samples` SHALL contain a runnable MCP server. It serves over stdio by default, and over Streamable HTTP at `http://localhost:3002/mcp` (or `--urls`) with `--http`. Over HTTP it is stateless for MCP 2026-07-28 clients and keeps a session for clients that initialize, so both kinds reveal their capabilities. Both transports serve the same server. It configures `WithWidgentic` with the docker example's demo seed (its widgets, themes and shared schemas). The seed is written one file per entry from `examples/docker/seed/demo.json`, never hand-copied, and loaded with the three directory helpers. The sample also registers one host tool rendering through `IWidgenticRenderer`. The seed's settings record (its default themes) is generated the same way and loaded at startup. Over HTTP the sample also demonstrates per-principal catalogs. An API-key authentication handler maps two demo keys, read from configuration and never printed, to two principals: one composed in Merge mode, with settings of its own, and one in Replace mode. Without a key, the startup catalog serves. The test suite SHALL launch the sample in both modes and drive it with a C# SDK client, and it SHALL connect a C# SDK client to the package's server over an in-process transport and verify `list_widgets`, `render_widget` (success and the `isError` path for an unknown kind), the host tool, and `resources/read` of the app template through the real protocol.

#### Scenario: Protocol round trip
- **WHEN** an in-process C# SDK client calls `render_widget` with `{ widget: "card", data: { title: "T" } }`
- **THEN** the delivered result SHALL contain `structuredContent.html` with `class="wg-card"`, and a content block carrying the widgentic payload

#### Scenario: Error through the protocol
- **WHEN** the client calls `render_widget` with an unknown widget id
- **THEN** the delivered result SHALL have `isError: true` with the `UNKNOWN_KIND` JSON error

#### Scenario: The sample serves the docker demo seed
- **WHEN** the sample's seed files are compared with `examples/docker/seed/demo.json`
- **THEN** they SHALL be equal, entry for entry, settings included, and the running sample's `list_widgets` SHALL include `appointment-agenda-widget` and `email-inbox-widget`, `list_themes` SHALL include `google-dark` and report the seed's defaults, and `list_schemas` SHALL include `email-inbox`

#### Scenario: Two principals over HTTP
- **WHEN** the sample runs with `--http` and three clients connect, one with each demo key and one with none
- **THEN** each SHALL list the widgets its catalog composes: the keyless client the startup seed, the Merge principal the seed with its own entries (an entry of the same kind replacing the seed's), and the Replace principal only the built-ins and its own entries

#### Scenario: The sample serves over HTTP
- **WHEN** the sample runs with `--http` and an MCP Apps client on the 2026-07-28 revision calls `team_roster`
- **THEN** the result SHALL be the slim output with the table in `structuredContent`
- **AND** a client without the UI capability SHALL get the full output, and an MCP Apps client on the 2025-11-25 revision, which initializes, SHALL get the slim output through its session

## ADDED Requirements

### Requirement: Hosts resolve a catalog per principal
The package SHALL let a host serve each caller (principal) its own catalog through an `IWidgenticCatalogSource` it registers. Given the caller's `ClaimsPrincipal` and the request's services, the source SHALL return either `null` or a catalog of widget, theme and schema entries, as JSON in the designer's export shapes, and optionally the principal's settings record (see "Default themes come from settings, at startup and per principal"). `null` means the startup catalog serves the caller. How the host stores or fetches catalogs SHALL be up to the implementer.

A catalog SHALL combine with the startup entries according to its composition mode. `WidgenticOptions.PrincipalComposition` sets the default mode, and a returned catalog MAY override it for its principal.
- `Merge` SHALL compose the startup entries together with the principal's. A principal entry SHALL replace the startup entry with the same identifier (a widget's `kind`, a theme's or schema's `name`), so no identifier is ever served twice. The remaining startup entries compose before the principal's, so a principal widget MAY reference a startup schema.
- `Replace` SHALL compose the built-ins and the principal's entries only.

Built-in kinds and the `light`/`dark` themes SHALL stay reserved in both modes. A catalog that repeats an identifier within itself SHALL serve the first occurrence, and each later one SHALL be refused and logged.

`list_widgets`, `render_widget`, `preview_widget`, `list_themes` and `list_schemas`, the `ui://widgentic/page/{kind}` pages, and `IWidgenticRenderer`'s `RequestContext` overload SHALL resolve the caller's catalog. `tools/list`, `list_theme_tokens`, `get_authoring_guide` and the app template SHALL stay the same for every caller and SHALL NOT consult the source.

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
- **THEN** both SHALL receive identical `tools/list` results and identical templates
- **AND** `list_theme_tokens` and `get_authoring_guide` SHALL be served without calling the source

#### Scenario: Preview pages follow the caller
- **WHEN** a principal reads `ui://widgentic/page/{kind}` for a kind only its catalog defines
- **THEN** the page SHALL render that kind's example, and another principal reading the same URI SHALL get the page for an unknown kind

### Requirement: Default themes come from settings, at startup and per principal
`WidgenticOptions` SHALL accept a settings record in the store's shape (`{ "defaultThemes": { "light"?, "dark"? } }`) as a JSON string or from a file. The record SHALL be passed to the bundle with the startup entries and validated there. A reported setting SHALL stop startup with a `WidgenticConfigurationException` naming the section `settings`, the source and the code, like a refused entry.

A catalog a source resolves MAY carry the principal's settings record, in the same shape. It SHALL combine with the startup record according to the catalog's composition mode:
- `Merge` SHALL combine the two records section by section. A section the principal's record defines replaces the startup record's section whole, so `{ "defaultThemes": { "dark": "night" } }` leaves the light mode on the built-in even when the startup record sets one. A section the principal's record omits is the startup record's. A principal record that is not a JSON object SHALL replace the startup record whole and be reported.
- `Replace` SHALL use the principal's record only.

Defaults SHALL resolve against the caller's composed themes. In `Merge`, a principal theme that replaces a startup theme of the same name is therefore the one a startup default names. A setting the caller's composition refuses SHALL be skipped and logged with its section, name and code, and its mode SHALL keep the built-in. A refused setting SHALL never fail the call. A startup default that names a theme the principal's catalog shadowed with a refused entry SHALL be logged as a startup setting skipped for that caller.

The defaults SHALL reach every per-caller surface: `render_widget` and `preview_widget` with no `theme`, `list_themes`' `defaults`, page and app documents, the `ui://widgentic/page/{kind}` pages, and `IWidgenticRenderer`'s `RequestContext` overload.

#### Scenario: Startup defaults dress renders that name no theme
- **WHEN** the startup record makes `google-light` the light default and `google-dark` the dark default, and a client calls `render_widget` with no `theme`
- **THEN** `structuredContent.css` SHALL carry `google-light`'s tokens under `:root:not([data-theme="dark"])` and `google-dark`'s under `:root[data-theme="dark"]`, and `list_themes` SHALL report both defaults

#### Scenario: A startup default naming no configured theme stops startup
- **WHEN** the startup record names `ghost` as the dark default and no configured theme is named `ghost`
- **THEN** startup SHALL fail with a `WidgenticConfigurationException` listing section `settings` and code `UNKNOWN_THEME`

#### Scenario: In Merge a principal's settings section replaces the startup one
- **WHEN** the startup record sets both defaults, and a principal in Merge mode whose catalog holds a theme `night` returns `{ "defaultThemes": { "dark": "night" } }`
- **THEN** that principal's `list_themes` SHALL report `defaults: { "light": "light", "dark": "night" }`, and other principals SHALL keep the startup defaults

#### Scenario: A principal without settings keeps the startup defaults in Merge
- **WHEN** a principal in Merge mode returns a catalog with no settings record
- **THEN** its `list_themes` SHALL report the startup record's defaults

#### Scenario: In Replace the startup settings never apply
- **WHEN** the startup record sets both defaults and a principal in Replace mode returns a catalog with no settings record
- **THEN** its `list_themes` SHALL report `defaults: { "light": "light", "dark": "dark" }`

#### Scenario: A principal's refused setting is skipped and logged
- **WHEN** a principal's record names a theme its composed catalog does not serve
- **THEN** the call SHALL succeed with that mode on the built-in, and a log entry SHALL name the section `settings` and the code `UNKNOWN_THEME`

#### Scenario: A startup default left unresolved by a principal is logged
- **WHEN** the startup record makes `google-dark` the dark default, and a principal in Merge mode defines its own `google-dark` that validation refuses
- **THEN** that principal's dark default SHALL be the built-in, the call SHALL succeed, and a log entry SHALL name the startup setting that was skipped for this caller

#### Scenario: Previews and pages follow the caller's defaults
- **WHEN** a principal's light default differs from the startup record's, and the principal reads `ui://widgentic/page/{kind}` and calls `preview_widget` with no `theme`
- **THEN** both SHALL carry the principal's light default, and another principal's page SHALL carry its own
