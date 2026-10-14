using System.Security.Claims;

namespace Widgentic.Mcp;

/// <summary>
/// Resolves each caller's own catalog, so one server serves every principal (a tenant, a user)
/// its own widgets, themes and schemas. Register an implementation in the server's services:
/// with one registered, every per-caller call (<c>list_widgets</c>, <c>render_widget</c>,
/// <c>preview_widget</c>, <c>list_themes</c>, <c>list_schemas</c>, the preview pages, and
/// <see cref="IWidgenticRenderer"/>'s <c>RequestContext</c> overload) composes the caller's
/// catalog for that call and drops it afterwards; nothing is cached. The app resource's
/// resource-domain declaration also asks the source, on <c>resources/list</c> and
/// <c>resources/read</c>; its content stays the same for every caller. How catalogs are stored or
/// fetched is the implementation's choice. Authenticate callers the ASP.NET Core way, so the
/// caller's <see cref="ClaimsPrincipal"/> arrives here.
/// </summary>
public interface IWidgenticCatalogSource
{
    /// <summary>
    /// The caller's catalog, or <see langword="null"/> to serve the startup catalog (for example
    /// to anonymous or unknown callers). A thrown exception answers the call with
    /// <c>CATALOG_UNAVAILABLE</c> and is logged; its message never reaches the client.
    /// </summary>
    /// <param name="caller">Who is calling, and the request's services.</param>
    /// <param name="cancellationToken">The call's cancellation.</param>
    ValueTask<WidgenticCatalog?> GetCatalogAsync(WidgenticCaller caller, CancellationToken cancellationToken);
}

/// <summary>The caller a catalog is resolved for.</summary>
/// <param name="User">The authenticated principal, or null when the transport has none (stdio).</param>
/// <param name="Services">The request's services.</param>
public sealed record WidgenticCaller(ClaimsPrincipal? User, IServiceProvider Services);

/// <summary>How a caller's catalog combines with the startup entries.</summary>
public enum WidgenticComposition
{
    /// <summary>
    /// The startup entries and the caller's. A caller entry replaces the startup entry with the
    /// same identifier (a widget's <c>kind</c>, a theme's or schema's <c>name</c>), so no
    /// identifier is served twice; the remaining startup entries compose first, so the caller's
    /// widgets may reference startup schemas.
    /// </summary>
    Merge,

    /// <summary>The built-ins and the caller's entries only.</summary>
    Replace,
}

/// <summary>
/// One caller's widgets, themes and shared schemas, in the designer's export shapes, and its
/// settings record: the same JSON the startup options take. Every entry is validated by the embedded bundle when a call
/// composes it; a refused entry is skipped and logged, never fatal.
/// </summary>
public sealed class WidgenticCatalog
{
    /// <summary>Widget definitions: each string one object or a JSON array of them.</summary>
    public IList<string> Widgets { get; } = new List<string>();

    /// <summary>Theme entries: each string one object or a JSON array of them.</summary>
    public IList<string> Themes { get; } = new List<string>();

    /// <summary>Shared schema entries: each string one object or a JSON array of them.</summary>
    public IList<string> Schemas { get; } = new List<string>();

    /// <summary>
    /// How this catalog combines with the startup entries; null uses
    /// <see cref="WidgenticOptions.PrincipalComposition"/>.
    /// </summary>
    public WidgenticComposition? Composition { get; set; }

    /// <summary>
    /// The caller's settings record, in the store's shape
    /// (<c>{ "defaultThemes"?: { "light"?, "dark"? }, "resourceDomains"?: [ … ] }</c>), or null for
    /// none. In <see cref="WidgenticComposition.Merge"/> each section it defines replaces the
    /// startup record's section whole, and the sections it omits are the startup record's; in
    /// <see cref="WidgenticComposition.Replace"/> it is the only record. Its defaults name themes
    /// of the caller's composed catalog, and its resource domains are declared on the app resource
    /// after <see cref="WidgenticOptions.ResourceDomains"/>.
    /// </summary>
    public string? Settings { get; set; }

    /// <summary>Set the caller's settings record (see <see cref="Settings"/>).</summary>
    /// <param name="json">The settings record JSON.</param>
    public WidgenticCatalog UseSettings(string json)
    {
        ArgumentNullException.ThrowIfNull(json);
        Settings = json;
        return this;
    }

    /// <summary>Add widget definitions (one object or an array).</summary>
    /// <param name="json">The definition JSON.</param>
    public WidgenticCatalog AddWidget(string json) => Add(Widgets, json);

    /// <summary>Add every <c>*.json</c> file in <paramref name="path"/> (ordinal file-name order) as widget definitions.</summary>
    /// <param name="path">A directory of designer exports.</param>
    public WidgenticCatalog AddWidgetsFromDirectory(string path) => AddFromDirectory(Widgets, path);

    /// <summary>Add theme entries (one object or an array).</summary>
    /// <param name="json">The theme JSON.</param>
    public WidgenticCatalog AddTheme(string json) => Add(Themes, json);

    /// <summary>Add every <c>*.json</c> file in <paramref name="path"/> (ordinal file-name order) as theme entries.</summary>
    /// <param name="path">A directory of theme entries.</param>
    public WidgenticCatalog AddThemesFromDirectory(string path) => AddFromDirectory(Themes, path);

    /// <summary>Add shared schema entries (one object or an array).</summary>
    /// <param name="json">The schema JSON.</param>
    public WidgenticCatalog AddSchema(string json) => Add(Schemas, json);

    /// <summary>Add every <c>*.json</c> file in <paramref name="path"/> (ordinal file-name order) as shared schema entries.</summary>
    /// <param name="path">A directory of shared schemas.</param>
    public WidgenticCatalog AddSchemasFromDirectory(string path) => AddFromDirectory(Schemas, path);

    private WidgenticCatalog Add(IList<string> into, string json)
    {
        ArgumentNullException.ThrowIfNull(json);
        into.Add(json);
        return this;
    }

    private WidgenticCatalog AddFromDirectory(IList<string> into, string path)
    {
        foreach (var file in Directory.EnumerateFiles(path, "*.json").Order(StringComparer.Ordinal))
        {
            into.Add(File.ReadAllText(file));
        }
        return this;
    }
}
