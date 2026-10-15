using System.Text.Json;
using System.Text.Json.Nodes;

namespace Widgentic.Mcp.Engine;

/// <summary>
/// Builds the configuration one call composes for its caller: the caller's entries alone
/// (Replace), or with the startup entries the caller does not redefine (Merge). Settings records
/// combine by section the same way: in Merge each section the caller defines replaces the
/// startup record's. Only identifiers and section names are read here (a widget's <c>kind</c>, a
/// theme's or schema's <c>name</c>); every check runs in the bundle. Each composed entry and
/// section remembers where it came from, so the bundle's problems are reported against the
/// caller's own catalog or the startup configuration. The app resource's resource domains compose
/// apart (<see cref="ComposeDomains"/>): the operator's list and the effective settings section
/// alone, so declaring them composes no widget or theme.
/// </summary>
internal sealed class CatalogComposer
{
    private readonly Section[] _sections;
    private readonly JsonNode? _startupSettings;
    private readonly string[] _operatorDomains;

    public CatalogComposer(WidgenticOptions options)
    {
        _sections =
        [
            new Section("widgets", "kind", options.Widgets),
            new Section("themes", "name", options.Themes),
            new Section("schemas", "name", options.Schemas),
        ];
        _startupSettings = options.SettingsEntry?.Value?.DeepClone();
        _operatorDomains = [.. options.ResourceDomains];
    }

    /// <summary>
    /// The configuration declaring a caller's resource domains: the operator's list, then the
    /// <c>resourceDomains</c> section of the settings record the caller composes with (Merge or
    /// Replace, as for every other call).
    /// </summary>
    public ComposedConfig ComposeDomains(WidgenticCatalog catalog, WidgenticComposition mode)
    {
        var unreadable = new List<CallerProblem>();
        var (settings, settingsOrigin) = ComposeSettings(catalog.Settings, mode, unreadable);
        var config = new JsonObject();
        if (_operatorDomains.Length > 0)
        {
            config["resourceDomains"] = new JsonArray([.. _operatorDomains.Select(domain => (JsonNode?)JsonValue.Create(domain))]);
        }
        if (settings is JsonObject record && record["resourceDomains"] is { } section)
        {
            config["settings"] = new JsonObject { ["resourceDomains"] = section.DeepClone() };
        }
        return new ComposedConfig(config.ToJsonString(), new Dictionary<string, IReadOnlyList<EntryOrigin>>(StringComparer.Ordinal), unreadable, settingsOrigin);
    }

    public ComposedConfig Compose(WidgenticCatalog catalog, WidgenticComposition mode)
    {
        var config = new JsonObject();
        var origins = new Dictionary<string, IReadOnlyList<EntryOrigin>>(StringComparer.Ordinal);
        var unreadable = new List<CallerProblem>();
        foreach (var section in _sections)
        {
            var callerEntries = Flatten(section.Name, section.Of(catalog), unreadable);
            var claimed = callerEntries
                .Select(entry => Identifier(entry.Value, section.IdentifierField))
                .OfType<string>()
                .ToHashSet(StringComparer.Ordinal);
            var array = new JsonArray();
            var from = new List<EntryOrigin>();
            if (mode == WidgenticComposition.Merge)
            {
                // The startup entries the caller does not redefine compose first, so the caller's
                // widgets can reference their schemas.
                foreach (var entry in section.Startup.Where(entry => entry.Id is null || !claimed.Contains(entry.Id)))
                {
                    array.Add(entry.Value?.DeepClone());
                    from.Add(new EntryOrigin(FromCaller: false, CallerIndex: -1, entry.Source));
                }
            }
            foreach (var (value, index) in callerEntries)
            {
                array.Add(value?.DeepClone());
                from.Add(new EntryOrigin(FromCaller: true, index, ""));
            }
            config[section.Name] = array;
            origins[section.Name] = from;
        }
        // The operator's domains cover the caller's stylesheets as they do the startup record's.
        if (_operatorDomains.Length > 0)
        {
            config["resourceDomains"] = new JsonArray([.. _operatorDomains.Select(domain => (JsonNode?)JsonValue.Create(domain))]);
        }
        var (settings, settingsOrigin) = ComposeSettings(catalog.Settings, mode, unreadable);
        if (settings is not null) config["settings"] = settings;
        return new ComposedConfig(config.ToJsonString(), origins, unreadable, settingsOrigin);
    }

    /// <summary>
    /// The settings record one call composes with. Replace uses the caller's record alone. Merge
    /// keeps the startup record, each section the caller defines replacing the startup one whole,
    /// so a caller's section reads as the store's own write would apply it. A caller record that
    /// is the JSON literal <c>null</c> is no record, as a C# <c>null</c> is. Any other record that
    /// is not an object replaces the startup record whole and goes to the bundle, which reports it.
    /// </summary>
    private (JsonNode? Record, SettingsOrigin Origin) ComposeSettings(string? callerJson, WidgenticComposition mode, List<CallerProblem> unreadable)
    {
        if (callerJson is null)
        {
            return mode == WidgenticComposition.Merge ? (_startupSettings?.DeepClone(), SettingsOrigin.Startup) : (null, SettingsOrigin.Startup);
        }
        JsonNode? caller;
        try
        {
            caller = JsonNode.Parse(callerJson);
        }
        catch (JsonException)
        {
            unreadable.Add(new CallerProblem("settings", -1, "settings", "INVALID_JSON"));
            return (null, SettingsOrigin.Caller);
        }
        if (caller is null)
        {
            // "null" is no record: Merge keeps the startup record, its stylesheets included.
            return mode == WidgenticComposition.Merge ? (_startupSettings?.DeepClone(), SettingsOrigin.Startup) : (null, SettingsOrigin.Startup);
        }
        if (mode == WidgenticComposition.Replace || caller is not JsonObject sections)
        {
            return (caller?.DeepClone(), SettingsOrigin.Caller);
        }
        var merged = _startupSettings is JsonObject startup ? (JsonObject)startup.DeepClone() : new JsonObject();
        foreach (var (name, value) in sections) merged[name] = value?.DeepClone();
        return (merged, new SettingsOrigin(Whole: false, sections.Select(section => section.Key).ToHashSet(StringComparer.Ordinal)));
    }

    /// <summary>The caller's strings as entries, an array contributing each element; text that is not JSON is reported, not composed.</summary>
    private static List<(JsonNode? Value, int Index)> Flatten(string section, IEnumerable<string> json, List<CallerProblem> unreadable)
    {
        var entries = new List<(JsonNode?, int)>();
        var index = 0;
        foreach (var text in json)
        {
            JsonNode? node;
            try
            {
                node = JsonNode.Parse(text);
            }
            catch (JsonException)
            {
                unreadable.Add(new CallerProblem(section, index++, "", "INVALID_JSON"));
                continue;
            }
            if (node is JsonArray array)
            {
                foreach (var element in array) entries.Add((element, index++));
            }
            else
            {
                entries.Add((node, index++));
            }
        }
        return entries;
    }

    private static string? Identifier(JsonNode? entry, string field) =>
        entry is JsonObject definition && definition[field] is JsonValue value && value.TryGetValue<string>(out var id) ? id : null;

    private sealed class Section(string name, string identifierField, IEnumerable<ConfigEntry> startup)
    {
        public string Name { get; } = name;

        public string IdentifierField { get; } = identifierField;

        /// <summary>The startup entries, validated at startup, with their identifiers read once.</summary>
        public IReadOnlyList<(JsonNode? Value, string Source, string? Id)> Startup { get; } =
            startup.Select(entry => (entry.Value, entry.Source, Identifier(entry.Value, identifierField))).ToArray();

        public IList<string> Of(WidgenticCatalog catalog) => Name switch
        {
            "widgets" => catalog.Widgets,
            "themes" => catalog.Themes,
            _ => catalog.Schemas,
        };
    }
}

/// <summary>Where a composed entry came from: the caller's catalog (its index there) or the startup configuration (its source).</summary>
internal readonly record struct EntryOrigin(bool FromCaller, int CallerIndex, string StartupSource);

/// <summary>
/// Which parts of a composed settings record came from the caller: all of it, or the named
/// sections (the rest is the startup record's).
/// </summary>
internal sealed record SettingsOrigin(bool Whole, IReadOnlySet<string> Sections)
{
    public static readonly SettingsOrigin Startup = new(false, new HashSet<string>());

    public static readonly SettingsOrigin Caller = new(true, new HashSet<string>());

    /// <summary>Whether the problem named <paramref name="name"/> (the record, a section, or <c>section.mode</c>) is the caller's.</summary>
    public bool FromCaller(string name) => Whole || Sections.Contains(name.Split('.')[0]);
}

/// <summary>A refused caller entry, reported by section, index, name and code; never its contents.</summary>
internal readonly record struct CallerProblem(string Section, int Index, string Name, string Code);

/// <summary>The configuration for one call, and the origin of every entry in it.</summary>
internal sealed record ComposedConfig(
    string Json,
    IReadOnlyDictionary<string, IReadOnlyList<EntryOrigin>> Origins,
    IReadOnlyList<CallerProblem> Unreadable,
    SettingsOrigin SettingsOrigin)
{
    /// <summary>The bundle's problems for this composition, each attributed to the caller's entry or the startup entry it names.</summary>
    public IEnumerable<(EntryOrigin Origin, CallerProblem Problem)> Attribute(string problemsJson)
    {
        foreach (var problem in JsonDocument.Parse(problemsJson).RootElement.EnumerateArray())
        {
            var section = problem.GetProperty("section").GetString() ?? "";
            var index = problem.GetProperty("index").GetInt32();
            var name = problem.TryGetProperty("name", out var named) ? named.GetString() ?? "" : "";
            var code = problem.GetProperty("code").GetString() ?? "";
            if (section == "settings")
            {
                yield return (new EntryOrigin(SettingsOrigin.FromCaller(name), -1, "settings"), new CallerProblem(section, -1, name, code));
                continue;
            }
            var origin = Origins.TryGetValue(section, out var list) && index >= 0 && index < list.Count
                ? list[index]
                : new EntryOrigin(FromCaller: true, index, "");
            yield return (origin, new CallerProblem(section, origin.FromCaller ? origin.CallerIndex : index, name, code));
        }
    }
}
