## Context

`@widgentic/mcp/sdk` wires the SDK-free handlers onto the MCP TypeScript SDK 1.31 and ext-apps 1.7. SDK 2.x is a different package set, and it shares no classes or types with 1.x. Only 2.x serves protocol revision 2026-07-28, and ext-apps 2.x requires it. The upstream guides this design follows are the SDK's `docs/migration/upgrade-to-v2.md` and `support-2026-07-28.md`, and ext-apps' `docs/migrate-to-2.md`.

The assembly decides slimming in `oninitialized`, from `getClientCapabilities()`. On 2026-07-28 neither exists: no request ever runs `initialize`, and each request carries the client's identity and capabilities in its `_meta` envelope. `Widgentic.Mcp` hit the same gap on the C# SDK and fixed it there (`dotnet-host` design A16). This change brings the Node side to the same behavior.

## Goals / Non-Goals

**Goals:**
- Move every Node host in this repository to SDK 2.x and ext-apps 2.x.
- Serve both protocol eras from one assembly.
- Slim correctly for 2026-07-28 requests.

**Non-Goals:**
- Supporting SDK 1.x side by side.
- Multi-round-trip (`inputRequired`) flows: no widgentic tool asks the client for input.
- `subscriptions/listen` change notifications: tool and resource lists are fixed per request.
- Replacing the zod input schemas with `fromJsonSchema` over the exported JSON Schemas. That is attractive ("derived, never restated"), but it changes how arguments are validated, so it gets its own change.
- The apps repository's adoption. It consumes the published release.

## Decisions

### D1. 2.x only, released as a minor

The 1.x and 2.x SDKs share no classes. Supporting both would mean two assemblies behind two entries, and the host's transport has to match its SDK anyway. So `@widgentic/mcp` peers on `@modelcontextprotocol/server` `^2.3.0` and drops `@modelcontextprotocol/sdk`.
- `^2.3.0` is the line whose serving entries and `@modelcontextprotocol/node` 2.1 adapter we build and test against; the node adapter itself peers on server `^2.3.0`.
- ext-apps goes to `^2`. zod goes to `^4.2.0`, because 2.x needs Standard JSON Schema (`~standard.jsonSchema`), which zod gained in 4.2.
- This is breaking for `./sdk` consumers. Under 0.x it ships as a minor (0.10.0), and the changeset says so.
- `Widgentic.Mcp` keeps its 0.9 pin: its bundle has no SDK.

### D2. Slimming per call: session, then request, then environment

```
capabilities = server.getClientCapabilities()        // 2025 era, after initialize
            ?? requestEnvelopeCapabilities(ctx)      // 2026-07-28, every request
slim = capabilities ? hasAppsUi(capabilities) : WIDGENTIC_ASSUME_UI
```

- The precedence is `Widgentic.Mcp`'s. The two sources never co-occur: a 2026-07-28 connection never initializes, and a 2025-era request carries no envelope. The order only fixes what a malformed mix would do.
- `WIDGENTIC_ASSUME_UI` keeps its meaning: a fallback only for calls that reveal nothing. Stateless 2025-era HTTP is the one real case, because the serving entry builds a fresh instance that never saw `initialize`.
- The decision moves from a closure that `oninitialized` set to a read inside the `render_widget` handler. The handler sees `ctx`, and a per-call read cannot go stale. `oninitialized` keeps only its log line, for 2025-era sessions.
- **The log line reports only what is known** (found on staging). Over stateless HTTP, the `initialized` notification reaches a fresh instance that never saw `initialize`. So the line said "host lacks the UI capability" for every session, Apps hosts included; that was already true on 1.x. It is now written only when the instance holds negotiated capabilities, and it stays silent over stateless HTTP.
- **Reading the envelope.** The SDK lifts the reserved keys into `ctx.mcpReq.envelope`. Its published declaration bundle flattens `RequestMetaEnvelope` to `{}`, so the key cannot be typed through it. The assembly narrows with `isPlainObject` and reads `CLIENT_CAPABILITIES_META_KEY` (`io.modelcontextprotocol/clientCapabilities`). `getUiCapability` from ext-apps then decides as before.

### D3. HTTP through `createMcpHandler`, behind our own edge

`examples/docker/mcp.ts` keeps its `node:http` server, because the edge does work the SDK entry does not:
- CORS,
- `/healthz`,
- the body cap with the JSON-RPC `413`,
- API-key resolution and per-request composition.

The `/mcp` path then goes to one module-level `createMcpHandler(factory)`, wrapped with `toNodeHandler`, and receives the already-read body as `parsedBody`.
- The factory is async and receives the inbound `Request`. It reads the key from the `x-api-key` header or `?key=`, resolves the principal, composes, and returns `createWidgenticServer(...)`. This is exactly what the per-request code did before.
- **Response shapes.** The service used to answer every request with JSON (`enableJsonResponse: true`), and nothing records why. The SDK entry's defaults are kept instead:
  - **2026-07-28:** `responseMode: "auto"` answers JSON unless a tool emits a notification before its result, which no widgentic tool does. `"json"` would add nothing but a startup warning.
  - **2025-era:** the stateless legacy fallback (`legacy: 'stateless'`, the default) answers with a single-event SSE stream. The fallback has no JSON option. Keeping JSON would take a hand-wired legacy route beside the entry (`isLegacyRequest`, plus a `WebStandardStreamableHTTPServerTransport` with `enableJsonResponse`). The Streamable HTTP spec requires clients to accept both shapes, and the `curl … | grep` recipes read either, so the hand-wiring is not worth carrying.
  - Hosts are retested after the apps deploy all the same.
- CORS adds `Mcp-Method` and `Mcp-Name` to the allowed headers. 2026-07-28 requests send them, and browser hosts would otherwise fail preflight. Browser clients skip `Mcp-Param-*` mirroring, so those need no listing.
- **Considered and rejected:** `createMcpExpressApp`, which would add Express as a dependency of the example for one route.

### D4. stdio through `serveStdio`

A `McpServer` connected directly to a stdio transport speaks only the 2025 era. `serveStdio(() => createWidgenticServer(...))` from `@modelcontextprotocol/server/stdio` pins one instance per connection, choosing the era from the opening exchange. The example's compiled-in catalog is built once and closed over.

### D5. Input schemas wrapped in `z.object`

2.x still accepts raw zod shapes, but deprecates them. The existing shapes are wrapped in `z.object(...)`, and the descriptions still come from `definitions.ts`.

Task 2.4 compared `tools/list` from the published 0.9.0 (SDK 1.31) with this assembly's. Names, descriptions, `_meta` and every property, type and description are identical. The one difference is the `$schema` the SDK's emitter stamps on the three zod-backed tools: 2.x declares JSON Schema 2020-12 (`https://json-schema.org/draft/2020-12/schema`) where 1.x declared draft-07. 2020-12 is MCP's default dialect, and nothing in the schemas uses a construct whose meaning differs between the two.

### D6. Tests reach both eras in process

- **2025 era:** `InMemoryTransport.createLinkedPair()` connects 2025-era instances only. The existing in-memory tests keep that path.
- **2026-07-28:** a `Client` pinned with `versionNegotiation: { mode: { pin: "2026-07-28" } }` connects through `StreamableHTTPClientTransport`, whose `fetch` calls `createMcpHandler(...).fetch` directly. Nothing listens on a socket.
- The slimming scenarios run on both paths. The stateless 2025 case runs through the same handler with the default (legacy) client.

### D7. A guard against the 1.x SDK

`mint` (docs tooling) depends on `@modelcontextprotocol/sdk` 1.x, so the package stays in `node_modules`. A forgotten 1.x import would still resolve and typecheck. `tools/boundaries.test.ts` therefore fails on any workspace source importing `@modelcontextprotocol/sdk`.

## Risks / Trade-offs

- **Unknown tools change shape.** A 2.x `McpServer` answers `tools/call` to an unregistered tool with JSON-RPC `-32602` instead of an `isError` result. No widgentic requirement covers unknown tools on the Node assembly (the host bundle's `UNKNOWN_TOOL` result is separate), so this is accepted as the SDK's behavior.
- **Consumers must migrate.** Hosts on `./sdk` must move to 2.x transports to take 0.10. The changeset gives the mapping, and the README examples show it.
- **`example-image` is red until the release.** It installs `@widgentic/mcp` from npm, and 0.9.0 still imports 1.x. This is the same pattern every Version Packages PR shows.
- **2026-07-28 hosts are new.** Live behavior is probed on staging before release, per the verification standard: the demo runs this branch's packed packages, and the hosts already hold its deployment key.
- **2025-era HTTP clients now receive SSE** (D3). This is spec-compliant, and a host that mishandled it would surface in the staging retest. The demo's web container proxies `/mcp` with every header forwarded and the response streamed unbuffered, so the 2026-07-28 standard headers and SSE reach both sides intact. The fallback is the hand-wired JSON legacy route described in D3.

## Migration Plan

1. This change: the packages, the examples, the docs, and a changeset (minor `@widgentic/mcp`).
2. Stage the branch (`selfhost-staging`), from the monorepo checkout of this branch:
   - build `Dockerfile.source` with `az acr build`, tagged `widgentic-selfhost:mcp-sdk-v2-<sha>`;
   - deploy it to `demo.widgentic.dev` with the apps repo's `infra/selfhost.bicep`;
   - retest claude.ai or Claude Desktop, VS Code Copilot and ChatGPT in fresh conversations, through the deployment key the hosts already hold.
3. `/opsx:verify` → `/opsx:archive` → PR → merge.
4. Release: the Version Packages PR, then publish 0.10.0.
5. Apps production: a change in `widgentic/apps` bumps `@widgentic/*` to the release and moves its own SDK dependency to 2.x. It migrates `apps/mcp-server/http.ts` to `createMcpHandler` the same way, deploys a new `vNN`, and reads the served bytes.

## Open Questions

None.
