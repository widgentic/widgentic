namespace Widgentic.Mcp;

/// <summary>Which widgentic code this server runs: the embedded host bundle's identity.</summary>
public sealed class WidgenticEngineInfo
{
    internal WidgenticEngineInfo(string bundleVersion, string bundleSha256, int poolSize)
    {
        BundleVersion = bundleVersion;
        BundleSha256 = bundleSha256;
        PoolSize = poolSize;
    }

    /// <summary>The <c>@widgentic/mcp</c> version the embedded bundle was built from.</summary>
    public string BundleVersion { get; }

    /// <summary>The SHA-256 of the embedded bundle's bytes, lowercase hex.</summary>
    public string BundleSha256 { get; }

    /// <summary>How many V8 runtimes serve calls.</summary>
    public int PoolSize { get; }
}
