// A .NET MCP server with widgentic over stdio: the example widgets (designer exports in
// widgets/), the render-side widgentic tools, and one tool of the server's own that renders
// its result as a widget. Register it in an MCP Apps host as `dotnet run --project <this dir>`.
using System.ComponentModel;
using System.Text.Json.Nodes;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using ModelContextProtocol.Extensions.Apps;
using ModelContextProtocol.Protocol;
using ModelContextProtocol.Server;
using Widgentic.Mcp;

var builder = Host.CreateApplicationBuilder(args);
// stdout carries the protocol, so every log line goes to stderr.
builder.Logging.AddConsole(options => options.LogToStandardErrorThreshold = LogLevel.Trace);
builder.Services
    .AddMcpServer()
    .WithStdioServerTransport()
    .WithWidgentic(options => options.AddWidgetsFromDirectory(Path.Combine(AppContext.BaseDirectory, "widgets")))
    .WithTools<TeamTools>();
await builder.Build().RunAsync();

/// <summary>The server's own tools: data from its backend, shown as widgentic widgets.</summary>
[McpServerToolType]
public sealed class TeamTools
{
    /// <summary>The team, as a table the host mounts inline.</summary>
    [McpServerTool(Name = "team_roster", ReadOnly = true)]
    [Description("The team roster with each person's role, shown as a table.")]
    [McpAppUi(ResourceUri = WidgenticResources.AppTemplateUri)]
    public static ValueTask<CallToolResult> TeamRoster(IWidgenticRenderer renderer, McpServer server, CancellationToken cancellationToken)
    {
        var rows = new JsonArray(
            new JsonObject { ["name"] = "Ada Lovelace", ["role"] = "Engineer", ["since"] = 2021 },
            new JsonObject { ["name"] = "Grace Hopper", ["role"] = "Architect", ["since"] = 2019 },
            new JsonObject { ["name"] = "Linus Torvalds", ["role"] = "Maintainer", ["since"] = 2023 });
        return renderer.RenderAsync(
            new WidgetRenderRequest("table", rows) { Meta = new JsonObject { ["title"] = "Team roster" } },
            server,
            cancellationToken);
    }
}
