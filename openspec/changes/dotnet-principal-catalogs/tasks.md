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
- [x] 4.3 Merge: the principal's `email-inbox-widget` replaces the startup one (listed once, the principal's descriptor), and a principal widget references the startup schema `email-inbox`. Replace: built-ins plus the principal's entries only. The per-catalog override.
- [x] 4.4 Repeats within a catalog are refused and logged; a refused principal entry still replaces the startup entry; an invalid principal entry is skipped and logged without its contents.
- [x] 4.5 A failing source answers `CATALOG_UNAVAILABLE` without the exception text and other callers keep working; global surfaces (`tools/list`, the app template, `list_theme_tokens`, `get_authoring_guide`) never call the source.
- [x] 4.6 A composed catalog never outlives its call: A then B on one runtime, and a changed catalog is reflected on the next call. Preview pages follow the caller. A host tool renders the caller's catalog through the `RequestContext` overload.

## 5. Sample

- [x] 5.1 An API-key authentication handler (`x-api-key` or `?key=`), with keys from configuration that are never printed. A catalog source maps the `merge-demo` and `replace-demo` principals to small committed catalogs; anonymous callers get `null` (D7).
- [x] 5.2 Sample test over HTTP: a keyless client, a Merge client and a Replace client each list their composed widgets.

## 6. Docs, release and records

- [x] 6.1 `dotnet/README.md` (a per-principal catalogs section, the Merge rules, the limits note), `dotnet/CHANGELOG.md`, and TESTING (host snippets with the demo keys passed as `?key=`, plus a dated log entry).
- [x] 6.2 Version: the `0.11.0 (unreleased)` CHANGELOG entry; 0.10.1 is not viable from `staging` (Migration Plan, decided during apply). The bump itself moved into this branch (7.9, D11).
- [x] 6.3 Gate: typecheck, `npm test`, build, `pack:check`, `openspec validate`, `dotnet test`.
- [x] 6.4 Local testing, by the owner's decision (2026-10-12): no staging deploy for this change.
  - **Owner's result:** all three principals behaved as specified (TESTING log, 2026-10-12).
  - The sample runs over HTTP on `localhost:3002` with both demo keys.
  - The owner retests each principal (keyless, `merge-demo`, `replace-demo`) in fresh conversations.
  - This covers section 7 too.

## 7. Settings (starts once PR #29 is merged into `staging`)

- [x] 7.1 Merge `origin/staging` (with PR #29, `7c68517`) into this branch.
  - Conflicts in `TESTING.md` (both log entries kept) and `dotnet/CHANGELOG.md` (one 0.11.0 section, with the incoming method name corrected to `AddTheme`).
  - `specs/mcp-server/spec.md` rebuilt from the archived base text of "Runtime-neutral host bundle", with all 11 scenario titles kept.
  - PR #29 removed theme `extends` (its D20). Test 4.3 now proves a cross-set schema reference instead, and the docs, the XML docs, D2, D7 and the Merge requirement were updated to match.
  - The gate passed after the merge.
- [x] 7.2 Host bundle (D8):
  - Move the settings rules the bundle needs into a Node-free module, keeping the boundary test green.
  - `createWidgenticHost` reads `config.settings`, checks it with the store's write rules against the themes it composed, applies valid defaults through `setDefault`, and reports refused settings under section `settings`.
  - Output stays byte-identical without settings.
  - Add a `@widgentic/mcp` changeset.
- [x] 7.3 Corpus: a second configuration with settings (a light default only, a dark default only, two defaults with styles, one theme for both modes; render, page, preview and `list_themes` each). The generator, the bare-realm test and the .NET `ConformanceTests` run each case against its configuration.
- [x] 7.4 .NET API (D9):
  - `WidgenticOptions.UseSettings(json)` and `UseSettingsFromFile(path)`. The record itself stays internal (D9).
  - `WidgenticCatalog.Settings` and `UseSettings(json)`.
  - A refused startup setting stops startup with `WidgenticConfigurationException`, naming section `settings`, the source and the code.
- [x] 7.5 Composition (D9):
  - `CatalogComposer` combines records section by section in Merge and uses the principal's record alone in Replace; a non-object record replaces the startup one whole.
  - Settings problems are attributed to the caller's section or to the startup one, and logged like entries.
- [x] 7.6 Tests, one per new scenario:
  - in `dotnet-host`: startup defaults, a startup refusal, Merge section replacement, Merge inheritance, Replace, a refused principal setting, a startup default shadowed by a refused principal theme, and previews and pages following the caller;
  - in `mcp-server`: the three settings scenarios, in the bare-realm and host tests.
- [x] 7.7 Sample:
  - `buildSampleSeed` writes `seed/settings.json` from `examples/docker/seed/demo.json`, and the seed staleness test covers it.
  - The sample loads it with `UseSettingsFromFile`.
  - `merge-demo` gets a `settings.json` choosing its own dark default.
  - Done at the merge (7.1): `merge-demo`'s `email-inbox-widget` and `merge-demo-dark` were re-derived from the regenerated seed. That brought in the corrected date pattern (`HH:mm`), and `merge-demo-dark` is now a complete copy of `google-dark`, since `extends` is gone.
  - The HTTP sample test asserts each principal's `defaults`.
- [x] 7.8 Docs:
  - `dotnet/README.md`: a "Default themes" section, the Merge rule for settings, and the legacy token note (D10).
  - `dotnet/CHANGELOG.md` and the `@widgentic/mcp` changeset text.
  - `TESTING.md`: a log entry.
  - `BACKLOG.md`: remove the entry PR #29 added for this work, "Default themes in the .NET host" (THM-1 at `8841d0a`), from both the summary table and Part 1. Match it by title, not by ID, in case the IDs move before merge.
  - Leave THM-2 and THM-3 (sibling combinators) in place: they are outside this change.
- [x] 7.9 Version (D11): `Widgentic.Mcp` 0.11.0 and the pin 0.11.0. The CHANGELOG entry loses "(unreleased)", and the README's version paragraph moves to 0.11.
- [x] 7.10 Gate: typecheck, `npm test`, build, `pack:check`, `openspec validate`, `dotnet test`, plus `conformance:generate` leaving no diff.
