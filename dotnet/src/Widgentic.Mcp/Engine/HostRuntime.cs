using Microsoft.ClearScript;
using Microsoft.ClearScript.JavaScript;
using Microsoft.ClearScript.V8;

namespace Widgentic.Mcp.Engine;

/// <summary>
/// One isolated V8 runtime holding the widgentic host composed from the startup configuration,
/// and the bundle's host factory for calls that compose a caller's own catalog. No .NET object,
/// type, file or network access is exposed to script: the bundle is a system document, loading
/// is disabled, and only strings cross the boundary. Used by one call at a time (the pool leases it).
/// </summary>
internal sealed class HostRuntime : IDisposable
{
    private const string BundleSpecifier = "widgentic-host";

    // The loader is ours, not the bundle's: it binds the host on the realm this runtime owns.
    private const string Loader = """
        import { createWidgenticHost } from "widgentic-host";
        globalThis.widgenticHost = createWidgenticHost(globalThis.widgenticConfig);
        globalThis.widgenticCreateHost = createWidgenticHost;
        delete globalThis.widgenticConfig;
        """;

    private const int MaxOldSpaceMegabytes = 256;

    private readonly V8Runtime _runtime;
    private readonly V8ScriptEngine _engine;
    private readonly ScriptObject _host;
    private readonly ScriptObject _createHost;

    private HostRuntime(V8Runtime runtime, V8ScriptEngine engine, ScriptObject host, ScriptObject createHost)
    {
        _runtime = runtime;
        _engine = engine;
        _host = host;
        _createHost = createHost;
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
            var createHost = engine.Global.GetProperty("widgenticCreateHost") as ScriptObject
                ?? throw new InvalidOperationException("The widgentic host bundle exports no host factory.");
            return new HostRuntime(runtime, engine, host, createHost);
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

    /// <summary>
    /// Compose a host from one caller's configuration, invoke one of its methods, and read the
    /// composition's problems. The host lives only for this call: nothing of it survives to the next.
    /// </summary>
    public ComposedResult InvokeComposed(string configJson, string method, params object[] args)
    {
        using var host = _createHost.Invoke(false, configJson) as ScriptObject
            ?? throw new InvalidOperationException("The widgentic host factory did not produce a host.");
        var value = host.InvokeMethod(method, args) as string
            ?? throw new InvalidOperationException($"The widgentic host's {method}() did not return a string.");
        var problems = host.InvokeMethod("problems") as string
            ?? throw new InvalidOperationException("The widgentic host's problems() did not return a string.");
        return new ComposedResult(value, problems);
    }

    /// <summary>Evaluate arbitrary script under the pool's limits. Tests only: drives the timeout path.</summary>
    internal object EvaluateForTest(string code) => _engine.Evaluate(code);

    public void Interrupt() => _engine.Interrupt();

    public void Dispose()
    {
        _createHost.Dispose();
        _host.Dispose();
        _engine.Dispose();
        _runtime.Dispose();
    }
}

/// <summary>A composed call's answer and the problems its composition reported (a JSON array).</summary>
internal readonly record struct ComposedResult(string Value, string Problems);
