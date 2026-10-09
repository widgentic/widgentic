using System.Diagnostics;
using System.IO.Compression;
using System.Reflection;
using System.Runtime.Loader;
using System.Xml.Linq;
using Widgentic.Mcp.Tests.Support;

namespace Widgentic.Mcp.Tests;

/// <summary>The .nupkg is build output only and declares exactly its dependencies.</summary>
public sealed class PackageTests : IDisposable
{
    private readonly string _output = Directory.CreateTempSubdirectory("widgentic-pack-").FullName;

    public void Dispose() => Directory.Delete(_output, recursive: true);

    [Fact]
    public async Task PacksBuildOutputWithExactlyItsDependencies()
    {
        var configuration = typeof(PackageTests).Assembly.GetCustomAttribute<AssemblyConfigurationAttribute>()!.Configuration;
        var project = Path.Combine(Repo.Root, "dotnet", "src", "Widgentic.Mcp", "Widgentic.Mcp.csproj");
        using var pack = Process.Start(new ProcessStartInfo("dotnet", ["pack", project, "-c", configuration, "--no-build", "-o", _output])
        {
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        })!;
        var log = await pack.StandardOutput.ReadToEndAsync(TestContext.Current.CancellationToken)
            + await pack.StandardError.ReadToEndAsync(TestContext.Current.CancellationToken);
        await pack.WaitForExitAsync(TestContext.Current.CancellationToken);
        Assert.True(pack.ExitCode == 0, log);

        var nupkg = Assert.Single(Directory.GetFiles(_output, "Widgentic.Mcp.*.nupkg"));
        using var archive = ZipFile.OpenRead(nupkg);
        var entries = archive.Entries.Select(e => e.FullName).ToArray();
        Assert.Contains("lib/net10.0/Widgentic.Mcp.dll", entries);
        Assert.Contains("lib/net10.0/Widgentic.Mcp.xml", entries);
        Assert.Contains("README.md", entries);
        Assert.Contains("LICENSE", entries);
        Assert.DoesNotContain(entries, e => e.EndsWith(".cs", StringComparison.Ordinal) || e.EndsWith(".ts", StringComparison.Ordinal) || e.EndsWith(".js", StringComparison.Ordinal));

        await using var nuspecStream = archive.Entries.Single(e => e.FullName.EndsWith(".nuspec", StringComparison.Ordinal)).Open();
        var nuspec = XDocument.Load(nuspecStream);
        XNamespace ns = nuspec.Root!.GetDefaultNamespace();
        var metadata = nuspec.Root.Element(ns + "metadata")!;
        Assert.Contains("BETA", metadata.Element(ns + "description")!.Value, StringComparison.Ordinal);
        var group = metadata.Element(ns + "dependencies")!.Elements(ns + "group").Single(g => (string?)g.Attribute("targetFramework") == "net10.0");
        Assert.Equal(
            [
                "Microsoft.ClearScript.V8",
                "Microsoft.ClearScript.V8.Native.linux-arm64",
                "Microsoft.ClearScript.V8.Native.linux-x64",
                "Microsoft.ClearScript.V8.Native.osx-arm64",
                "Microsoft.ClearScript.V8.Native.win-x64",
                "ModelContextProtocol",
                "ModelContextProtocol.Extensions.Apps",
            ],
            group.Elements(ns + "dependency").Select(d => (string)d.Attribute("id")!).Order(StringComparer.Ordinal));

        // The bundle is inside the assembly, not beside it.
        await using var assembly = archive.GetEntry("lib/net10.0/Widgentic.Mcp.dll")!.Open();
        var copy = new MemoryStream();
        await assembly.CopyToAsync(copy, TestContext.Current.CancellationToken);
        copy.Position = 0;
        var context = new AssemblyLoadContext("packed Widgentic.Mcp", isCollectible: true);
        try
        {
            Assert.Contains("Widgentic.Mcp.widgentic-host.js", context.LoadFromStream(copy).GetManifestResourceNames());
        }
        finally
        {
            context.Unload();
        }
    }
}
