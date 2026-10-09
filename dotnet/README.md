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

**Versions.** `Widgentic.Mcp` X.Y.* embeds `@widgentic/mcp` X.Y.*, so `Widgentic.Mcp` 0.9.x
renders exactly like the Node server of `@widgentic/mcp` 0.9. The patch number moves on its own
for .NET-only fixes. The tools differ only by scope: this package is render-only (no
`list_actions` or `execute_action`, no image inlining). The input schemas are the documented
ones from `@widgentic/mcp`, while the Node server publishes its zod rendering of the same
schemas.

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
  Core rate limiting), as the Node server does.
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
SDK's experimental MCP Apps API, so projects that use it suppress `MCPEXP003`.

## Your own widgets, themes and schemas

Design widgets in the widgentic designer, export them, and drop the JSON into your project:

- `AddWidget(json)` and `AddWidgetsFromDirectory(path)` take the designer's export shape
  `{ kind, template, descriptor, load? }`: one object, or an array.
- `AddTheme(json)` and `AddThemesFromDirectory(path)` take theme entries `{ name, tokens, … }`.
- `AddSchema(json)` and `AddSchemasFromDirectory(path)` take shared schemas `{ name, schema, … }`.
  A widget whose `descriptor.dataSchemaRef` names a schema needs that schema loaded too.

The directory helpers read every `*.json` file in ordinal name order, and each file holds one
entry or an array.

Every entry is validated by the bundle at startup. Anything refused (a forbidden tag, a
reserved kind such as `card`, a theme named `light`, malformed JSON) stops startup with a
`WidgenticConfigurationException` listing every problem with its file. Nothing is accepted
and then silently missing.

## Render-only, for now

- Http actions in templates render **disabled** ("This action is not available"). Prompt
  actions work: the template proposes them to the host's composer.
- `execute_action`, `list_actions` and widget `load` bindings are not available. A `load` is
  accepted and logged once as inactive.
- The package makes **no outbound requests**. Images are therefore not inlined: in MCP Apps
  hosts whose sandbox blocks external images, serve them from a host listed in
  `ResourceDomains` (declared to the host as CSP) or pass `data:` URIs.

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
seed (an appointment agenda and an email inbox, two Google-style themes, and the shared schemas
the widgets reference) plus one host tool, over stdio by default or over Streamable HTTP with
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
for clients that initialize (`SessionMode = StatefulForInitializeClients`). It binds loopback
only, because it has no authentication.

## Developing this package

The package lives in the widgentic repository and embeds the bundle built there.

```sh
npm ci && npm run build                    # at the root: the host bundle
cd dotnet && dotnet test --solution Widgentic.slnx -c Release
```

The tests read the conformance corpus that `npm run conformance:generate` writes, so a
behavior change in TypeScript reaches the .NET suite without anything being copied.

MIT © Diego Hoyos
