using System.Text.Json;
using ModelContextProtocol;
using ModelContextProtocol.Protocol;
using ModelContextProtocol.Server;

namespace Widgentic.Mcp.Mcp;

/// <summary>
/// One widgentic tool, defined by the bundle (name, description, input schema) and answered by
/// the bundle's handler, on the caller's catalog when one resolves; the raw arguments are
/// forwarded unchanged.
/// </summary>
internal sealed class WidgenticTool : McpServerTool
{
    private readonly CallerCatalogs _catalogs;
    private readonly bool _assumeUi;

    public WidgenticTool(CallerCatalogs catalogs, JsonElement definition, bool assumeUi)
    {
        _catalogs = catalogs;
        _assumeUi = assumeUi;
        ProtocolTool = new Tool
        {
            Name = definition.GetProperty("name").GetString() ?? "",
            Description = definition.GetProperty("description").GetString(),
            InputSchema = definition.GetProperty("inputSchema").Clone(),
        };
    }

    public override Tool ProtocolTool { get; }

    public override IReadOnlyList<object> Metadata { get; } = [];

    public override async ValueTask<CallToolResult> InvokeAsync(
        RequestContext<CallToolRequestParams> request,
        CancellationToken cancellationToken = default)
    {
        var json = await _catalogs.CallToolAsync(
            ProtocolTool.Name,
            ArgumentsJson(request.Params?.Arguments),
            Slimming.For(request.Server, request.Params?.Meta, _assumeUi),
            request.User,
            request.Services,
            cancellationToken).ConfigureAwait(false);
        return ToolResults.Parse(json);
    }

    /// <summary>The call's arguments as one JSON object, each value written exactly as received.</summary>
    internal static string ArgumentsJson(IDictionary<string, JsonElement>? arguments)
    {
        using var buffer = new MemoryStream();
        using (var writer = new Utf8JsonWriter(buffer, ToolResults.WriterOptions))
        {
            writer.WriteStartObject();
            foreach (var (name, value) in arguments ?? new Dictionary<string, JsonElement>())
            {
                writer.WritePropertyName(name);
                value.WriteTo(writer);
            }
            writer.WriteEndObject();
        }
        return System.Text.Encoding.UTF8.GetString(buffer.ToArray());
    }
}

/// <summary>Reading the bundle's tool-result JSON as the SDK's result type.</summary>
internal static class ToolResults
{
    public static readonly JsonWriterOptions WriterOptions = new()
    {
        Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    public static CallToolResult Parse(string json) =>
        JsonSerializer.Deserialize<CallToolResult>(json, McpJsonUtilities.DefaultOptions)
            ?? throw new InvalidOperationException("The widgentic host returned no tool result.");
}
