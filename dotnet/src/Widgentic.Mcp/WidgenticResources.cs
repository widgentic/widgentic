namespace Widgentic.Mcp;

/// <summary>
/// Where widgentic's documents are served. The values mirror the bundle's own and are checked
/// against it at startup, so a host tool can declare
/// <c>[McpAppUi(ResourceUri = WidgenticResources.AppTemplateUri)]</c> without restating them.
/// </summary>
public static class WidgenticResources
{
    /// <summary>The MCP Apps template that mounts every widgentic render.</summary>
    public const string AppTemplateUri = "ui://widgentic/app.html";

    /// <summary>The per-kind preview page, rendered from the kind's <c>dataExample</c>.</summary>
    public const string WidgetPageUriTemplate = "ui://widgentic/page/{kind}";
}
