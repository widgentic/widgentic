using Microsoft.Extensions.DependencyInjection;
using ModelContextProtocol;
using Widgentic.Mcp.Engine;
using Widgentic.Mcp.Tests.Support;

namespace Widgentic.Mcp.Tests;

/// <summary>Hosts choose which widgentic tools exist; a hidden tool is not registered at all.</summary>
public sealed class SelectionTests
{
    private static CancellationToken Cancel => TestContext.Current.CancellationToken;

    private static readonly string[] RenderSide =
        ["get_authoring_guide", "list_schemas", "list_theme_tokens", "list_themes", "list_widgets", "render_widget"];

    [Fact]
    public async Task TheDefaultExposesTheRenderSideSet()
    {
        await using var server = await TestServer.StartAsync();
        var tools = await server.Client.ListToolsAsync(cancellationToken: Cancel);
        Assert.Equal(RenderSide, tools.Select(t => t.Name).Order(StringComparer.Ordinal));
    }

    [Fact]
    public async Task AHiddenToolIsGone()
    {
        await using var server = await TestServer.StartAsync(o => o.Tools = WidgenticTools.Default & ~WidgenticTools.GetAuthoringGuide);
        var tools = await server.Client.ListToolsAsync(cancellationToken: Cancel);
        Assert.DoesNotContain(tools, t => t.Name == "get_authoring_guide");
        Assert.Equal(5, tools.Count);
        await Assert.ThrowsAsync<McpProtocolException>(async () =>
            await server.Client.CallToolAsync("get_authoring_guide", cancellationToken: Cancel));
    }

    [Fact]
    public async Task NoSelectionEverExposesActions()
    {
        await using var server = await TestServer.StartAsync();
        var definitions = server.Services.GetRequiredService<WidgenticEngine>().Definitions;
        for (var bits = 0; bits <= (int)WidgenticTools.Default; bits++)
        {
            var selection = (WidgenticTools)bits;
            var names = WidgenticBuilderExtensions.SelectDefinitions(definitions, selection)
                .Select(d => d.GetProperty("name").GetString())
                .ToArray();
            Assert.DoesNotContain("execute_action", names);
            Assert.DoesNotContain("list_actions", names);
            Assert.Equal(
                WidgenticToolNames.ByFlag.Where(pair => selection.HasFlag(pair.Key)).Select(pair => pair.Value).Order(StringComparer.Ordinal),
                names.Order(StringComparer.Ordinal));
        }
    }

    [Fact]
    public async Task UnknownSelectionBitsAreRefused()
    {
        await Assert.ThrowsAsync<ArgumentOutOfRangeException>(async () =>
            await TestServer.StartAsync(o => o.Tools = (WidgenticTools)(1 << 10)));
    }
}
