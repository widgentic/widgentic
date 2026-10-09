using System.IO.Pipelines;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using ModelContextProtocol.Client;
using ModelContextProtocol.Protocol;
using ModelContextProtocol.Server;

namespace Widgentic.Mcp.Tests.Support;

/// <summary>A real MCP server with widgentic, and a C# SDK client connected to it over in-process pipes.</summary>
internal sealed class TestServer : IAsyncDisposable
{
    private readonly IHost _host;

    private TestServer(IHost host, McpClient client)
    {
        _host = host;
        Client = client;
    }

    public McpClient Client { get; }

    public IServiceProvider Services => _host.Services;

    /// <summary>The client capability an MCP Apps host advertises.</summary>
    public static ClientCapabilities AppsHost() => new()
    {
        Extensions = new Dictionary<string, object>
        {
            ["io.modelcontextprotocol/ui"] = JsonDocument.Parse("""{"mimeTypes":["text/html;profile=mcp-app"]}""").RootElement,
        },
    };

    public static async Task<TestServer> StartAsync(
        Action<WidgenticOptions>? configure = null,
        ClientCapabilities? clientCapabilities = null,
        Action<IMcpServerBuilder>? extra = null,
        ILoggerProvider? logs = null)
    {
        var clientToServer = new Pipe();
        var serverToClient = new Pipe();
        var builder = Host.CreateApplicationBuilder();
        builder.Logging.ClearProviders();
        if (logs is not null) builder.Logging.AddProvider(logs);
        var mcp = builder.Services
            .AddMcpServer()
            .WithStreamServerTransport(clientToServer.Reader.AsStream(), serverToClient.Writer.AsStream())
            .WithWidgentic(configure);
        extra?.Invoke(mcp);
        var host = builder.Build();
        await host.StartAsync(TestContext.Current.CancellationToken);
        var client = await McpClient.CreateAsync(
            new StreamClientTransport(clientToServer.Writer.AsStream(), serverToClient.Reader.AsStream(), null),
            new McpClientOptions { Capabilities = clientCapabilities ?? new ClientCapabilities() },
            null,
            TestContext.Current.CancellationToken);
        return new TestServer(host, client);
    }

    public async ValueTask DisposeAsync()
    {
        await Client.DisposeAsync();
        await _host.StopAsync();
        _host.Dispose();
    }
}
