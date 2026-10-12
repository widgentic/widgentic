using System.Text.Json;
using System.Text.Json.Nodes;
using ModelContextProtocol.Extensions.Apps;
using ModelContextProtocol.Protocol;
using ModelContextProtocol.Server;
using Widgentic.Mcp.Engine;

namespace Widgentic.Mcp.Mcp;

/// <summary>
/// The app template resource and the preview-page template, named and described by the bundle,
/// with the operator's CSP resource domains on the app resource when there are any.
/// </summary>
internal static class WidgenticResourceFactory
{
    public static McpServerResource AppTemplate(WidgenticEngine engine, IReadOnlyList<string> resourceDomains)
    {
        var resources = engine.Resources;
        return McpServerResource.Create(
            async (CancellationToken cancellationToken) => new TextResourceContents
            {
                Uri = resources.AppTemplateUri,
                MimeType = resources.AppTemplateMimeType,
                Text = await engine.Pool.InvokeAsync("appTemplate", cancellationToken).ConfigureAwait(false),
            },
            new McpServerResourceCreateOptions
            {
                UriTemplate = resources.AppTemplateUri,
                Name = resources.AppTemplateName,
                Description = resources.AppTemplateDescription,
                MimeType = resources.AppTemplateMimeType,
                Meta = resourceDomains.Count == 0 ? null : CspMeta(resourceDomains),
            });
    }

    /// <summary>
    /// <c>{ "ui": { "csp": { "resourceDomains": [...] } } }</c>, shaped by the SDK's own type. Passed
    /// through the create options because <c>McpApps.SetResourceUi</c> (SDK 2.2.0) writes only the
    /// resource-template view, which <c>resources/list</c> never shows for a fixed URI.
    /// </summary>
    private static JsonObject CspMeta(IReadOnlyList<string> resourceDomains)
    {
        var ui = JsonSerializer.SerializeToNode(
            new McpUiResourceMeta { Csp = new McpUiResourceCsp { ResourceDomains = [.. resourceDomains] } },
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
