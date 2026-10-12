using Widgentic.Mcp.Engine;
using Widgentic.Mcp.Tests.Support;

namespace Widgentic.Mcp.Tests;

/// <summary>
/// Every case of the repository's conformance corpus, run through the embedded bundle on V8,
/// must reproduce the output recorded from the Node path byte for byte.
/// </summary>
public sealed class ConformanceTests : IClassFixture<ConformanceTests.Engine>
{
    private readonly Engine _engines;
    private readonly WidgenticEngine _engine;

    public ConformanceTests(Engine engine)
    {
        _engines = engine;
        _engine = engine.Value;
    }

    public static TheoryData<string> CaseNames() => [.. Repo.Corpus.Cases.Select(c => c.Name)];

    [Theory]
    [MemberData(nameof(CaseNames))]
    public async Task ReproducesTheNodeOutput(string name)
    {
        var entry = Repo.Corpus.Cases.Single(c => c.Name == name);
        var engine = entry.Config is null ? _engine : _engines.For(entry.Config);
        var cancel = TestContext.Current.CancellationToken;
        var output = entry.Op switch
        {
            "call" => await engine.Pool.CallToolAsync(entry.Tool!, entry.Args!, entry.Slim, cancel),
            "appTemplate" => await engine.Pool.InvokeAsync("appTemplate", cancel),
            "resources" => await engine.Pool.InvokeAsync("resources", cancel),
            "widgetPage" => await engine.Pool.InvokeAsync("widgetPage", cancel, entry.Kind!),
            _ => throw new InvalidOperationException($"unknown corpus op '{entry.Op}'"),
        };
        Assert.Equal(entry.Output, output);
    }

    [Fact]
    public async Task FormatsCanadianFrenchCurrencyLikeBrowsers()
    {
        var entry = Repo.Corpus.Cases.Single(c => c.Name == "formats 1234.5");
        var output = await _engine.Pool.CallToolAsync(entry.Tool!, entry.Args!, entry.Slim, TestContext.Current.CancellationToken);
        Assert.Contains("<p>1 234,50 $</p>", output);
        Assert.DoesNotContain("CA$", output);
    }

    /// <summary>One engine over the corpus configuration, and one per named configuration, shared by the class.</summary>
    public sealed class Engine : IDisposable
    {
        private readonly Dictionary<string, WidgenticEngine> _named = new(StringComparer.Ordinal);

        internal WidgenticEngine Value { get; } = WidgenticEngine.Create(Repo.Corpus.Options(poolSize: 2));

        /// <summary>The engine over a named configuration, created on first use.</summary>
        internal WidgenticEngine For(string config)
        {
            lock (_named)
            {
                if (!_named.TryGetValue(config, out var engine))
                {
                    engine = WidgenticEngine.Create(Repo.Corpus.Options(poolSize: 1, config));
                    _named.Add(config, engine);
                }
                return engine;
            }
        }

        public void Dispose()
        {
            Value.Dispose();
            foreach (var engine in _named.Values) engine.Dispose();
        }
    }
}
