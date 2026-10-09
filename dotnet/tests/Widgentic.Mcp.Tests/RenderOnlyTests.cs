using System.Diagnostics;
using Widgentic.Mcp.Engine;
using Widgentic.Mcp.Tests.Support;

namespace Widgentic.Mcp.Tests;

/// <summary>Render-only: no egress, and prompt actions survive while http actions render disabled.</summary>
public sealed class RenderOnlyTests
{
    private static CancellationToken Cancel => TestContext.Current.CancellationToken;

    [Fact]
    public void ThePackageCannotReachTheNetwork()
    {
        var referenced = typeof(WidgenticEngine).Assembly.GetReferencedAssemblies().Select(a => a.Name).ToArray();
        Assert.DoesNotContain("System.Net.Http", referenced);
        Assert.DoesNotContain("System.Net.Sockets", referenced);
    }

    [Fact]
    public async Task TheWholeCorpusRendersWithoutAnHttpRequest()
    {
        var requests = new List<string>();
        using var subscription = DiagnosticListener.AllListeners.Subscribe(new HttpRequestObserver(requests));
        using var engine = WidgenticEngine.Create(Repo.Corpus.Options());
        foreach (var entry in Repo.Corpus.Cases.Where(c => c.Op == "call"))
        {
            Assert.Equal(entry.Output, await engine.Pool.CallToolAsync(entry.Tool!, entry.Args!, entry.Slim, Cancel));
        }
        Assert.Empty(requests);
    }

    [Fact]
    public async Task PromptActionsSurviveAndHttpActionsAreDisabled()
    {
        var entry = Repo.Corpus.Cases.Single(c => c.Name == "example weather");
        using var engine = WidgenticEngine.Create(Repo.Corpus.Options());
        var output = await engine.Pool.CallToolAsync(entry.Tool!, entry.Args!, entry.Slim, Cancel);
        Assert.Contains("\\\"kind\\\":\\\"prompt\\\"", output);
        Assert.Contains("\\\"disabled\\\":\\\"unresolved\\\"", output);
        Assert.DoesNotContain("\"load\":", output);
    }

    /// <summary>Records every outgoing HttpClient request the process makes.</summary>
    private sealed class HttpRequestObserver(List<string> requests) : IObserver<DiagnosticListener>, IObserver<KeyValuePair<string, object?>>
    {
        public void OnNext(DiagnosticListener listener)
        {
            if (listener.Name == "HttpHandlerDiagnosticListener") listener.Subscribe(this);
        }

        public void OnNext(KeyValuePair<string, object?> evt)
        {
            if (evt.Key.EndsWith(".Start", StringComparison.Ordinal) || evt.Key == "System.Net.Http.Request")
            {
                lock (requests) requests.Add(evt.Key);
            }
        }

        public void OnCompleted()
        {
        }

        public void OnError(Exception error)
        {
        }
    }
}
