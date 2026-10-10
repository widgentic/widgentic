## Why

The Node assembly is built on the MCP TypeScript SDK 1.x (`@modelcontextprotocol/sdk`) and `@modelcontextprotocol/ext-apps` 1.x. Both lines are superseded. SDK 2.x splits the package (`@modelcontextprotocol/server`, `client`, `core`, `node`, `express`), and only 2.x serves protocol revision 2026-07-28. ext-apps 2.x requires SDK 2.x. Hosts are moving to 2026-07-28, and the .NET host already showed what breaks when they do. A 2026-07-28 request carries the client's capabilities in its own `_meta` envelope and never runs `initialize`. The assembly's slimming reads capabilities only from `initialize`, so an MCP Apps host on 2026-07-28 would get the full HTML in model context (`dotnet-host` design A16).

## What Changes

- **BREAKING** (`@widgentic/mcp/sdk`): `createWidgenticServer` returns an SDK 2.x `McpServer` from `@modelcontextprotocol/server`. The optional peers become `@modelcontextprotocol/server` `^2.3.0`, `@modelcontextprotocol/ext-apps` `^2` and `zod` `^4.2.0`; `@modelcontextprotocol/sdk` is no longer a peer. Hosts must use SDK 2.x transports. The base entry and every other subpath are unchanged. Ships as a minor release (0.x).
- Slimming is decided per call:
  1. the session's negotiated capabilities, when the connection ran `initialize`;
  2. otherwise the capabilities the request carries in `_meta["io.modelcontextprotocol/clientCapabilities"]`;
  3. otherwise `WIDGENTIC_ASSUME_UI`.

  This is the same precedence as `Widgentic.Mcp`.
- One assembly serves both protocol eras through the SDK's serving entries: `createMcpHandler` over HTTP (2026-07-28 per request, 2025-era requests statelessly) and `serveStdio` over stdio.
- The stdio example (`examples/mcp-server`) serves through `serveStdio`.
- The self-hosted example's MCP service (`examples/docker/mcp.ts`) serves through `createMcpHandler` wrapped with `toNodeHandler`. It keeps its own CORS, health probe, body limit and per-request key resolution, and CORS allows the 2026-07-28 standard headers.
- Tool input schemas are `z.object(...)`, since SDK 2.x deprecates raw zod shapes. The wire schemas are unchanged.
- A boundary check fails when any workspace source imports the 1.x SDK. It stays installed transitively through the docs tooling, so a stale import would otherwise still typecheck.
- Docs (`docs/develop/run-your-own-server.mdx`, README, TESTING) move to the 2.x imports.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `mcp-server`:
  - **Capability-aware default output:** slimming also reads a request's own 2026-07-28 capabilities, and is decided per call.
  - **Server assembly is a library export:** the assembly is an SDK 2.x `McpServer` that serves both eras, and no source imports the 1.x SDK.
  - **Runnable server and SDK interoperability:** the stdio example serves both eras.
- `mcp-widget-output`:
  - **Host capability negotiation:** support is advertised in the client's capabilities, at initialization or in a 2026-07-28 request's `_meta`.
- `package-distribution`:
  - **Dependencies are declared honestly:** the optional peers are the SDK 2.x server package, ext-apps 2 and zod 4.2+.

## Impact

- **Code:** `packages/mcp/src/server/server.ts`, its tests (`server-wiring`, `sdk-interop`, `store/isolation`), `examples/mcp-server/main.ts`, `examples/docker/mcp.ts` and `tools/boundaries.test.ts`.
- **Dependencies:**
  - Root devDependencies: the 2.x packages (`server`, `client`, `node`), ext-apps 2.0.3 and zod 4.6.5, exact-pinned. `@modelcontextprotocol/sdk` is removed.
  - The docker example's dependencies move the same way.
- **Consumers:** hosts importing `@widgentic/mcp/sdk` must move to SDK 2.x. Our own deployment (`widgentic/apps`) adopts the release in its own change: bump the `@widgentic/*` ranges and move `apps/mcp-server/http.ts` to `createMcpHandler`.
- **CI:** the `example-image` job installs the published `@widgentic/mcp`, so it fails on this PR and on the Version Packages PR until 0.10.0 is on npm. This is the same pattern every Version Packages PR shows. `selfhost-source-image` builds the self-host image from this branch's packed packages, and is the image check that means something here.
- **Staging:** the branch is staged before release on `demo.widgentic.dev`, built from source (`examples/docker/Dockerfile.source`), and the hosts are retested there (`selfhost-staging`).
- **Not affected:** `Widgentic.Mcp` keeps its 0.9 pin; it embeds the runtime-neutral `./host` bundle, which has no SDK.
