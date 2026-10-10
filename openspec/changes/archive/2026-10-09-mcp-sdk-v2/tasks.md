## 1. Dependencies

- [x] 1.1 Root devDependencies: remove `@modelcontextprotocol/sdk`. Add `@modelcontextprotocol/server` 2.3.1, `@modelcontextprotocol/client` 2.3.1 and `@modelcontextprotocol/node` 2.1.1, and set `@modelcontextprotocol/ext-apps` 2.0.3 and `zod` 4.6.5, all exact.
- [x] 1.2 `examples/docker`: the same move for its runtime dependencies.
- [x] 1.3 `@widgentic/mcp` peers: `@modelcontextprotocol/server` `^2.3.0`, `@modelcontextprotocol/ext-apps` `^2` and `zod` `^4.2.0`, all optional. `@modelcontextprotocol/sdk` is removed (D1).

## 2. Server assembly

- [x] 2.1 `server.ts`: import from `@modelcontextprotocol/server`, and wrap the input shapes with `z.object` (D5).
- [x] 2.2 Slimming per call in `render_widget`: the session's capabilities, else the request envelope's, else `WIDGENTIC_ASSUME_UI` (D2). `oninitialized` keeps only its log line.
- [x] 2.3 The module header describes current behavior: both eras, and the slimming precedence.
- [x] 2.4 Check that the wire `inputSchema` of every tool is unchanged against the 0.9 listing. Only `$schema` differs: JSON Schema 2020-12 instead of draft-07 (design D5).

## 3. Hosts

- [x] 3.1 `examples/mcp-server/main.ts`: `serveStdio` (D4).
- [x] 3.2 `examples/docker/mcp.ts`: `createMcpHandler` with an async factory, `toNodeHandler` and `parsedBody`, plus the CORS standard headers (D3). The SDK's default response shapes are kept; 2025-era responses are now single-event SSE (D3).

## 4. Tests

- [x] 4.1 Move `server-wiring`, `sdk-interop` and `store/isolation` to the 2.x `Client` and `InMemoryTransport`.
- [x] 4.2 2026-07-28 tests through `createMcpHandler`, with a pinned client (D6):
  - an Apps client gets the slim output;
  - a client without UI gets the full output, even with `WIDGENTIC_ASSUME_UI=1`;
  - both eras list the same tools and render the same `structuredContent`.
- [x] 4.3 A stateless 2025-era request through the handler follows `WIDGENTIC_ASSUME_UI`.
- [x] 4.4 Boundary check: no workspace source imports `@modelcontextprotocol/sdk` (D7). The manifest test asserts the new peers.
- [x] 4.5 Smoke-run the stdio and docker examples, with a 2026-07-28 client and a 2025-era client.

## 5. Docs and release

- [x] 5.1 `docs/develop/run-your-own-server.mdx`, the README and the `packages/mcp` README use the 2.x imports and serving entries.
- [x] 5.2 TESTING: host snippets, plus a dated verification-log entry.
- [x] 5.3 BACKLOG: the `fromJsonSchema` follow-up (AGT-4). Remove the untriaged "Node 2026-07-28 capabilities" note, which this change resolves. The apps adoption is tracked in the apps repository, per the backlog's scope rule.
- [x] 5.4 A changeset: a minor `@widgentic/mcp` release, with the migration mapping for `./sdk` hosts.
- [x] 5.5 Gate: typecheck, `npm test`, build, `pack:check` and `openspec validate`.

## 6. Staging (`selfhost-staging`)

- [x] 6.1 Build `Dockerfile.source` locally from this branch. Run it shaped like the demo (the web proxy, the seed, a deployment key) and drive a 2025-era client and a 2026-07-28 Apps client through the proxy. The Docker daemon was down, so the Dockerfile's steps were replayed by hand: pack, the `/srv` layout, the manifest rewrite, `npm install --omit=dev --install-links`, and the import smoke. CI's `selfhost-source-image` builds the real image.
- [x] 6.2 Stage on `demo.widgentic.dev`: `az acr build` of `Dockerfile.source` from this branch, then a `selfhost.bicep` deploy from the apps repo. Read the served bytes per the runbook. Image `mcp-sdk-v2-cc39e7b` is live; both eras answer on the demo, a raw 2026-07-28 Apps request gets the slim output, and the seed and deployment key are active (recorded in the apps RUNBOOK).
- [x] 6.3 Retest the hosts on staging in fresh conversations: Claude, VS Code Copilot and ChatGPT. Record each host's protocol era and output shape in the TESTING log.
  - All three mounted the widgets inline, and Claude's streaming previews worked.
  - Copilot's first call passed `kind` instead of `widget`. It got the SDK's input-validation error, the same as on 0.9.0, and corrected itself; this is noted under AGT-4.
  - All three still speak the 2025 era: the window holds nine `initialize` handshakes, and nothing marks 2026-07-28 traffic.
  - Their `MCP Apps:` log lines all said "lacks the UI capability", because the instance that receives the `initialized` notification never saw `initialize`. The line now stays silent there (design D2), with a test.
