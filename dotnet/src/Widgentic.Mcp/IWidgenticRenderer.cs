using System.Text.Json.Nodes;
using ModelContextProtocol.Protocol;
using ModelContextProtocol.Server;

namespace Widgentic.Mcp;

/// <summary>
/// The <c>render_widget</c> arguments for a host's own tool. Only <see cref="Widget"/> and
/// <see cref="Data"/> are required; see <c>list_widgets</c> for each kind's data shape and hints.
/// </summary>
/// <param name="Widget">The widget kind (<c>card</c>, <c>table</c>, <c>tree</c>, <c>group</c> or a configured kind).</param>
/// <param name="Data">The data to render.</param>
public sealed record WidgetRenderRequest(string Widget, JsonNode? Data)
{
    /// <summary>Presentation hints for the kind (columns, links, images…).</summary>
    public JsonObject? Hints { get; init; }

    /// <summary>Metadata such as <c>title</c>.</summary>
    public JsonObject? Meta { get; init; }

    /// <summary>An output format (<c>both</c>, <c>html</c>, <c>widget</c>, <c>page</c>, <c>app</c>); default <c>both</c>.</summary>
    public string? Format { get; init; }

    /// <summary>A theme: a theme name (string) or an inline token map (object).</summary>
    public JsonNode? Theme { get; init; }
}

/// <summary>
/// Renders widgentic results for a host's OWN tools. Declare the tool with
/// <c>[McpAppUi(ResourceUri = WidgenticResources.AppTemplateUri)]</c> and return
/// <see cref="RenderAsync"/>'s result: MCP Apps hosts mount it, and the model still sees the data in
/// the payload block.
/// </summary>
public interface IWidgenticRenderer
{
    /// <summary>
    /// The result <c>render_widget</c> would return for the same arguments in the same session.
    /// Invalid input is an <c>isError</c> result with a structured code, never an exception.
    /// </summary>
    /// <param name="request">What to render.</param>
    /// <param name="session">The calling session (slims output for Apps hosts); null applies <see cref="WidgenticOptions.AssumeUi"/>.</param>
    /// <param name="cancellationToken">Cancels waiting for a free engine.</param>
    ValueTask<CallToolResult> RenderAsync(WidgetRenderRequest request, McpServer? session = null, CancellationToken cancellationToken = default);
}
