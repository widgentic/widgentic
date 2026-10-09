using System.Text.Json;
using System.Text.Json.Nodes;

namespace Widgentic.Mcp;

/// <summary>Configuration for <see cref="Microsoft.Extensions.DependencyInjection.WidgenticBuilderExtensions.WithWidgentic"/>.</summary>
public sealed class WidgenticOptions
{
    internal List<ConfigEntry> Widgets { get; } = [];
    internal List<ConfigEntry> Themes { get; } = [];
    internal List<ConfigEntry> Schemas { get; } = [];
    internal List<WidgenticConfigurationProblem> ParseProblems { get; } = [];

    /// <summary>The widgentic tools to expose. Default: <see cref="WidgenticTools.Default"/>.</summary>
    public WidgenticTools Tools { get; set; } = WidgenticTools.Default;

    /// <summary>
    /// Hosts the MCP Apps frame may load assets from directly, declared as the app resource's
    /// <c>_meta.ui.csp.resourceDomains</c>. Deployment configuration only: no widget, theme or
    /// render input can extend it. Empty by default.
    /// </summary>
    public IList<string> ResourceDomains { get; } = new List<string>();

    /// <summary>Whether to serve the <c>ui://widgentic/page/{kind}</c> preview pages. Default: true.</summary>
    public bool IncludeWidgetPages { get; set; } = true;

    /// <summary>
    /// Whether to slim model-facing output when a request carries no negotiated client
    /// capabilities (stateless HTTP). A negotiated session always decides by itself.
    /// The equivalent of the Node assembly's <c>WIDGENTIC_ASSUME_UI</c>. Default: false.
    /// </summary>
    public bool AssumeUi { get; set; }

    /// <summary>How many V8 runtimes render concurrently. Default: the processor count, at most 4.</summary>
    public int EnginePoolSize { get; set; } = Math.Min(Environment.ProcessorCount, 4);

    /// <summary>The longest one call may run before it is interrupted. Default: 2 seconds.</summary>
    public TimeSpan CallTimeout { get; set; } = TimeSpan.FromSeconds(2);

    /// <summary>
    /// Add widget definitions in the designer's export shape (<c>{ kind, template, descriptor, load? }</c>):
    /// one JSON object, or a JSON array of them.
    /// </summary>
    /// <param name="json">The definition JSON.</param>
    /// <param name="source">Where it came from, named in configuration errors.</param>
    public WidgenticOptions AddWidget(string json, string? source = null) =>
        Add(Widgets, "widgets", json, source ?? "widget JSON");

    /// <summary>Add every <c>*.json</c> file in <paramref name="path"/> (ordinal file-name order) as widget definitions.</summary>
    /// <param name="path">A directory of designer exports.</param>
    public WidgenticOptions AddWidgetsFromDirectory(string path)
    {
        foreach (var file in Directory.EnumerateFiles(path, "*.json").Order(StringComparer.Ordinal))
        {
            AddWidget(File.ReadAllText(file), file);
        }
        return this;
    }

    /// <summary>Add theme entries (<c>{ name, label?, description?, extends?, tokens }</c>): one object or an array.</summary>
    /// <param name="json">The theme JSON.</param>
    /// <param name="source">Where it came from, named in configuration errors.</param>
    public WidgenticOptions AddTheme(string json, string? source = null) =>
        Add(Themes, "themes", json, source ?? "theme JSON");

    /// <summary>Add shared schema entries (<c>{ name, label?, description?, schema }</c>): one object or an array.</summary>
    /// <param name="json">The schema JSON.</param>
    /// <param name="source">Where it came from, named in configuration errors.</param>
    public WidgenticOptions AddSchema(string json, string? source = null) =>
        Add(Schemas, "schemas", json, source ?? "schema JSON");

    private WidgenticOptions Add(List<ConfigEntry> into, string section, string json, string source)
    {
        JsonNode? node;
        try
        {
            node = JsonNode.Parse(json);
        }
        catch (JsonException error)
        {
            ParseProblems.Add(new WidgenticConfigurationProblem(section, source, "INVALID_JSON", error.Message));
            return this;
        }
        if (node is JsonArray array)
        {
            for (var index = 0; index < array.Count; index++)
            {
                into.Add(new ConfigEntry(array[index]?.DeepClone(), $"{source}[{index}]"));
            }
        }
        else
        {
            into.Add(new ConfigEntry(node, source));
        }
        return this;
    }
}

/// <summary>One configured entry and where it came from.</summary>
internal sealed record ConfigEntry(JsonNode? Value, string Source);
