using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Widgentic.Mcp.Engine;
using Widgentic.Mcp.Tests.Support;

namespace Widgentic.Mcp.Tests;

/// <summary>Widgets, themes and schemas load from designer JSON; anything refused stops startup.</summary>
public sealed class ConfigurationTests : IDisposable
{
    private static CancellationToken Cancel => TestContext.Current.CancellationToken;

    private readonly string _directory = Directory.CreateTempSubdirectory("widgentic-config-").FullName;

    public void Dispose() => Directory.Delete(_directory, recursive: true);

    private static JsonElement ParseJson(string text) => JsonDocument.Parse(text).RootElement;

    [Fact]
    public async Task ServesADesignerExport()
    {
        await using var server = await TestServer.StartAsync(o => o.AddWidgetsFromDirectory(Repo.SampleWidgets));
        var listing = await server.Client.CallToolAsync("list_widgets", cancellationToken: Cancel);
        var invoice = ParseJson(((ModelContextProtocol.Protocol.TextContentBlock)listing.Content[0]).Text)
            .EnumerateArray().Single(d => d.GetProperty("kind").GetString() == "invoice");
        var data = invoice.GetProperty("dataExample").GetRawText();
        var renderer = server.Services.GetRequiredService<IWidgenticRenderer>();
        var result = await renderer.RenderAsync(new WidgetRenderRequest("invoice", JsonNode.Parse(data)), cancellationToken: Cancel);
        Assert.NotEqual(true, result.IsError);
        Assert.Contains("wg-invoice", result.StructuredContent!.Value.GetProperty("html").GetString());
    }

    [Fact]
    public async Task AnInvalidFileStopsStartupNamingIt()
    {
        var file = Path.Combine(_directory, "evil.json");
        await File.WriteAllTextAsync(file, """{"kind":"evil","template":{"tag":"script","children":["x"]},"descriptor":{"description":"x"}}""", Cancel);
        var error = Assert.Throws<WidgenticConfigurationException>(() =>
            WidgenticEngine.Create(new WidgenticOptions { EnginePoolSize = 1 }.AddWidgetsFromDirectory(_directory)));
        var problem = Assert.Single(error.Problems);
        Assert.Equal(("widgets", file, "INVALID_TEMPLATE"), (problem.Section, problem.Source, problem.Code));
        Assert.Contains(file, error.Message);
    }

    [Fact]
    public void ReservedNamesAreRefused()
    {
        var options = new WidgenticOptions { EnginePoolSize = 1 }
            .AddWidget("""{"kind":"card","template":{"tag":"p"},"descriptor":{"description":"shadow"}}""", "shadow card")
            .AddTheme("""[{"name":"brand","tokens":{"accent":"#0b6e4f"}},{"name":"light","tokens":{"accent":"#000000"}}]""", "themes.json");
        var error = Assert.Throws<WidgenticConfigurationException>(() => WidgenticEngine.Create(options));
        Assert.Equal(
            [("widgets", "shadow card", "RESERVED_KIND"), ("themes", "themes.json[1]", "RESERVED_THEME")],
            error.Problems.Select(p => (p.Section, p.Source, p.Code)));
    }

    [Fact]
    public void MalformedJsonIsAProblemToo()
    {
        var error = Assert.Throws<WidgenticConfigurationException>(() =>
            WidgenticEngine.Create(new WidgenticOptions { EnginePoolSize = 1 }.AddSchema("{ not json", "schemas.json")));
        Assert.Equal(("schemas", "schemas.json", "INVALID_JSON"), (error.Problems[0].Section, error.Problems[0].Source, error.Problems[0].Code));
    }

    [Fact]
    public async Task ALoadBindingIsInactiveNotFatal()
    {
        var logs = new ListLoggerProvider();
        await using var server = await TestServer.StartAsync(o => o.AddWidgetsFromDirectory(Repo.SampleWidgets), logs: logs);
        var inactive = logs.Messages.Where(m => m.Contains("declares a load binding", StringComparison.Ordinal)).ToArray();
        Assert.Equal(["weather"], inactive.Select(m => m.Split('\'')[1]));

        var engine = server.Services.GetRequiredService<WidgenticEngine>();
        var weather = JsonNode.Parse(await File.ReadAllTextAsync(Path.Combine(Repo.SampleWidgets, "weather.json"), Cancel))!;
        var result = await server.Services.GetRequiredService<IWidgenticRenderer>().RenderAsync(
            new WidgetRenderRequest("weather", weather["descriptor"]!["dataExample"]!.DeepClone()), cancellationToken: Cancel);
        var http = Descriptors(result.StructuredContent!.Value.GetProperty("tree"))
            .Where(d => d.GetProperty("kind").GetString() == "http").ToArray();
        Assert.NotEmpty(http);
        Assert.All(http, d => Assert.Equal("unresolved", d.GetProperty("disabled").GetString()));
        Assert.False(result.StructuredContent!.Value.TryGetProperty("load", out _));
        Assert.Contains(engine.StartupNotes, n => n.Contains("render-only", StringComparison.Ordinal));
    }

    /// <summary>Every action descriptor in a render tree.</summary>
    private static IEnumerable<JsonElement> Descriptors(JsonElement node)
    {
        if (node.ValueKind != JsonValueKind.Object) yield break;
        if (node.TryGetProperty("attrs", out var attrs) && attrs.TryGetProperty("data-wg-action", out var raw))
        {
            yield return JsonDocument.Parse(raw.GetString()!).RootElement;
        }
        if (!node.TryGetProperty("children", out var children)) yield break;
        foreach (var child in children.EnumerateArray())
        {
            foreach (var descriptor in Descriptors(child)) yield return descriptor;
        }
    }

    private sealed class ListLoggerProvider : ILoggerProvider
    {
        private readonly System.Collections.Concurrent.ConcurrentQueue<string> _messages = new();

        public IReadOnlyList<string> Messages => [.. _messages];

        public ILogger CreateLogger(string categoryName) => new ListLogger(_messages);

        public void Dispose()
        {
        }

        private sealed class ListLogger(System.Collections.Concurrent.ConcurrentQueue<string> messages) : ILogger
        {
            public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

            public bool IsEnabled(LogLevel logLevel) => true;

            public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter) =>
                messages.Enqueue(formatter(state, exception));
        }
    }
}
