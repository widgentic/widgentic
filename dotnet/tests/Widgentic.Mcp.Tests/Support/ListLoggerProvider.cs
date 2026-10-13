using System.Collections.Concurrent;
using Microsoft.Extensions.Logging;

namespace Widgentic.Mcp.Tests.Support;

/// <summary>Collects every log message, formatted, with its level.</summary>
internal sealed class ListLoggerProvider : ILoggerProvider
{
    private readonly ConcurrentQueue<(LogLevel Level, string Message)> _entries = new();

    public IReadOnlyList<string> Messages => [.. _entries.Select(entry => entry.Message)];

    public IReadOnlyList<(LogLevel Level, string Message)> Entries => [.. _entries];

    public ILogger CreateLogger(string categoryName) => new ListLogger(_entries);

    public void Dispose()
    {
    }

    private sealed class ListLogger(ConcurrentQueue<(LogLevel, string)> entries) : ILogger
    {
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter) =>
            entries.Enqueue((logLevel, formatter(state, exception)));
    }
}
