using System.Text.Json;
using System.Text.Json.Nodes;
using ModelContextProtocol;
using ModelContextProtocol.Extensions.Apps;
using ModelContextProtocol.Protocol;
using ModelContextProtocol.Server;

namespace Widgentic.Mcp.Mcp;

/// <summary>
/// Whether model-facing output is slimmed for a call: the client's MCP Apps capability decides
/// whenever the call reveals one (either direction), otherwise <see cref="WidgenticOptions.AssumeUi"/>.
/// </summary>
internal static class Slimming
{
    public static bool For(McpServer? server, JsonObject? requestMeta, bool assumeUi)
    {
        var capabilities = server?.ClientCapabilities ?? FromRequest(requestMeta);
        if (capabilities is null) return assumeUi;
        var ui = McpApps.GetUiCapability(capabilities);
        return ui?.MimeTypes?.Contains(McpApps.HtmlMimeType) ?? false;
    }

    /// <summary>
    /// The capabilities a request carries itself. Stateless requests (MCP 2026-07-28, the SDK's
    /// default over HTTP) send them in every request's <c>_meta</c>, and the SDK then leaves
    /// <see cref="McpServer.ClientCapabilities"/> empty.
    /// </summary>
    private static ClientCapabilities? FromRequest(JsonObject? meta) =>
        meta?[MetaKeys.ClientCapabilities] is JsonObject capabilities
            ? capabilities.Deserialize<ClientCapabilities>(McpJsonUtilities.DefaultOptions)
            : null;
}
