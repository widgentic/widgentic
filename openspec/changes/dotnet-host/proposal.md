## Why

MCP servers written in .NET cannot use widgentic today: the render path, the app template
and the tool definitions ship only in `@widgentic/mcp`, which requires Node 22. Porting the
engine to C# would fork about 13k lines, including the security-critical template validator
and the iframe bridge, and the two copies would drift. A probe (2026-10-08, .NET 10.0.401)
showed this is unnecessary. The existing render path, bundled into one file, runs inside an
embedded V8 (ClearScript) with output byte-identical to Node — built-ins, groups, themes,
hint diagnostics and the example template widgets. The official C# MCP SDK (2.2.0) also
ships the MCP Apps extension (`McpAppUi`, `WithMcpApps`, UI capability detection, CSP
metadata). Two small gaps block it: core relies on the WHATWG `URL` global, which an
embedded engine lacks, and the authoring guide and validators reach a store module that
imports `node:crypto`.

## What Changes

- **A runtime-neutral host bundle in `@widgentic/mcp` (new `./host` entry).** One
  self-contained ES module with no imports. It needs nothing beyond ECMAScript and `Intl`:
  no `node:` modules, no `process`, no `Buffer`, no web APIs. It exports a JSON-in,
  JSON-out host: the tool definitions as data, the list tools, `render_widget` and the
  template's app-only `preview_widget`, the authoring guide, the app template, the
  per-kind preview page, and a render call for a host's own tools. Widgets and themes are passed in the designer's export shapes and
  validated at the door with the same structured codes the store uses. `URL` resolves to
  the platform's implementation when one exists, and otherwise to a bundled,
  spec-compliant implementation. The bundle never mutates globals.
- **Render-only by construction.** A host built from the bundle registers no
  `execute_action` and emits no `load` descriptors. Http actions render disabled with the
  existing "not available" reason. Prompt actions keep working, because the bridge handles
  them in the client. Server-side image inlining is not part of the bundle: images reach
  strict hosts through operator-declared resource domains or as `data:` URIs.
- **Store limits without Node.** `DEFAULT_LIMITS`, `StoreLimits` and `SAFE_IDENTIFIER`
  move into a module with no Node imports. They are still exported under the same names
  from the same entries, so the authoring guide and the store validators load without Node.
- **A conformance corpus.** A generated fixture holds render inputs and the Node path's
  exact outputs: built-ins, groups, themes, errors, hint diagnostics, value formats
  including `fr-CA` currency, URL edge cases and the example template widgets. The default
  gate checks the bundle in a bare JavaScript realm against it, and the .NET tests check
  byte-equality against the same file.
- **`Widgentic.Mcp`, a NuGet package (beta, 0.1.0, `net10.0`) under `dotnet/`.**
  - It embeds the host bundle and runs it on ClearScript V8, chosen for parity with Node
    including `Intl`, using a bounded pool of isolated runtimes.
  - It extends the C# SDK's server builder with `WithWidgentic(...)`. That call registers
    the widgentic tools, with names, descriptions and input schemas read from the bundle
    (never restated in C#). It also registers the app template resource with its MCP Apps
    metadata and CSP resource domains, plus the preview-page resource template, and slims
    model-facing output when the client advertises the Apps capability.
  - The host chooses which tools to expose. The default matches the Node assembly's
    render-side set; any tool can be hidden, including `render_widget` itself.
  - An injectable renderer lets a host's OWN tools return widgentic results and render in
    Apps hosts directly, with no extra `render_widget` round trip.
  - Widgets and themes are loaded from designer-exported JSON.
- **A .NET sample host** (`dotnet/samples`): a stdio server that serves the example
  widgets from JSON generated out of `examples/mcp-server/widgets`, so the definitions are
  derived, never restated.
- **Release and CI.** A NuGet release workflow sits outside the Changesets linked group.
  The package embeds the host bundle from a PUBLISHED `@widgentic/mcp` version and is
  published only from the workflow, with a build-provenance attestation. The CI workflow
  builds and tests the `dotnet/` tree after the npm build.
- **CLAUDE.md wording.** "Two repositories, not five" is reworded to say what it means:
  two repositories (this public one and the private apps), never one per package or
  language. The .NET host lives here under `dotnet/`. The layout, commands, boundaries and
  release sections gain the .NET lines.

Not breaking: no existing entry changes behavior and no export is renamed. `./host` is
additive and the limits move keeps every exported name.

## Capabilities

### New Capabilities

- `dotnet-host`: the .NET host package. It covers the embedded engine and its pool, the
  `WithWidgentic` builder extension and its tool selection, the Apps declaration on the
  C# SDK, the renderer for a host's own tools, widget and theme loading from designer
  JSON, the render-only boundary, parity with the Node path, and the sample host.

### Modified Capabilities

- `mcp-server`: adds "Runtime-neutral host bundle", which covers the `./host` entry, its
  JSON surface, its runtime floor (ECMAScript plus `Intl`, nothing else), the `URL`
  resolution, the render-only configuration and the conformance corpus.
- `package-distribution`:
  - "Three public packages with fixed contents" adds the NuGet package and its contents.
  - "Package boundaries are enforced at the source" adds the `dotnet/` edge: it consumes
    the built host bundle only, never TypeScript sources.
  - "Runtime targets are explicit" adds the host bundle's runtime floor and `net10.0`.
  - "Dependencies are declared honestly" covers the NuGet dependencies and the bundled
    `URL` implementation as build-time only.
  - "Versions move together and are attested" puts the NuGet package outside the linked
    group, embedding a published `@widgentic/mcp`.
  - "Capabilities map to packages" maps `dotnet-host` to `Widgentic.Mcp`.

## Impact

- `packages/mcp`:
  - `src/host/` (facade, `URL` shim, bundle script, `__tests__/` with the bare-realm and
    conformance tests).
  - `src/store/limits.ts`, with imports updated in `types.ts`, `validate.ts`,
    `compose.ts`, `file.ts` and `server/guide.ts`.
  - `package.json`: the `./host` entry, a build step, and an exact-pinned devDependency for
    the bundled `URL` implementation.
  - A changeset (minor) for `@widgentic/mcp`.
- Tooling:
  - `tools/exports.test.ts` (+1 entry and snapshot).
  - `tools/boundaries.test.ts`: the host bundle's module graph must carry no `node:`
    import, and `dotnet/` may reference only the built bundle.
  - `tools/pack-check.mjs` and a conformance generator script.
- New `dotnet/`: `Widgentic.slnx`, `Directory.Build.props`, `Directory.Packages.props`
  with exact versions, `src/Widgentic.Mcp`, `tests/Widgentic.Mcp.Tests`,
  `samples/Widgentic.Sample.Stdio`, a README and a LICENSE copy.
- Workflows: `ci.yml` gains a .NET job, and a new `release-dotnet.yml`.
- Docs: CLAUDE.md (reworded line plus layout, commands, boundaries and release),
  root README package and capability rows, `packages/mcp/README.md` (`./host`),
  `dotnet/README.md`, `TESTING.md` (a .NET recipe and a verification-log entry), and a
  new BACKLOG.md item for .NET actions and image inlining (the C# guarded fetch).
- Owner actions before the first NuGet publish: a nuget.org account or organization,
  reservation of the `Widgentic.` ID prefix, a trusted-publishing policy for
  `release-dotnet.yml`, and the repository variable that enables publishing.
- Downstream: the private apps need nothing. A .NET 10 MCP project adopts the package
  after its first publish, which is not a task of this change.
