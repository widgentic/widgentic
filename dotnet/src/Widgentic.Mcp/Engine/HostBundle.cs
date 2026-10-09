using System.Security.Cryptography;
using System.Text;

namespace Widgentic.Mcp.Engine;

/// <summary>The embedded <c>@widgentic/mcp/host</c> bundle: its text and the hash of its bytes.</summary>
internal sealed class HostBundle
{
    private const string ResourceName = "Widgentic.Mcp.widgentic-host.js";

    private static readonly Lazy<HostBundle> EmbeddedBundle = new(Load);

    private HostBundle(string text, string sha256)
    {
        Text = text;
        Sha256 = sha256;
    }

    public static HostBundle Embedded => EmbeddedBundle.Value;

    public string Text { get; }

    public string Sha256 { get; }

    private static HostBundle Load()
    {
        using var stream = typeof(HostBundle).Assembly.GetManifestResourceStream(ResourceName)
            ?? throw new InvalidOperationException($"The embedded resource '{ResourceName}' is missing from {typeof(HostBundle).Assembly.FullName}.");
        using var buffer = new MemoryStream();
        stream.CopyTo(buffer);
        var bytes = buffer.ToArray();
        return new HostBundle(Encoding.UTF8.GetString(bytes), Convert.ToHexStringLower(SHA256.HashData(bytes)));
    }
}
