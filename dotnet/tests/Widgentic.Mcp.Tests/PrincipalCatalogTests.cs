using System.ComponentModel;
using System.Security.Claims;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using ModelContextProtocol.Protocol;
using ModelContextProtocol.Server;
using Widgentic.Mcp.Engine;
using Widgentic.Mcp.Mcp;
using Widgentic.Mcp.Tests.Support;

namespace Widgentic.Mcp.Tests;

/// <summary>
/// Per-principal catalogs: each caller's catalog is composed inside its call (Merge or Replace
/// with the startup entries), refusals are logged, a failing source is a result, and nothing
/// outlives the call. Identity-dependent scenarios drive <see cref="CallerCatalogs"/> with real
/// principals; the in-process protocol tests cover the wiring that needs no identity.
/// </summary>
public sealed class PrincipalCatalogTests
{
    private static CancellationToken Cancel => TestContext.Current.CancellationToken;

    private static readonly ClaimsPrincipal Alpha = Principal("alpha");
    private static readonly ClaimsPrincipal Beta = Principal("beta");

    [Fact]
    public async Task WithoutASourceNothingChanges()
    {
        using var rig = Rig.Start(source: null);
        Assert.Equal(await rig.Engine.Pool.CallToolAsync("list_widgets", "{}", false, Cancel), await rig.CallAsync("list_widgets", Alpha));
    }

    [Fact]
    public async Task AnUnknownCallerGetsTheStartupCatalog()
    {
        using var rig = Rig.Start(new FakeSource(_ => null));
        Assert.Equal(await rig.Engine.Pool.CallToolAsync("list_widgets", "{}", false, Cancel), await rig.CallAsync("list_widgets", Alpha));
        Assert.Equal(1, rig.Source!.Calls);
    }

    [Fact]
    public async Task PrincipalsNeverSeeEachOthersEntries()
    {
        using var rig = Rig.Start(new FakeSource(user => Name(user) switch
        {
            "alpha" => new WidgenticCatalog().AddWidget(OwnWidget("alpha-card", "Alpha")),
            "beta" => new WidgenticCatalog().AddWidget(OwnWidget("beta-card", "Beta")),
            _ => null,
        }), poolSize: 4);
        var calls = Enumerable.Range(0, 32).Select(async index =>
        {
            var (user, own, other) = index % 2 == 0 ? (Alpha, "alpha-card", "beta-card") : (Beta, "beta-card", "alpha-card");
            var kinds = Kinds(await rig.CallAsync("list_widgets", user));
            Assert.Contains(own, kinds);
            Assert.DoesNotContain(other, kinds);
            Assert.False(IsError(await rig.CallAsync("render_widget", user, $$$"""{"widget":"{{{own}}}","data":{"title":"T"}}""")));
            Assert.Equal("UNKNOWN_KIND", ErrorCode(await rig.CallAsync("render_widget", user, $$$"""{"widget":"{{{other}}}","data":{"title":"T"}}""")));
        });
        await Task.WhenAll(calls);
    }

    [Fact]
    public async Task InMergeThePrincipalsEntryWins()
    {
        var inbox = SeedWidget("email-inbox-widget");
        inbox["descriptor"]!["description"] = "Alpha's own inbox.";
        // A widget of the principal's own that references the startup schema by name.
        var mail = SeedWidget("email-inbox-widget");
        mail["kind"] = "alpha-mail";
        using var rig = Rig.Start(new FakeSource(_ => new WidgenticCatalog()
            .AddWidget(inbox.ToJsonString())
            .AddWidget(mail.ToJsonString())));

        var listing = Descriptors(await rig.CallAsync("list_widgets", Alpha));
        var inboxes = listing.Where(d => d.GetProperty("kind").GetString() == "email-inbox-widget").ToArray();
        Assert.Single(inboxes);
        Assert.Equal("Alpha's own inbox.", inboxes[0].GetProperty("description").GetString());
        Assert.Contains(listing, d => d.GetProperty("kind").GetString() == "appointment-agenda-widget");

        // The listing resolves the reference: the startup schema, as the seed defines it.
        var own = listing.Single(d => d.GetProperty("kind").GetString() == "alpha-mail");
        var startupSchema = JsonNode.Parse(File.ReadAllText(Path.Combine(Repo.SampleSeed, "schemas", "email-inbox.json")))!["schema"];
        Assert.True(JsonNode.DeepEquals(startupSchema, JsonNode.Parse(own.GetProperty("dataSchema").GetRawText())));
        Assert.Empty(rig.Logs.Messages);
    }

    [Fact]
    public async Task InReplaceOnlyThePrincipalsEntriesJoinTheBuiltIns()
    {
        using var rig = Rig.Start(new FakeSource(_ => new WidgenticCatalog().AddWidget(OwnWidget("alpha-card", "Alpha"))), WidgenticComposition.Replace);
        var kinds = Kinds(await rig.CallAsync("list_widgets", Alpha));
        Assert.Contains("alpha-card", kinds);
        Assert.Contains("card", kinds);
        Assert.DoesNotContain("email-inbox-widget", kinds);
        Assert.DoesNotContain("appointment-agenda-widget", kinds);
    }

    [Fact]
    public async Task ACatalogOverridesTheDefaultMode()
    {
        using var rig = Rig.Start(new FakeSource(user => Name(user) == "alpha"
            ? new WidgenticCatalog { Composition = WidgenticComposition.Replace }.AddWidget(OwnWidget("alpha-card", "Alpha"))
            : new WidgenticCatalog().AddWidget(OwnWidget("beta-card", "Beta"))));
        Assert.DoesNotContain("email-inbox-widget", Kinds(await rig.CallAsync("list_widgets", Alpha)));
        Assert.Contains("email-inbox-widget", Kinds(await rig.CallAsync("list_widgets", Beta)));
    }

    [Fact]
    public async Task DuplicatesWithinACatalogAreRefused()
    {
        using var rig = Rig.Start(new FakeSource(_ => new WidgenticCatalog()
            .AddWidget(OwnWidget("alpha-card", "First"))
            .AddWidget(OwnWidget("alpha-card", "Second"))));
        var listed = Descriptors(await rig.CallAsync("list_widgets", Alpha)).Where(d => d.GetProperty("kind").GetString() == "alpha-card").ToArray();
        Assert.Single(listed);
        Assert.Equal("First's own widget.", listed[0].GetProperty("description").GetString());
        Assert.Contains(rig.Logs.Messages, message => message.Contains("widgets[1] ('alpha-card')", StringComparison.Ordinal));
    }

    [Fact]
    public async Task ARefusedPrincipalEntryStillReplacesTheStartupEntry()
    {
        var broken = SeedWidget("email-inbox-widget");
        broken["template"] = JsonNode.Parse("""{"tag":"script","children":["x"]}""");
        using var rig = Rig.Start(new FakeSource(_ => new WidgenticCatalog().AddWidget(broken.ToJsonString())));
        Assert.DoesNotContain("email-inbox-widget", Kinds(await rig.CallAsync("list_widgets", Alpha)));
        Assert.Contains(rig.Logs.Messages, message => message.Contains("widgets[0] ('email-inbox-widget')", StringComparison.Ordinal) && message.Contains("INVALID_TEMPLATE", StringComparison.Ordinal));
    }

    [Fact]
    public async Task APrincipalsInvalidEntryIsSkippedAndLogged()
    {
        using var rig = Rig.Start(new FakeSource(_ => new WidgenticCatalog()
            .AddWidget(OwnWidget("alpha-card", "Alpha"))
            .AddWidget("""{"kind":"bad-one","template":{"tag":"script","children":["x"]},"descriptor":{"description":"bad","dataExample":{}}}""")
            .AddWidget("{ not json")));
        var result = await rig.CallAsync("list_widgets", Alpha);
        Assert.False(IsError(result));
        var kinds = Kinds(result);
        Assert.Contains("alpha-card", kinds);
        Assert.DoesNotContain("bad-one", kinds);
        var refusals = rig.Logs.Entries.Where(entry => entry.Level == LogLevel.Warning).Select(entry => entry.Message).ToArray();
        Assert.Contains(refusals, message => message.Contains("widgets[1] ('bad-one')", StringComparison.Ordinal) && message.Contains("INVALID_TEMPLATE", StringComparison.Ordinal));
        Assert.Contains(refusals, message => message.Contains("widgets[2]", StringComparison.Ordinal) && message.Contains("INVALID_JSON", StringComparison.Ordinal));
        // Section, index, name and code only: never the entry's contents.
        Assert.DoesNotContain(refusals, message => message.Contains("script", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public async Task AFailingSourceIsAResult()
    {
        using var rig = Rig.Start(new FakeSource(user => Name(user) == "alpha"
            ? throw new InvalidOperationException("tenant db at 10.0.0.5 refused the connection")
            : new WidgenticCatalog().AddWidget(OwnWidget("beta-card", "Beta"))));
        var failed = await rig.CallAsync("list_widgets", Alpha);
        Assert.Equal("CATALOG_UNAVAILABLE", ErrorCode(failed));
        Assert.DoesNotContain("10.0.0.5", failed, StringComparison.Ordinal);
        Assert.Contains(rig.Logs.Entries, entry => entry.Level == LogLevel.Error && entry.Message.Contains("CATALOG_UNAVAILABLE", StringComparison.Ordinal));
        Assert.Contains("beta-card", Kinds(await rig.CallAsync("list_widgets", Beta)));
        await Assert.ThrowsAsync<ModelContextProtocol.McpException>(async () => await rig.Catalogs.WidgetPageAsync("card", Alpha, rig.Services, Cancel));
    }

    [Fact]
    public async Task GlobalToolsNeverConsultTheSource()
    {
        using var rig = Rig.Start(new FakeSource(_ => throw new InvalidOperationException("must not be called")));
        Assert.False(IsError(await rig.CallAsync("list_theme_tokens", Alpha)));
        Assert.False(IsError(await rig.CallAsync("get_authoring_guide", Alpha)));
        Assert.Equal(0, rig.Source!.Calls);
    }

    [Fact]
    public async Task ACompositionNeverOutlivesItsCall()
    {
        var alphaCatalog = new WidgenticCatalog().AddWidget(OwnWidget("alpha-card", "Alpha"));
        using var rig = Rig.Start(new FakeSource(user => Name(user) == "alpha" ? alphaCatalog : new WidgenticCatalog()), poolSize: 1);
        Assert.Contains("alpha-card", Kinds(await rig.CallAsync("list_widgets", Alpha)));
        // Same runtime (a pool of one): B sees none of A's entries.
        Assert.DoesNotContain("alpha-card", Kinds(await rig.CallAsync("list_widgets", Beta)));
        alphaCatalog.AddWidget(OwnWidget("alpha-two", "Alpha two"));
        Assert.Contains("alpha-two", Kinds(await rig.CallAsync("list_widgets", Alpha)));
    }

    [Fact]
    public async Task PreviewPagesFollowTheCaller()
    {
        using var rig = Rig.Start(new FakeSource(user => Name(user) == "alpha" ? new WidgenticCatalog().AddWidget(OwnWidget("alpha-card", "Alpha")) : null));
        var own = await rig.Catalogs.WidgetPageAsync("alpha-card", Alpha, rig.Services, Cancel);
        var other = await rig.Catalogs.WidgetPageAsync("alpha-card", Beta, rig.Services, Cancel);
        Assert.Contains("Alpha: ", own, StringComparison.Ordinal);
        Assert.DoesNotContain("Alpha: ", other, StringComparison.Ordinal);
        Assert.Equal(await rig.Engine.Pool.InvokeAsync("widgetPage", Cancel, "alpha-card"), other);
    }

    [Fact]
    public async Task GlobalSurfacesStayGlobalThroughTheProtocol()
    {
        var source = new FakeSource(_ => new WidgenticCatalog().AddWidget(OwnWidget("alpha-card", "Alpha")));
        await using var server = await TestServer.StartAsync(
            options => options.AddSampleSeed(),
            extra: mcp => mcp.Services.AddSingleton<IWidgenticCatalogSource>(source));
        var tools = await server.Client.ListToolsAsync(cancellationToken: Cancel);
        Assert.NotEmpty(tools);
        Assert.Equal(0, source.Calls);

        // The template's content is global; only its declared domains consult the source, and
        // with no domains configured anywhere the declaration is the startup one.
        var engine = server.Services.GetRequiredService<WidgenticEngine>();
        var template = Assert.Single((await server.Client.ReadResourceAsync(WidgenticResources.AppTemplateUri, cancellationToken: Cancel)).Contents);
        Assert.Equal(await engine.Pool.InvokeAsync("appTemplate", Cancel), Assert.IsType<TextResourceContents>(template).Text);
        Assert.Empty(await ProtocolTests.DeclaredAsync(server));

        // The per-caller tools go through the source on the real protocol path.
        var before = source.Calls;
        var listed = await server.Client.CallToolAsync("list_widgets", cancellationToken: Cancel);
        Assert.Contains("alpha-card", ((TextContentBlock)listed.Content[0]).Text, StringComparison.Ordinal);
        Assert.Equal(before + 1, source.Calls);
    }

    [Fact]
    public async Task AHostToolRendersTheCallersCatalog()
    {
        var source = new FakeSource(_ => new WidgenticCatalog().AddWidget(OwnWidget("alpha-card", "Alpha")));
        await using var server = await TestServer.StartAsync(
            options => options.AddSampleSeed(),
            extra: mcp => mcp.WithTools<OwnKindTool>().Services.AddSingleton<IWidgenticCatalogSource>(source));
        var arguments = new Dictionary<string, object?> { ["widget"] = "alpha-card", ["data"] = new Dictionary<string, object?> { ["title"] = "T" } };
        var viaTool = await server.Client.CallToolAsync("own_kind", cancellationToken: Cancel);
        var viaRender = await server.Client.CallToolAsync("render_widget", arguments, cancellationToken: Cancel);
        Assert.NotEqual(true, viaTool.IsError);
        Assert.Equal(
            JsonSerializer.Serialize(viaRender, ModelContextProtocol.McpJsonUtilities.DefaultOptions),
            JsonSerializer.Serialize(viaTool, ModelContextProtocol.McpJsonUtilities.DefaultOptions));
    }

    // Default themes from settings, at startup and per principal.

    [Fact]
    public async Task StartupDefaultsDressRendersThatNameNoTheme()
    {
        using var rig = Rig.Start(source: null, settingsFile: SeedSettings);
        var css = Css(await rig.CallAsync("render_widget", Alpha, Card));
        var lightToken = SeedTheme("google-light")["tokens"]!["bg"]!.GetValue<string>();
        var darkToken = SeedTheme("google-dark")["tokens"]!["bg"]!.GetValue<string>();
        Assert.Contains($":root:not([data-theme=\"dark\"]) {{\n  --wg-bg: {lightToken};", css, StringComparison.Ordinal);
        Assert.Contains($":root[data-theme=\"dark\"] {{\n  --wg-bg: {darkToken};", css, StringComparison.Ordinal);
        Assert.Equal(("google-light", "google-dark"), Defaults(await rig.CallAsync("list_themes", Alpha)));
    }

    [Fact]
    public void AStartupDefaultNamingNoConfiguredThemeStopsStartup()
    {
        var unknown = new WidgenticOptions { EnginePoolSize = 1 }.AddSampleSeed().UseSettings("""{"defaultThemes":{"dark":"ghost"}}""");
        var problem = Assert.Single(Assert.Throws<WidgenticConfigurationException>(() => WidgenticEngine.Create(unknown)).Problems);
        Assert.Equal(("settings", "settings JSON", "UNKNOWN_THEME"), (problem.Section, problem.Source, problem.Code));

        var file = Path.Combine(Directory.CreateTempSubdirectory("widgentic-settings-").FullName, "settings.json");
        File.WriteAllText(file, "{ not json");
        var unreadable = new WidgenticOptions { EnginePoolSize = 1 }.UseSettingsFromFile(file);
        problem = Assert.Single(Assert.Throws<WidgenticConfigurationException>(() => WidgenticEngine.Create(unreadable)).Problems);
        Assert.Equal(("settings", file, "INVALID_JSON"), (problem.Section, problem.Source, problem.Code));
    }

    [Fact]
    public async Task InMergeAPrincipalsSettingsSectionReplacesTheStartupOne()
    {
        using var rig = Rig.Start(new FakeSource(user => Name(user) == "alpha"
            ? new WidgenticCatalog().AddTheme(Night).UseSettings("""{"defaultThemes":{"dark":"night"}}""")
            : new WidgenticCatalog()), settingsFile: SeedSettings);
        Assert.Equal(("light", "night"), Defaults(await rig.CallAsync("list_themes", Alpha)));
        // A principal without settings keeps the startup record's defaults.
        Assert.Equal(("google-light", "google-dark"), Defaults(await rig.CallAsync("list_themes", Beta)));
        Assert.Empty(rig.Logs.Messages);
    }

    [Fact]
    public async Task InReplaceTheStartupSettingsNeverApply()
    {
        using var rig = Rig.Start(new FakeSource(_ => new WidgenticCatalog().AddTheme(Night)), WidgenticComposition.Replace, settingsFile: SeedSettings);
        Assert.Equal(("light", "dark"), Defaults(await rig.CallAsync("list_themes", Alpha)));
        Assert.Empty(rig.Logs.Messages);
    }

    [Fact]
    public async Task APrincipalsRefusedSettingIsSkippedAndLogged()
    {
        using var rig = Rig.Start(new FakeSource(user => Name(user) == "alpha"
            ? new WidgenticCatalog().UseSettings("""{"defaultThemes":{"light":"google-light","dark":"ghost"}}""")
            : new WidgenticCatalog().UseSettings("{ not json")), settingsFile: SeedSettings);
        var result = await rig.CallAsync("list_themes", Alpha);
        Assert.False(IsError(result));
        Assert.Equal(("google-light", "dark"), Defaults(result));
        Assert.Contains(rig.Logs.Messages, message => message.Contains("the caller's setting 'defaultThemes.dark'", StringComparison.Ordinal) && message.Contains("UNKNOWN_THEME", StringComparison.Ordinal));
        // An unreadable record replaces the startup record whole: the built-ins serve, and it is logged.
        Assert.Equal(("light", "dark"), Defaults(await rig.CallAsync("list_themes", Beta)));
        Assert.Contains(rig.Logs.Messages, message => message.Contains("the caller's setting 'settings'", StringComparison.Ordinal) && message.Contains("INVALID_JSON", StringComparison.Ordinal));
        Assert.DoesNotContain(rig.Logs.Messages, message => message.Contains("ghost", StringComparison.Ordinal));
    }

    [Fact]
    public async Task AStartupDefaultLeftUnresolvedByAPrincipalIsLogged()
    {
        var broken = SeedTheme("google-dark");
        broken["tokens"]!["accent"] = "url(https://example.invalid/x.png)";
        using var rig = Rig.Start(new FakeSource(_ => new WidgenticCatalog().AddTheme(broken.ToJsonString())), settingsFile: SeedSettings);
        var result = await rig.CallAsync("list_themes", Alpha);
        Assert.False(IsError(result));
        Assert.Equal(("google-light", "dark"), Defaults(result));
        Assert.Contains(rig.Logs.Messages, message => message.Contains("startup setting 'defaultThemes.dark' was skipped for this caller", StringComparison.Ordinal) && message.Contains("UNKNOWN_THEME", StringComparison.Ordinal));
        Assert.Contains(rig.Logs.Messages, message => message.Contains("the caller's themes[0] ('google-dark')", StringComparison.Ordinal));
    }

    [Fact]
    public async Task PreviewsAndPagesFollowTheCallersDefaults()
    {
        const string sun = """{"name":"sun","tokens":{"accent":"#ff5a1f"},"styles":{".wg-card-title":{"letter-spacing":"0.1em"}}}""";
        using var rig = Rig.Start(new FakeSource(user => Name(user) == "alpha"
            ? new WidgenticCatalog().AddTheme(sun).UseSettings("""{"defaultThemes":{"light":"sun"}}""")
            : null), settingsFile: SeedSettings);
        var own = await rig.Catalogs.WidgetPageAsync("card", Alpha, rig.Services, Cancel);
        var other = await rig.Catalogs.WidgetPageAsync("card", Beta, rig.Services, Cancel);
        Assert.Contains("--wg-accent: #ff5a1f;", own, StringComparison.Ordinal);
        Assert.Contains("letter-spacing: 0.1em;", own, StringComparison.Ordinal);
        Assert.DoesNotContain("#ff5a1f", other, StringComparison.Ordinal);
        Assert.Contains("--wg-accent: #ff5a1f;", Css(await rig.CallAsync("preview_widget", Alpha, Card)), StringComparison.Ordinal);
        Assert.DoesNotContain("#ff5a1f", Css(await rig.CallAsync("preview_widget", Beta, Card)), StringComparison.Ordinal);
    }

    private static readonly string SeedSettings = Path.Combine(Repo.SampleSeed, "settings.json");

    private const string Night = """{"name":"night","tokens":{"bg":"#101010","fg":"#f0f0f0","accent":"#8ab4f8"}}""";

    private const string Card = """{"widget":"card","data":{"title":"T"}}""";

    // Resource domains from options and settings, at startup and per principal.

    private static void OperatorAndStartupDomains(WidgenticOptions options)
    {
        options.ResourceDomains.Add("assets.example.org");
        options.UseSettings("""{"resourceDomains":["cdn.example.com"]}""", "startup settings");
    }

    [Fact]
    public async Task StartupSettingsDeclareTheirDomains()
    {
        using var rig = Rig.Start(source: null, configure: OperatorAndStartupDomains);
        Assert.Equal(["https://assets.example.org", "https://cdn.example.com"], await rig.DomainsAsync(Alpha));
        Assert.Equal(["https://assets.example.org", "https://cdn.example.com"], rig.Engine.Resources.AppTemplateResourceDomains);
    }

    [Fact]
    public async Task InMergeAPrincipalsDomainSectionReplacesTheStartupOne()
    {
        using var rig = Rig.Start(
            new FakeSource(user => Name(user) == "alpha"
                ? new WidgenticCatalog().UseSettings("""{"resourceDomains":["img.tenant.example"]}""")
                : new WidgenticCatalog()),
            configure: OperatorAndStartupDomains);
        Assert.Equal(["https://assets.example.org", "https://img.tenant.example"], await rig.DomainsAsync(Alpha));
        Assert.Equal(["https://assets.example.org", "https://cdn.example.com"], await rig.DomainsAsync(Beta));
    }

    [Fact]
    public async Task InReplaceTheStartupDomainSectionNeverApplies()
    {
        using var rig = Rig.Start(new FakeSource(_ => new WidgenticCatalog()), WidgenticComposition.Replace, configure: OperatorAndStartupDomains);
        Assert.Equal(["https://assets.example.org"], await rig.DomainsAsync(Alpha));
    }

    [Fact]
    public async Task APrincipalsRefusedDomainIsSkippedAndLogged()
    {
        using var rig = Rig.Start(
            new FakeSource(_ => new WidgenticCatalog().UseSettings("""{"resourceDomains":["http://old.example.com","img.tenant.example"]}""")),
            configure: OperatorAndStartupDomains);
        Assert.Equal(["https://assets.example.org", "https://img.tenant.example"], await rig.DomainsAsync(Alpha));
        Assert.Contains(rig.Logs.Messages, message =>
            message.Contains("setting", StringComparison.Ordinal) && message.Contains("INVALID_DOMAIN", StringComparison.Ordinal));
        // The startup record is never blamed for the caller's entry.
        Assert.DoesNotContain(rig.Logs.Messages, message => message.Contains("startup setting", StringComparison.Ordinal));
    }

    [Fact]
    public async Task PrincipalsSeeOnlyTheirOwnDomains()
    {
        using var rig = Rig.Start(new FakeSource(user => new WidgenticCatalog()
            .UseSettings($$"""{"resourceDomains":["{{Name(user)}}.tenant.example"]}""")), poolSize: 4);
        var reads = Enumerable.Range(0, 32).Select(async index =>
        {
            var (user, own, other) = index % 2 == 0 ? (Alpha, "alpha", "beta") : (Beta, "beta", "alpha");
            var declared = await rig.DomainsAsync(user);
            Assert.Equal([$"https://{own}.tenant.example"], declared);
            Assert.DoesNotContain($"https://{other}.tenant.example", declared);
        });
        await Task.WhenAll(reads);
    }

    [Fact]
    public async Task AFailingSourceKeepsTheTemplate()
    {
        var logs = new ListLoggerProvider();
        var source = new FakeSource(_ => throw new InvalidOperationException("tenant store offline"));
        await using var server = await TestServer.StartAsync(
            options => options.AddSampleSeed().ResourceDomains.Add("assets.example.org"),
            extra: mcp => mcp.Services.AddSingleton<IWidgenticCatalogSource>(source),
            logs: logs);
        var engine = server.Services.GetRequiredService<WidgenticEngine>();
        var template = Assert.Single((await server.Client.ReadResourceAsync(WidgenticResources.AppTemplateUri, cancellationToken: Cancel)).Contents);
        Assert.Equal(await engine.Pool.InvokeAsync("appTemplate", Cancel), Assert.IsType<TextResourceContents>(template).Text);
        Assert.Equal(["https://assets.example.org"], await ProtocolTests.DeclaredAsync(server));
        Assert.Contains(logs.Messages, message => message.Contains("startup resource domains", StringComparison.Ordinal));
    }

    [Fact]
    public async Task TheProtocolDeclaresTheCallersDomainsOnListAndRead()
    {
        var source = new FakeSource(_ => new WidgenticCatalog().UseSettings("""{"resourceDomains":["img.tenant.example"]}"""));
        await using var server = await TestServer.StartAsync(
            options => options.AddSampleSeed().ResourceDomains.Add("assets.example.org"),
            extra: mcp => mcp
                .WithResources([McpServerResource.Create(() => "first", new McpServerResourceCreateOptions { UriTemplate = "test://first", Name = "first" })])
                .Services.AddSingleton<IWidgenticCatalogSource>(source));
        Assert.Equal(["https://assets.example.org", "https://img.tenant.example"], await ProtocolTests.DeclaredAsync(server));
        // Other listed resources are left as registered.
        var listed = await server.Client.ListResourcesAsync(cancellationToken: Cancel);
        Assert.Null(Assert.Single(listed, r => r.Uri == "test://first").ProtocolResource.Meta);
        // The registered declaration itself is never changed by a caller's listing.
        var registered = server.Services.GetServices<McpServerResource>().Single(r => r.ProtocolResource?.Uri == WidgenticResources.AppTemplateUri);
        Assert.Equal("https://assets.example.org", Assert.Single(registered.ProtocolResource!.Meta!["ui"]!["csp"]!["resourceDomains"]!.AsArray())!.GetValue<string>());
    }

    private static JsonNode SeedTheme(string name) =>
        JsonNode.Parse(File.ReadAllText(Path.Combine(Repo.SampleSeed, "themes", $"{name}.json")))!;

    private static string Css(string result) =>
        JsonDocument.Parse(result).RootElement.GetProperty("structuredContent").GetProperty("css").GetString()!;

    /// <summary>The effective default theme names <c>list_themes</c> reports.</summary>
    private static (string Light, string Dark) Defaults(string result)
    {
        var defaults = JsonDocument.Parse(Text(result)).RootElement.GetProperty("defaults");
        return (defaults.GetProperty("light").GetString()!, defaults.GetProperty("dark").GetString()!);
    }

    /// <summary>A host tool rendering a kind that only the caller's catalog defines.</summary>
    [McpServerToolType]
    public sealed class OwnKindTool
    {
        [McpServerTool(Name = "own_kind"), Description("Renders the caller's own kind.")]
        public static ValueTask<CallToolResult> Render(IWidgenticRenderer renderer, RequestContext<CallToolRequestParams> context, CancellationToken cancellationToken) =>
            renderer.RenderAsync(new WidgetRenderRequest("alpha-card", JsonNode.Parse("""{"title":"T"}""")), context, cancellationToken);
    }

    private static ClaimsPrincipal Principal(string name) => new(new ClaimsIdentity([new Claim(ClaimTypes.Name, name)], "test"));

    private static string? Name(ClaimsPrincipal? user) => user?.Identity?.Name;

    private static string OwnWidget(string kind, string label) =>
        $$$$"""{"kind":"{{{{kind}}}}","template":{"tag":"p","children":["{{{{label}}}}: ",{"bind":"title"}]},"descriptor":{"description":"{{{{label}}}}'s own widget.","dataExample":{"title":"T"}}}""";

    private static JsonNode SeedWidget(string kind) =>
        JsonNode.Parse(File.ReadAllText(Path.Combine(Repo.SampleSeed, "widgets", $"{kind}.json")))!;

    private static string Text(string result) =>
        JsonDocument.Parse(result).RootElement.GetProperty("content")[0].GetProperty("text").GetString()!;

    private static JsonElement[] Descriptors(string result) => [.. JsonDocument.Parse(Text(result)).RootElement.EnumerateArray().Select(d => d.Clone())];

    private static string[] Kinds(string result) => [.. Descriptors(result).Select(d => d.GetProperty("kind").GetString()!)];

    private static bool IsError(string result) =>
        JsonDocument.Parse(result).RootElement.TryGetProperty("isError", out var flag) && flag.GetBoolean();

    private static string? ErrorCode(string result) =>
        IsError(result) ? JsonDocument.Parse(Text(result)).RootElement.GetProperty("code").GetString() : null;

    private sealed class FakeSource(Func<ClaimsPrincipal?, WidgenticCatalog?> resolve) : IWidgenticCatalogSource
    {
        private int _calls;

        public int Calls => Volatile.Read(ref _calls);

        public ValueTask<WidgenticCatalog?> GetCatalogAsync(WidgenticCaller caller, CancellationToken cancellationToken)
        {
            Interlocked.Increment(ref _calls);
            return ValueTask.FromResult(resolve(caller.User));
        }
    }

    /// <summary>An engine over the sample seed, the resolver, and request services carrying the source and a log collector.</summary>
    private sealed class Rig : IDisposable
    {
        private Rig(WidgenticEngine engine, CallerCatalogs catalogs, ServiceProvider services, FakeSource? source, ListLoggerProvider logs)
        {
            Engine = engine;
            Catalogs = catalogs;
            Services = services;
            Source = source;
            Logs = logs;
        }

        public WidgenticEngine Engine { get; }

        public CallerCatalogs Catalogs { get; }

        public ServiceProvider Services { get; }

        public FakeSource? Source { get; }

        public ListLoggerProvider Logs { get; }

        public static Rig Start(
            FakeSource? source,
            WidgenticComposition composition = WidgenticComposition.Merge,
            int poolSize = 1,
            string? settingsFile = null,
            Action<WidgenticOptions>? configure = null)
        {
            var options = new WidgenticOptions { EnginePoolSize = poolSize }.AddSampleSeed();
            if (settingsFile is not null) options.UseSettingsFromFile(settingsFile);
            configure?.Invoke(options);
            var engine = WidgenticEngine.Create(options);
            var logs = new ListLoggerProvider();
            var services = new ServiceCollection().AddLogging(logging => logging.AddProvider(logs));
            if (source is not null) services.AddSingleton<IWidgenticCatalogSource>(source);
            return new Rig(engine, new CallerCatalogs(engine, composition), services.BuildServiceProvider(), source, logs);
        }

        public async Task<string> CallAsync(string tool, ClaimsPrincipal? user, string argsJson = "{}") =>
            await Catalogs.CallToolAsync(tool, argsJson, false, user, Services, Cancel);

        public async Task<IReadOnlyList<string>> DomainsAsync(ClaimsPrincipal? user) =>
            await Catalogs.ResourceDomainsAsync(user, Services, Cancel);

        public void Dispose()
        {
            Services.Dispose();
            Engine.Dispose();
        }
    }
}
