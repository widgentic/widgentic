## Purpose
widgentic for MCP servers written in .NET. The `Widgentic.Mcp` NuGet package runs the published `@widgentic/mcp` host bundle in an embedded V8 engine. It wires the widgentic tools, the MCP Apps template and a renderer for the host's own tools onto the official C# MCP SDK. Nothing is re-implemented in C#: rendering, validation, tool texts and the app template all come from the bundle, and output is byte-identical to the Node path. Render-only in this version. Ships in `Widgentic.Mcp` (NuGet, beta).

## ADDED Requirements

### Requirement: The package runs the embedded host bundle and restates nothing
`Widgentic.Mcp` SHALL embed exactly one `@widgentic/mcp` host bundle (the `./host` entry's artifact) as a resource and execute it with ClearScript V8. Every tool name, tool description, input schema, rendered output, validation outcome, authoring-guide text and app-template byte that the package serves SHALL come from that bundle. The C# sources SHALL carry no copy of any of them. The package SHALL expose the embedded bundle's identity — the `@widgentic/mcp` version it was taken from and the bundle's SHA-256 — through a public `WidgenticEngineInfo`, and SHALL log it once at startup.

#### Scenario: Tool texts come from the bundle
- **WHEN** a C# SDK client lists the tools of a server configured with `WithWidgentic()`
- **THEN** each widgentic tool's name, description and input schema SHALL deep-equal the bundle's `definitions()` entry for that tool

#### Scenario: The embedded bundle is identifiable
- **WHEN** `WidgenticEngineInfo` is read
- **THEN** it SHALL report the `@widgentic/mcp` version and a SHA-256 that equals the hash of the embedded resource's bytes

### Requirement: Output is byte-identical to the Node path
Every input of the repository's conformance corpus, run through the package, SHALL produce output byte-identical to the corpus output recorded from the Node path. This covers the tool result JSON, `structuredContent` and `isError`. The package's test suite SHALL assert this for the whole corpus, read from the repository rather than copied into the .NET tree.

#### Scenario: The corpus passes on V8
- **WHEN** the .NET test suite runs every corpus input through the package's renderer
- **THEN** every output SHALL equal its recorded Node output, byte for byte

#### Scenario: Locale formats match browsers
- **WHEN** the corpus input that formats a currency value with locale `fr-CA` is rendered through the package
- **THEN** the formatted text SHALL equal the Node output, `1 234,50 $` with the corpus's spacing normalization, not an engine-specific variant such as `CA$`

### Requirement: WithWidgentic wires the widgentic surface onto the C# SDK
The package SHALL extend the C# SDK's server builder with `WithWidgentic(Action<WidgenticOptions>? configure = null)`. The call SHALL enable the SDK's MCP Apps extension and register:
- the selected widgentic tools, each answering through the bundle's `call`;
- `render_widget` with `_meta.ui.resourceUri` set to `ui://widgentic/app.html`;
- the app template resource at that URI, with MIME type `text/html;profile=mcp-app` and content equal to the bundle's `appTemplate()`;
- unless `IncludeWidgetPages` is false, the `ui://widgentic/page/{kind}` resource template, serving the bundle's `widgetPage(kind)`.

`WidgenticOptions.ResourceDomains` SHALL be declared as `_meta.ui.csp.resourceDomains` on the app resource, and the key SHALL be absent when the list is empty. The list is deployment configuration: no widget, theme or render input can extend it. Model-facing output SHALL be slimmed exactly when the calling session's client advertised the Apps UI capability with the app MIME type. When no capabilities were negotiated for the request, as in stateless HTTP, `WidgenticOptions.AssumeUi` (default false) SHALL decide, which is the equivalent of the Node assembly's `WIDGENTIC_ASSUME_UI`.

#### Scenario: The tool declares its template
- **WHEN** a C# SDK client lists tools
- **THEN** `render_widget` SHALL carry `_meta.ui.resourceUri: "ui://widgentic/app.html"`

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

#### Scenario: Stateless requests follow AssumeUi
- **WHEN** a request arrives with no negotiated client capabilities on a server configured with `AssumeUi = true`
- **THEN** `render_widget` with default format SHALL return the slim output
- **AND** with `AssumeUi` left at its default the same request SHALL return the full output

#### Scenario: Preview pages serve the dataExample
- **WHEN** the client reads `ui://widgentic/page/card`
- **THEN** the content SHALL equal the bundle's `widgetPage("card")`

### Requirement: Hosts choose which tools are exposed
`WidgenticOptions.Tools` SHALL be a flags value over `ListWidgets`, `RenderWidget`, `ListThemeTokens`, `ListThemes`, `ListSchemas` and `GetAuthoringGuide`. Its default, `WidgenticTools.Default`, SHALL include all six. A tool not selected SHALL NOT be registered: it is absent from `tools/list`, and a call to it is answered as an unknown tool. Any subset SHALL be valid, including `None`. The app template resource SHALL be registered whatever the selection, because a host's own tools render through it. No option SHALL register `execute_action` or `list_actions` in this version.

#### Scenario: The default exposes the render-side set
- **WHEN** a server is configured with `WithWidgentic()` and a client lists tools
- **THEN** exactly `list_widgets`, `render_widget`, `list_theme_tokens`, `list_themes`, `list_schemas` and `get_authoring_guide` SHALL be listed from widgentic

#### Scenario: A hidden tool is gone
- **WHEN** the server is configured with `Tools = WidgenticTools.Default & ~WidgenticTools.GetAuthoringGuide`
- **THEN** `get_authoring_guide` SHALL be absent from `tools/list`, and calling it SHALL produce the SDK's unknown-tool error

#### Scenario: No widgentic tools, still rendering
- **WHEN** the server is configured with `Tools = WidgenticTools.None` and registers its own tool that returns a widgentic render
- **THEN** no widgentic tool SHALL be listed, the app template resource SHALL still be readable, and the host tool's result SHALL mount in an Apps host

#### Scenario: Actions cannot be exposed
- **WHEN** any combination of `WidgenticTools` values is configured
- **THEN** neither `execute_action` nor `list_actions` SHALL appear in `tools/list`

### Requirement: A host's own tools render widgets
The package SHALL register an `IWidgenticRenderer` service. Its `RenderAsync` SHALL accept the `render_widget` arguments (`widget`, `data`, optional `hints`, `meta`, `format`, `theme`) plus the calling session. It SHALL return a C# SDK `CallToolResult` equal to the result `render_widget` would return for the same arguments in the same session. Invalid input SHALL become an `isError` result with the bundle's structured error, never an exception. The package SHALL expose the app template URI as a public constant, so a host tool declares `[McpAppUi(ResourceUri = ...)]` without restating it. The result's content SHALL keep the widgentic payload block, so the model still sees the data in slim mode.

#### Scenario: A host tool equals render_widget
- **WHEN** a host tool returns `renderer.RenderAsync(new WidgetRenderRequest("table", rows), session)`, and a client calls both that tool and `render_widget` with the same arguments
- **THEN** both results SHALL serialize to the same JSON

#### Scenario: A host tool mounts in Apps hosts
- **WHEN** a host tool declared with `[McpAppUi(ResourceUri = WidgenticResources.AppTemplateUri)]` is listed
- **THEN** it SHALL carry `_meta.ui.resourceUri: "ui://widgentic/app.html"`

#### Scenario: Bad input is a result
- **WHEN** a host tool renders an unknown widget kind
- **THEN** `RenderAsync` SHALL return `isError: true` with the `UNKNOWN_KIND` error naming the available kinds, and SHALL NOT throw

### Requirement: Widgets, themes and schemas load from designer JSON and are refused at the door
`WidgenticOptions` SHALL accept widget definitions in the designer's export shape, one per JSON document or as a JSON array, from strings and from every `*.json` file in a directory. It SHALL also accept theme entries and shared schema entries as JSON. Every entry SHALL be validated by the bundle at startup. If the bundle reports any problem, the host SHALL fail to start with a `WidgenticConfigurationException` listing each problem's section, source (file path when loaded from a file), index, code and message: no entry is ever accepted and then silently missing. A widget that declares a `load` binding SHALL be accepted, and the package SHALL log once at startup that the binding is inactive in this render-only version.

#### Scenario: A designer export is served
- **WHEN** a file holding the designer's export of the example invoice widget is loaded and a client calls `list_widgets`
- **THEN** `invoice` SHALL be listed with its descriptor, and `render_widget` with its `dataExample` SHALL succeed

#### Scenario: An invalid entry stops startup
- **WHEN** the configured directory holds a widget whose template uses a forbidden tag
- **THEN** the host SHALL fail to start with a `WidgenticConfigurationException` naming the file, the section `widgets`, and the structured code

#### Scenario: Reserved names are refused
- **WHEN** the configuration carries a widget of kind `card` or a theme named `light`
- **THEN** startup SHALL fail naming the reserved entry

#### Scenario: A load binding is inactive, not fatal
- **WHEN** the example weather widget, which declares an http action, is loaded
- **THEN** startup SHALL succeed, a single startup log line SHALL say that the binding is inactive, and a render SHALL carry its http action with `disabled: "unresolved"`

### Requirement: The engine is isolated, bounded and stateless
The package SHALL run the bundle in a bounded pool of independent V8 runtimes. The default size is `Math.Min(Environment.ProcessorCount, 4)`; `EnginePoolSize` overrides it. Every runtime SHALL load the bundle and create its host at startup, so configuration problems surface before the first request. Only strings, and the boolean `slim` flag, SHALL cross between .NET and script. No .NET object, type, file system or network access SHALL be exposed to the script.

Each call SHALL be bounded by `CallTimeout` (default 2 seconds) and by a per-runtime heap limit. A call that exceeds either SHALL return an `isError` result with code `ENGINE_TIMEOUT` or `ENGINE_FAILURE`. The runtime that failed SHALL be discarded and replaced, and the host process SHALL keep serving. A runtime SHALL be used by one call at a time. Pooling SHALL carry no data between calls: the bundle keeps no per-call state, and the pool serves only the configuration given at startup. A per-principal catalog is not part of this version.

#### Scenario: Concurrent calls render correctly
- **WHEN** 64 renders of distinct payloads run concurrently against a pool of 4
- **THEN** every result SHALL equal the same payload rendered alone

#### Scenario: A runaway call is contained
- **WHEN** a call exceeds `CallTimeout` (forced in tests with a test-only slow configuration)
- **THEN** the call SHALL return `isError: true` with code `ENGINE_TIMEOUT`, the next call SHALL succeed, and the pool size SHALL be unchanged

#### Scenario: Nothing leaks between callers
- **WHEN** payload A is rendered and then payload B on the same runtime
- **THEN** B's result SHALL equal B rendered on a fresh runtime, and SHALL contain no string that appears only in A

### Requirement: Render-only in this version
The package SHALL make no outbound network request. It SHALL NOT register `execute_action` or emit `load` descriptors. Http actions in templates SHALL render disabled for the `unresolved` reason, so the bridge shows them as unavailable. Prompt actions SHALL work unchanged, because the bridge proposes them to the host's composer. Server-side image inlining SHALL NOT be performed: in Apps hosts whose sandbox blocks external images, images SHALL display only when served from a declared `ResourceDomains` host or given as `data:` URIs. The package README SHALL state these limits.

#### Scenario: No egress
- **WHEN** the test suite renders every corpus input with outbound networking unavailable to the process
- **THEN** every render SHALL succeed with output equal to the corpus, and no network attempt SHALL be recorded

#### Scenario: Prompt actions survive
- **WHEN** a widget whose template binds a prompt action is rendered
- **THEN** the element SHALL carry the prompt descriptor with no `disabled` key

### Requirement: Protocol round trip and a runnable sample
`dotnet/samples` SHALL contain a runnable stdio MCP server. It configures `WithWidgentic` with the example widgets, read from JSON generated out of `examples/mcp-server/widgets` (never hand-copied), and registers one host tool rendering through `IWidgenticRenderer`. The test suite SHALL connect a C# SDK client to the package's server over an in-process transport and verify `list_widgets`, `render_widget` (success and the `isError` path for an unknown kind), the host tool, and `resources/read` of the app template through the real protocol.

#### Scenario: Protocol round trip
- **WHEN** an in-process C# SDK client calls `render_widget` with `{ widget: "card", data: { title: "T" } }`
- **THEN** the delivered result SHALL contain `structuredContent.html` with `class="wg-card"`, and a content block carrying the widgentic payload

#### Scenario: Error through the protocol
- **WHEN** the client calls `render_widget` with an unknown widget id
- **THEN** the delivered result SHALL have `isError: true` with the `UNKNOWN_KIND` JSON error

#### Scenario: The sample serves the example widgets
- **WHEN** the sample's generated widget JSON is compared with `examples/mcp-server/widgets` exported through the designer's export shape
- **THEN** they SHALL be equal, and the sample's `list_widgets` SHALL include `invoice`, `weather` and `x-post`
