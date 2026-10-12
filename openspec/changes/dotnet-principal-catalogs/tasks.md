## 1. Public surface

- [x] 1.1 `IWidgenticCatalogSource`, `WidgenticCaller(ClaimsPrincipal? User, IServiceProvider Services)`, `WidgenticCatalog` (the `Widgets`/`Themes`/`Schemas` JSON lists, `Add*` helpers mirroring the options', a nullable `Composition`) and the `WidgenticComposition` enum (`Merge`, `Replace`). XML docs state that storage is the implementer's (D3).
- [x] 1.2 `WidgenticOptions.PrincipalComposition` (default `Merge`).

## 2. Engine

- [x] 2.1 The loader keeps `createWidgenticHost` beside the startup host. `HostRuntime` composes a per-call host from a config JSON, invokes the method, reads `problems()` and releases the host, all within the call (D1).
- [x] 2.2 `V8HostPool`/`WidgenticEngine` take an optional per-call config. Without one, calls are served by the startup host exactly as today; timeouts, heap failures and runtime replacement cover the composition too.
- [x] 2.3 Merge and Replace building (D2):
  - startup identifiers are read once at startup, and principal identifiers per call;
  - shadowed startup entries are dropped, the remaining startup entries go first, then the principal's;
  - Replace sends the principal's entries only;
  - entries whose identifier can't be read pass through to the bundle.

## 3. Wiring

- [x] 3.1 Per-caller resolution in the tool handlers for `list_widgets`, `render_widget`, `preview_widget`, `list_themes` and `list_schemas`, and in the `ui://widgentic/page/{kind}` resource template. The source is resolved from `MessageContext.Services` and called once per request with the call's cancellation token (D3, D4).
- [x] 3.2 `IWidgenticRenderer.RenderAsync(request, RequestContext, …)` resolves the caller's catalog; the session overload keeps the startup catalog.
- [x] 3.3 Problems from a principal composition are logged at Warning with section, index, name and code, never contents (D5).
- [x] 3.4 A throwing source answers `CATALOG_UNAVAILABLE` (tools) or the SDK's read error (pages), logs the exception, and lets cancellation propagate (D6).

## 4. Tests (one per spec scenario)

- [x] 4.1 Without a source nothing changes; a `null` catalog serves the startup catalog.
- [x] 4.2 Principals never see each other's entries: two principals, concurrent calls, a pool of 4.
- [x] 4.3 Merge: the principal's `email-inbox-widget` replaces the startup one (listed once, the principal's descriptor), and a principal theme extends `google-dark`. Replace: built-ins plus the principal's entries only. The per-catalog override.
- [x] 4.4 Repeats within a catalog are refused and logged; a refused principal entry still replaces the startup entry; an invalid principal entry is skipped and logged without its contents.
- [x] 4.5 A failing source answers `CATALOG_UNAVAILABLE` without the exception text and other callers keep working; global surfaces (`tools/list`, the app template, `list_theme_tokens`, `get_authoring_guide`) never call the source.
- [x] 4.6 A composed catalog never outlives its call: A then B on one runtime, and a changed catalog is reflected on the next call. Preview pages follow the caller. A host tool renders the caller's catalog through the `RequestContext` overload.

## 5. Sample

- [x] 5.1 An API-key authentication handler (`x-api-key` or `?key=`), with keys from configuration that are never printed. A catalog source maps the `merge-demo` and `replace-demo` principals to small committed catalogs; anonymous callers get `null` (D7).
- [x] 5.2 Sample test over HTTP: a keyless client, a Merge client and a Replace client each list their composed widgets.

## 6. Docs, release and records

- [x] 6.1 `dotnet/README.md` (a per-principal catalogs section, the Merge rules, the limits note), `dotnet/CHANGELOG.md`, and TESTING (host snippets with the demo keys passed as `?key=`, plus a dated log entry).
- [x] 6.2 Version: the `0.11.0 (unreleased)` CHANGELOG entry. The version and the pin stay at 0.10.0 and move to 0.11.0 in one commit after `@widgentic/mcp` 0.11.0 is on npm; 0.10.1 is not viable from `staging` (Migration Plan, decided during apply).
- [x] 6.3 Gate: typecheck, `npm test`, build, `pack:check`, `openspec validate`, `dotnet test`.
- [ ] 6.4 Staging, on the owner's go: the sample served over HTTP with both demo keys. Owner host retest per principal: Claude, VS Code Copilot, ChatGPT.
