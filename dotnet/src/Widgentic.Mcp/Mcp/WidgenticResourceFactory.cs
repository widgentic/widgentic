using System.Text.Json;
using System.Text.Json.Nodes;
using ModelContextProtocol;
using ModelContextProtocol.Extensions.Apps;
using ModelContextProtocol.Protocol;
using ModelContextProtocol.Server;
using Widgentic.Mcp.Engine;

namespace Widgentic.Mcp.Mcp;

/// <summary>
/// The app template resource and the preview-page template, named and described by the bundle.
/// The app resource declares the resource domains the bundle reports: the startup declaration on
/// the listed entry (rewritten per caller by <see cref="DeclareForCaller"/> when a catalog source
/// is registered), and the caller's own on the read content.
/// </summary>
internal static class WidgenticResourceFactory
{
    public static McpServerResource AppTemplate(WidgenticEngine engine, CallerCatalogs catalogs)
    {
        var resources = engine.Resources;
        return McpServerResource.Create(
            async (RequestContext<ReadResourceRequestParams> request, CancellationToken cancellationToken) => new TextResourceContents
            {
                Uri = resources.AppTemplateUri,
                MimeType = resources.AppTemplateMimeType,
                Text = await engine.Pool.InvokeAsync("appTemplate", cancellationToken).ConfigureAwait(false),
                Meta = UiMeta(
                    resources.AppTemplatePrefersBorder,
                    await catalogs.ResourceDomainsAsync(request.User, request.Services, cancellationToken).ConfigureAwait(false)),
            },
            new McpServerResourceCreateOptions
            {
                UriTemplate = resources.AppTemplateUri,
                Name = resources.AppTemplateName,
                Description = resources.AppTemplateDescription,
                MimeType = resources.AppTemplateMimeType,
                Meta = UiMeta(resources.AppTemplatePrefersBorder, resources.AppTemplateResourceDomains),
            });
    }

    /// <summary>
    /// A <c>resources/list</c> filter: with a catalog source registered, the app entry's
    /// <c>_meta.ui</c> carries the caller's domains, as its read content does. The listed entry is
    /// replaced with a copy, never changed in place, because the SDK lists the registered instance.
    /// </summary>
    public static McpRequestHandler<ListResourcesRequestParams, ListResourcesResult> DeclareForCaller(
        McpRequestHandler<ListResourcesRequestParams, ListResourcesResult> next, WidgenticEngine engine, CallerCatalogs catalogs) =>
        async (request, cancellationToken) =>
        {
            var result = await next(request, cancellationToken).ConfigureAwait(false);
            var uri = engine.Resources.AppTemplateUri;
            if (!CallerCatalogs.HasSource(request.Services) || !result.Resources.Any(resource => resource.Uri == uri)) return result;
            var meta = UiMeta(
                engine.Resources.AppTemplatePrefersBorder,
                await catalogs.ResourceDomainsAsync(request.User, request.Services, cancellationToken).ConfigureAwait(false));
            result.Resources = [.. result.Resources.Select(resource => resource.Uri == uri ? WithMeta(resource, meta) : resource)];
            return result;
        };

    private static Resource WithMeta(Resource resource, JsonObject meta)
    {
        var copy = JsonSerializer.Deserialize<Resource>(JsonSerializer.SerializeToNode(resource, McpJsonUtilities.DefaultOptions), McpJsonUtilities.DefaultOptions)!;
        copy.Meta = meta;
        return copy;
    }

    /// <summary>
    /// <c>{ "ui": { "prefersBorder": …, "csp": { "resourceDomains": [...] } } }</c>, shaped by the
    /// SDK's own type: the bundle's border preference, and the CSP block only when domains are
    /// declared. Built fresh per use, for the declaration and for the read content alike. Passed
    /// through the create options because <c>McpApps.SetResourceUi</c> (SDK 2.2.0) writes only the
    /// resource-template view, which <c>resources/list</c> never shows for a fixed URI.
    /// </summary>
    private static JsonObject UiMeta(bool prefersBorder, IReadOnlyList<string> resourceDomains)
    {
        var ui = JsonSerializer.SerializeToNode(
            new McpUiResourceMeta
            {
                PrefersBorder = prefersBorder,
                Csp = resourceDomains.Count == 0 ? null : new McpUiResourceCsp { ResourceDomains = [.. resourceDomains] },
            },
            McpApps.SerializerOptions);
        return new JsonObject { ["ui"] = ui };
    }

    /// <summary>The preview page for a kind of the caller's catalog (the startup catalog when none resolves).</summary>
    public static McpServerResource WidgetPage(WidgenticEngine engine, CallerCatalogs catalogs)
    {
        var resources = engine.Resources;
        return McpServerResource.Create(
            async (RequestContext<ReadResourceRequestParams> request, string kind, CancellationToken cancellationToken) => new TextResourceContents
            {
                Uri = request.Params?.Uri ?? resources.WidgetPageUriTemplate.Replace("{kind}", kind, StringComparison.Ordinal),
                MimeType = resources.WidgetPageMimeType,
                Text = await catalogs.WidgetPageAsync(kind, request.User, request.Services, cancellationToken).ConfigureAwait(false),
            },
            new McpServerResourceCreateOptions
            {
                UriTemplate = resources.WidgetPageUriTemplate,
                Name = resources.WidgetPageName,
                Title = resources.WidgetPageTitle,
                Description = resources.WidgetPageDescription,
                MimeType = resources.WidgetPageMimeType,
            });
    }
}
