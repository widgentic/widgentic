## Why

The Node server composes the catalog per request, so every caller (principal) gets the built-ins plus their own widgets, themes and schemas. `Widgentic.Mcp` composes once, at startup: each pooled V8 runtime builds one host from the configured entries and serves it to everyone. A .NET host that serves several tenants or users therefore can't give each one their own catalog, which is the capability the hosted widgentic server is built around.

The pieces are already in place:
- The bundle's `createWidgenticHost` builds a fresh, stateless host from any config.
- Composing in V8 costs about 0.05 ms per widget (2.3 ms at 50), so per-request composition needs no cache.
- The C# SDK hands every tool and resource handler the caller's `ClaimsPrincipal` and request services.

## What Changes

- **A host-implemented catalog source.** `IWidgenticCatalogSource` resolves the caller's catalog (widget, theme and schema JSON in the designer's export shapes) from the caller's `ClaimsPrincipal` and the request's services.
  - How the host stores or fetches catalogs is out of scope; the interface is the whole contract.
  - Returning `null` means "use the startup catalog", for anonymous or unknown callers.
- **A composition option per principal.** `WidgenticComposition.Merge` composes the startup entries plus the principal's. `Replace` composes the built-ins plus the principal's entries only. `WidgenticOptions.PrincipalComposition` sets the default, and a resolved catalog may override it for its principal.
  - In Merge, the principal wins: a principal entry replaces the startup entry with the same identifier (widget `kind`, theme or schema `name`), and no identifier is ever served twice. A catalog that repeats an identifier within itself serves the first occurrence; each later one is refused and logged.
- **Per-call composition.** With a source configured, each call composes the caller's catalog inside its leased runtime and drops it after the call. Nothing is cached and nothing is carried to the next call. Without a source, the startup host is used exactly as today.
- **Refused at the door, per call.** A principal's invalid entries are skipped and logged, with section, index, name and code, never contents; they are never fatal. Startup entries still stop startup.
- **A failing source is a result, not a crash.** If the source throws, the call returns an `isError` result with code `CATALOG_UNAVAILABLE`, without the exception's text, and the exception is logged.
- **Where it applies:** `list_widgets`, `render_widget`, `preview_widget`, `list_themes` and `list_schemas`; the `ui://widgentic/page/{kind}` pages; and `IWidgenticRenderer`'s `RequestContext` overload. `list_theme_tokens`, `get_authoring_guide`, `tools/list` and the app template stay global.
- **The sample** gains an API-key authentication handler. Two demo keys map to two principals with different catalogs; the keys are read from configuration and never printed. Without a key, the startup catalog serves.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `dotnet-host`:
  - A new requirement for per-principal catalogs (the source, Replace/Merge, failure handling, and what resolves per caller).
  - **The engine is isolated, bounded and stateless:** the pool composes per call when a source is configured, and still caches nothing.
  - **Widgets, themes and schemas load from designer JSON and are refused at the door:** per-principal entries are refused per call, skipped and logged.
  - **A host's own tools render widgets:** the `RequestContext` overload resolves the caller's catalog.
  - **Protocol round trip and a runnable sample:** the sample demonstrates two principals over HTTP.

## Impact

- **Code:** `dotnet/src/Widgentic.Mcp` (engine, pool, options, tool and resource handlers, renderer, a new interface and composition enum), `dotnet/tests`, `dotnet/samples/Widgentic.Sample.Stdio`, and the README and CHANGELOG.
- **No npm change.** The `./host` bundle is used as it is, and `mcp-server` doesn't change.
- **Release:** ships as `Widgentic.Mcp` 0.11.0, together with the 0.11 pin bump that `derived-input-schemas` (`@widgentic/mcp` 0.11.0) brings. If that release isn't out first, it can ship alone as 0.10.1 under the patch rule. That's a release decision recorded in the tasks.
- **Out of scope:**
  - storage of principal catalogs (the implementer decides);
  - actions and `execute_action` (BACKLOG NET-1);
  - caching composed catalogs.
- **PR target:** `staging`.
