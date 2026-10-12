// A .NET MCP server with widgentic: the docker example's demo seed (widgets, themes, shared
// schemas and the settings choosing default themes, under seed/), the render-side widgentic tools, and one tool of the server's own that
// renders its result as a widget. Two transports, one server:
//   (default)  stdio, for hosts that launch the process (Claude Code, VS Code, Inspector)
//   --http     Streamable HTTP at http://localhost:3002/mcp (or --urls ...), for hosts that
//              connect to a URL, such as Claude's custom connectors (through a tunnel) and VS Code
// Over HTTP each caller may also get its own catalog: a demo key (the x-api-key header, or ?key=
// for hosts that only take a URL) names the merge-demo or replace-demo principal, whose entries
// under principals/ (settings included) compose with the seed for that caller's calls. Keys come from configuration,
// Widgentic:Sample:Keys:<principal>; without a known key the seed serves.
using System.ComponentModel;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;
using ModelContextProtocol.AspNetCore;
using ModelContextProtocol.Extensions.Apps;
using ModelContextProtocol.Protocol;
using ModelContextProtocol.Server;
using Widgentic.Mcp;

if (args.Contains("--http"))
{
    var web = WebApplication.CreateBuilder(args.Where(arg => arg != "--http").ToArray());
    // Loopback unless the operator says otherwise: the demo keys select a catalog, they gate nothing.
    if (string.IsNullOrEmpty(web.Configuration["urls"])) web.WebHost.UseUrls("http://localhost:3002");
    // The request-start log prints the URL, and ?key= with it; keys are never printed.
    web.Logging.AddFilter("Microsoft.AspNetCore.Hosting.Diagnostics", LogLevel.Warning);
    web.Services.AddAuthentication(SampleKeys.SchemeName).AddScheme<AuthenticationSchemeOptions, SampleKeys>(SampleKeys.SchemeName, null);
    web.Services.AddSingleton<IWidgenticCatalogSource, SampleCatalogs>();
    // Clients on the 2026-07-28 revision are stateless and send their capabilities with every
    // request; older clients that initialize get a session, so their capabilities are known too.
    web.Services.AddMcpServer()
        .WithHttpTransport(options => options.SessionMode = HttpServerSessionMode.StatefulForInitializeClients)
        .AddSampleServer();
    var app = web.Build();
    app.UseAuthentication();
    app.MapMcp("/mcp");
    await app.RunAsync();
}
else
{
    var builder = Host.CreateApplicationBuilder(args);
    // stdout carries the protocol, so every log line goes to stderr.
    builder.Logging.AddConsole(options => options.LogToStandardErrorThreshold = LogLevel.Trace);
    builder.Services.AddMcpServer().WithStdioServerTransport().AddSampleServer();
    await builder.Build().RunAsync();
}

/// <summary>The sample's server, identical over both transports.</summary>
internal static class SampleServer
{
    private static readonly string Seed = Path.Combine(AppContext.BaseDirectory, "seed");

    public static IMcpServerBuilder AddSampleServer(this IMcpServerBuilder mcp) =>
        mcp.WithWidgentic(options => options
                .AddSchemasFromDirectory(Path.Combine(Seed, "schemas"))
                .AddThemesFromDirectory(Path.Combine(Seed, "themes"))
                .AddWidgetsFromDirectory(Path.Combine(Seed, "widgets"))
                .UseSettingsFromFile(Path.Combine(Seed, "settings.json")))
            .WithTools<TeamTools>();
}

/// <summary>
/// Names the caller from a demo key, sent as the <c>x-api-key</c> header or the <c>key</c> query
/// parameter. A request without a known key stays anonymous.
/// </summary>
internal sealed class SampleKeys(
    IOptionsMonitor<AuthenticationSchemeOptions> options,
    ILoggerFactory logger,
    UrlEncoder encoder,
    IConfiguration configuration) : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    public const string SchemeName = "SampleKey";

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var presented = Request.Headers["x-api-key"].FirstOrDefault() ?? Request.Query["key"].FirstOrDefault();
        if (string.IsNullOrEmpty(presented)) return Task.FromResult(AuthenticateResult.NoResult());
        var bytes = Encoding.UTF8.GetBytes(presented);
        foreach (var key in configuration.GetSection("Widgentic:Sample:Keys").GetChildren())
        {
            if (string.IsNullOrEmpty(key.Value) || !CryptographicOperations.FixedTimeEquals(bytes, Encoding.UTF8.GetBytes(key.Value))) continue;
            var principal = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.Name, key.Key)], SchemeName));
            return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(principal, SchemeName)));
        }
        return Task.FromResult(AuthenticateResult.NoResult());
    }
}

/// <summary>
/// The demo principals' catalogs, read from <c>principals/&lt;name&gt;/</c> on every call:
/// merge-demo merges with the seed (the default mode), replace-demo replaces it. Anyone else is
/// served the seed.
/// </summary>
internal sealed class SampleCatalogs : IWidgenticCatalogSource
{
    private static readonly string Principals = Path.Combine(AppContext.BaseDirectory, "principals");

    private static readonly Dictionary<string, WidgenticComposition?> Modes = new(StringComparer.Ordinal)
    {
        ["merge-demo"] = null,
        ["replace-demo"] = WidgenticComposition.Replace,
    };

    public ValueTask<WidgenticCatalog?> GetCatalogAsync(WidgenticCaller caller, CancellationToken cancellationToken)
    {
        if (caller.User?.Identity is not { IsAuthenticated: true, Name: { } name } || !Modes.TryGetValue(name, out var mode))
        {
            return ValueTask.FromResult<WidgenticCatalog?>(null);
        }
        var catalog = new WidgenticCatalog { Composition = mode };
        var root = Path.Combine(Principals, name);
        if (Directory.Exists(Path.Combine(root, "schemas"))) catalog.AddSchemasFromDirectory(Path.Combine(root, "schemas"));
        if (Directory.Exists(Path.Combine(root, "themes"))) catalog.AddThemesFromDirectory(Path.Combine(root, "themes"));
        if (Directory.Exists(Path.Combine(root, "widgets"))) catalog.AddWidgetsFromDirectory(Path.Combine(root, "widgets"));
        if (File.Exists(Path.Combine(root, "settings.json"))) catalog.UseSettings(File.ReadAllText(Path.Combine(root, "settings.json")));
        return ValueTask.FromResult<WidgenticCatalog?>(catalog);
    }
}

/// <summary>The server's own tools: data from its backend, shown as widgentic widgets.</summary>
[McpServerToolType]
public sealed class TeamTools
{
    /// <summary>The team, as a table the host mounts inline.</summary>
    [McpServerTool(Name = "team_roster", ReadOnly = true)]
    [Description("The team roster with each person's role, shown as a table.")]
    [McpAppUi(ResourceUri = WidgenticResources.AppTemplateUri)]
    public static ValueTask<CallToolResult> TeamRoster(
        IWidgenticRenderer renderer,
        RequestContext<CallToolRequestParams> context,
        CancellationToken cancellationToken)
    {
        var rows = new JsonArray(
            new JsonObject { ["name"] = "Ada Lovelace", ["role"] = "Engineer", ["since"] = 2021 },
            new JsonObject { ["name"] = "Grace Hopper", ["role"] = "Architect", ["since"] = 2019 },
            new JsonObject { ["name"] = "Linus Torvalds", ["role"] = "Maintainer", ["since"] = 2023 });
        return renderer.RenderAsync(
            new WidgetRenderRequest("table", rows) { Meta = new JsonObject { ["title"] = "Team roster" } },
            context,
            cancellationToken);
    }
}
