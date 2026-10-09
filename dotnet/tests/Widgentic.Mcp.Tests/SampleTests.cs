using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
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
        var url = $"http://127.0.0.1:{FreePort()}";
        using var process = Process.Start(new ProcessStartInfo("dotnet", [SamplePath(), "--http", "--urls", url])
        {
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
        })!;
        // Drain the server's logs so its pipes never fill and block it.
        process.OutputDataReceived += (_, _) => { };
        process.ErrorDataReceived += (_, _) => { };
        process.BeginOutputReadLine();
        process.BeginErrorReadLine();
        try
        {
            await WaitUntilListening(new Uri(url), process);
            HttpClientTransport Transport() => new(new HttpClientTransportOptions
            {
                Name = "widgentic sample (http)",
                Endpoint = new Uri($"{url}/mcp"),
            });

            // Stateless (2026-07-28): each request carries its capabilities, so an MCP Apps host is slimmed...
            await using (var apps = await McpClient.CreateAsync(Transport(), new McpClientOptions { Capabilities = TestServer.AppsHost() }, cancellationToken: Cancel))
            {
                Assert.Equal("2026-07-28", apps.NegotiatedProtocolVersion);
                await AssertServesTheSample(apps, slim: true);
            }
            // ...and a client without the UI capability is not.
            await using (var plain = await McpClient.CreateAsync(Transport(), cancellationToken: Cancel))
            {
                await AssertServesTheSample(plain, slim: false);
            }
            // A host on the initialize-based revision gets a session that remembers its capabilities.
            await using var older = await McpClient.CreateAsync(
                Transport(),
                new McpClientOptions { Capabilities = TestServer.AppsHost(), ProtocolVersion = "2025-11-25" },
                cancellationToken: Cancel);
            Assert.Equal("2025-11-25", older.NegotiatedProtocolVersion);
            await AssertServesTheSample(older, slim: true);
        }
        finally
        {
            process.Kill(entireProcessTree: true);
        }
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
