using System.Security.Claims;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using ModelContextProtocol;
using Widgentic.Mcp.Engine;

namespace Widgentic.Mcp.Mcp;

/// <summary>
/// Answers the calls whose result depends on the caller's catalog. With an
/// <see cref="IWidgenticCatalogSource"/> in the request's services, the caller's catalog is
/// resolved once per call, composed inside that call and dropped with it; without one, or when the
/// source returns null, the startup host answers exactly as before.
/// </summary>
internal sealed class CallerCatalogs(WidgenticEngine engine, WidgenticComposition defaultComposition)
{
    private const string LoggerCategory = "Widgentic.Mcp.Catalogs";
    private const string UnavailableCode = "CATALOG_UNAVAILABLE";
    private const string UnavailableMessage = "The caller's catalog is unavailable.";

    /// <summary>The tools whose answers come from the caller's catalog; the rest never consult the source.</summary>
    public static readonly IReadOnlySet<string> PerCallerTools = new HashSet<string>(StringComparer.Ordinal)
    {
        "list_widgets", "render_widget", "preview_widget", "list_themes", "list_schemas",
    };

    public async ValueTask<string> CallToolAsync(
        string tool, string argsJson, bool slim, ClaimsPrincipal? user, IServiceProvider? services, CancellationToken cancellationToken)
    {
        if (PerCallerTools.Contains(tool))
        {
            var resolved = await ResolveAsync(user, services, cancellationToken).ConfigureAwait(false);
            if (resolved.Unavailable) return V8HostPool.ErrorResult(UnavailableCode, UnavailableMessage);
            if (resolved.Config is { } config)
            {
                var result = await engine.Pool.CallToolComposedAsync(config.Json, tool, argsJson, slim, cancellationToken).ConfigureAwait(false);
                Report(config, result.Problems, services);
                return result.Value;
            }
        }
        return await engine.Pool.CallToolAsync(tool, argsJson, slim, cancellationToken).ConfigureAwait(false);
    }

    public async ValueTask<string> WidgetPageAsync(string kind, ClaimsPrincipal? user, IServiceProvider? services, CancellationToken cancellationToken)
    {
        var resolved = await ResolveAsync(user, services, cancellationToken).ConfigureAwait(false);
        // A page has no isError form: the read fails with the SDK's error, without the source's text.
        if (resolved.Unavailable) throw new McpException(UnavailableMessage);
        if (resolved.Config is { } config)
        {
            var result = await engine.Pool.InvokeComposedAsync(config.Json, "widgetPage", cancellationToken, kind).ConfigureAwait(false);
            Report(config, result.Problems, services);
            return result.Value;
        }
        return await engine.Pool.InvokeAsync("widgetPage", cancellationToken, kind).ConfigureAwait(false);
    }

    private async ValueTask<Resolution> ResolveAsync(ClaimsPrincipal? user, IServiceProvider? services, CancellationToken cancellationToken)
    {
        var source = services?.GetService<IWidgenticCatalogSource>();
        if (source is null) return default;
        WidgenticCatalog? catalog;
        try
        {
            catalog = await source.GetCatalogAsync(new WidgenticCaller(user, services!), cancellationToken).ConfigureAwait(false);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception exception)
        {
            Logger(services).LogError(exception, "The widgentic catalog source failed; the call answers {Code}.", UnavailableCode);
            return new Resolution(null, Unavailable: true);
        }
        if (catalog is null) return default;
        var config = engine.Composer.Compose(catalog, catalog.Composition ?? defaultComposition);
        foreach (var problem in config.Unreadable) LogCallerProblem(Logger(services), problem);
        return new Resolution(config, Unavailable: false);
    }

    /// <summary>Each refused entry, by section, index, name and code; never its contents.</summary>
    private static void Report(ComposedConfig config, string problemsJson, IServiceProvider? services)
    {
        ILogger? logger = null;
        foreach (var (origin, problem) in config.Attribute(problemsJson))
        {
            logger ??= Logger(services);
            if (origin.FromCaller)
            {
                LogCallerProblem(logger, problem);
            }
            else
            {
                logger.LogWarning(
                    "widgentic: startup entry {Source} ('{Name}') was skipped for this caller ({Code}).",
                    origin.StartupSource, problem.Name, problem.Code);
            }
        }
    }

    private static void LogCallerProblem(ILogger logger, CallerProblem problem) =>
        logger.LogWarning(
            "widgentic: the caller's {Section}[{Index}] ('{Name}') was refused and skipped for this call ({Code}).",
            problem.Section, problem.Index, problem.Name, problem.Code);

    private static ILogger Logger(IServiceProvider? services) =>
        services?.GetService<ILoggerFactory>()?.CreateLogger(LoggerCategory) ?? NullLogger.Instance;

    /// <summary>No config and not unavailable: the startup host answers.</summary>
    private readonly record struct Resolution(ComposedConfig? Config, bool Unavailable);
}
