using System.Text.Json;
using System.Text.Json.Nodes;
using ModelContextProtocol.Extensions.Apps;

namespace Widgentic.Mcp.Engine;

/// <summary>
/// The configured widgentic host for one server: the pool, plus what the bundle declared at
/// startup (tool definitions, resources, identity). Built once, before the server starts;
/// any refused configuration entry stops startup with every problem listed.
/// </summary>
internal sealed class WidgenticEngine : IDisposable
{
    private WidgenticEngine(
        V8HostPool pool,
        IReadOnlyList<JsonElement> definitions,
        HostResources resources,
        WidgenticEngineInfo info,
        IReadOnlyList<string> notes)
    {
        Pool = pool;
        Definitions = definitions;
        Resources = resources;
        Info = info;
        StartupNotes = notes;
    }

    public V8HostPool Pool { get; }

    /// <summary>The bundle's tool definitions (name, description, inputSchema), in its order.</summary>
    public IReadOnlyList<JsonElement> Definitions { get; }

    public HostResources Resources { get; }

    public WidgenticEngineInfo Info { get; }

    /// <summary>Lines to log once at startup: the bundle's identity and inactive bindings.</summary>
    public IReadOnlyList<string> StartupNotes { get; }

    public static WidgenticEngine Create(WidgenticOptions options) => Create(options, HostBundle.Embedded);

    internal static WidgenticEngine Create(WidgenticOptions options, HostBundle bundle)
    {
        if (options.ParseProblems.Count > 0) throw new WidgenticConfigurationException(options.ParseProblems);
        var config = new JsonObject
        {
            ["widgets"] = Section(options.Widgets),
            ["themes"] = Section(options.Themes),
            ["schemas"] = Section(options.Schemas),
        };
        var pool = new V8HostPool(bundle.Text, config.ToJsonString(), options.EnginePoolSize, options.CallTimeout);
        try
        {
            var problems = Problems(Read(pool, "problems"), options);
            if (problems.Count > 0) throw new WidgenticConfigurationException(problems);

            var definitions = JsonDocument.Parse(Read(pool, "definitions")).RootElement.EnumerateArray().Select(d => d.Clone()).ToArray();
            CheckToolNames(definitions);
            var resources = HostResources.Parse(Read(pool, "resources"));
            resources.CheckAgainstPackage();

            var info = new WidgenticEngineInfo(Read(pool, "version"), bundle.Sha256, pool.Size);
            var notes = new List<string>
            {
                $"widgentic host bundle @widgentic/mcp {info.BundleVersion} (sha256 {info.BundleSha256}) on {info.PoolSize} V8 runtime(s); render-only.",
            };
            foreach (var widget in options.Widgets)
            {
                if (widget.Value is JsonObject definition && definition.ContainsKey("load"))
                {
                    notes.Add($"widget '{definition["kind"]}' ({widget.Source}) declares a load binding; it is inactive in this render-only version.");
                }
            }
            return new WidgenticEngine(pool, definitions, resources, info, notes);
        }
        catch
        {
            pool.Dispose();
            throw;
        }
    }

    private static JsonArray Section(List<ConfigEntry> entries) => new(entries.Select(entry => entry.Value?.DeepClone()).ToArray());

    /// <summary>Startup-time reads run synchronously: nothing else uses the pool yet.</summary>
    private static string Read(V8HostPool pool, string method) =>
        pool.InvokeAsync(method, CancellationToken.None).AsTask().GetAwaiter().GetResult();

    private static List<WidgenticConfigurationProblem> Problems(string json, WidgenticOptions options)
    {
        var problems = new List<WidgenticConfigurationProblem>();
        foreach (var problem in JsonDocument.Parse(json).RootElement.EnumerateArray())
        {
            var section = problem.GetProperty("section").GetString() ?? "";
            var index = problem.GetProperty("index").GetInt32();
            var entries = section switch
            {
                "widgets" => options.Widgets,
                "themes" => options.Themes,
                "schemas" => options.Schemas,
                _ => null,
            };
            var source = entries is not null && index >= 0 && index < entries.Count ? entries[index].Source : section;
            problems.Add(new WidgenticConfigurationProblem(
                section,
                source,
                problem.GetProperty("code").GetString() ?? "",
                problem.GetProperty("message").GetString() ?? ""));
        }
        return problems;
    }

    /// <summary>The flags and companions must name exactly the bundle's tools, or this package and its bundle disagree.</summary>
    private static void CheckToolNames(IReadOnlyList<JsonElement> definitions)
    {
        var bundle = definitions.Select(d => d.GetProperty("name").GetString()).Order(StringComparer.Ordinal).ToArray();
        var package = WidgenticToolNames.All.Order(StringComparer.Ordinal).ToArray();
        if (!bundle.SequenceEqual(package))
        {
            throw new InvalidOperationException(
                $"The embedded host bundle serves [{string.Join(", ", bundle)}] but this package selects [{string.Join(", ", package)}]; the bundle and Widgentic.Mcp do not match.");
        }
    }

    public void Dispose() => Pool.Dispose();
}

/// <summary>The bundle's documents: where they are served and how they are described.</summary>
internal sealed record HostResources(
    string AppTemplateName,
    string AppTemplateUri,
    string AppTemplateMimeType,
    string AppTemplateDescription,
    string WidgetPageName,
    string WidgetPageTitle,
    string WidgetPageUriTemplate,
    string WidgetPageMimeType,
    string WidgetPageDescription)
{
    public static HostResources Parse(string json)
    {
        var root = JsonDocument.Parse(json).RootElement;
        var app = root.GetProperty("appTemplate");
        var page = root.GetProperty("widgetPage");
        string Text(JsonElement element, string name) => element.GetProperty(name).GetString() ?? "";
        return new HostResources(
            Text(app, "name"), Text(app, "uri"), Text(app, "mimeType"), Text(app, "description"),
            Text(page, "name"), Text(page, "title"), Text(page, "uriTemplate"), Text(page, "mimeType"), Text(page, "description"));
    }

    /// <summary>The public constants mirror the bundle; a mismatch is a packaging error, caught at startup.</summary>
    public void CheckAgainstPackage()
    {
        if (AppTemplateUri != WidgenticResources.AppTemplateUri
            || WidgetPageUriTemplate != WidgenticResources.WidgetPageUriTemplate
            || AppTemplateMimeType != McpApps.HtmlMimeType)
        {
            throw new InvalidOperationException(
                $"The embedded host bundle serves {AppTemplateUri} ({AppTemplateMimeType}) and {WidgetPageUriTemplate}, which this package's constants do not match.");
        }
    }
}
