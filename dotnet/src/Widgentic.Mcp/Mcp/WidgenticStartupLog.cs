using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Widgentic.Mcp.Engine;

namespace Widgentic.Mcp.Mcp;

/// <summary>Logs the engine's startup notes once, when the host starts.</summary>
internal sealed class WidgenticStartupLog(WidgenticEngine engine, ILogger<WidgenticStartupLog> logger) : IHostedService
{
    public Task StartAsync(CancellationToken cancellationToken)
    {
        foreach (var note in engine.StartupNotes) logger.LogInformation("{WidgenticNote}", note);
        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
