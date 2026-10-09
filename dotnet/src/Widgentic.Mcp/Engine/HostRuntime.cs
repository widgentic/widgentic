using Microsoft.ClearScript;
using Microsoft.ClearScript.JavaScript;
using Microsoft.ClearScript.V8;

namespace Widgentic.Mcp.Engine;

/// <summary>
/// One isolated V8 runtime holding one widgentic host. No .NET object, type, file or network
/// access is exposed to script: the bundle is a system document, loading is disabled, and only
/// strings cross the boundary. Used by one call at a time (the pool leases it).
/// </summary>
internal sealed class HostRuntime : IDisposable
{
    private const string BundleSpecifier = "widgentic-host";

    // The loader is ours, not the bundle's: it binds the host on the realm this runtime owns.
    private const string Loader = """
        import { createWidgenticHost } from "widgentic-host";
        globalThis.widgenticHost = createWidgenticHost(globalThis.widgenticConfig);
        delete globalThis.widgenticConfig;
        """;

    private const int MaxOldSpaceMegabytes = 256;

    private readonly V8Runtime _runtime;
    private readonly V8ScriptEngine _engine;
    private readonly ScriptObject _host;

    private HostRuntime(V8Runtime runtime, V8ScriptEngine engine, ScriptObject host)
    {
        _runtime = runtime;
        _engine = engine;
        _host = host;
    }

    public static HostRuntime Create(string bundle, string configJson, string name)
    {
        var runtime = new V8Runtime(name, new V8RuntimeConstraints { MaxOldSpaceSize = MaxOldSpaceMegabytes })
        {
            MaxHeapSize = (UIntPtr)((MaxOldSpaceMegabytes + 64) * 1024L * 1024L),
            HeapSizeViolationPolicy = V8RuntimeViolationPolicy.Exception,
        };
        V8ScriptEngine? engine = null;
        try
        {
            engine = runtime.CreateScriptEngine(V8ScriptEngineFlags.DisableGlobalMembers);
            engine.DocumentSettings.AccessFlags = DocumentAccessFlags.None;
            engine.DocumentSettings.AddSystemDocument(BundleSpecifier, ModuleCategory.Standard, bundle);
            engine.Global.SetProperty("widgenticConfig", configJson);
            engine.Execute(new DocumentInfo("widgentic-loader") { Category = ModuleCategory.Standard }, Loader);
            var host = engine.Global.GetProperty("widgenticHost") as ScriptObject
                ?? throw new InvalidOperationException("The widgentic host bundle did not produce a host.");
            return new HostRuntime(runtime, engine, host);
        }
        catch
        {
            engine?.Dispose();
            runtime.Dispose();
            throw;
        }
    }

    /// <summary>Invoke one host method; every host method takes and returns strings (and one boolean).</summary>
    public string Invoke(string method, params object[] args) =>
        _host.InvokeMethod(method, args) as string
            ?? throw new InvalidOperationException($"The widgentic host's {method}() did not return a string.");

    /// <summary>Evaluate arbitrary script under the pool's limits. Tests only: drives the timeout path.</summary>
    internal object EvaluateForTest(string code) => _engine.Evaluate(code);

    public void Interrupt() => _engine.Interrupt();

    public void Dispose()
    {
        _host.Dispose();
        _engine.Dispose();
        _runtime.Dispose();
    }
}
