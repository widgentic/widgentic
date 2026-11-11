## Why

Adding the widgentic MCP endpoint to a host today means creating an API key in the app, copying it, and pasting it into a header or a `?key=` URL. A host that is given the bare URL connects silently to the built-in catalog, so a person who expected their own widgets gets no prompt and no explanation. MCP hosts already implement the OAuth authorization flow of the MCP specification: a `401` with a challenge makes them open a sign-in window. Using it turns "add the URL" into the whole setup.

## What Changes

- **BREAKING** — The MCP endpoint of the self-host example (and, through the follow-up apps change, of mcp.widgentic.dev) requires a credential. A request with no credential, an unknown or revoked API key, or an invalid or expired access token is answered `401` with a `WWW-Authenticate: Bearer` challenge naming the protected-resource metadata. Today such a request is served the built-in catalog.
- The built-in catalog moves to a second path, `/mcp/public`, which never challenges and never resolves a credential. Hosts that used the endpoint with no key change their URL to it.
- API keys keep working unchanged on the protected path (`x-api-key` header or `?key=`).
- A new `@widgentic/mcp/oauth` entry carries both halves of the flow:
  - the resource side: the protected-resource metadata document, the challenge header and bearer extraction;
  - the authorization surface: authorization-server metadata, client registration, the authorize and consent step, the token endpoint (authorization code with PKCE, rotating refresh tokens) and revocation. Like the authoring surface, it is transport-agnostic and the host resolves who is signed in.
- The consent step is where a person **selects one of their API keys or creates one**. The grant is bound to that key: it carries the key's scopes and stops working when the key is revoked.
- A person who does not sign in can choose **Continue without an account** and receives a token that resolves to the anonymous principal — the built-in catalog — so a failed or declined login still leaves a working connection.
- The key listing of the authoring surface names the applications connected through each key (the client's own name, when it connected and last refreshed), and the example's Keys section shows them. Managing connections one by one stays out of scope: revoking the key is the control.
- The stores gain access grants: tokens and authorization codes are held as digests, access-token resolution is one point read, and revoking a key ends its grants.
- The self-host example mounts the authorization surface on its authoring app (its existing identity modes decide who is signed in) and protects its MCP endpoint, which also makes the staging deployment the rig for host probes.
- Out of scope here and queued: the apps repository adopts the release in its own change (`widgentic-app`); a separate connected-apps section with per-connection revocation; scope step-up; the .NET host (ASP.NET hosts use their own authorization stack).

## Capabilities

### New Capabilities
- `mcp-authorization`: the OAuth resource-side helpers and the authorization surface a host mounts to sign MCP hosts in, published behind `@widgentic/mcp/oauth`.

### Modified Capabilities
- `mcp-server`: per-request principal resolution accepts an access token beside an API key; an unresolvable credential is a challenge on a protected endpoint; the public endpoint serves the anonymous catalog.
- `widget-store`: access grants bound to keys — digest-only tokens and codes, point-read token resolution, rotation, and revocation that follows the key.
- `self-host-example`: the MCP service protects `/mcp` and serves `/mcp/public`; the authoring app mounts the authorization surface and forwards the protected-resource metadata when it fronts the MCP service; an unknown key no longer degrades to the anonymous catalog.
- `authoring-api`: the key listing carries each key's live connections.
- `package-distribution`: `@widgentic/mcp` gains the `./oauth` entry, and `mcp-authorization` maps to `@widgentic/mcp`.

## Impact

- **Code**: `packages/mcp/src/oauth/` (new), `packages/mcp/src/store/` (grant port, four adapters, limits, key revocation), `packages/mcp/src/authoring/` (key listing), `packages/mcp/package.json` exports, `tools/exports.test.ts` (21 entries), `tools/boundaries.test.ts` (entry list), `examples/docker/` (MCP service, app routes, proxy, README), `examples/shared/` if the consent page reuses the page palette.
- **Persisted shape**: new record kinds only (grants, token digests, authorization codes). Existing key, principal and entry records are read unchanged; an old-shape regression test covers a store written before this change.
- **APIs**: no change to the nine MCP tools, the tool descriptions or the host bundle. The conformance corpus is unaffected.
- **Dependencies**: none added; hashing and sealing use `node:crypto`, client metadata documents go through the existing guarded fetch.
- **Docs**: `packages/mcp/README.md`, `examples/docker/README.md`, the docs site (connect pages, a new authorization page), `TESTING.md` (protocol smoke and host registration snippets), `CLAUDE.md` product invariants (the "never an error" line), `BACKLOG.md`.
- **Release**: `@widgentic/mcp` minor (0.16.0) with a changeset stating the example's breaking change; `Widgentic.Mcp` follows with a pin bump only. The apps repository then adopts it: authorization routes on widgentic.dev over its session, `401` and `/mcp/public` on mcp.widgentic.dev, and the announcement to keyless users.
