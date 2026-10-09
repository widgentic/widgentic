using System.Text.Json.Nodes;
using ModelContextProtocol.Protocol;
using Widgentic.Mcp.Mcp;

namespace Widgentic.Mcp.Tests;

/// <summary>
/// Which capabilities decide slimming. Stateless requests (MCP 2026-07-28) carry them in their own
/// <c>_meta</c>; only a request that reveals none falls back to <c>AssumeUi</c>.
/// </summary>
public sealed class SlimmingTests
{
    private static JsonObject RequestMeta(string capabilities) =>
        new() { [MetaKeys.ClientCapabilities] = JsonNode.Parse(capabilities) };

    [Fact]
    public void ARequestsOwnAppsCapabilitySlims()
    {
        var meta = RequestMeta("""{"extensions":{"io.modelcontextprotocol/ui":{"mimeTypes":["text/html;profile=mcp-app"]}}}""");
        Assert.True(Slimming.For(null, meta, assumeUi: false));
    }

    [Fact]
    public void ARequestWithoutTheAppsCapabilityIsNotSlimmedEvenWhenUiIsAssumed()
    {
        Assert.False(Slimming.For(null, RequestMeta("""{"extensions":{}}"""), assumeUi: true));
        Assert.False(Slimming.For(null, RequestMeta("{}"), assumeUi: true));
    }

    [Fact]
    public void ARequestRevealingNoCapabilitiesFollowsAssumeUi()
    {
        Assert.True(Slimming.For(null, null, assumeUi: true));
        Assert.False(Slimming.For(null, null, assumeUi: false));
        Assert.True(Slimming.For(null, new JsonObject { ["other"] = 1 }, assumeUi: true));
    }
}
