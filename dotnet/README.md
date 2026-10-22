# Widgentic.Mcp

> **Beta, render-only.** The API may change in minor versions before 1.0.

[widgentic](https://widgentic.dev) widgets for MCP servers written in .NET. Your tools return
structured data; MCP Apps hosts (Claude, VS Code, ChatGPT) show it as cards, tables, trees,
groups or your own designer-made widgets, and other hosts get readable text.

The package does not re-implement widgentic. It embeds the published `@widgentic/mcp` host
bundle and runs it on V8 (ClearScript). Rendering, validation, the tool descriptions, the
authoring guide and the MCP Apps template all come from that bundle, and renders are
byte-identical to the Node server's, apart from image inlining, which this render-only release
does not do. The repository's conformance corpus checks that on every
build.

Requires .NET 10 and the official C# MCP SDK (`ModelContextProtocol` 2.2).

**Versions.** `Widgentic.Mcp` X.Y.* embeds `@widgentic/mcp` X.Y.*, so `Widgentic.Mcp` 0.13.x
renders exactly like the Node server of `@widgentic/mcp` 0.13. The patch number moves on its own
for .NET-only fixes. The tools differ only by scope: this package is render-only (no
`list_actions` or `execute_action`, no image inlining). The input schemas are the exported
ones from `@widgentic/mcp`, the same ones its Node server advertises (from 0.11), and malformed
arguments get the same structured errors on both.

## Serve widgentic

```sh
dotnet add package Widgentic.Mcp
```

```csharp
builder.Services
    .AddMcpServer()
    .WithStdioServerTransport()          // or WithHttpTransport()
    .WithWidgentic(options =>
    {
        options.AddSchemasFromDirectory("seed/schemas")   // optional: shared schemas,
               .AddThemesFromDirectory("seed/themes")     // themes,
               .AddWidgetsFromDirectory("seed/widgets");  // and designer exports
        options.Tools = WidgenticTools.Default & ~WidgenticTools.GetAuthoringGuide;
    });
```

`WithWidgentic` registers:
- **The tools you select.** `WidgenticTools` is a flags enum over `ListWidgets`,
  `RenderWidget`, `ListThemeTokens`, `ListThemes`, `ListSchemas` and `GetAuthoringGuide`. The
  default is all six; any subset is valid, including `None`. A tool you leave out is not
  registered at all. The authoring guide may still mention a hidden tool by name: the texts
  come from the bundle unchanged. `RenderWidget` also brings the app-only `preview_widget`,
  which the template calls while a `render_widget` call is still streaming, so the widget
  fills in as its data arrives. If you serve over HTTP, rate-limit it at your edge (ASP.NET
  Core rate limiting), as the Node server does. Every tool carries the bundle's annotations:
  all are read-only, non-destructive and idempotent, and only `render_widget` is open-world
  (the Node server fetches images to inline them).
- **The MCP Apps template** (`ui://widgentic/app.html`), always, because your own tools render
  through it.
- **The preview pages** (`ui://widgentic/page/{kind}`), unless `IncludeWidgetPages = false`.
- **An `IWidgenticRenderer`** for your own tools (below).

It also enables the SDK's MCP Apps extension. Output for the model is slimmed when the
client advertises MCP Apps support: from the session when there is one, and otherwise from the
capabilities each stateless request carries (MCP 2026-07-28, the SDK's HTTP default). Only
when a call reveals neither does `AssumeUi` decide.

## Render from your own tools

```csharp
[McpServerToolType]
public sealed class TeamTools
{
    [McpServerTool(Name = "team_roster", ReadOnly = true), Description("The team as a table.")]
    [McpAppUi(ResourceUri = WidgenticResources.AppTemplateUri)]
    public static ValueTask<CallToolResult> TeamRoster(
        IWidgenticRenderer renderer, RequestContext<CallToolRequestParams> context, CancellationToken ct) =>
        renderer.RenderAsync(new WidgetRenderRequest("table", rows) { Meta = new() { ["title"] = "Team" } }, context, ct);
}
```

The result is exactly what `render_widget` would return. MCP Apps hosts mount it inline, and
the model still receives the data in the payload block. Invalid input comes back as an
`isError` result with a structured code, never as an exception. `[McpAppUi]` belongs to the
SDK's experimental MCP Apps API, so projects that use it suppress `MCPEXP003`. With a catalog
source (below), the `RequestContext` overload renders with the caller's catalog; the session
overload always renders with the startup catalog.

## Your own widgets, themes and schemas

Design widgets in the widgentic designer, export them, and drop the JSON into your project:

- `AddWidget(json)` and `AddWidgetsFromDirectory(path)` take the designer's export shape
  `{ kind, template, descriptor, load? }`: one object, or an array.
- `AddTheme(json)` and `AddThemesFromDirectory(path)` take theme entries `{ name, tokens, styles?, … }`.
  An entry is complete as given: to base one theme on another, merge the base's tokens and
  styles into it first.
- `AddSchema(json)` and `AddSchemasFromDirectory(path)` take shared schemas `{ name, schema, … }`.
  A widget whose `descriptor.dataSchemaRef` names a schema needs that schema loaded too.

The directory helpers read every `*.json` file in ordinal name order, and each file holds one
entry or an array.

Every entry is validated by the bundle at startup. Anything refused (a forbidden tag, a
reserved kind such as `card`, a theme named `light`, malformed JSON) stops startup with a
`WidgenticConfigurationException` listing every problem with its file. Nothing is accepted
and then silently missing.

## Default themes

A render that names no theme takes, for the host's colour scheme, the theme the widget's
`descriptor.themes` names, else the default theme: the built-in `light` and `dark`, unless a
settings record chooses others. The record has the
widgentic store's shape:

```json
{ "defaultThemes": { "light": "google-light", "dark": "google-dark" } }
```

Set it at startup with `UseSettings(json)` or `UseSettingsFromFile(path)`. Each default must name
a configured theme, and a refused setting stops startup like a refused entry.

- **Which output takes which default.** The light default dresses light hosts and the dark
  default dark hosts. Page documents and preview pages take the light default.
- **An explicit `theme` input** replaces both defaults.
- **`list_themes`** reports the effective `defaults`.

## Resource domains

The app resource declares the domains its frame may load assets from directly, as the MCP
Apps CSP block `_meta.ui.csp.resourceDomains`. Since this package does not inline images, a
declared domain is how an external image displays in hosts that enforce `img-src` (claude.ai,
ChatGPT and VS Code all do). The declaration lists `ResourceDomains`, then the settings record's
`resourceDomains` section:

```csharp
options.ResourceDomains.Add("assets.example.org");
options.UseSettings(""" { "resourceDomains": ["cdn.example.com", "*.example.net"] } """);
```

- **Forms.** `cdn.example.com`, `*.example.com`, or either behind `https://`, at most 20 in the
  settings section. They are declared as canonical origins (`https://cdn.example.com`).
  Ports, paths, IP addresses, single-label hosts and other schemes are refused, and a refused
  entry stops startup.
- **Trust.** Any render, including image addresses an agent supplies, may load from a declared
  domain in the viewer's browser. Hosts put the domains into their script, style and font
  sources too. List only domains you control.
- **Caching.** Hosts keep the declaration they read: claude.ai keeps it until the page reloads.

The settings record may also list stylesheets every frame links: an icon font or a brand font,
on a declared domain.

```csharp
options.ResourceDomains.Add("fonts.googleapis.com");
options.ResourceDomains.Add("fonts.gstatic.com");
options.UseSettings(""" { "resources": [{ "type": "stylesheet", "href": "https://fonts.googleapis.com/icon?family=Material+Icons" }] } """);
```

- **Delivery.** Each stylesheet rides every render and preview in `structuredContent.resources`.
  The app template links it before the widget's CSS, and templates may then use its classes
  (`material-icons`).
- **Rules.** Up to 8 entries, each `{ "type": "stylesheet", "href", "integrity"? }` with an
  `https://` address and no port. Its host must be covered by `ResourceDomains` or the record's
  `resourceDomains`, and the fonts' domain must be declared too. A refused or uncovered entry
  stops startup.

## A catalog per caller

One server can serve each caller (a tenant, a user) its own widgets, themes and schemas.
Authenticate callers the ASP.NET Core way and register an `IWidgenticCatalogSource`. It receives
the caller's `ClaimsPrincipal` and the request's services, and returns a `WidgenticCatalog`, or
`null` to serve the startup catalog. Where catalogs live is up to you:

```csharp
builder.Services.AddSingleton<IWidgenticCatalogSource, TenantCatalogs>();

sealed class TenantCatalogs(ITenantWidgets store) : IWidgenticCatalogSource
{
    public async ValueTask<WidgenticCatalog?> GetCatalogAsync(WidgenticCaller caller, CancellationToken ct)
    {
        if (caller.User?.FindFirst("tenant")?.Value is not { } tenant) return null;   // the startup catalog
        var catalog = new WidgenticCatalog();
        foreach (var json in await store.WidgetsAsync(tenant, ct)) catalog.AddWidget(json);
        return catalog;
    }
}
```

The catalog composes with the startup entries in one of two modes. `WidgenticOptions.PrincipalComposition`
sets the default, and a catalog's own `Composition` overrides it for its caller:
- **`Merge`** (the default): the startup entries plus the caller's. A caller's entry replaces
  the startup entry with the same identifier (a widget's `kind`, a theme's or schema's `name`),
  so no identifier is served twice. The remaining startup entries compose first, so the
  caller's widgets can reference startup schemas.
- **`Replace`**: the built-ins and the caller's entries only.

Built-in kinds and the `light`/`dark` themes stay reserved in both modes.

A catalog may also carry the caller's settings record (`Settings`, or `UseSettings(json)`).
- **In `Merge`,** each section the caller's record defines replaces the startup record's whole.
  So `{ "defaultThemes": { "dark": "night" } }` leaves the light mode on the built-in even when
  the startup record sets one. A caller without a record keeps the startup defaults.
- **In `Replace`,** only the caller's record applies.
- **Resolution.** Defaults name themes of the caller's composed catalog. A default that names
  none is skipped and logged, and that mode keeps its built-in.
- **Resource domains** combine the same way. The app resource then declares `ResourceDomains`
  followed by the caller's effective section, on `resources/list` and `resources/read` alike.
  The template's content stays global. A caller's refused domain is skipped and logged, and a
  source that throws leaves the startup declaration.
- **Stylesheets** combine the same way, by section. A caller's stylesheet is delivered when
  `ResourceDomains` or the caller's effective `resourceDomains` cover it. Otherwise it is skipped
  and logged as `UNDECLARED_DOMAIN`.

`list_widgets`, `render_widget`, `preview_widget`, `list_themes`, `list_schemas`, the preview
pages and the renderer's `RequestContext` overload answer from the caller's catalog. `tools/list`,
`list_theme_tokens` and `get_authoring_guide` are the same for every caller and never call the
source. The app template's content is the same for every caller too, but its domain declaration
asks the source on `resources/list` and `resources/read` (above).

- **Nothing is cached.** Each call asks the source, composes inside the leased runtime (about
  0.05 ms per widget, 2.3 ms at 50) and drops the composition when the call ends. If fetching
  catalogs is slow, cache in your source.
- **A caller's refused entry never fails a call.** Startup entries stop startup, but a caller's
  invalid entry is skipped, as is any repeat of an identifier within one catalog (the first one
  wins). Each is logged at Warning under `Widgentic.Mcp.Catalogs` with its section, index, name
  and code, never its contents. A refused entry still replaces the startup entry with its
  identifier.
- **A failing source is a result.** If the source throws, tools answer `isError` with
  `CATALOG_UNAVAILABLE` and a preview page read fails. The exception is logged, and its message
  never reaches the client.
- **Limits.** The composed set counts against the limits of 100 widgets, 50 themes and 50
  schemas. In `Merge` the startup entries come first, so a large startup set leaves each caller
  less room; entries past a limit are refused with `LIMIT_REACHED`.
- **Themes saved under older token rules are refused whole.** If a theme has a token value
  that today's rules refuse, .NET refuses the whole theme and logs it. The widgentic store
  instead trims the value and keeps serving the theme. If your source reads a widgentic
  store's data, re-save such themes in the designer.

## Render-only, for now

- Http actions in templates render **disabled** ("This action is not available"). Prompt
  actions work: the template proposes them to the host's composer.
- `execute_action`, `list_actions` and widget `load` bindings are not available. A `load` is
  accepted and logged once as inactive.
- The package makes **no outbound requests**. Images are therefore not inlined: in MCP Apps
  hosts whose sandbox blocks external images, serve them from a declared resource domain
  (`ResourceDomains` or a settings record's `resourceDomains`) or pass `data:` URIs.

## Engine and deployment

- **Engine pool.** `EnginePoolSize` V8 runtimes render concurrently; the default is the
  processor count, at most 4. All load the bundle at startup: about half a second for the
  first runtime, while native V8 loads, then tens of milliseconds for each further one. Only strings
  cross between .NET and script, and no .NET object, file or network access is exposed to
  script.
- **Limits.** Each call is bounded by `CallTimeout` (default 2 s) and a heap limit. A call
  that exceeds them returns `ENGINE_TIMEOUT` or `ENGINE_FAILURE`, and that runtime is
  replaced.
- **Native runtimes.** The package brings ClearScript's native V8 for `linux-x64`,
  `linux-arm64`, `win-x64` and `osx-arm64`, about 40 MB each. Publish with `-r <rid>` so only
  yours ships. Alpine (musl) is not supported; use the default Debian-based .NET images.
- **Identity.** `WidgenticEngineInfo` (from DI) reports the embedded `@widgentic/mcp`
  version and the bundle's SHA-256. Both are logged once at startup.

## Sample

[`samples/Widgentic.Sample.Stdio`](samples/Widgentic.Sample.Stdio) serves the docker example's demo
seed (an appointment agenda, an email inbox, a project status widget and a person card, two Google-style themes
as the light and dark defaults and the brand pair the person card names, four resource domains, the Material Icons stylesheet, and the shared schemas the agenda and inbox
reference) plus one host tool, over stdio by default or over Streamable HTTP with
`--http`. The seed files under `seed/` are generated from `examples/docker/seed/demo.json` by
`npm run conformance:generate`:

```sh
npm ci && npm run build        # at the repository root: builds the host bundle
dotnet run --project dotnet/samples/Widgentic.Sample.Stdio                          # http://localhost:3002/mcp (profile http, also F5)
dotnet run --project dotnet/samples/Widgentic.Sample.Stdio --launch-profile stdio   # stdio
```

Hosts that connect to a URL are where widgets render inline. Over HTTP the sample has been
verified in Claude, VS Code Copilot and ChatGPT, its own `team_roster` tool included. The
built executable still defaults to stdio when run without `--http`. Over HTTP the sample is stateless for MCP 2026-07-28 clients and keeps a session
for clients that initialize (`SessionMode = StatefulForInitializeClients`).

Over HTTP the sample also serves two demo principals, each with a small catalog under
`principals/`. Give each one a key in configuration, `Widgentic:Sample:Keys:merge-demo` and
`Widgentic:Sample:Keys:replace-demo` (as environment variables `Widgentic__Sample__Keys__merge-demo`
and so on, or on the command line), and connect with the key in an `x-api-key` header or as
`?key=` in the URL:

```sh
dotnet run --project dotnet/samples/Widgentic.Sample.Stdio -- --http \
  --Widgentic:Sample:Keys:merge-demo=<key> --Widgentic:Sample:Keys:replace-demo=<key>
```

- **`merge-demo`** gets the seed, with its own `email-inbox-widget` in place of the seed's and a
  `merge-demo-dark` theme, a copy of `google-dark` with a green accent. Its settings make
  `merge-demo-dark` its dark default, and its `resourceDomains` section lists the seed's four
  domains plus `ui-avatars.com` (a caller's section replaces the startup one whole, so it keeps
  the font domains the seed's Material Icons stylesheet needs).
- **`replace-demo`** gets the built-ins and its own `release-notes-widget` only, with the
  built-in defaults.
- **Callers without a known key** get the seed.

Keys are never logged; the request-start log, which would print `?key=`, is turned off. The keys
select a catalog and gate nothing, so the sample binds loopback only.

## Developing this package

The package lives in the widgentic repository and embeds the bundle built there.

```sh
npm ci && npm run build                    # at the root: the host bundle
cd dotnet && dotnet test --solution Widgentic.slnx -c Release
```

The tests read the conformance corpus that `npm run conformance:generate` writes, so a
behavior change in TypeScript reaches the .NET suite without anything being copied.

MIT © Diego Hoyos
