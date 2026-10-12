using System.Security.Claims;
using System.Text.Json;
using ModelContextProtocol.Protocol;
using ModelContextProtocol.Server;

namespace Widgentic.Mcp.Mcp;

/// <summary>
/// Renders through the same bundle call as <c>render_widget</c>, so the results are equal by
/// construction. Only the <c>RequestContext</c> overload knows the caller, so only it renders
/// with the caller's catalog; the session overload renders with the startup catalog.
/// </summary>
internal sealed class WidgenticRenderer(CallerCatalogs catalogs, bool assumeUi) : IWidgenticRenderer
{
    public ValueTask<CallToolResult> RenderAsync(
        WidgetRenderRequest request,
        McpServer? session = null,
        CancellationToken cancellationToken = default) =>
        RenderAsync(request, Slimming.For(session, null, assumeUi), null, null, cancellationToken);

    public ValueTask<CallToolResult> RenderAsync(
        WidgetRenderRequest request,
        RequestContext<CallToolRequestParams> context,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(context);
        return RenderAsync(request, Slimming.For(context.Server, context.Params?.Meta, assumeUi), context.User, context.Services, cancellationToken);
    }

    private async ValueTask<CallToolResult> RenderAsync(
        WidgetRenderRequest request, bool slim, ClaimsPrincipal? user, IServiceProvider? services, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);
        var json = await catalogs.CallToolAsync(
            WidgenticToolNames.RenderWidget,
            ArgumentsJson(request),
            slim,
            user,
            services,
            cancellationToken).ConfigureAwait(false);
        return ToolResults.Parse(json);
    }

    /// <summary>The request as <c>render_widget</c> arguments; absent options stay absent.</summary>
    internal static string ArgumentsJson(WidgetRenderRequest request)
    {
        using var buffer = new MemoryStream();
        using (var writer = new Utf8JsonWriter(buffer, ToolResults.WriterOptions))
        {
            writer.WriteStartObject();
            writer.WriteString("widget", request.Widget);
            writer.WritePropertyName("data");
            if (request.Data is null) writer.WriteNullValue();
            else request.Data.WriteTo(writer);
            if (request.Hints is not null)
            {
                writer.WritePropertyName("hints");
                request.Hints.WriteTo(writer);
            }
            if (request.Meta is not null)
            {
                writer.WritePropertyName("meta");
                request.Meta.WriteTo(writer);
            }
            if (request.Format is not null) writer.WriteString("format", request.Format);
            if (request.Theme is not null)
            {
                writer.WritePropertyName("theme");
                request.Theme.WriteTo(writer);
            }
            writer.WriteEndObject();
        }
        return System.Text.Encoding.UTF8.GetString(buffer.ToArray());
    }
}
