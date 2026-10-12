## Context

`Widgentic.Mcp` runs the `@widgentic/mcp` `./host` bundle in a pool of V8 runtimes (`V8HostPool`, `HostRuntime`). Each runtime's loader calls `createWidgenticHost(config)` once with the startup entries, binds the resulting host, and serves every call from it. The bundle already supports per-caller composition: `createWidgenticHost` builds a fresh, stateless host from any config, and the bundle touches no globals and keeps nothing between calls (`mcp-server`, "Runtime-neutral host bundle").

Composition is cheap. Timed on the built bundle's V8 (Node 24; ClearScript runs the same engine):

| Widgets | Compose | Compose + render |
|---|---|---|
| 2 | 0.17 ms | 0.26 ms |
| 10 | 0.55 ms | 0.61 ms |
| 25 | 1.2 ms | 1.3 ms |
| 50 | 2.3 ms | 2.4 ms |

A warm render alone is about 0.05 ms.

The C# SDK gives every tool and resource handler a `MessageContext`. Its `User` is the caller's `ClaimsPrincipal`, set by ASP.NET Core authentication over HTTP, and its `Services` is the request's service provider.

## Goals / Non-Goals

**Goals:**
- Each caller gets its own catalog, composed per call.
- Replace and Merge combine a catalog with the startup entries, and in Merge the principal's entries win.
- Nothing is cached across calls, and nothing leaks between callers.
- Hosts without a source see no change.

**Non-Goals:**
- Storing or fetching catalogs; the implementer decides.
- Actions (NET-1).
- Caching composed catalogs, or per-principal pools.
- Any change to the npm bundle.

## Decisions

### D1. Compose per call inside the leased runtime

The loader keeps a reference to `createWidgenticHost` beside the startup host. A call whose caller resolves to a catalog does this inside its leased runtime:
1. Invoke the factory with the merged config JSON.
2. Invoke `call` (or `widgetPage`) on the resulting host.
3. Read `problems()`.
4. Release the script object.

All of this runs within the call's `CallTimeout`, so a runaway composition is contained like a runaway render. Only strings and the `slim` boolean cross, as today.

**Rejected alternatives:**
- **A pool per principal:** tens of MB per runtime, lifecycle and eviction to manage, and long-lived per-tenant state.
- **Caching composed hosts per principal:** breaks the "per-request composition, no caches" invariant, and composition costs at most 2.5 ms anyway.

### D2. Merge by identifier, in C#, before composing

For Merge, the package reads only the identifier of each entry: a widget's `kind`, a theme's or schema's `name`. Startup entries are read once at startup, since they were validated then; principal entries are read per call. It drops every startup entry whose identifier the principal defines, then composes the remaining startup entries followed by the principal's entries. So:
- **No identifier is served twice.** The principal's definition always wins, even when it is invalid. A refused principal entry leaves that identifier unserved for the principal, rather than silently falling back to the startup one. A principal edit that breaks never surfaces the shared version.
- **References work across the two sets.** Startup entries register first, so a principal theme can `extend` a startup theme (themes resolve `extends` eagerly, in registration order) and a principal widget can reference a startup schema.
- **Repeats within a catalog:** the bundle's composition registers the first occurrence and refuses each later one (`DUPLICATE_NAME` for schemas, `REGISTER_FAILED` for widgets and themes), and those refusals are logged.
- **Unreadable entries:** an entry whose identifier can't be read (malformed JSON, no string `kind`/`name`) shadows nothing and goes to the bundle, which refuses and reports it.

Reading an identifier isn't validation: every check still runs in the bundle, so the package still restates nothing.

**Rejected:** putting principal entries first and letting the bundle's first-wins rule pick. Every call would report the shadowed startup entries as duplicates. A principal theme couldn't extend a startup theme. And a refused principal entry would quietly fall back to the startup one, against "the principal wins".

### D3. The API surface

```csharp
public interface IWidgenticCatalogSource
{
    // null: the startup catalog serves this caller.
    ValueTask<WidgenticCatalog?> GetCatalogAsync(WidgenticCaller caller, CancellationToken cancellationToken);
}

public sealed record WidgenticCaller(ClaimsPrincipal? User, IServiceProvider Services);

public sealed class WidgenticCatalog
{
    public IList<string> Widgets { get; }   // designer export JSON, one entry or an array per string
    public IList<string> Themes { get; }
    public IList<string> Schemas { get; }
    public WidgenticComposition? Composition { get; set; }   // null: WidgenticOptions.PrincipalComposition
}

public enum WidgenticComposition { Merge, Replace }
```

- **Default mode.** `WidgenticOptions.PrincipalComposition` defaults to `Merge`, so startup entries keep serving principals unless a host opts out. That's an assumption, easy to flip; the owner chose the Replace/Merge option and the principal-wins rule.
- **Registration.** The source is resolved from the request's services (`MessageContext.Services`), so scoped implementations (a `DbContext`, say) work, and registering one is what turns per-principal mode on. Absent from DI, nothing changes.
- **Calls per request.** The source is called once per tool call or resource read, with that call's cancellation token. A host that wants its own cache can add one behind the interface, outside the package.
- **stdio.** No authentication, so `User` is null.

### D4. What resolves per caller, and what stays global

- **Per caller:** the handlers for `list_widgets`, `render_widget`, `preview_widget`, `list_themes` and `list_schemas`; the `ui://widgentic/page/{kind}` resource template; and `IWidgenticRenderer.RenderAsync(request, RequestContext, …)`. These consult the source.
- **Global:** `tools/list`, `list_theme_tokens`, `get_authoring_guide` and `ui://widgentic/app.html` never call it. They don't depend on a catalog, and an extra source round trip there would cost every host for nothing.
- **The session overload** of `RenderAsync` has no request context, so it uses the startup catalog.

### D5. Refusals are logged per call, never fatal

Each problem a principal composition reports is logged at Warning, one line per refused entry: section, index, name and code, never the entry's contents. The call continues with what composed.
- `LIMIT_REACHED` can also hit the remaining startup entries, because the composed set counts against the store limits (100 widgets, 50 themes). Startup entries come first, so a large startup set narrows each principal's budget; this is documented.
- Startup entries keep failing fast with `WidgenticConfigurationException`.

### D6. A failing source answers `CATALOG_UNAVAILABLE`

- **Errors.** An exception from the source becomes an `isError` result with `{ code: "CATALOG_UNAVAILABLE", path: "", message: "The caller's catalog is unavailable." }`, and the exception is logged at Error. The message never includes the exception's text, which may carry the host's data.
- **Cancellation.** It propagates as it does for any call.
- **Resource reads.** A resource read answers with the SDK's error for a failed read, since a page has no `isError` form.

### D7. The sample shows two principals

- An API-key `AuthenticationHandler` reads `x-api-key` or `?key=`. Keys come from configuration (`Widgentic:Sample:Keys:<principal>`, so environment variables work) and are never printed. A request without a known key stays anonymous, and the source returns `null` for it.
- **`merge-demo`** carries a variant of `email-inbox-widget` (its own description), to show the replacement, plus a theme extending `google-dark`.
- **`replace-demo`** carries a single widget of its own.
- The principals' entries are small committed sample files, kept beside the generated seed. The seed staleness test covers only the generated seed.

## Risks / Trade-offs

- **Fetching catalogs costs more than composing them.** That's the implementer's to manage; the package caches nothing by design.
- **A principal identifier shadows even when invalid** (D2). That's deliberate, and the log names the refusal.
- **Store limits apply to the merged set** (D5).
- **Garbage per call.** Each composition allocates a host that V8 collects. At the measured sizes this is well within the 256 MB heap.
- **Stateful sessions.** Clients that initialize keep a session. The SDK's HTTP transport still sets `User` per request from the authenticated request.

## Migration Plan

Additive: hosts without a source are unchanged.
- **Release:** `Widgentic.Mcp` 0.11.0 together with the 0.11 pin bump, once `@widgentic/mcp` 0.11.0 (`derived-input-schemas`) is on npm.
  - **Decided during apply:** no 0.10.1. This branch starts from `staging`, whose host bundle already carries `derived-input-schemas`' handler changes. `tools/verify-host-pin.mjs` would never find that bundle byte-identical to the 0.10.0 tarball, so a 0.10.1 could not publish.
  - This change ships the `0.11.0 (unreleased)` CHANGELOG entry and leaves the version and the pin at 0.10.0.
  - The version and the pin move in one commit after the npm release, the order that 0.10 followed (#27).
- **PR:** into `staging`.

## Open Questions

None. The default mode (`Merge`) is recorded as an assumption in D3.
