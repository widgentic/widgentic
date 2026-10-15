using System.Collections.Concurrent;
using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Security.Cryptography;
using System.Text.Json;
using ModelContextProtocol.Client;
using ModelContextProtocol.Protocol;
using Widgentic.Mcp.Tests.Support;

namespace Widgentic.Mcp.Tests;

/// <summary>The sample, launched as a real process and driven by a C# SDK client over both transports.</summary>
public sealed class SampleTests
{
    private static CancellationToken Cancel => TestContext.Current.CancellationToken;

    private static string SamplePath()
    {
        var configuration = typeof(SampleTests).Assembly.GetCustomAttribute<AssemblyConfigurationAttribute>()!.Configuration;
        var sample = Path.Combine(Repo.Root, "dotnet", "samples", "Widgentic.Sample.Stdio", "bin", configuration, "net10.0", "Widgentic.Sample.Stdio.dll");
        Assert.True(File.Exists(sample), $"build the sample first: {sample}");
        return sample;
    }

    private static async Task AssertServesTheSample(McpClient client, bool slim)
    {
        var tools = await client.ListToolsAsync(cancellationToken: Cancel);
        Assert.Contains(tools, t => t.Name == "team_roster");
        Assert.Contains(tools, t => t.Name == "render_widget");

        var listing = await client.CallToolAsync("list_widgets", cancellationToken: Cancel);
        var text = Assert.IsType<TextContentBlock>(listing.Content[0]).Text;
        foreach (var kind in new[] { "appointment-agenda-widget", "email-inbox-widget" }) Assert.Contains($"\"kind\": \"{kind}\"", text);
        var themes = await client.CallToolAsync("list_themes", cancellationToken: Cancel);
        Assert.Contains("google-dark", Assert.IsType<TextContentBlock>(themes.Content[0]).Text);
        Assert.Equal(("google-light", "google-dark"), await Defaults(client));
        var schemas = await client.CallToolAsync("list_schemas", cancellationToken: Cancel);
        Assert.Contains("email-inbox", Assert.IsType<TextContentBlock>(schemas.Content[0]).Text);

        var roster = await client.CallToolAsync("team_roster", cancellationToken: Cancel);
        Assert.Contains("Grace Hopper", roster.StructuredContent!.Value.GetProperty("html").GetString());
        var rosterText = Assert.IsType<TextContentBlock>(roster.Content[0]).Text;
        if (slim) Assert.StartsWith("Rendered 'table' widget inline", rosterText);
        else Assert.Contains("class=\"wg-table\"", rosterText);

        var template = await client.ReadResourceAsync(WidgenticResources.AppTemplateUri, cancellationToken: Cancel);
        Assert.Contains("wg-root", Assert.IsType<TextResourceContents>(Assert.Single(template.Contents)).Text);
    }

    [Fact]
    public async Task ServesOverStdio()
    {
        var transport = new StdioClientTransport(new StdioClientTransportOptions
        {
            Name = "widgentic sample (stdio)",
            Command = "dotnet",
            Arguments = [SamplePath()],
        });
        await using var client = await McpClient.CreateAsync(transport, cancellationToken: Cancel);
        await AssertServesTheSample(client, slim: false);
    }

    [Fact]
    public async Task ServesOverStreamableHttp()
    {
        using var sample = await HttpSample.StartAsync();

        // Stateless (2026-07-28): each request carries its capabilities, so an MCP Apps host is slimmed...
        await using (var apps = await McpClient.CreateAsync(sample.Transport(), new McpClientOptions { Capabilities = TestServer.AppsHost() }, cancellationToken: Cancel))
        {
            Assert.Equal("2026-07-28", apps.NegotiatedProtocolVersion);
            await AssertServesTheSample(apps, slim: true);
        }
        // ...and a client without the UI capability is not.
        await using (var plain = await McpClient.CreateAsync(sample.Transport(), cancellationToken: Cancel))
        {
            await AssertServesTheSample(plain, slim: false);
        }
        // A host on the initialize-based revision gets a session that remembers its capabilities.
        await using var older = await McpClient.CreateAsync(
            sample.Transport(),
            new McpClientOptions { Capabilities = TestServer.AppsHost(), ProtocolVersion = "2025-11-25" },
            cancellationToken: Cancel);
        Assert.Equal("2025-11-25", older.NegotiatedProtocolVersion);
        await AssertServesTheSample(older, slim: true);
    }

    [Fact]
    public async Task ServesEachPrincipalItsCatalogOverHttp()
    {
        var mergeKey = Convert.ToHexStringLower(RandomNumberGenerator.GetBytes(16));
        var replaceKey = Convert.ToHexStringLower(RandomNumberGenerator.GetBytes(16));
        using var sample = await HttpSample.StartAsync(new Dictionary<string, string>
        {
            ["Widgentic__Sample__Keys__merge-demo"] = mergeKey,
            ["Widgentic__Sample__Keys__replace-demo"] = replaceKey,
        });
        var seedInbox = Description(File.ReadAllText(Path.Combine(Repo.SampleSeed, "widgets", "email-inbox-widget.json")));

        // Without a key: the seed.
        await using (var keyless = await McpClient.CreateAsync(sample.Transport(), cancellationToken: Cancel))
        {
            var widgets = await ListWidgets(keyless);
            Assert.Equal(seedInbox, Assert.Single(widgets, w => w.Kind == "email-inbox-widget").Description);
            Assert.Contains(widgets, w => w.Kind == "appointment-agenda-widget");
            Assert.DoesNotContain(widgets, w => w.Kind == "release-notes-widget");
            Assert.Equal(("google-light", "google-dark"), await Defaults(keyless));
            // The seed's settings declare its two image domains and the icon font's two.
            Assert.Equal(["https://api.dicebear.com", "https://*.pravatar.cc", "https://fonts.googleapis.com", "https://fonts.gstatic.com"], await Declared(keyless));
        }
        // Merge, keyed by header: the seed, with the principal's inbox in place of the seed's, and its theme.
        await using (var merge = await McpClient.CreateAsync(sample.Transport(headers: new() { ["x-api-key"] = mergeKey }), cancellationToken: Cancel))
        {
            var widgets = await ListWidgets(merge);
            var inbox = Assert.Single(widgets, w => w.Kind == "email-inbox-widget");
            Assert.StartsWith("Displays the merge-demo principal's inbox", inbox.Description);
            Assert.Contains(widgets, w => w.Kind == "appointment-agenda-widget");
            var themes = await merge.CallToolAsync("list_themes", cancellationToken: Cancel);
            var themeText = Assert.IsType<TextContentBlock>(themes.Content[0]).Text;
            Assert.Contains("merge-demo-dark", themeText);
            Assert.Contains("google-dark", themeText);
            Assert.Equal(("google-light", "merge-demo-dark"), await Defaults(merge));
            // Its section replaces the seed's whole: the seed's four domains and one of its own.
            Assert.Equal(
                ["https://api.dicebear.com", "https://*.pravatar.cc", "https://fonts.googleapis.com", "https://fonts.gstatic.com", "https://ui-avatars.com"],
                await Declared(merge));
        }
        // Replace, keyed in the URL as hosts that only take a URL send it: the built-ins and its own widget.
        await using (var replace = await McpClient.CreateAsync(sample.Transport(query: $"?key={replaceKey}"), cancellationToken: Cancel))
        {
            var widgets = await ListWidgets(replace);
            Assert.Contains(widgets, w => w.Kind == "release-notes-widget");
            Assert.Contains(widgets, w => w.Kind == "card");
            Assert.DoesNotContain(widgets, w => w.Kind is "email-inbox-widget" or "appointment-agenda-widget");
            // Replace composes no startup entries, so the seed's defaults never apply.
            Assert.Equal(("light", "dark"), await Defaults(replace));
            // Replace composes no startup settings, so it declares nothing.
            Assert.Empty(await Declared(replace));
            var data = new Dictionary<string, object?>
            {
                ["product"] = "Sample",
                ["version"] = "1.2.3",
                ["changes"] = new[] { new Dictionary<string, object?> { ["summary"] = "Only-for-replace-demo" } },
            };
            var rendered = await replace.CallToolAsync(
                "render_widget",
                new Dictionary<string, object?> { ["widget"] = "release-notes-widget", ["data"] = data },
                cancellationToken: Cancel);
            Assert.NotEqual(true, rendered.IsError);
            Assert.Contains("Only-for-replace-demo", Assert.IsType<TextContentBlock>(rendered.Content[0]).Text);
        }
        // The server's Information logs are collected, and none of them carries a key.
        Assert.Contains(sample.Output, line => line.Contains("Now listening on", StringComparison.Ordinal));
        Assert.DoesNotContain(sample.Output, line => line.Contains(mergeKey, StringComparison.Ordinal) || line.Contains(replaceKey, StringComparison.Ordinal));
    }

    /// <summary>The app resource's declared domains this client lists, asserted equal to those it reads.</summary>
    private static async Task<string[]> Declared(McpClient client)
    {
        var listed = Assert.Single(await client.ListResourcesAsync(cancellationToken: Cancel), r => r.Uri == WidgenticResources.AppTemplateUri);
        var read = Assert.Single((await client.ReadResourceAsync(WidgenticResources.AppTemplateUri, cancellationToken: Cancel)).Contents);
        static string[] Domains(System.Text.Json.Nodes.JsonObject? meta) =>
            [.. meta?["ui"]?["csp"]?["resourceDomains"]?.AsArray().Select(d => d!.GetValue<string>()) ?? []];
        Assert.Equal(Domains(listed.ProtocolResource.Meta), Domains(read.Meta));
        return Domains(read.Meta);
    }

    private static async Task<(string Kind, string? Description)[]> ListWidgets(McpClient client)
    {
        var listing = await client.CallToolAsync("list_widgets", cancellationToken: Cancel);
        using var json = JsonDocument.Parse(Assert.IsType<TextContentBlock>(listing.Content[0]).Text);
        return [.. json.RootElement.EnumerateArray().Select(w => (w.GetProperty("kind").GetString()!, w.TryGetProperty("description", out var d) ? d.GetString() : null))];
    }

    /// <summary>The effective default theme names <c>list_themes</c> reports to this client.</summary>
    private static async Task<(string Light, string Dark)> Defaults(McpClient client)
    {
        var listing = await client.CallToolAsync("list_themes", cancellationToken: Cancel);
        using var json = JsonDocument.Parse(Assert.IsType<TextContentBlock>(listing.Content[0]).Text);
        var defaults = json.RootElement.GetProperty("defaults");
        return (defaults.GetProperty("light").GetString()!, defaults.GetProperty("dark").GetString()!);
    }

    private static string? Description(string widgetJson)
    {
        using var json = JsonDocument.Parse(widgetJson);
        return json.RootElement.GetProperty("descriptor").GetProperty("description").GetString();
    }

    /// <summary>The sample served over HTTP on a free loopback port, its output collected.</summary>
    private sealed class HttpSample : IDisposable
    {
        private readonly Process _process;
        private readonly ConcurrentQueue<string> _output = new();

        private HttpSample(Process process, string url)
        {
            _process = process;
            Url = url;
            // Collecting also drains the pipes, so they never fill and block the server.
            process.OutputDataReceived += (_, line) => { if (line.Data is not null) _output.Enqueue(line.Data); };
            process.ErrorDataReceived += (_, line) => { if (line.Data is not null) _output.Enqueue(line.Data); };
            process.BeginOutputReadLine();
            process.BeginErrorReadLine();
        }

        public string Url { get; }

        public IReadOnlyCollection<string> Output => _output;

        public static async Task<HttpSample> StartAsync(IReadOnlyDictionary<string, string>? environment = null)
        {
            var url = $"http://127.0.0.1:{FreePort()}";
            var start = new ProcessStartInfo("dotnet", [SamplePath(), "--http", "--urls", url])
            {
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
            };
            foreach (var (name, value) in environment ?? new Dictionary<string, string>()) start.Environment[name] = value;
            var sample = new HttpSample(Process.Start(start)!, url);
            try
            {
                await WaitUntilListening(new Uri(url), sample._process);
                return sample;
            }
            catch
            {
                sample.Dispose();
                throw;
            }
        }

        public HttpClientTransport Transport(Dictionary<string, string>? headers = null, string query = "") => new(new HttpClientTransportOptions
        {
            Name = "widgentic sample (http)",
            Endpoint = new Uri($"{Url}/mcp{query}"),
            AdditionalHeaders = headers,
        });

        public void Dispose() => _process.Kill(entireProcessTree: true);
    }

    private static int FreePort()
    {
        using var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        return ((IPEndPoint)listener.LocalEndpoint).Port;
    }

    private static async Task WaitUntilListening(Uri url, Process process)
    {
        var deadline = DateTime.UtcNow.AddSeconds(30);
        while (DateTime.UtcNow < deadline)
        {
            Assert.False(process.HasExited, "the sample exited before it started listening");
            try
            {
                using var socket = new TcpClient();
                await socket.ConnectAsync(url.Host, url.Port, Cancel);
                return;
            }
            catch (SocketException)
            {
                await Task.Delay(200, Cancel);
            }
        }
        Assert.Fail($"the sample did not listen on {url} within 30 s");
    }
}
