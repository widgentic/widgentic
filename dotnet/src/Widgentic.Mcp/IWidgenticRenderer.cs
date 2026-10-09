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
/// <c>[McpAppUi(ResourceUri = WidgenticResources.AppTemplateUri)]</c>, take a
/// <c>RequestContext&lt;CallToolRequestParams&gt;</c> parameter, and return
/// <see cref="RenderAsync(WidgetRenderRequest, RequestContext{CallToolRequestParams}, CancellationToken)"/>'s
/// result: MCP Apps hosts mount it, and the model still sees the data in the payload block.
/// </summary>
public interface IWidgenticRenderer
{
    /// <summary>
    /// The result <c>render_widget</c> would return for the same arguments in the same session.
    /// Invalid input is an <c>isError</c> result with a structured code, never an exception.
    /// </summary>
    /// <param name="request">What to render.</param>
    /// <param name="session">
    /// The calling session; its negotiated MCP Apps capability slims the output. Stateless requests
    /// carry their capabilities themselves, which only the <c>RequestContext</c> overload sees; null
    /// applies <see cref="WidgenticOptions.AssumeUi"/>.
    /// </param>
    /// <param name="cancellationToken">Cancels waiting for a free engine.</param>
    ValueTask<CallToolResult> RenderAsync(WidgetRenderRequest request, McpServer? session = null, CancellationToken cancellationToken = default);

    /// <summary>
    /// As above, slimming by the calling request's MCP Apps capability, from its session when it has one
    /// and from the capabilities the request carries otherwise (stateless HTTP); with neither,
    /// <see cref="WidgenticOptions.AssumeUi"/> decides. Prefer this overload in tools.
    /// </summary>
    /// <param name="request">What to render.</param>
    /// <param name="context">The tool call being answered.</param>
    /// <param name="cancellationToken">Cancels waiting for a free engine.</param>
    ValueTask<CallToolResult> RenderAsync(WidgetRenderRequest request, RequestContext<CallToolRequestParams> context, CancellationToken cancellationToken = default);
}
