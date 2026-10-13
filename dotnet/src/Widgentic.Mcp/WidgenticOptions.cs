using System.Text.Json;
using System.Text.Json.Nodes;

namespace Widgentic.Mcp;

/// <summary>Configuration for <see cref="Microsoft.Extensions.DependencyInjection.WidgenticBuilderExtensions.WithWidgentic"/>.</summary>
public sealed class WidgenticOptions
{
    internal List<ConfigEntry> Widgets { get; } = [];
    internal List<ConfigEntry> Themes { get; } = [];
    internal List<ConfigEntry> Schemas { get; } = [];

    /// <summary>The settings record and where it came from, or null for none.</summary>
    internal ConfigEntry? SettingsEntry { get; private set; }
    internal List<WidgenticConfigurationProblem> ParseProblems { get; } = [];

    /// <summary>The widgentic tools to expose. Default: <see cref="WidgenticTools.Default"/>.</summary>
    public WidgenticTools Tools { get; set; } = WidgenticTools.Default;

    /// <summary>
    /// Domains the MCP Apps frame may load assets from directly (<c>cdn.example.com</c>,
    /// <c>*.example.com</c>, either with <c>https://</c>), declared on the app resource's
    /// <c>_meta.ui.csp.resourceDomains</c> as canonical origins, followed by the settings record's
    /// <c>resourceDomains</c> section (the caller's, with a catalog source). Read by the bundle's
    /// resource-domain rule: a refused entry stops startup. No widget, theme or render input can
    /// extend the list. Empty by default. This package does not inline images, so in hosts that
    /// enforce <c>img-src</c> a declared domain is the only way an external image displays.
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
    /// How a caller's catalog from an <see cref="IWidgenticCatalogSource"/> combines with the
    /// entries configured here, unless the catalog sets its own. Default: <see cref="WidgenticComposition.Merge"/>.
    /// </summary>
    public WidgenticComposition PrincipalComposition { get; set; } = WidgenticComposition.Merge;

    /// <summary>
    /// Add widget definitions in the designer's export shape (<c>{ kind, template, descriptor, load? }</c>):
    /// one JSON object, or a JSON array of them.
    /// </summary>
    /// <param name="json">The definition JSON.</param>
    /// <param name="source">Where it came from, named in configuration errors.</param>
    public WidgenticOptions AddWidget(string json, string? source = null) =>
        Add(Widgets, "widgets", json, source ?? "widget JSON");

    /// <summary>Add every <c>*.json</c> file in <paramref name="path"/> (ordinal file-name order) as widget definitions.</summary>
    /// <param name="path">A directory of designer exports, one definition or an array per file.</param>
    public WidgenticOptions AddWidgetsFromDirectory(string path) => AddFromDirectory(path, AddWidget);

    /// <summary>Add theme entries (<c>{ name, label?, description?, tokens, styles? }</c>): one object or an array.</summary>
    /// <param name="json">The theme JSON.</param>
    /// <param name="source">Where it came from, named in configuration errors.</param>
    public WidgenticOptions AddTheme(string json, string? source = null) =>
        Add(Themes, "themes", json, source ?? "theme JSON");

    /// <summary>Add every <c>*.json</c> file in <paramref name="path"/> (ordinal file-name order) as theme entries.</summary>
    /// <param name="path">A directory of theme entries, one entry or an array per file.</param>
    public WidgenticOptions AddThemesFromDirectory(string path) => AddFromDirectory(path, AddTheme);

    /// <summary>Add shared schema entries (<c>{ name, label?, description?, schema }</c>): one object or an array.</summary>
    /// <param name="json">The schema JSON.</param>
    /// <param name="source">Where it came from, named in configuration errors.</param>
    public WidgenticOptions AddSchema(string json, string? source = null) =>
        Add(Schemas, "schemas", json, source ?? "schema JSON");

    /// <summary>Add every <c>*.json</c> file in <paramref name="path"/> (ordinal file-name order) as shared schema entries.</summary>
    /// <param name="path">A directory of shared schemas, one entry or an array per file.</param>
    public WidgenticOptions AddSchemasFromDirectory(string path) => AddFromDirectory(path, AddSchema);

    /// <summary>
    /// Set the settings record, in the store's shape (<c>{ "defaultThemes": { "light"?, "dark"? } }</c>):
    /// its default themes stand in for the built-ins when a render names no theme. The bundle
    /// checks it at startup against the configured themes, and a refused setting stops startup
    /// like a refused entry. A later call replaces the record.
    /// </summary>
    /// <param name="json">The settings record JSON.</param>
    /// <param name="source">Where it came from, named in configuration errors.</param>
    public WidgenticOptions UseSettings(string json, string? source = null)
    {
        ArgumentNullException.ThrowIfNull(json);
        source ??= "settings JSON";
        try
        {
            SettingsEntry = new ConfigEntry(JsonNode.Parse(json), source);
        }
        catch (JsonException error)
        {
            ParseProblems.Add(new WidgenticConfigurationProblem("settings", source, "INVALID_JSON", error.Message));
        }
        return this;
    }

    /// <summary>Set the settings record from a file, named in configuration errors.</summary>
    /// <param name="path">A JSON file holding the settings record.</param>
    public WidgenticOptions UseSettingsFromFile(string path) => UseSettings(File.ReadAllText(path), path);

    /// <summary>Each file's text, with its path as the source named in configuration errors.</summary>
    private WidgenticOptions AddFromDirectory(string path, Func<string, string?, WidgenticOptions> add)
    {
        foreach (var file in Directory.EnumerateFiles(path, "*.json").Order(StringComparer.Ordinal))
        {
            add(File.ReadAllText(file), file);
        }
        return this;
    }

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
