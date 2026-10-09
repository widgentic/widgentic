## Context

A .NET 10 MCP project wants widgentic widgets: its own tool results rendered as cards and
tables in MCP Apps hosts, and optionally the `render_widget` family for agents. Everything
widgentic serves comes from TypeScript. Contract validation, template compilation, the hint
analysis, value formatting, the tool descriptions, the authoring guide and the 886-line app
template bridge are all TypeScript, and `@widgentic/mcp` requires Node 22.

A probe on 2026-10-08 (.NET 10.0.401, scratch code, not committed) settled feasibility:

| Measurement | ClearScript V8 7.5.1.1 | Jint 4.17.0 |
|---|---|---|
| Bundle load | 137 ms | ~600 ms |
| Warm render | 0.18 ms | ~2.1 ms |
| Byte-identical to Node (built-ins, group+theme+hint diagnostics, invoice/weather/x-post templates) | yes | yes |
| `new Intl.NumberFormat("fr-CA", {style:"currency", currency:"CAD"})` | `1 234,50 $` (= Node) | `1 234,50 CA$` |
| `URL` global | absent | absent |

- **Bundle:** the probe bundled the render path (handlers, list tools, authoring guide,
  app template, `registerTemplate`) with esbuild as a neutral IIFE: ~116 KB minified,
  ~40 KB gzipped, including a URL polyfill (core-js 3.45.1).
- **C# SDK fit:** results deserialized into `ModelContextProtocol` 2.2.0's
  `CallToolResult` with `McpJsonUtilities.DefaultOptions` and round-tripped.
  `ModelContextProtocol.Extensions.Apps` 2.2.0 provides `McpAppUiAttribute`,
  `WithMcpApps()`, `McpApps.GetUiCapability()`, `McpApps.HtmlMimeType` and
  `McpUiResourceMeta.Csp.ResourceDomains`, which covers what `server.ts` uses from
  ext-apps.
- **Gaps found:**
  - Core uses the WHATWG `URL` global (`actions/validate.ts`, `actions/execute.ts`,
    `contract/urls.ts`). Without it, http-action templates are refused at registration
    (loud), and `looksLikeImageUrl` silently answers false, so image URLs render as
    text (quiet).
  - `server/guide.ts` and `store/validate.ts` reach `DEFAULT_LIMITS` in
    `store/types.ts`, which imports `node:crypto` at module scope. The probe had to stub
    `node:*`.

## Goals / Non-Goals

**Goals:**
- A .NET host that serves widgentic with output byte-identical to the Node path, proven
  by a shared conformance corpus rather than by review.
- Zero restatement: every agent-facing text and every validation rule stays in TypeScript
  and reaches .NET as data.
- An idiomatic C# surface: `WithWidgentic(...)` on the SDK builder, tool selection as a
  flags enum, a DI renderer for the host's own tools, and widgets as designer-exported
  JSON files.
- A host bundle that any embedded engine can run, not only .NET.

**Non-Goals:**
- Actions (`execute_action`, `load`, `list_actions`), the SSRF-guarded fetch in C#, and
  server-side image inlining. These are the follow-up change; see "Actions later" below.
- Per-principal catalogs, stores, API keys, secrets, the authoring HTTP surface.
- Jint or any second engine, `net8.0`, Alpine/musl images.
- Adopting the package in a specific .NET project (downstream, after the first publish).

## Decisions

### D1. Embed the TypeScript engine; do not port it
The render path runs unchanged in an embedded engine, so a port would buy nothing and
cost about 13k lines of second implementation. That includes the template validator
(tag denylist, URL scheme allowlist, node budget), which must never diverge between
languages.
- *Alternatives:*
  - A Node sidecar, with .NET acting as an MCP client and proxying: full fidelity, but
    a Node 22 runtime in every .NET deployment plus process supervision.
  - Rendering inside the iframe, with core bundled into the template: tiny .NET side,
    but the agent never learns that its payload was invalid, and non-Apps hosts get
    only JSON.
  - A second MCP server beside the .NET one: zero code, but data crosses the model
    twice and the .NET tools never render their own results.

  The sidecar stays the named fallback if the native V8 dependency proves unacceptable
  somewhere.

### D2. ClearScript V8, not Jint
- *Parity:* Jint's `Intl` is built on .NET globalization and already diverges from
  browsers for `fr-CA` currency, a locale a Canadian deployment cannot treat as an edge
  case. V8 ships the same ICU-based `Intl` as Node and the browsers that render the
  designer preview.
- *Speed:* V8 is about 10× faster per render and about 4× faster to load.
- *Cost:* native binaries per runtime ID and an isolate per pooled runtime.

There is no public engine abstraction. The conformance corpus is the gate any future
engine would have to pass, so the seam can be added when a second engine has a reason
to exist.

### D3. `./host` is one ES module, exported like the designer's browser bundle
`@widgentic/mcp` gains `"./host": { "types": "./dist/host/index.d.ts", "default":
"./dist/host/widgentic-host.js" }`, mirroring `@widgentic/designer`'s `./browser`. The
types come from `tsc` over `src/host/index.ts`, and the default is an esbuild bundle:
`format: "esm"`, `platform: "neutral"`, `target: "es2022"`, minified, no imports left.

- *Loading in .NET:* ClearScript evaluates the file as a standard module through a
  minimal loader that imports `createWidgenticHost` and keeps the host object inside
  the engine. Nothing is assigned to the global object.
- *Loading in the bare-realm test:* evaluating ESM in Node's `vm` would need
  `--experimental-vm-modules`, so the test runs the built file through esbuild's
  `transform` (IIFE, local `globalName`) and evaluates it in `vm.createContext({})`.
  The transform rewrites only the export syntax.
- *Fallback:* if ClearScript module loading misbehaves, the bundle script also emits an
  IIFE variant from the same entry.

### D4. Strings across the boundary, one generic `call`
The facade takes and returns JSON strings: `createWidgenticHost(configJson)`, then
`version`, `problems`, `definitions`, `call(name, argsJson, slim)`, `appTemplate` and
`widgetPage(kind)`.
- Strings are what MCP carries anyway.
- They make conformance a byte comparison.
- They keep ClearScript's host-object marshalling, and its lifetime and threading
  pitfalls, out of the design entirely.

The extra parse/serialize per call is inside the measured 0.18 ms. A single `call`
dispatch keeps the facade from growing a method per tool. An unknown name returns
`UNKNOWN_TOOL` as a result.

### D5. `URL` through an esbuild `inject` shim, platform first
The bundle injects
`export const URL = typeof globalThis.URL === "function" ? globalThis.URL : PolyfillURL`
(and the same for `URLSearchParams`). The polyfill comes from `core-js-pure`, exact-pinned
as a devDependency.
- Every `URL` reference in the bundled code resolves to the shim. No global is created
  or patched.
- Node and browsers keep their native implementation. Only engines without one use the
  polyfill.
- *Why not in-house:* URL parsing guards the scheme allowlist, and a hand-rolled parser
  is where allowlist bypasses come from. That outweighs "build in-house".
- *Why not .NET `Uri` exposed from the host:* it is not WHATWG-conformant (different
  normalization), and it would put a .NET object inside the engine (D10).
- *Named fallback:* `whatwg-url`, the reference implementation. It is larger and needs
  `TextEncoder`/`TextDecoder` shims.

### D6. Render-only through existing seams
- **Http actions:** templates are compiled with `httpDisabled: "unresolved"`, an
  existing reason that the existing bridge already shows as "This action is not
  available.".
- **`load`:** the facade passes no action source, so `handleRenderWidget` emits no
  `load` or `loads`.
- **Definitions:** they omit `execute_action` and `list_actions`.
- **Prompt actions** need no server, since the bridge sends `ui/message`, so they work
  unchanged.
- *Alternative:* a new `"unsupported"` disabled reason with its own text. Rejected,
  because it changes core and the bridge for a temporary state, and the existing
  wording is accurate.
- *Why `list_actions` is withheld rather than served empty:* it exists for authoring
  and binding shared actions, and advertising actions that only ever render disabled
  would steer agents wrong.

### D7. Store limits move to a Node-free module
`StoreLimits`, `DEFAULT_LIMITS` and `SAFE_IDENTIFIER` move to `store/limits.ts`.
`types.ts` and `validate.ts` import from it and keep re-exporting the same names, so the
exports snapshot does not change and no consumer changes. `guide.ts` imports from
`store/limits.ts` directly instead of the barrel.

The boundary check walks the STATIC import graph from `src/host/index.ts`. A `node:`
import anywhere in that graph fails the gate even if esbuild would tree-shake it, which
is exactly how the stray `node:crypto` survived into the probe bundle.

### D8. Validation in the bundle; startup failure in .NET
The facade validates each entry with `checkStoredWidget`, `checkStoredTheme` and the
schema check from `store/validate.ts`, plus the reserved-name rules. It skips invalid
entries and reports them through `problems()`, which matches the store's
"skipped with a diagnostic" read behavior.

The .NET side treats any problem as fatal at startup (`WidgenticConfigurationException`,
listing every problem with its file path). In-process configuration is the operator's
compiled-in setup, which is the same reasoning that makes `registerTemplate` throw. A
widget's `load` binding is accepted and logged once as inactive (D6).

### D9. Tools registered dynamically from `definitions()`
- **Registration:** each tool is an `McpServerTool` built from the bundle's definition.
  Its `ProtocolTool` carries the bundle's `Name`, `Description` and `InputSchema`
  (`JsonElement`), and `render_widget` gets `McpApps.SetAppUi(..., new McpUiToolMeta
  { ResourceUri = AppTemplateUri })`.
- **Invocation:** the handler forwards the raw arguments JSON to the pool's `call` and
  deserializes the result with `McpJsonUtilities.DefaultOptions`.
- **Selection:** a `[Flags] WidgenticTools` maps one-to-one to tool names. That table
  is the only place C# names a tool, and a startup self-check fails if a flag names a
  tool missing from `definitions()` or a definition has no flag. Bundle drift therefore
  shows up as a test failure, never as a silently missing tool.
- **Slimming:** comes from `McpApps.GetUiCapability(server.ClientCapabilities)` when the
  session negotiated, else from `WidgenticOptions.AssumeUi`.
- **Resources:** `ui://widgentic/app.html` is always registered, with
  `McpUiResourceMeta { Csp = { ResourceDomains } }` when domains are configured. The
  page template follows `IncludeWidgetPages`.

### D10. A bounded pool of isolated V8 runtimes
- **Shape:** N runtimes (default `min(ProcessorCount, 4)`), each `new V8Runtime(constraints)`
  with one engine created with `V8ScriptEngineFlags.DisableGlobalMembers` and no
  `AddHostObject` or `AddHostType` call, so script can reach no .NET type, file or
  socket.
- **Acquisition:** callers take a runtime through a `Channel<V8Lease>`, so one call
  holds one runtime.
- **Startup:** runtimes are created eagerly and in parallel at startup (~140 ms each),
  so configuration problems surface before the first request. The bundle is compiled
  with V8 code caching to cut per-runtime cost.
- **Limits:** a per-call timer calls `engine.Interrupt()` at `CallTimeout`. Heap limits
  come from `V8RuntimeConstraints`. A timed-out or failed runtime is disposed and
  replaced in the background, and the call returns `ENGINE_TIMEOUT` or
  `ENGINE_FAILURE` as an `isError` result.
- **Tenancy:** reusing a realm across requests is safe because templates are data with
  no expressions (no caller code ever executes) and the facade keeps no per-call state.
  The value-format `WeakMap` caches locale/currency configuration keyed by compiled spec
  objects, never payload data. A test renders A then B and compares with a fresh
  runtime.
- **Testing the timeout:** the test drives it with an `internal` test hook that makes
  `call` spin, available only to the test assembly via `InternalsVisibleTo`.

### D11. `IWidgenticRenderer` for the host's own tools
`IWidgenticRenderer` is a singleton with
`Render(WidgetRenderRequest request, McpServer? session)`, and `WidgetRenderRequest`
carries `Widget`, `Data` (`JsonNode?`), `Hints`, `Meta`, `Format` and `Theme`. It
serializes to the `render_widget` arguments and goes through the same `call`, so a host
tool's result is the `render_widget` result by construction.

`WidgenticResources.AppTemplateUri` is a public constant for
`[McpAppUi(ResourceUri = ...)]`. Its value is checked against the bundle's definitions
at startup, so it is a mirror under test, not an unverified copy. Slim output keeps the
payload block, so the model still sees data that came from the .NET backend.

### D12. What the NuGet package embeds, and how releases prove it
- **The pin:** `dotnet/Directory.Build.props` carries `<WidgenticMcpVersion>`.
- **Dev and CI:** the build embeds the workspace artifact
  `packages/mcp/dist/host/widgentic-host.js`, so `npm run build` runs before
  `dotnet build`. An MSBuild target fails with a clear message if the file is missing.
- **Release:** `release-dotnet.yml` fetches the registry tarball of the pinned version,
  extracts `package/dist/host/widgentic-host.js`, and refuses to publish unless its
  SHA-256 equals the workspace build's. That guarantees the NuGet embeds exactly a
  published, provenance-attested npm artifact. In practice, release the npm package
  first, then bump the pin. esbuild output is deterministic for identical sources and
  pinned versions, which is what makes the comparison meaningful.
- **Identity:** `WidgenticEngineInfo.BundleVersion` reads `version()` from the bundle
  itself (D4), and `BundleSha256` is computed from the embedded bytes. No version string
  is restated in C#.

### D13. One conformance corpus, four checks
`tools/conformance-generate.ts` (`npm run conformance:generate`) writes
`packages/mcp/src/host/__tests__/conformance.json`, holding config plus
`[{ name, call, args, slim, output }]`, and the sample's seed
(`dotnet/samples/Widgentic.Sample.Stdio/seed/{widgets,themes,schemas}/*.json`) from
`examples/docker/seed/demo.json`, one file per entry. Reference outputs come from the facade source running in
Node, with native `URL` and Node's ICU. The four checks:
1. The facade's output equals the direct handler output for the same catalog. The
   facade is a pass-through.
2. The committed corpus equals a fresh in-memory generation. The corpus cannot go
   stale.
3. The built bundle in a bare realm equals the corpus.
4. The .NET suite equals the corpus.

Every corpus case is a named test, so a failure names its input.

### D14. Layout and gates
```
dotnet/
  Widgentic.slnx  Directory.Build.props  Directory.Packages.props (exact versions)  README.md  CHANGELOG.md  LICENSE
  src/Widgentic.Mcp/                       options, flags, builder extension, renderer, engine pool, bundle loader
  tests/Widgentic.Mcp.Tests/               conformance, protocol round trip, selection, config, pool, no-egress,
                                           slimming, sample (both transports), package
  samples/Widgentic.Sample.Stdio/          stdio or HTTP server + generated seed/{widgets,themes,schemas} + one host tool
```
`ci.yml` gains a `dotnet` job (ubuntu-latest, Node and .NET 10): `npm ci`,
`npm run build`, then `dotnet test --solution Widgentic.slnx` from `dotnet/`. The repository gate in CLAUDE.md
adds `dotnet test` when `dotnet/` or the host bundle changes.

`release-dotnet.yml` runs on `main` pushes touching `dotnet/**`, and on manual dispatch.
It builds, tests, verifies the pin (D12) and packs. It publishes only when the
repository variable `NUGET_PUBLISH` is `true` and that version is not on nuget.org yet,
using NuGet trusted publishing (`NuGet/login`, OIDC, short-lived key), and attests the
`.nupkg` with `actions/attest-build-provenance`. Named fallback if trusted publishing is
unavailable for the account: an API-key secret scoped to push `Widgentic.Mcp` only, with
expiry.

### D15. The CLAUDE.md wording
"Two repositories, not five" is the title of D1 in `2026-08-27-package-split-readiness`,
which rejected one repository per package. Out of that context it reads as a riddle,
especially once a second language arrives. The replacement says what it means: exactly two
repositories, this public one holding every package, every language host (`dotnet/`) and
the examples, and the private `widgentic/apps`. Never one repository per package or per
language. The layout, commands, boundaries, gotchas and release sections gain the .NET
lines (D12, D14).

### Apply-time decisions (recorded while implementing)

- **A1. `Buffer` in the store validators.** `store/validate.ts` measured entry size with
  `Buffer.byteLength`. In a bare realm, the `try/catch` around it would have quietly turned
  every entry into `TOO_LARGE`. It now counts UTF-8 bytes by code point, with a lone
  surrogate counting 3, the same as `Buffer` does for its U+FFFD replacement. The host-graph
  boundary check flags `Buffer`, `process` and `require` at any depth, so this cannot come
  back.
- **A2. Composition has a synchronous core.** The facade needs composition's exact
  semantics (`dataSchemaRef` resolution, limits, duplicate kinds, unknown-action warnings)
  but cannot await. `composeCatalogEntries` and `composeThemeEntries` now hold the logic and
  return structured `ComposeProblem`s. `composeCatalog` and `composeThemes` read the store,
  delegate, and format the problems into the same diagnostic lines as before (the store
  tests pin them). The cores stay internal to the package, so the exports snapshot is
  unchanged. The host lists refusals only: unknown-action warnings are dropped because
  every http action is disabled in the host anyway.
- **A3. Two more synchronous seams in `server/handlers.ts`.**
  - `listSchemasResult(schemas)` sits under the async `handleListSchemas`.
  - `renderWidgetPage(catalog, kind)` is now shared by `server.ts` and the host, so the
    preview page cannot drift.
  - `unknownToolResult` adds `UNKNOWN_TOOL` to the handlers' error vocabulary.
- **A4. core-js writes a global even in its pure build.** Its shared store lives on
  `globalThis.__core-js_shared__`. The bundle resolves `internals/shared-store` to a
  module-local object through an esbuild plugin (`scripts/host-core-js-store.cjs`). The
  bare-realm test compares the realm's global names before and after a full corpus run,
  so a core-js upgrade that writes elsewhere fails the gate.
- **A5. Bundle size.** 168 KB minified (58 KB gzipped): about 60 KB of server modules (the
  guide and the app template), about 48 KB of core-js's pure URL (it carries its own
  internal polyfills), and the rest is core. This is irrelevant for an embedded resource,
  and V8 compiles it once per pooled runtime (D10).
- **A6. The staleness check lives in `tools/conformance.test.ts`.** A package test may
  not import from `tools/` (boundary rule), and the generator is tooling. The bare-realm
  test stays next to the host.
- **A7. The repository gate runs on Windows.**
  - `tools/boundaries.test.ts` compared `relative()` output against `/`-joined prefixes,
    which failed for every file on Windows (679 false violations on a clean tree). It now
    uses a `repoPath()` helper.
  - `tools/pack-check.mjs` started `npm`/`npx` with `execFileSync`, which cannot launch
    `.cmd` shims. It now uses a shell on Windows only.
- **A8. `IWidgenticRenderer.RenderAsync`, not `Render`.** A call leases a runtime from the
  pool, which is asynchronous, and the SDK's tool methods are commonly async. The spec
  delta names `RenderAsync` accordingly; its behavior is unchanged.
- **A9. Quirks of the C# SDK's MCP Apps helpers (2.2.0), matched to the Node assembly.**
  - The whole Apps API is experimental (`MCPEXP003`), suppressed in each project. The
    README tells consumers that `[McpAppUi]` needs the same suppression.
  - `McpApps.SetResourceUi` writes only the resource-template view, which `resources/list`
    never shows for a fixed URI. The CSP meta therefore goes through
    `McpServerResourceCreateOptions.Meta`, serialized from the SDK's own
    `McpUiResourceMeta` so its shape stays the SDK's.
  - `McpApps.SetAppUi` writes `_meta.ui.resourceUri` but not the legacy
    `_meta["ui/resourceUri"]` that the TypeScript helper also writes. The package adds it
    to `render_widget` so both servers declare the same keys.
- **A10. The host bundle names its documents.** C# needs the app template URI as a
  compile-time constant (for `[McpAppUi]`), and the spec requires it be checked against the
  bundle. The facade gained `resources()` (name, URI or URI template, MIME type,
  description). Those values moved into `APP_TEMPLATE_RESOURCE` and `WIDGET_PAGE_RESOURCE`
  in `server/definitions.ts`, which `server.ts` now registers from too, so the resource
  texts are restated nowhere. The constants stay internal; the exports snapshot is
  unchanged.
- **A11. Tests run on Microsoft.Testing.Platform.** On the .NET 10 SDK, xunit.v3 4.x no
  longer runs through VSTest. `dotnet/global.json` opts in, `Microsoft.NET.Test.Sdk` and
  the VSTest adapter are gone, and `dotnet test` runs from `dotnet/`
  (`--solution Widgentic.slnx`). CI and the release workflow set that working directory.
- **A13. Publishing only from `main`, in an environment.** A nuget.org trusted-publishing
  policy cannot restrict branches, so a manually dispatched run from a feature branch
  could have published once `NUGET_PUBLISH` was on. The workflow is now two jobs.
  `package` runs everywhere: test, pack, pin check (fatal only when the run would
  publish), and upload. `publish` runs only on `main`, in the GitHub environment
  `nuget`, and it alone holds `id-token: write`. The policy's Environment field names
  `nuget`, and the environment's deployment branches allow `main` only, so nuget.org
  refuses a token from anywhere else.
- **A12. The pin check reads the tarball itself.** `tools/verify-host-pin.mjs` extracts
  the one file with `zlib` and a ustar reader instead of the platform's `tar`. Git Bash's
  GNU tar reads `C:` as a remote host. Verified on a locally packed tarball (the bundle
  found, its hash equal to the workspace build's), and against the registry for `0.7.0`
  (predates the bundle) and `0.8.0` (not published).

- **A14. Merging the rendering-app-template change and the 0.8.0 release (2026-10-08).**
  - **Release:** `@widgentic/mcp` 0.8.0 shipped without `./host`, so this change
    releases in 0.9.0. `WidgenticMcpVersion` moves to `0.9.0`, and the pin check
    reports 0.8.0 as predating the bundle.
  - **The preview tool:** main added the app-only `preview_widget`. It is pure
    (partial-data render, never fetches) and synchronous, so the host serves it
    through `handlePreviewWidget`, marked `visibility: ["app"]` from the new
    `APP_ONLY_VISIBILITY` constant that `server.ts` uses too.
  - **In .NET**, `preview_widget` is `render_widget`'s companion:
    `WidgenticToolNames.CompanionOf` maps it to `RenderWidget`, it is registered
    exactly when that flag is, and the startup self-check counts companions.
    Previews are not rate-limited in the package. The Node assembly limits them at
    its HTTP edge, and a .NET host serving HTTP does the same with ASP.NET Core's
    rate limiting; the engine pool already bounds concurrency.
  - **Corpus:** it gains nine preview cases and was regenerated. Only the
    authoring guide and the app template had drifted from main's changes; render
    outputs for the existing inputs were unchanged.

- **A15. The NuGet version follows its bundle's minor (owner decision, 2026-10-08).**
  `Widgentic.Mcp` X.Y.* embeds `@widgentic/mcp` X.Y.*: the first release is 0.9.0, not
  0.1.0, and the patch stays free for .NET-only fixes. The number then answers "which Node
  server does this behave like" without opening `WidgenticEngineInfo`. Remaining
  differences are scope (render-only) and the schema spelling noted in the README, never
  version skew.
  - An MSBuild target (`WidgenticRequireAlignedVersion`) fails every build whose major.minor
    disagrees with `WidgenticMcpVersion`, so a pin bump forces the version bump.
  - *Alternatives:* independent versioning from 0.1.0, where parity is visible only through
    the pin; or exact lockstep, where a .NET-only fix would need a four-part version.

- **A16. HTTP for the sample, and stateless capabilities (2026-10-08).**
  - **Why HTTP:** the owner recalls Claude not showing widgets for a stdio server; MCP Apps
    hosts that take a URL (Claude's custom connectors, VS Code) are where widgets mount. So
    the sample also serves Streamable HTTP with `--http`. Stdio stays the executable's
    default, both modes share one registration, and the HTTP server binds loopback because
    the sample has no authentication. The committed launch profiles make `dotnet run` and F5
    start HTTP on port 3002: the mode the owner verified live in Claude, VS Code Copilot and
    ChatGPT.
  - **The finding:** C# SDK 2.2.0 serves HTTP stateless by default (MCP 2026-07-28,
    SEP-2567). A probe showed that such clients send their capabilities in every request's
    `_meta["io.modelcontextprotocol/clientCapabilities"]` while `McpServer.ClientCapabilities`
    stays null. Slimming therefore read nothing and fell back to `AssumeUi`, so an MCP Apps host
    over HTTP got the full HTML in model context.
  - **The fix:** slimming reads the session's capabilities, else the request's own, else
    `AssumeUi`, using the SDK's `MetaKeys.ClientCapabilities`. `IWidgenticRenderer` gains a
    `RequestContext` overload so host tools see the same capabilities. The sample sets
    `SessionMode = StatefulForInitializeClients`, which the SDK does not mark obsolete, so
    hosts still on the initialize-based 2025-11-25 revision keep a session that remembers
    theirs. The sample's HTTP test drives all three clients.
  - **The Node side:** the TypeScript SDK (1.31) still negotiates at most 2025-11-25, so the
    Node assembly is unaffected for now; BACKLOG records the follow-up for when it moves.

- **A17. The sample serves the docker demo seed (owner request, 2026-10-09).** The sample
  now serves what the self-host demo serves: the seed's widgets, themes and shared
  schemas, written per entry by the generator and guarded by the staleness test.
  - **Helpers:** `AddThemesFromDirectory` and `AddSchemasFromDirectory` join
    `AddWidgetsFromDirectory` and share one directory reader, and the sample loads all
    three. The seed's widgets reference shared schemas by name, so the sample also
    shows the reference resolving end to end.
  - **Actions:** the generator skips the seed's shared actions, since a render-only host
    serves none.
  - **Tests:** those that need the old example widgets' features (the weather `load`
    binding, http and prompt actions) use the conformance corpus's configuration, which
    still carries them.

## Risks / Trade-offs

- **[ICU/CLDR drift between Node's ICU and ClearScript's V8 build]** A future locale data
  update could change a formatted string on one side. → The corpus includes non-English
  locales. A drift fails CI on the first run after an upgrade, not in production, and
  the fix is a pinned toolchain pair recorded in TESTING.md.
- **[core-js URL vs native WHATWG on edge cases (IDN, odd ports, encoded paths)]** →
  Corpus URL cases cover the allowlist paths, links, image detection and action URLs.
  Divergence triggers the D5 fallback.
- **[Native V8 footprint and platform coverage]** No musl/Alpine runtime, and each
  isolate costs memory. → The README documents the supported RIDs and Debian-based
  images (`mcr.microsoft.com/dotnet/aspnet:10.0`). Isolate memory is measured during
  apply and recorded in TESTING.md. The pool size is configurable.
- **[V8 security lag]** ClearScript ships V8 behind upstream. → Only our own bundle runs,
  templates are data, and no host object is exposed (D10). ClearScript is exact-pinned
  and bumped deliberately.
- **[Hidden tools still named in agent texts]** The authoring guide and some messages
  mention `list_widgets` even if a host hides it. → This is the host's choice, documented
  in the README. `render_widget` errors already list the available kinds, so recovery
  never depends on a hidden tool.
- **[C# SDK API churn (2.x)]** → Exact versions in `Directory.Packages.props`, and
  dependency floors in the nuspec. The protocol round-trip tests catch breaks on bump.
- **[Release ordering]** The NuGet package cannot ship ahead of an npm release that
  changes the bundle. → Accepted on purpose (D12). It is the same "release here, bump
  there" protocol the apps repository follows.
- **[Images on strict hosts]** Without inlining, external images do not show in hosts
  whose sandbox blocks them unless their host is declared. → Documented. Declaring the
  operator's image CDN in `ResourceDomains` covers the common case. Inlining arrives with
  the guarded fetch.

## Actions later (the follow-up change, effort as assessed for this proposal)

Adding actions is roughly as much work again as this change, and almost all of the extra
is security-critical C#:
1. **Upstream:** split `handleExecuteAction` into a pure prepare step (scope check,
   argument validation, built request with secret placeholders) and a complete step
   (fold the JSON response, re-render, redact), so a host without Node performs the
   fetch itself.
2. **C# guarded fetch:** public https only, DNS resolution with private-address
   rejection that re-checks embedded IPv4 in mapped IPv6 (the `BlockList` gotcha), a
   connection pinned to the vetted address (`SocketsHttpHandler.ConnectCallback`), no
   redirects, 8 s, 256 KiB, JSON only. It needs a test suite mirroring
   `guarded-fetch.ts`'s.
3. **`execute_action` and `load`:** app-only visibility, the `execute` scope gate,
   secret resolution by name, rate limiting.
4. **Image inlining:** reuses item 2 and walks the render tree.

A BACKLOG.md entry records this with its origin.

## Migration Plan

Additive only. Order:
1. Land the `@widgentic/mcp` changes and the `.changeset`.
2. Release `@widgentic/mcp` (minor).
3. Set the .NET pin to that version.
4. Complete the owner setup ([USER] items below).
5. Set `NUGET_PUBLISH=true` and publish `Widgentic.Mcp` 0.9.0.

Rollback: unlist the NuGet version (nuget.org cannot delete). The npm `./host` entry is
additive and needs no rollback.

## Open Questions

- [USER] Create the nuget.org account or organization `widgentic`, request reservation of
  the `Widgentic.` ID prefix, and add a trusted-publishing policy for `widgentic/widgentic`
  → `release-dotnet.yml`. Then set the repository variable `NUGET_PUBLISH` (GitHub →
  repository Settings → Secrets and variables → Actions → Variables) and the nuget.org
  profile name variable the login step needs.
- [USER] Confirm the package ID `Widgentic.Mcp` (the namespace follows it).
- ~~Exact ClearScript package composition.~~ Resolved during apply.
  `Microsoft.ClearScript.V8` brings only the managed engine, `ClearScript.Core` and
  `V8.ICUData`, which is the ICU data that makes `Intl` match Node. Each native runtime is
  its own `Microsoft.ClearScript.V8.Native.<rid>` package (about 40 MB unpacked), and the
  package references the four in D10. Apps publish with `-r <rid>` so only theirs ships.
