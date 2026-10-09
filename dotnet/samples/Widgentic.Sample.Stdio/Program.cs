// A .NET MCP server with widgentic: the docker example's demo seed (widgets, themes and shared
// schemas under seed/), the render-side widgentic tools, and one tool of the server's own that
// renders its result as a widget. Two transports, one server:
//   (default)  stdio, for hosts that launch the process (Claude Code, VS Code, Inspector)
//   --http     Streamable HTTP at http://localhost:3002/mcp (or --urls ...), for hosts that
//              connect to a URL, such as Claude's custom connectors (through a tunnel) and VS Code
using System.ComponentModel;
using System.Text.Json.Nodes;
using ModelContextProtocol.AspNetCore;
using ModelContextProtocol.Extensions.Apps;
using ModelContextProtocol.Protocol;
using ModelContextProtocol.Server;
using Widgentic.Mcp;

if (args.Contains("--http"))
{
    var web = WebApplication.CreateBuilder(args.Where(arg => arg != "--http").ToArray());
    // Loopback unless the operator says otherwise: the sample has no authentication.
    if (string.IsNullOrEmpty(web.Configuration["urls"])) web.WebHost.UseUrls("http://localhost:3002");
    // Clients on the 2026-07-28 revision are stateless and send their capabilities with every
    // request; older clients that initialize get a session, so their capabilities are known too.
    web.Services.AddMcpServer()
        .WithHttpTransport(options => options.SessionMode = HttpServerSessionMode.StatefulForInitializeClients)
        .AddSampleServer();
    var app = web.Build();
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
                .AddWidgetsFromDirectory(Path.Combine(Seed, "widgets")))
            .WithTools<TeamTools>();
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
