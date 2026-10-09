using System.Reflection;
using ModelContextProtocol.Client;
using ModelContextProtocol.Protocol;
using Widgentic.Mcp.Tests.Support;

namespace Widgentic.Mcp.Tests;

/// <summary>The stdio sample, launched as a real process and driven by a C# SDK client.</summary>
public sealed class SampleTests
{
    private static CancellationToken Cancel => TestContext.Current.CancellationToken;

    [Fact]
    public async Task ServesTheExampleWidgetsAndItsOwnTool()
    {
        var configuration = typeof(SampleTests).Assembly.GetCustomAttribute<AssemblyConfigurationAttribute>()!.Configuration;
        var sample = Path.Combine(Repo.Root, "dotnet", "samples", "Widgentic.Sample.Stdio", "bin", configuration, "net10.0", "Widgentic.Sample.Stdio.dll");
        Assert.True(File.Exists(sample), $"build the sample first: {sample}");
        var transport = new StdioClientTransport(new StdioClientTransportOptions
        {
            Name = "widgentic sample",
            Command = "dotnet",
            Arguments = [sample],
        });
        await using var client = await McpClient.CreateAsync(transport, cancellationToken: Cancel);

        var tools = await client.ListToolsAsync(cancellationToken: Cancel);
        Assert.Contains(tools, t => t.Name == "team_roster");
        Assert.Contains(tools, t => t.Name == "render_widget");

        var listing = await client.CallToolAsync("list_widgets", cancellationToken: Cancel);
        var text = Assert.IsType<TextContentBlock>(listing.Content[0]).Text;
        foreach (var kind in new[] { "invoice", "weather", "x-post" }) Assert.Contains($"\"kind\": \"{kind}\"", text);

        var roster = await client.CallToolAsync("team_roster", cancellationToken: Cancel);
        Assert.Contains("Grace Hopper", roster.StructuredContent!.Value.GetProperty("html").GetString());
    }
}
