using System.Reflection;
using System.Text.Json;

namespace Widgentic.Mcp.Tests.Support;

/// <summary>Paths into the repository, stamped at build time, and the conformance corpus.</summary>
internal static class Repo
{
    private static string Metadata(string key) =>
        typeof(Repo).Assembly.GetCustomAttributes<AssemblyMetadataAttribute>().Single(a => a.Key == key).Value
            ?? throw new InvalidOperationException($"assembly metadata '{key}' is empty");

    public static string Root => Metadata("WidgenticRepoRoot");

    public static string CorpusPath => Metadata("WidgenticCorpusPath");

    public static string SampleWidgets => Path.Combine(Root, "dotnet", "samples", "Widgentic.Sample.Stdio", "widgets");

    public static string McpPackageVersion =>
        JsonDocument.Parse(File.ReadAllText(Path.Combine(Root, "packages", "mcp", "package.json")))
            .RootElement.GetProperty("version").GetString()!;

    private static readonly Lazy<Corpus> LoadedCorpus = new(() =>
    {
        var root = JsonDocument.Parse(File.ReadAllText(CorpusPath)).RootElement;
        var cases = root.GetProperty("cases").EnumerateArray().Select(c => new CorpusCase(
            c.GetProperty("name").GetString()!,
            c.GetProperty("op").GetString()!,
            c.TryGetProperty("tool", out var tool) ? tool.GetString() : null,
            c.TryGetProperty("args", out var args) ? args.GetString() : null,
            c.TryGetProperty("slim", out var slim) && slim.GetBoolean(),
            c.TryGetProperty("kind", out var kind) ? kind.GetString() : null,
            c.GetProperty("output").GetString()!)).ToArray();
        return new Corpus(root.GetProperty("config").GetString()!, cases);
    });

    public static Corpus Corpus => LoadedCorpus.Value;
}

internal sealed record Corpus(string Config, IReadOnlyList<CorpusCase> Cases)
{
    /// <summary>Options carrying the corpus configuration, exactly as a host would configure it.</summary>
    public WidgenticOptions Options(int poolSize = 1)
    {
        var config = JsonDocument.Parse(Config).RootElement;
        var options = new WidgenticOptions { EnginePoolSize = poolSize };
        options.AddWidget(config.GetProperty("widgets").GetRawText(), "corpus widgets");
        options.AddTheme(config.GetProperty("themes").GetRawText(), "corpus themes");
        options.AddSchema(config.GetProperty("schemas").GetRawText(), "corpus schemas");
        return options;
    }
}

internal sealed record CorpusCase(string Name, string Op, string? Tool, string? Args, bool Slim, string? Kind, string Output);
