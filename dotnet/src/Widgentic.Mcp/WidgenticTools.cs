namespace Widgentic.Mcp;

/// <summary>
/// The widgentic tools a server exposes. Combine flags to choose; a tool that is not selected
/// is not registered at all. Actions (<c>execute_action</c>, <c>list_actions</c>) are not part of
/// this render-only version.
/// </summary>
[Flags]
public enum WidgenticTools
{
    /// <summary>No widgentic tool; the app template resource is still served for the host's own tools.</summary>
    None = 0,

    /// <summary><c>list_widgets</c>: the widget kinds with their data shapes and hints.</summary>
    ListWidgets = 1 << 0,

    /// <summary><c>render_widget</c>: validate and render a payload, mounted by MCP Apps hosts.</summary>
    RenderWidget = 1 << 1,

    /// <summary><c>list_theme_tokens</c>: the theming vocabulary.</summary>
    ListThemeTokens = 1 << 2,

    /// <summary><c>list_themes</c>: the named themes, built-in and configured.</summary>
    ListThemes = 1 << 3,

    /// <summary><c>list_schemas</c>: the configured shared schemas.</summary>
    ListSchemas = 1 << 4,

    /// <summary><c>get_authoring_guide</c>: the contract an agent drafts widgets against.</summary>
    GetAuthoringGuide = 1 << 5,

    /// <summary>Every tool above: the render-side set the Node assembly serves.</summary>
    Default = ListWidgets | RenderWidget | ListThemeTokens | ListThemes | ListSchemas | GetAuthoringGuide
}

/// <summary>The one place C# names a widgentic tool; checked against the bundle's definitions at startup.</summary>
internal static class WidgenticToolNames
{
    public static readonly IReadOnlyDictionary<WidgenticTools, string> ByFlag = new Dictionary<WidgenticTools, string>
    {
        [WidgenticTools.ListWidgets] = "list_widgets",
        [WidgenticTools.RenderWidget] = "render_widget",
        [WidgenticTools.ListThemeTokens] = "list_theme_tokens",
        [WidgenticTools.ListThemes] = "list_themes",
        [WidgenticTools.ListSchemas] = "list_schemas",
        [WidgenticTools.GetAuthoringGuide] = "get_authoring_guide",
    };

    public const string RenderWidget = "render_widget";
}
