using Microsoft.Extensions.DependencyInjection;
using ModelContextProtocol.Extensions.Apps;
using ModelContextProtocol.Server;
using Widgentic.Mcp;
using Widgentic.Mcp.Engine;
using Widgentic.Mcp.Mcp;

// The SDK's builder extensions live in this namespace; ours sit beside them.
namespace Microsoft.Extensions.DependencyInjection;

/// <summary>Registers widgentic on the C# MCP SDK's server builder.</summary>
public static class WidgenticBuilderExtensions
{
    private const string LegacyResourceUriKey = "ui/resourceUri";

    /// <summary>
    /// Serve widgentic: the selected tools (names, descriptions and input schemas from the
    /// embedded bundle), the MCP Apps template resource, the preview pages, and an
    /// <see cref="IWidgenticRenderer"/> for the server's own tools. The engine starts here:
    /// a refused widget, theme or schema throws <see cref="WidgenticConfigurationException"/>
    /// before the server runs.
    /// </summary>
    /// <param name="builder">The SDK's server builder.</param>
    /// <param name="configure">Tool selection, widgets, themes, schemas and engine limits.</param>
    public static IMcpServerBuilder WithWidgentic(this IMcpServerBuilder builder, Action<WidgenticOptions>? configure = null)
    {
        ArgumentNullException.ThrowIfNull(builder);
        var options = new WidgenticOptions();
        configure?.Invoke(options);
        var unknown = options.Tools & ~WidgenticTools.Default;
        if (unknown != WidgenticTools.None)
        {
            throw new ArgumentOutOfRangeException(nameof(configure), options.Tools, $"Unknown WidgenticTools value: {unknown}.");
        }

        var engine = WidgenticEngine.Create(options);
        var domains = options.ResourceDomains
            .Select(domain => domain.Trim().ToLowerInvariant())
            .Where(domain => domain.Length > 0)
            .ToArray();

        var tools = new List<McpServerTool>();
        foreach (var definition in SelectDefinitions(engine.Definitions, options.Tools))
        {
            McpServerTool tool = new WidgenticTool(engine, definition, options.AssumeUi);
            if (tool.ProtocolTool.Name == WidgenticToolNames.RenderWidget)
            {
                tool = McpApps.SetAppUi(tool, new McpUiToolMeta { ResourceUri = engine.Resources.AppTemplateUri });
                // The TypeScript helper also writes the pre-2026 flat key; the Node server carries
                // both, so this server does too.
                tool.ProtocolTool.Meta![LegacyResourceUriKey] = engine.Resources.AppTemplateUri;
            }
            tools.Add(tool);
        }

        var resources = new List<McpServerResource> { WidgenticResourceFactory.AppTemplate(engine, domains) };
        if (options.IncludeWidgetPages) resources.Add(WidgenticResourceFactory.WidgetPage(engine));

        builder.Services.AddSingleton(engine);
        builder.Services.AddSingleton(engine.Info);
        builder.Services.AddSingleton<IWidgenticRenderer>(new WidgenticRenderer(engine, options.AssumeUi));
        builder.Services.AddHostedService<WidgenticStartupLog>();
        return builder.WithMcpApps().WithTools(tools).WithResources(resources);
    }

    /// <summary>The bundle's definitions the selection keeps, in the bundle's order.</summary>
    internal static IEnumerable<System.Text.Json.JsonElement> SelectDefinitions(
        IEnumerable<System.Text.Json.JsonElement> definitions,
        WidgenticTools selection) =>
        definitions.Where(definition =>
        {
            var name = definition.GetProperty("name").GetString();
            return WidgenticToolNames.ByFlag.Any(pair => pair.Value == name && selection.HasFlag(pair.Key));
        });
}
