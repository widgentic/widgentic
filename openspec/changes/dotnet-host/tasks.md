## 1. Node-free store limits (`packages/mcp`)

- [x] 1.1 `src/store/limits.ts`: move `StoreLimits`, `DEFAULT_LIMITS` and `SAFE_IDENTIFIER` here, with no imports beyond `@widgentic/core` types. `types.ts` and `validate.ts` import from it and re-export the same names. `compose.ts`, `file.ts` and `server/guide.ts` import from `limits.ts` directly. The exports snapshot is unchanged (design D7).
- [x] 1.2 `tools/boundaries.test.ts`: walk the STATIC import graph from `packages/mcp/src/host/index.ts` (relative imports plus `@widgentic/core` sources) and fail on any `node:` import, `process`, `Buffer` or `require`, naming the import chain. Add a regression case proving that a `node:` import reachable only through a tree-shakeable re-export still fails.

## 2. Host facade and bundle (`packages/mcp/src/host`)

- [x] 2.1 `index.ts`: `createWidgenticHost(configJson)` per the mcp-server "Runtime-neutral host bundle" requirement.
  - Parse the config.
  - Validate `widgets`, `themes` and `schemas` with `checkStoredWidget`, `checkStoredTheme` and the schema check. Built-in kinds and `light`/`dark` are reserved. Collect `{ section, index, code, message }` problems.
  - `registerTemplate(..., { httpDisabled: "unresolved" })`.
  - Build the theme registry and the schema list.
  - Return `version` (manifest version injected at build), `problems`, `definitions` (the six exported definitions), `call(name, argsJson, slim)` dispatching to the existing handlers (`UNKNOWN_TOOL` result otherwise), `appTemplate` and `widgetPage(kind)` (same rendering as `server.ts`'s page resource — extract it into a shared helper that `server.ts` uses too, so the two cannot drift).
  - No module-level mutable state. Module header describes current behavior.
- [x] 2.2 `url-shim.ts`: export `URL` and `URLSearchParams`, preferring `globalThis` implementations and falling back to `core-js-pure` (exact-pinned devDependency), with no global writes (design D5).
- [x] 2.3 `scripts/bundle-host.mjs`: esbuild `entryPoints: src/host/index.ts`, `format: "esm"`, `platform: "neutral"`, `target: "es2022"`, `minify`, `inject: [url-shim]`, `define` for the version, and output to `dist/host/widgentic-host.js`. Fail the build if the output contains `import`, `require(` or `node:`. Wire it into `packages/mcp` `build` after `tsc`.
- [x] 2.4 `package.json`: add `"./host": { "types": "./dist/host/index.d.ts", "default": "./dist/host/widgentic-host.js" }` and the `core-js-pure` devDependency (exact version). Add `.changeset/dotnet-host.md` with a minor bump for `@widgentic/mcp`.
- [x] 2.5 `packages/mcp/README.md`: a `./host` section covering what it is for (embedded engines), the JSON surface, the render-only boundary, the runtime floor (ECMAScript plus `Intl`), and that the Node 22 engines field does not apply to this artifact.

## 3. Conformance corpus and bare-realm tests

- [x] 3.1 `tools/conformance-generate.ts` (`npm run conformance:generate`): build the corpus inputs and write two outputs.
  - Inputs:
    - every built-in kind's `dataExample`;
    - a group mixing card and tree;
    - named `dark` and an inline theme;
    - `UNKNOWN_KIND`, `MISSING_FIELD` and bad `format`;
    - a misaimed hint (diagnostics);
    - number/currency formats in `en-CA`, `fr-CA` and `de-DE`;
    - links and images with odd URLs (IDN host, encoded path, query, a disallowed scheme);
    - the three example widgets (weather with an http action, one with a prompt action);
    - slim and non-slim; all formats;
    - `list_*`, `get_authoring_guide`, `appTemplate`, `widgetPage("card")`;
    - an `UNKNOWN_TOOL` call.
  - Outputs:
    - `packages/mcp/src/host/__tests__/conformance.json`, with outputs from the facade source in Node;
    - `dotnet/samples/Widgentic.Sample.Stdio/widgets/*.json`, from `examples/mcp-server/widgets` in the designer export shape.
- [x] 3.2 `src/host/__tests__/host.test.ts`:
  - the facade equals the direct handlers for the same catalog (D13 check 1);
  - the committed corpus equals a fresh in-memory generation, failing with the case name (check 2) — lives in `tools/conformance.test.ts`, since a package test may not import from `tools/`;
  - refused entries (forbidden tag, kind `card`, theme `dark`) appear in `problems()` with their codes and are not served;
  - the definitions deep-equal the exported constants and contain no `execute_action` or `list_actions`;
  - http descriptors carry `disabled: "unresolved"`, prompt descriptors carry none, and there is no `load` or `loads`.
- [x] 3.3 `src/host/__tests__/bare-realm.test.ts`: transform the BUILT bundle to an IIFE with esbuild `transform` and evaluate it in `vm.createContext({})`.
  - Assert `URL`, `process`, `Buffer` and `require` are undefined there.
  - Every corpus case is byte-identical (check 3, one named test per case).
  - The weather widget registers with no problems.
  - The global property list is unchanged after a full corpus run.
  - B after A equals B on a fresh host.

  The test builds the bundle first when it is missing (`globalSetup`), so `npm test` works without a prior `npm run build`.

## 4. Repository tooling

- [x] 4.1 `tools/exports.test.ts`: add the `@widgentic/mcp/host` entry and update its snapshot (`createWidgenticHost` plus types).
- [x] 4.2 `tools/pack-check.mjs`: assert the mcp tarball contains `dist/host/widgentic-host.js` and that the file has no `import`. publint and are-the-types-wrong stay green with the new entry.
- [x] 4.3 `tools/boundaries.test.ts`: scan `dotnet/**/*.csproj`, `*.props`, `*.targets` and `*.cs` for paths into `packages/`. Only `packages/mcp/dist/host/widgentic-host.js` and `packages/mcp/src/host/__tests__/conformance.json` are allowed. Fail naming the file and the path.
- [x] 4.4 `tools/docs-generate.ts`: include the `./host` entry if it enumerates entries, and keep `npm run docs:check` green.

## 5. .NET scaffold (`dotnet/`)

- [x] 5.1 `Widgentic.slnx`, `Directory.Build.props` and `Directory.Packages.props`.
  - `Directory.Build.props`: `net10.0`, nullable, `TreatWarningsAsErrors`, deterministic builds, `<WidgenticMcpVersion>` pin, repository metadata, MIT license expression.
  - `Directory.Packages.props`: exact versions for `ModelContextProtocol`, `ModelContextProtocol.Extensions.Apps`, ClearScript and the test stack.
  - Resolve whether `Microsoft.ClearScript.V8` brings the native runtimes or each `Microsoft.ClearScript.V8.Native.<rid>` (linux-x64, linux-arm64, win-x64, osx-arm64) must be referenced, and record the answer in design.md's open question.
- [x] 5.2 `src/Widgentic.Mcp/Widgentic.Mcp.csproj`: package ID `Widgentic.Mcp`, version `0.9.0` (major.minor aligned with the pin, A15), a description stating beta and render-only, `README.md`, `LICENSE`, XML docs, and SourceLink. Embed `$(WidgenticBundlePath)`, defaulting to `../../packages/mcp/dist/host/widgentic-host.js`, as an `EmbeddedResource`. A target fails with "run `npm run build` first" when the file is missing.
- [x] 5.3 `dotnet/README.md` and `CHANGELOG.md` (0.9.0 entry), plus a `LICENSE` copy.
  - Usage: `AddMcpServer().WithWidgentic(...)`, tool selection, a host tool with `[McpAppUi]`, and widgets from designer exports.
  - The render-only limits and the image/`ResourceDomains` note.
  - Supported RIDs and Debian-based images (no Alpine).
  - That hidden tools may still be named in agent-facing texts.

## 6. .NET engine (`src/Widgentic.Mcp/Engine`)

- [x] 6.1 `BundleLoader`: read the embedded resource and compute its SHA-256. Load it in an engine as a standard module through a minimal in-engine importer that keeps the host object engine-internal. Fallback recorded in design D3 if ClearScript module loading misbehaves.
- [x] 6.2 `V8HostPool`:
  - N `V8Runtime`s (`EnginePoolSize`, default `Math.Min(ProcessorCount, 4)`), each created with `V8RuntimeConstraints` heap limits and an engine flagged `DisableGlobalMembers`, with no host objects or types.
  - Eager parallel creation at startup, with code caching across runtimes.
  - `Channel`-based leases.
  - Per-call `CallTimeout` (default 2 s) via `Interrupt()`, returning an `ENGINE_TIMEOUT` result.
  - Heap or script failure returns an `ENGINE_FAILURE` result.
  - A failed runtime is disposed and replaced in the background.
  - An internal test hook makes `call` spin.
- [x] 6.3 `WidgenticEngineInfo`: `BundleVersion` from the bundle's `version()` and `BundleSha256` from the embedded bytes. Log both once at startup.

## 7. .NET MCP wiring (`src/Widgentic.Mcp`)

- [x] 7.1 `WidgenticOptions`:
  - `Tools` (`WidgenticTools` flags: `ListWidgets`, `RenderWidget`, `ListThemeTokens`, `ListThemes`, `ListSchemas`, `GetAuthoringGuide`, `None`; `Default` is all six);
  - `ResourceDomains`, `IncludeWidgetPages` (default true) and `AssumeUi` (default false);
  - `EnginePoolSize` and `CallTimeout`;
  - `AddWidget(json, source?)`, `AddWidgetsFromDirectory(path)` (one definition or an array per file), `AddTheme(json)` and `AddSchema(json)`.
- [x] 7.2 `WithWidgentic(this IMcpServerBuilder, Action<WidgenticOptions>?)`:
  - Call `WithMcpApps()`.
  - Build the pool and fail startup with `WidgenticConfigurationException` listing every `problems()` entry with its source file.
  - Log a widget's `load` binding once as inactive.
  - Run the flags↔definitions self-check.
  - Register each selected tool as an `McpServerTool` from `definitions()`, with `render_widget` set via `McpApps.SetAppUi(... AppTemplateUri)`. Handlers forward raw arguments to `call` and deserialize with `McpJsonUtilities.DefaultOptions`.
  - Register the app resource (`McpApps.HtmlMimeType`, CSP `ResourceDomains` only when non-empty) always, and the `ui://widgentic/page/{kind}` template per option.
- [x] 7.3 Slimming: use `McpApps.GetUiCapability(server.ClientCapabilities)` when negotiated (it must advertise `McpApps.HtmlMimeType`), else `AssumeUi`.
- [x] 7.4 `IWidgenticRenderer`, `WidgetRenderRequest` and `WidgenticResources.AppTemplateUri`. `Render` serializes to the `render_widget` arguments and goes through the same `call` and slimming. It never throws for bad input. The constant is checked against the bundle at startup.

## 8. .NET tests (`tests/Widgentic.Mcp.Tests`)

- [x] 8.1 Conformance: every case in `packages/mcp/src/host/__tests__/conformance.json`, read from the repository, is byte-identical through the pool, including the `fr-CA` currency case (D13 check 4). One named test case per corpus entry.
- [x] 8.2 Protocol round trip over an in-process transport with a C# SDK client:
  - `tools/list` texts deep-equal `definitions()`, and `render_widget` carries `_meta.ui.resourceUri`;
  - the `card` render has `class="wg-card"` and a payload block;
  - `UNKNOWN_KIND` is an `isError` result;
  - `resources/read` of the app template equals `appTemplate()` with the app MIME type;
  - the page template serves `widgetPage("card")`;
  - CSP domains are present when configured and absent by default.
- [x] 8.3 Selection:
  - the default lists exactly six tools;
  - hiding `GetAuthoringGuide` removes it, and calling it yields the SDK's unknown-tool error;
  - `None` plus a host tool still renders and the app resource stays readable;
  - no combination lists `execute_action` or `list_actions`.
- [x] 8.4 Slimming: an Apps-capable client gets slim output and a plain client gets full output, with identical `structuredContent`. A request with no negotiated capabilities follows `AssumeUi`.
- [x] 8.5 Configuration:
  - the invoice designer export is served;
  - a forbidden-tag file fails startup naming the file, section and code;
  - kind `card` and theme `light` are refused;
  - the weather widget loads with one inactive-binding log line, and its http action renders `disabled: "unresolved"`.
- [x] 8.6 Engine:
  - 64 concurrent distinct renders on a pool of 4 each equal their solo render;
  - the timeout hook returns `ENGINE_TIMEOUT`, the next call succeeds and the pool size is unchanged;
  - A then B equals B on a fresh runtime;
  - `WidgenticEngineInfo` hash equals the embedded bytes.
- [x] 8.7 No egress: run the corpus with an `HttpClient` / `SocketsHttpHandler` diagnostic listener and a `DiagnosticSource` subscription asserting zero outbound requests.
- [x] 8.8 Package shape: `dotnet pack` and inspect the `.nupkg` for the assembly (with the embedded bundle), XML docs, README and LICENSE, no sources, and the `net10.0` dependency group listing exactly the declared packages.

## 9. Sample (`dotnet/samples/Widgentic.Sample.Stdio`)

- [x] 9.1 A stdio server with `WithStdioServerTransport().WithWidgentic(o => o.AddWidgetsFromDirectory("widgets"))`, plus one host tool (for example `team_roster`) that returns `renderer.Render("table", ...)` with `[McpAppUi(ResourceUri = WidgenticResources.AppTemplateUri)]`.
- [x] 9.2 A test: the generated `widgets/*.json` equals a fresh generation (the corpus generator's second output), and the sample's `list_widgets` includes `invoice`, `weather` and `x-post`.

## 10. CI and release workflows

- [x] 10.1 `ci.yml`: a `dotnet` job (ubuntu-latest) running setup-node, `npm ci`, `npm run build`, setup-dotnet `10.0.x`, then `dotnet test dotnet/Widgentic.slnx -c Release`.
- [x] 10.2 `release-dotnet.yml`:
  - Trigger on `main` pushes touching `dotnet/**`, plus `workflow_dispatch`.
  - Build the npm workspace, then test, pack and run the pin check.
  - Pin check: download the registry tarball of `WidgenticMcpVersion` and compare the `dist/host/widgentic-host.js` SHA-256 with the workspace build. It is fatal when publishing and a warning in dry runs, because the first `./host` release does not exist yet.
  - Publish only when `vars.NUGET_PUBLISH == 'true'` and the version is absent from nuget.org, via `NuGet/login` (OIDC) and `dotnet nuget push`.
  - Run `actions/attest-build-provenance` on the `.nupkg`.
  - `permissions: id-token: write, attestations: write, contents: read`.
- [x] 10.3 A dry run of `release-dotnet.yml` on the PR from `feature/dotnet-host` (`workflow_dispatch` only works once the file is on `main`): the `package` job builds, tests and packs and reports the pin-check warning, and `publish` is skipped. Record the run in TESTING.md.

## 11. Docs and verification

- [x] 11.1 CLAUDE.md:
  - Reword the product-invariant line: exactly two repositories, this public one (every package, every language host under `dotnet/`, the examples) and the private `widgentic/apps`, never one per package or per language (design D15).
  - Layout: add `dotnet/` and `packages/mcp` `host/`.
  - Commands: `dotnet test dotnet/Widgentic.slnx` and `npm run conformance:generate`.
  - Gate: add `dotnet test` when `dotnet/` or the host bundle changes.
  - Boundaries: the `dotnet/` edge and the `./host` runtime floor.
  - Release: the NuGet package outside Changesets, the pin and the pin check.
- [x] 11.2 Root `README.md`: the `dotnet-host` capability row → `Widgentic.Mcp`, and a package-table row (.NET 10, beta, render-only).
- [x] 11.3 `BACKLOG.md`: a ".NET actions and image inlining" entry (priority, origin `dotnet-host` design "Actions later"): the prepare/complete split, the C# guarded fetch, `execute_action`/`load`, and inlining.
- [x] 11.4 `TESTING.md`: an entries table row for `./host` and the .NET suite. A ".NET host" recipe: build order, `dotnet test`, running the sample over stdio in Claude Desktop and VS Code, and isolate memory measured per pooled runtime. A dated verification-log entry.
- [ ] 11.5 Live check: register the sample (stdio) in a real MCP Apps host and, in a FRESH conversation, call the host tool and `render_widget` for `invoice`. Record what was VISIBLE (mounted widget vs text, dark/light, the disabled http action's state) honestly in the verification log.
- [x] 11.6 Gate: typecheck, `npm test`, `npm run build`, `npm run pack:check`, `openspec validate --strict dotnet-host`, `openspec validate --specs` and `dotnet test`, all green.

## 12. Merge with main (rendering-app-template, 0.8.0 release)

- [x] 12.1 Merge `main` into `feature/dotnet-host` and resolve the additive conflicts (the handlers' error codes, server imports, mcp devDependencies, the TESTING log). Sync the lockfile with the released ranges.
- [x] 12.2 The host serves `preview_widget` through `handlePreviewWidget`, marked `visibility: ["app"]` from the shared `APP_ONLY_VISIBILITY` constant (also used by `server.ts`). Covered by host tests and nine new corpus cases; the corpus was regenerated.
- [x] 12.3 .NET: `preview_widget` is `render_widget`'s app-only companion. It is registered with `_meta.ui.visibility: ["app"]` and the legacy key, the startup self-check counts companions, and the selection and protocol tests cover it.
- [x] 12.4 Pin `WidgenticMcpVersion` to `0.9.0`, since 0.8.0 shipped without `./host`. Update the spec deltas, design (A14) and docs for the preview tool.
- [x] 12.5 Version alignment (owner decision, design A15): `Widgentic.Mcp` 0.9.0, the build-time rule that its major.minor equals `WidgenticMcpVersion`'s, and the package-distribution delta, CHANGELOG, README and CLAUDE.md updated.
- [x] 12.6 Merge `main` again (streaming-preview image placeholders, 0.8.1). Kept both BACKLOG items (RND-5, NET-1) and synced the lockfile. Only the app template's corpus case went stale; it was regenerated. The placeholder behaviour reaches .NET through the bundled template with no package change.

## 13. Streamable HTTP (live finding: Claude does not mount widgets over stdio)

- [x] 13.1 The sample serves Streamable HTTP with `--http` (loopback `:3002/mcp`, `--urls` to override, `SessionMode = StatefulForInitializeClients`), sharing one server registration with stdio. `ModelContextProtocol.AspNetCore` 2.2.0 is pinned.
- [x] 13.2 Slimming reads a stateless request's `_meta` client capabilities (`MetaKeys.ClientCapabilities`) when there is no session, and only then falls back to `AssumeUi`. `IWidgenticRenderer` gains the `RequestContext` overload, and the sample's host tool uses it. Covered by `SlimmingTests`.
- [x] 13.3 The sample is tested over HTTP as a real process with three clients: a 2026-07-28 MCP Apps client (slimmed), a plain client (full), and a 2025-11-25 MCP Apps client (slimmed through its session). The spec delta, design A16, the README, TESTING (recipes for VS Code and Claude) and CLAUDE.md are updated, and the Node follow-up is in BACKLOG.
- [x] 13.4 Add `AddThemesFromDirectory` and `AddSchemasFromDirectory` (one shared directory reader). The sample now serves the docker example's demo seed (design A17): the generator writes `seed/{widgets,themes,schemas}/` from `examples/docker/seed/demo.json` and the staleness test guards it. Tests cover the seed loaded from directories, widgets without their schemas, and directory errors naming their files; the load-binding test uses the corpus.
