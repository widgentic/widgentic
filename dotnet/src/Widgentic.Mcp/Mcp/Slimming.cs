using ModelContextProtocol.Extensions.Apps;
using ModelContextProtocol.Server;

namespace Widgentic.Mcp.Mcp;

/// <summary>
/// Whether model-facing output is slimmed for a call: the session's negotiated UI capability
/// decides when there is one (either direction); otherwise <see cref="WidgenticOptions.AssumeUi"/>.
/// </summary>
internal static class Slimming
{
    public static bool For(McpServer? server, bool assumeUi)
    {
        var capabilities = server?.ClientCapabilities;
        if (capabilities is null) return assumeUi;
        var ui = McpApps.GetUiCapability(capabilities);
        return ui?.MimeTypes?.Contains(McpApps.HtmlMimeType) ?? false;
    }
}
