## Why

widgentic already has a human half and an agent half that never meet on the same
screen: agents learn the authoring contract through MCP tools and draft widget, theme,
schema and action JSON; people paste that JSON into a designer, fix it, and save. WebMCP
(webmachinelearning/webmcp — an experimental W3C standard shipping in ChatGPT Desktop's
browser and behind a flag / origin trial in Chrome 149+ and Edge 150) lets a PAGE register
tools that a browser-side agent calls under the visiting person's own session. Registering
the mounted designers as WebMCP tools closes the loop: the agent drafts INTO the designer
the person is looking at, sees the same diagnostics the person sees, iterates, the person
saves — and the saved widget is served to agents over the MCP endpoint on the next call.
Co-author here, consume there. The OpenAI WebMCP Challenge closes 2026-09-03 13:00 PT
(15:00 Bogotá), so the first cut ships as a small, explicitly BETA package plus the
self-host example deployed as the live URL, rather than as a change to the designers.

## What Changes

- **A fourth public package, `@widgentic/webmcp` (beta).** Browser-safe, zero runtime
  dependencies, depends on `@widgentic/core` and `@widgentic/designer`. It turns designer
  handles into WebMCP tool descriptors and registers them on the page's model context
  (`document.modelContext`, falling back to `navigator.modelContext`), doing nothing —
  never throwing — when no agent-capable browser is present. It targets the native API
  shape and never bundles a polyfill; a host that wants extension-based agents loads one
  (e.g. `@mcp-b/webmcp-polyfill`, which defers to native) before the one call, and the
  package finds it.
- **Designer tools, prefix-configurable (default `widgentic_`).** Widget designer: get the
  draft (definition + diagnostics, read-only), load a definition, set example data, set the
  preview theme tokens. Theme designer: get / load the entry, merge tokens into it. Schema
  designer and action designer: get / load. One reference tool lists the `--wg-*` theme
  tokens from the exported specs (read-only). Tool descriptions steer the agent
  (shapes, the diagnostics it gets back, "the person saves").
- **Handles resolve at call time** through host-supplied getters (hosts remount designers
  per tab); a getter returning nothing yields a structured "not mounted" result, not an
  exception. Every result is MCP-shaped text content; errors are results, never rejections,
  except the browser's own abort.
- **No save tool ships.** Agents change the draft; the person saves through the host, as
  today. Hosts that want more register their own tools through the same helper.
- **The self-host example is the reference host and the challenge's live URL.** Its
  authoring app registers the tools (getters open the section and return the live handle,
  shared with the designer demo through `examples/shared`), shows an "agent tools"
  status, and can serve a Chrome origin-trial token from the environment. Its web service
  gains an optional reverse proxy of `/mcp` to the MCP service so ONE public origin
  serves both — what a single-domain self-host needs, and what a single Azure Container
  App with two containers needs. The image's import smoke includes the new entry.
- **The designer demo (`examples/designer`) registers the same tools** — it is the
  flag-Chrome rig for the package's real-browser check. Its static build is NOT part of
  this change (scope cut: the live URL is the self-host example).
- **Bookkeeping**: package-distribution grows to four packages (edge `webmcp → core,
  designer`; boundaries test, exports snapshot, pack-check, root `tsconfig` paths, vitest
  alias/project, build order); `@widgentic/webmcp` starts at 0.1.0 OUTSIDE the linked
  release group with beta stated in its description and README; README capability/package
  rows, a docs page, and a `TESTING.md` recipe for a real Chrome
  (`--enable-features=WebMCPTesting,DevToolsWebMCPSupport`, `navigator.modelContextTesting`).

Not breaking: nothing in the existing packages changes behavior; the designer package is
consumed through its public handle types only. Sequencing matters: the image installs from
the registry, so `@widgentic/webmcp@0.1.0` is released BEFORE the example image is built
and deployed; widgentic.dev adopts after the same release (apps repo).

## Capabilities

### New Capabilities

- `designer-webmcp`: the mounted designers exposed as WebMCP tools — descriptors, result
  shape, registration/feature-detection/disposal, handle resolution, and the
  "agents edit, people save" boundary.

### Modified Capabilities

- `package-distribution`: "Three public packages with fixed contents" becomes four;
  "Package boundaries are enforced at the source" gains the `webmcp → core, designer`
  edge; "Runtime targets are explicit" adds webmcp to the browser-safe set;
  "Dependencies are declared honestly" states webmcp's two dependencies; "Versions move
  together and are attested" excludes webmcp from the linked group; "Capabilities map to
  packages" maps `designer-webmcp` to `@widgentic/webmcp`.
- `self-host-example`: "One image, two services, one store" gains the optional `/mcp`
  reverse proxy behind `WIDGENTIC_MCP_UPSTREAM`; "The app mounts the authoring surface
  and the designers" registers the WebMCP tools and the optional origin-trial token;
  "The image consumes published packages" adds `@widgentic/webmcp`.

## Impact

- New: `packages/webmcp/` (manifest, `tsconfig.build.json`, `src/index.ts`, tool modules,
  `__tests__/`, README, LICENSE copy); `.changeset/*` minor entry for `@widgentic/webmcp`.
- Tooling: `tools/boundaries.test.ts` (PACKAGES, ALLOWED_EDGES, BROWSER_SAFE, honest-deps
  assertion), `tools/exports.test.ts` (+1 entry and snapshot), `tools/pack-check.mjs`,
  root `tsconfig.json` paths, `vitest.config.ts` alias + project, root `build` script.
- Examples: `examples/shared/webmcp.ts` (getter wiring), `examples/docker`
  (`main.ts` registers, `web.ts` proxy + origin-trial meta, `index.html` status line,
  Dockerfile smoke, manifest, README), `examples/designer` (registers, manifest).
- Docs: root README capability + package rows, `packages/webmcp/README.md`, a `docs/`
  page ("Co-author with a browser agent"), `TESTING.md` (entries table, Chrome recipe,
  verification-log entry), `CLAUDE.md` layout/boundaries lines.
- Downstream (apps repo, after release): widgentic.dev adds the call beside its four
  designer mounts and bumps the range; the example is deployed as a second container
  app in the existing environment (infra + RUNBOOK) — not tasks of this change.
