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

    /// <summary>The sample's seed (the docker example's demo seed): <c>widgets/</c>, <c>themes/</c>, <c>schemas/</c>.</summary>
    public static string SampleSeed => Path.Combine(Root, "dotnet", "samples", "Widgentic.Sample.Stdio", "seed");

    /// <summary>The sample's seed, loaded with the three directory helpers.</summary>
    public static WidgenticOptions AddSampleSeed(this WidgenticOptions options) => options
        .AddSchemasFromDirectory(Path.Combine(SampleSeed, "schemas"))
        .AddThemesFromDirectory(Path.Combine(SampleSeed, "themes"))
        .AddWidgetsFromDirectory(Path.Combine(SampleSeed, "widgets"));

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
            c.GetProperty("output").GetString()!,
            c.TryGetProperty("config", out var named) ? named.GetString() : null)).ToArray();
        var configs = root.GetProperty("configs").EnumerateObject().ToDictionary(c => c.Name, c => c.Value.GetString()!, StringComparer.Ordinal);
        return new Corpus(root.GetProperty("config").GetString()!, configs, cases);
    });

    public static Corpus Corpus => LoadedCorpus.Value;
}

internal sealed record Corpus(string Config, IReadOnlyDictionary<string, string> Configs, IReadOnlyList<CorpusCase> Cases)
{
    /// <summary>Options carrying the corpus configuration (or the named one), exactly as a host would configure it.</summary>
    public WidgenticOptions Options(int poolSize = 1, string? config = null) =>
        Configure(new WidgenticOptions { EnginePoolSize = poolSize }, config);

    /// <summary>Adds the corpus configuration (the example widgets among it), or the named one, to any options.</summary>
    public WidgenticOptions Configure(WidgenticOptions options, string? config = null)
    {
        var root = JsonDocument.Parse(config is null ? Config : Configs[config]).RootElement;
        if (root.TryGetProperty("widgets", out var widgets)) options.AddWidget(widgets.GetRawText(), "corpus widgets");
        if (root.TryGetProperty("themes", out var themes)) options.AddTheme(themes.GetRawText(), "corpus themes");
        if (root.TryGetProperty("schemas", out var schemas)) options.AddSchema(schemas.GetRawText(), "corpus schemas");
        if (root.TryGetProperty("settings", out var settings)) options.UseSettings(settings.GetRawText(), "corpus settings");
        return options;
    }

    /// <summary>A corpus widget definition by kind.</summary>
    public JsonElement Widget(string kind) =>
        JsonDocument.Parse(Config).RootElement.GetProperty("widgets").EnumerateArray().Single(w => w.GetProperty("kind").GetString() == kind);
}

/// <summary>One corpus case; <c>Config</c> names the configuration it runs against, null for the main one.</summary>
internal sealed record CorpusCase(string Name, string Op, string? Tool, string? Args, bool Slim, string? Kind, string Output, string? Config);
