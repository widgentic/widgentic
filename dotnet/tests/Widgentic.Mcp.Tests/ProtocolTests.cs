using System.ComponentModel;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Extensions.DependencyInjection;
using ModelContextProtocol;
using ModelContextProtocol.Extensions.Apps;
using ModelContextProtocol.Protocol;
using ModelContextProtocol.Server;
using Widgentic.Mcp.Engine;
using Widgentic.Mcp.Tests.Support;

namespace Widgentic.Mcp.Tests;

/// <summary>widgentic through the real protocol: a C# SDK client against a server built with <c>WithWidgentic</c>.</summary>
public sealed class ProtocolTests
{
    private static CancellationToken Cancel => TestContext.Current.CancellationToken;

    private static Dictionary<string, object?> Args(string json) =>
        JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(json)!.ToDictionary(p => p.Key, p => (object?)p.Value);

    private static string Text(CallToolResult result) => Assert.IsType<TextContentBlock>(result.Content[0]).Text;

    [Fact]
    public async Task ListsTheBundlesToolTextsVerbatim()
    {
        await using var server = await TestServer.StartAsync();
        var engine = server.Services.GetRequiredService<WidgenticEngine>();
        var tools = await server.Client.ListToolsAsync(cancellationToken: Cancel);
        Assert.Equal(engine.Definitions.Count, tools.Count);
        foreach (var definition in engine.Definitions)
        {
            var tool = Assert.Single(tools, t => t.Name == definition.GetProperty("name").GetString());
            Assert.Equal(definition.GetProperty("description").GetString(), tool.Description);
            Assert.True(JsonNode.DeepEquals(
                JsonNode.Parse(definition.GetProperty("inputSchema").GetRawText()),
                JsonNode.Parse(tool.ProtocolTool.InputSchema.GetRawText())), tool.Name);
        }
    }

    [Fact]
    public async Task RenderWidgetDeclaresTheAppTemplate()
    {
        await using var server = await TestServer.StartAsync();
        var tools = await server.Client.ListToolsAsync(cancellationToken: Cancel);
        var render = Assert.Single(tools, t => t.Name == "render_widget");
        Assert.Equal(WidgenticResources.AppTemplateUri, render.ProtocolTool.Meta?["ui"]?["resourceUri"]?.GetValue<string>());
        Assert.Equal(WidgenticResources.AppTemplateUri, render.ProtocolTool.Meta?["ui/resourceUri"]?.GetValue<string>());
        Assert.Null(render.ProtocolTool.Meta?["ui"]?["visibility"]);

        var preview = Assert.Single(tools, t => t.Name == "preview_widget");
        Assert.Equal(WidgenticResources.AppTemplateUri, preview.ProtocolTool.Meta?["ui"]?["resourceUri"]?.GetValue<string>());
        Assert.Equal(WidgenticResources.AppTemplateUri, preview.ProtocolTool.Meta?["ui/resourceUri"]?.GetValue<string>());
        Assert.Equal(["app"], preview.ProtocolTool.Meta?["ui"]?["visibility"]?.AsArray().Select(v => v!.GetValue<string>()));

        foreach (var other in tools.Where(t => t.Name is not "render_widget" and not "preview_widget"))
        {
            Assert.Null(other.ProtocolTool.Meta?["ui"]);
        }
    }

    [Fact]
    public async Task RendersACardWithItsPayload()
    {
        await using var server = await TestServer.StartAsync();
        var result = await server.Client.CallToolAsync("render_widget", Args("""{"widget":"card","data":{"title":"T"}}"""), cancellationToken: Cancel);
        Assert.NotEqual(true, result.IsError);
        Assert.Contains("class=\"wg-card\"", result.StructuredContent!.Value.GetProperty("html").GetString());
        var payload = Assert.Single(result.Content.OfType<EmbeddedResourceBlock>());
        var text = Assert.IsType<TextResourceContents>(payload.Resource).Text;
        Assert.Equal("card", JsonDocument.Parse(text).RootElement.GetProperty("kind").GetString());
    }

    [Fact]
    public async Task PreviewsAPartialStoredKind()
    {
        await using var server = await TestServer.StartAsync(o => o.AddWidgetsFromDirectory(Repo.SampleWidgets));
        var result = await server.Client.CallToolAsync("preview_widget", Args("""{"widget":"invoice","data":{"customer":"Ada"}}"""), cancellationToken: Cancel);
        Assert.NotEqual(true, result.IsError);
        Assert.Equal("Preview of 'invoice'.", Text(result));
        Assert.Contains("Ada", result.StructuredContent!.Value.GetProperty("tree").GetRawText());
        Assert.False(result.StructuredContent!.Value.TryGetProperty("payload", out _));
    }

    [Fact]
    public async Task AnUnknownKindIsAStructuredError()
    {
        await using var server = await TestServer.StartAsync();
        var result = await server.Client.CallToolAsync("render_widget", Args("""{"widget":"nope","data":{}}"""), cancellationToken: Cancel);
        Assert.True(result.IsError);
        var error = JsonDocument.Parse(Text(result)).RootElement;
        Assert.Equal("UNKNOWN_KIND", error.GetProperty("code").GetString());
        Assert.Contains("Available widgets: card, group, table, tree.", error.GetProperty("message").GetString());
    }

    [Fact]
    public async Task ServesTheBundlesAppTemplate()
    {
        await using var server = await TestServer.StartAsync();
        var engine = server.Services.GetRequiredService<WidgenticEngine>();
        var read = await server.Client.ReadResourceAsync(WidgenticResources.AppTemplateUri, cancellationToken: Cancel);
        var contents = Assert.IsType<TextResourceContents>(Assert.Single(read.Contents));
        Assert.Equal(McpApps.HtmlMimeType, contents.MimeType);
        Assert.Equal(await engine.Pool.InvokeAsync("appTemplate", Cancel), contents.Text);
    }

    [Fact]
    public async Task ServesPreviewPagesFromTheBundle()
    {
        await using var server = await TestServer.StartAsync();
        var engine = server.Services.GetRequiredService<WidgenticEngine>();
        var read = await server.Client.ReadResourceAsync("ui://widgentic/page/card", cancellationToken: Cancel);
        var contents = Assert.IsType<TextResourceContents>(Assert.Single(read.Contents));
        Assert.Equal("text/html", contents.MimeType);
        Assert.Equal(await engine.Pool.InvokeAsync("widgetPage", Cancel, "card"), contents.Text);
        var templates = await server.Client.ListResourceTemplatesAsync(cancellationToken: Cancel);
        Assert.Contains(templates, t => t.UriTemplate == WidgenticResources.WidgetPageUriTemplate);
    }

    [Fact]
    public async Task PreviewPagesCanBeTurnedOff()
    {
        await using var server = await TestServer.StartAsync(o => o.IncludeWidgetPages = false);
        var templates = await server.Client.ListResourceTemplatesAsync(cancellationToken: Cancel);
        Assert.DoesNotContain(templates, t => t.UriTemplate == WidgenticResources.WidgetPageUriTemplate);
    }

    [Fact]
    public async Task DeclaresResourceDomainsOnlyWhenConfigured()
    {
        await using (var plain = await TestServer.StartAsync())
        {
            var app = Assert.Single(await plain.Client.ListResourcesAsync(cancellationToken: Cancel), r => r.Uri == WidgenticResources.AppTemplateUri);
            Assert.Null(app.ProtocolResource.Meta?["ui"]?["csp"]);
        }
        await using var configured = await TestServer.StartAsync(o => o.ResourceDomains.Add("CDN.example.com "));
        var declared = Assert.Single(await configured.Client.ListResourcesAsync(cancellationToken: Cancel), r => r.Uri == WidgenticResources.AppTemplateUri);
        var domains = declared.ProtocolResource.Meta?["ui"]?["csp"]?["resourceDomains"]?.AsArray().Select(d => d!.GetValue<string>());
        Assert.Equal(["cdn.example.com"], domains);
    }

    [Fact]
    public async Task SlimsForAppsHostsOnly()
    {
        const string card = """{"widget":"card","data":{"title":"T"}}""";
        await using var apps = await TestServer.StartAsync(clientCapabilities: TestServer.AppsHost());
        await using var plain = await TestServer.StartAsync();
        var slim = await apps.Client.CallToolAsync("render_widget", Args(card), cancellationToken: Cancel);
        var full = await plain.Client.CallToolAsync("render_widget", Args(card), cancellationToken: Cancel);
        Assert.StartsWith("Rendered 'card' widget inline", Text(slim));
        Assert.Contains("class=\"wg-card\"", Text(full));
        Assert.Equal(slim.StructuredContent!.Value.GetRawText(), full.StructuredContent!.Value.GetRawText());
    }

    [Fact]
    public async Task AHostToolEqualsRenderWidgetAndMountsInAppsHosts()
    {
        await using var server = await TestServer.StartAsync(
            clientCapabilities: TestServer.AppsHost(),
            extra: mcp => mcp.WithTools<HostTools>());
        var tools = await server.Client.ListToolsAsync(cancellationToken: Cancel);
        var roster = Assert.Single(tools, t => t.Name == "team_roster");
        Assert.Equal(WidgenticResources.AppTemplateUri, roster.ProtocolTool.Meta?["ui"]?["resourceUri"]?.GetValue<string>());

        var fromHostTool = await server.Client.CallToolAsync("team_roster", cancellationToken: Cancel);
        var fromRender = await server.Client.CallToolAsync("render_widget", Args(HostTools.RosterArgs), cancellationToken: Cancel);
        Assert.Equal(
            JsonSerializer.Serialize(fromRender, McpJsonUtilities.DefaultOptions),
            JsonSerializer.Serialize(fromHostTool, McpJsonUtilities.DefaultOptions));
        Assert.StartsWith("Rendered 'table' widget inline", Text(fromHostTool));
    }

    [Fact]
    public async Task AHostToolRendersWithEveryWidgenticToolHidden()
    {
        await using var server = await TestServer.StartAsync(
            o => o.Tools = WidgenticTools.None,
            extra: mcp => mcp.WithTools<HostTools>());
        var tools = await server.Client.ListToolsAsync(cancellationToken: Cancel);
        Assert.Equal(["team_roster"], tools.Select(t => t.Name));
        var read = await server.Client.ReadResourceAsync(WidgenticResources.AppTemplateUri, cancellationToken: Cancel);
        Assert.Contains("wg-root", Assert.IsType<TextResourceContents>(Assert.Single(read.Contents)).Text);
        var result = await server.Client.CallToolAsync("team_roster", cancellationToken: Cancel);
        Assert.Contains("class=\"wg-table\"", result.StructuredContent!.Value.GetProperty("html").GetString());
    }

    [Fact]
    public async Task BadHostInputIsAResultNotAnException()
    {
        await using var server = await TestServer.StartAsync();
        var renderer = server.Services.GetRequiredService<IWidgenticRenderer>();
        var result = await renderer.RenderAsync(new WidgetRenderRequest("nope", new JsonObject()), cancellationToken: Cancel);
        Assert.True(result.IsError);
        Assert.Equal("UNKNOWN_KIND", JsonDocument.Parse(Text(result)).RootElement.GetProperty("code").GetString());
    }

    [Fact]
    public async Task StatelessRequestsFollowAssumeUi()
    {
        var request = new WidgetRenderRequest("card", new JsonObject { ["title"] = "T" });
        await using (var assumed = await TestServer.StartAsync(o => o.AssumeUi = true))
        {
            var slim = await assumed.Services.GetRequiredService<IWidgenticRenderer>().RenderAsync(request, session: null, Cancel);
            Assert.StartsWith("Rendered 'card' widget inline", Text(slim));
        }
        await using var plain = await TestServer.StartAsync();
        var full = await plain.Services.GetRequiredService<IWidgenticRenderer>().RenderAsync(request, session: null, Cancel);
        Assert.Contains("class=\"wg-card\"", Text(full));
    }

    [McpServerToolType]
    public sealed class HostTools
    {
        public const string RosterArgs = """{"widget":"table","data":[{"name":"Ada","role":"Engineer"}],"meta":{"title":"Team"}}""";

        [McpServerTool(Name = "team_roster"), Description("The team as a table.")]
        [McpAppUi(ResourceUri = WidgenticResources.AppTemplateUri)]
        public static ValueTask<CallToolResult> TeamRoster(IWidgenticRenderer renderer, McpServer server, CancellationToken cancellationToken) =>
            renderer.RenderAsync(
                new WidgetRenderRequest("table", new JsonArray(new JsonObject { ["name"] = "Ada", ["role"] = "Engineer" }))
                {
                    Meta = new JsonObject { ["title"] = "Team" },
                },
                server,
                cancellationToken);
    }
}
