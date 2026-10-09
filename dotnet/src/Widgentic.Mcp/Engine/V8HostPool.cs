using System.Text.Json;
using System.Threading.Channels;
using Microsoft.ClearScript;

namespace Widgentic.Mcp.Engine;

/// <summary>
/// A bounded pool of <see cref="HostRuntime"/>s, all loaded eagerly with the same
/// configuration. A call leases one runtime, runs under <c>CallTimeout</c>, and returns it; a
/// runtime that timed out or failed is disposed and replaced in the background, so the
/// process keeps serving and the pool keeps its size. Pooling carries no data between calls:
/// the bundle keeps no per-call state and every runtime holds only the startup configuration.
/// </summary>
internal sealed class V8HostPool : IDisposable
{
    private readonly string _bundle;
    private readonly string _configJson;
    private readonly TimeSpan _timeout;
    private readonly Channel<HostRuntime> _idle = Channel.CreateUnbounded<HostRuntime>();
    private readonly object _replacementsGate = new();
    private readonly List<Task> _replacements = [];
    private int _generation;
    private bool _disposed;

    public V8HostPool(string bundle, string configJson, int size, TimeSpan timeout)
    {
        if (size < 1) throw new ArgumentOutOfRangeException(nameof(size), size, "The engine pool needs at least one runtime.");
        if (timeout <= TimeSpan.Zero) throw new ArgumentOutOfRangeException(nameof(timeout), timeout, "The call timeout must be positive.");
        _bundle = bundle;
        _configJson = configJson;
        _timeout = timeout;
        Size = size;

        // Eager and parallel: configuration problems surface before the first request.
        var runtimes = new HostRuntime[size];
        try
        {
            Parallel.For(0, size, index => runtimes[index] = HostRuntime.Create(bundle, configJson, RuntimeName(index)));
        }
        catch
        {
            foreach (var runtime in runtimes) runtime?.Dispose();
            throw;
        }
        foreach (var runtime in runtimes) _idle.Writer.TryWrite(runtime);
    }

    public int Size { get; }

    /// <summary>Runtimes waiting for a call (tests compare it with <see cref="Size"/>).</summary>
    internal int IdleCount => _idle.Reader.Count;

    /// <summary>Completes when every replacement started so far is back in the pool.</summary>
    internal Task ReplacementsSettled()
    {
        lock (_replacementsGate) return Task.WhenAll(_replacements.ToArray());
    }

    /// <summary>Call a host method that answers with a tool result; engine failures become <c>isError</c> results.</summary>
    public async ValueTask<string> CallToolAsync(string tool, string argsJson, bool slim, CancellationToken cancellationToken)
    {
        var outcome = await RunAsync(runtime => runtime.Invoke("call", tool, argsJson, slim), cancellationToken).ConfigureAwait(false);
        return outcome.Error is null ? outcome.Value! : EngineErrorResult(outcome.Error.Value);
    }

    /// <summary>Call a host method that answers with a document or JSON; engine failures throw.</summary>
    public async ValueTask<string> InvokeAsync(string method, CancellationToken cancellationToken, params object[] args)
    {
        var outcome = await RunAsync(runtime => runtime.Invoke(method, args), cancellationToken).ConfigureAwait(false);
        return outcome.Error is { } error
            ? throw new InvalidOperationException($"widgentic {method}() failed: {error.Code} — {error.Message}")
            : outcome.Value!;
    }

    /// <summary>Run arbitrary script on a leased runtime under the same limits. Tests only.</summary>
    internal async ValueTask<string> EvaluateForTestAsync(string code, CancellationToken cancellationToken)
    {
        var outcome = await RunAsync(runtime => Convert.ToString(runtime.EvaluateForTest(code)) ?? "", cancellationToken).ConfigureAwait(false);
        return outcome.Error is null ? outcome.Value! : EngineErrorResult(outcome.Error.Value);
    }

    private async ValueTask<Outcome> RunAsync(Func<HostRuntime, string> work, CancellationToken cancellationToken)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        var runtime = await _idle.Reader.ReadAsync(cancellationToken).ConfigureAwait(false);
        // 0 running, 1 finished, 2 interrupted: the timer may only interrupt a call still running,
        // and a runtime it interrupted is never reused, even if the call had just returned.
        var state = 0;
        using var timer = new Timer(_ =>
        {
            if (Interlocked.CompareExchange(ref state, 2, 0) == 0) runtime.Interrupt();
        }, null, _timeout, Timeout.InfiniteTimeSpan);
        string? value = null;
        EngineError? error = null;
        try
        {
            value = work(runtime);
        }
        catch (ScriptInterruptedException)
        {
            error = new EngineError("ENGINE_TIMEOUT", $"The widgentic call did not finish within {_timeout.TotalSeconds:0.###} s.");
        }
        catch (Exception exception) when (exception is ScriptEngineException or InvalidOperationException)
        {
            error = new EngineError("ENGINE_FAILURE", exception.Message);
        }
        var interrupted = Interlocked.CompareExchange(ref state, 1, 0) == 2;
        if (interrupted && error is null) error = new EngineError("ENGINE_TIMEOUT", $"The widgentic call did not finish within {_timeout.TotalSeconds:0.###} s.");
        if (error is null) _idle.Writer.TryWrite(runtime);
        else Replace(runtime);
        return new Outcome(error is null ? value : null, error);
    }

    private void Replace(HostRuntime failed)
    {
        failed.Dispose();
        var name = RuntimeName(Size + Interlocked.Increment(ref _generation));
        var replacement = Task.Run(() =>
        {
            var fresh = HostRuntime.Create(_bundle, _configJson, name);
            if (_disposed || !_idle.Writer.TryWrite(fresh)) fresh.Dispose();
        });
        lock (_replacementsGate)
        {
            _replacements.RemoveAll(task => task.IsCompleted);
            _replacements.Add(replacement);
        }
    }

    private static string RuntimeName(int index) => $"widgentic-{index}";

    /// <summary>An engine failure in the bundle's error vocabulary, as a tool result.</summary>
    private static string EngineErrorResult(EngineError error)
    {
        var text = JsonSerializer.Serialize(new Dictionary<string, string>
        {
            ["code"] = error.Code,
            ["path"] = "",
            ["message"] = error.Message,
        });
        using var buffer = new MemoryStream();
        using (var writer = new Utf8JsonWriter(buffer))
        {
            writer.WriteStartObject();
            writer.WriteBoolean("isError", true);
            writer.WriteStartArray("content");
            writer.WriteStartObject();
            writer.WriteString("type", "text");
            writer.WriteString("text", text);
            writer.WriteEndObject();
            writer.WriteEndArray();
            writer.WriteEndObject();
        }
        return System.Text.Encoding.UTF8.GetString(buffer.ToArray());
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        _idle.Writer.TryComplete();
        while (_idle.Reader.TryRead(out var runtime)) runtime.Dispose();
    }

    private readonly record struct EngineError(string Code, string Message);

    private readonly record struct Outcome(string? Value, EngineError? Error);
}
