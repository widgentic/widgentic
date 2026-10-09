using System.Security.Cryptography;
using System.Text.Json;
using Widgentic.Mcp.Engine;
using Widgentic.Mcp.Tests.Support;

namespace Widgentic.Mcp.Tests;

/// <summary>The pool: isolated runtimes, bounded calls, nothing carried between callers.</summary>
public sealed class EngineTests
{
    private static CancellationToken Cancel => TestContext.Current.CancellationToken;

    private static string Card(string title) =>
        JsonSerializer.Serialize(new { widget = "card", data = new { title, fields = new { marker = $"only-in-{title}" } } });

    [Fact]
    public async Task ConcurrentCallsEqualSoloCalls()
    {
        using var engine = WidgenticEngine.Create(new WidgenticOptions { EnginePoolSize = 4 });
        var inputs = Enumerable.Range(0, 64).Select(i => Card($"tenant-{i}")).ToArray();
        var concurrent = await Task.WhenAll(inputs.Select(args => engine.Pool.CallToolAsync("render_widget", args, false, Cancel).AsTask()));
        for (var i = 0; i < inputs.Length; i++)
        {
            Assert.Equal(await engine.Pool.CallToolAsync("render_widget", inputs[i], false, Cancel), concurrent[i]);
        }
    }

    [Fact]
    public async Task ARunawayCallIsContainedAndReplaced()
    {
        using var engine = WidgenticEngine.Create(new WidgenticOptions { EnginePoolSize = 2, CallTimeout = TimeSpan.FromMilliseconds(300) });
        var stuck = await engine.Pool.EvaluateForTestAsync("for (;;) {}", Cancel);
        var result = JsonDocument.Parse(stuck).RootElement;
        Assert.True(result.GetProperty("isError").GetBoolean());
        var error = JsonDocument.Parse(result.GetProperty("content")[0].GetProperty("text").GetString()!).RootElement;
        Assert.Equal("ENGINE_TIMEOUT", error.GetProperty("code").GetString());

        var next = await engine.Pool.CallToolAsync("render_widget", Card("after"), false, Cancel);
        Assert.Contains("wg-card", next);
        await engine.Pool.ReplacementsSettled();
        Assert.Equal(engine.Pool.Size, engine.Pool.IdleCount);
    }

    [Fact]
    public async Task NothingLeaksBetweenCallers()
    {
        using var shared = WidgenticEngine.Create(new WidgenticOptions { EnginePoolSize = 1 });
        using var fresh = WidgenticEngine.Create(new WidgenticOptions { EnginePoolSize = 1 });
        await shared.Pool.CallToolAsync("render_widget", Card("TENANT-A-7f3e"), false, Cancel);
        var b = Card("tenant-b");
        var afterA = await shared.Pool.CallToolAsync("render_widget", b, false, Cancel);
        Assert.Equal(await fresh.Pool.CallToolAsync("render_widget", b, false, Cancel), afterA);
        Assert.DoesNotContain("TENANT-A-7f3e", afterA);
    }

    [Fact]
    public void ReportsTheEmbeddedBundlesIdentity()
    {
        using var engine = WidgenticEngine.Create(new WidgenticOptions { EnginePoolSize = 1 });
        using var stream = typeof(WidgenticEngine).Assembly.GetManifestResourceStream("Widgentic.Mcp.widgentic-host.js")!;
        Assert.Equal(Convert.ToHexStringLower(SHA256.HashData(stream)), engine.Info.BundleSha256);
        Assert.Equal(Repo.McpPackageVersion, engine.Info.BundleVersion);
        Assert.Equal(1, engine.Info.PoolSize);
        Assert.StartsWith($"widgentic host bundle @widgentic/mcp {Repo.McpPackageVersion} (sha256 {engine.Info.BundleSha256})", engine.StartupNotes[0]);
    }

    [Fact]
    public async Task ExposesNoHostObjectsToScript()
    {
        // Only strings cross: nothing on the global object reaches .NET.
        using var engine = WidgenticEngine.Create(new WidgenticOptions { EnginePoolSize = 1 });
        var globals = await engine.Pool.EvaluateForTestAsync(
            "Object.getOwnPropertyNames(globalThis).filter(n => /host|clr|xHost|lib/i.test(n) && n !== 'widgenticHost').join()",
            Cancel);
        Assert.Equal("", globals);
    }
}
