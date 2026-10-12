using System.Text.Json;
using System.Text.Json.Nodes;

namespace Widgentic.Mcp.Engine;

/// <summary>
/// Builds the configuration one call composes for its caller: the caller's entries alone
/// (Replace), or with the startup entries the caller does not redefine (Merge). Only identifiers
/// are read here (a widget's <c>kind</c>, a theme's or schema's <c>name</c>); every check runs in
/// the bundle. Each composed entry remembers where it came from, so the bundle's problems are
/// reported against the caller's own catalog.
/// </summary>
internal sealed class CatalogComposer
{
    private readonly Section[] _sections;

    public CatalogComposer(WidgenticOptions options)
    {
        _sections =
        [
            new Section("widgets", "kind", options.Widgets),
            new Section("themes", "name", options.Themes),
            new Section("schemas", "name", options.Schemas),
        ];
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
        return new ComposedConfig(config.ToJsonString(), origins, unreadable);
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

/// <summary>A refused caller entry, reported by section, index, name and code; never its contents.</summary>
internal readonly record struct CallerProblem(string Section, int Index, string Name, string Code);

/// <summary>The configuration for one call, and the origin of every entry in it.</summary>
internal sealed record ComposedConfig(
    string Json,
    IReadOnlyDictionary<string, IReadOnlyList<EntryOrigin>> Origins,
    IReadOnlyList<CallerProblem> Unreadable)
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
            var origin = Origins.TryGetValue(section, out var list) && index >= 0 && index < list.Count
                ? list[index]
                : new EntryOrigin(FromCaller: true, index, "");
            yield return (origin, new CallerProblem(section, origin.FromCaller ? origin.CallerIndex : index, name, code));
        }
    }
}
