## Context

See `proposal.md` for the motivation. The constraints that shape the approach:

- The MCP service holds a **read-only** store handle (by type in the example, by RBAC in production). Whatever validates a token must be a read.
- The authoring side already owns identity (a session in production, a fixed principal or a trusted header in the example) and the write role. The authoring surface is built so that "the host resolves the principal; the surface never does".
- Keys are digests with scopes fixed at creation; `execute` is opt-in per key because credentials travel into prompt-injectable hosts. There is no agent write path.
- No caches, per-request composition; zero runtime dependencies; `@widgentic/mcp` base must import with no optional peer installed.
- The owner decided (2026-11-11): the bare endpoint returns `401` by default, the built-in catalog moves to another path, and breaking keyless users is accepted.
- An MCP host starts the flow only on a `401` carrying a challenge. It then reads the protected-resource metadata (RFC 9728), the authorization-server metadata (RFC 8414), registers (RFC 7591) or presents a client metadata document, and runs authorization code with PKCE and a `resource` parameter (RFC 8707). How each of our three hosts behaves in detail is unprobed (D12).

## Goals / Non-Goals

**Goals:**

- "Add the URL" is the whole setup on a host that implements MCP authorization; a person picks or creates the key in the browser.
- The resource service stays read-only and adds one point read per request at most.
- No write that an unauthenticated visitor can cause.
- One implementation that the example and the hosted app both mount.

**Non-Goals:**

- Signing people in. No identity provider, password, session or cookie code enters the package.
- OpenID Connect (no ID token, no `userinfo`), confidential clients, client secrets, the device or client-credentials grants.
- A separate connected-apps section with per-connection revocation, scope step-up on `FORBIDDEN_SCOPE`, and per-tool scopes — queued in `BACKLOG.md`. The key list names what is connected (D14); the key is the control.
- The .NET host: ASP.NET hosts have their own authorization stack; `Widgentic.Mcp` only takes the pin bump.
- The hosted app's wiring (session return address, Bicep, landing copy) — the apps repository's own change.

## Decisions

### D1 — The authoring side is the authorization server; the MCP service is only a resource server

The app has the identity and the write role; the MCP service has neither and must not gain them. Alternatives: an authorization server inside the MCP service (needs a write role and a sign-in there — rejected); delegating to the identity provider as the authorization server (Entra External ID cannot express "bind to one of my widgentic keys", GitHub sign-in is not behind it, and the self-host example has no provider at all — rejected).

### D2 — Both halves ship in `@widgentic/mcp` behind `./oauth`

The authoring surface was first written in the apps repository and later extracted (0.4.0); this starts where that ended. The surface is a function over a decoded request plus a Node adapter, constructed with `{ issuer, resources, secret, store, resolvePrincipal, signIn, log }`. One entry, not two: the resource helpers are three pure functions and would not justify a subpath. The base entry does not re-export it. Alternative: app-only implementation — rejected because the example (and therefore staging and every self-hoster) would have no flow, and the two hosts would diverge.

### D3 — Tokens are opaque and resolved by digest, not JWTs

Access tokens `wga_…`, refresh tokens `wgr_…`, codes `wgc_…`: 32 random bytes, hex, stored as `sha256:` digests like keys. The token's own record carries everything resolution needs — principal id, scopes, resource, expiry — so resolution is one point read (Cosmos: `keys` container, id = partition = digest, `type: "access"`). Alternative: signed JWTs validated offline — rejected: a signing key would have to be shared or published, revocation would need a list or a store read anyway, and a per-request point read is what key resolution already costs.

### D4 — Revocation fans out at write time

Because the read is a single record, anything that ends a grant must remove or stamp that grant's token records when it happens: rotation, grant revocation, key revocation, the grant limit and code replay all do it in the writer. The grant record (`grant:<id>` in the principal's partition) lists the digests of its current tokens so the writer can find them without a query across partitions. `revokeKey` gains the fan-out in all three writable adapters. Alternative: check the key and grant on every resolution — two more reads per request, rejected.

### D5 — A separate port, so `WidgetStore` is unchanged

`AccessGrantStore` (`resolveAccessToken(token, { resource })`) and `WritableAccessGrantStore` are new interfaces the adapters also implement. `WidgetStore` and `resolvePrincipal` keep their shape, so a host's own store implementation still compiles, and the long "Store programmatic surface" requirement is untouched. Prefixes keep the two credentials apart: `resolvePrincipal` refuses `wga_`, `resolveAccessToken` refuses `wgk_`.

### D6 — The grant is bound to an API key; a key created at consent is never shown

This is the owner's shape ("select/create an API key"): the key is the unit of scope and revocation people already manage, so a grant inherits both and needs no second permission model. A key created at consent has its raw value discarded — the host never needs it, and showing a secret inside an authorization popup trains people to copy secrets out of popups. It appears in the key list by name (default: the client's name) and revoking it disconnects the host. Alternatives: grants with their own scopes, independent of keys (a second concept to list and revoke — rejected for now); showing the new raw key once (rejected as above).

### D7 — Nothing an unauthenticated visitor does is stored

Open registration and an anonymous choice would otherwise be free writes.

- **Clients**: a registered `client_id` is `wgd_` + the registered metadata (name, redirect URIs, issue time) + an HMAC under the surface's secret. A URL `client_id` is fetched per request through the guarded fetch. Neither is stored.
- **Anonymous codes**: the code is the sealed request (client, redirect, challenge, expiry), verified by the token endpoint. Replaying one yields another anonymous token, which is worth nothing.
- **Anonymous tokens**: a fixed prefix `wgn_` plus random bytes; it resolves to the anonymous principal by form alone, never expires and has no refresh token. It grants exactly what `/mcp/public` grants to anyone.
- **Signed-in codes and grants** are stored, by a person who is signed in.

Consequence: the secret must be stable across restarts and replicas (it is a required option; the example derives it from the KEK with a fixed label through HKDF so no new setting is needed). Rotating it invalidates registered clients, which re-register on the next `invalid_client`.

Alternative: stored clients with a time-to-live and a rate limit — more state, an abuse surface, and a cleanup job; rejected.

### D8 — One-hour access tokens, thirty-day sliding refresh, rotation with a sixty-second grace

Short access tokens bound the damage of a token leaked from a host; rotation detects a stolen refresh token. Hosts refresh from several tabs or retry on a dropped response, so the previous refresh token is honored for sixty seconds; after that it is a replay and ends the grant. Alternative: long-lived access tokens with no refresh — simpler, rejected because a leaked token would live until someone noticed.

### D9 — The challenge rule and the public path

On the protected path the edge reads, in order: `x-api-key`, `?key=`, then `Authorization: Bearer`. Nothing presented, or nothing resolved, is `401` with the challenge; no server is constructed. An unknown key is challenged too: once the endpoint challenges at all, "garbage key means built-ins" would be a way around the door and would hide a revoked key from its owner. The JSON-RPC error body names the public URL and the key header, so a host without the flow shows something actionable.

`/mcp/public` builds the anonymous server and reads no credential. Ignoring a presented key there (instead of honoring it) keeps the path's meaning exact and keeps a mistyped URL from silently looking like a working key.

The path is the host's choice; the package fixes only the helpers. The metadata is served at `/.well-known/oauth-protected-resource/mcp` and at the root form, since hosts differ in which they try first.

This revises the product invariant "anonymous/unknown keys degrade to the built-in catalog, never to an error" to: the public endpoint never errors; a protected endpoint challenges. `CLAUDE.md` is updated with the change.

### D10 — Pages are server-rendered, script-free where possible, and sealed

The surface serves three pages: sign-in choice, consent, error. They carry inline styles under a hashed CSP, no external resource, `frame-ancestors 'none'`, `no-store`. The consent form posts to `/oauth/authorize/decision` with a token sealed under the secret that binds principal id + the exact request parameters + a ten-minute expiry; this is the CSRF defence and it needs no cookie, so the surface stays free of session code. Client name and redirect host are printed as text and labelled unverified, because registration is open. A host that wants its own look passes a `renderPage` option; the default is complete.

Redirect URIs: `https`, loopback `http` (any port at authorize time, per RFC 8252), or a private-use scheme; a denylist of script-like schemes applies to all.

### D11 — The example is the first consumer and the probe rig

`examples/docker` mounts the surface in the app under `/oauth/*` and `/.well-known/oauth-authorization-server`, resolves the principal through `identity.ts` (single mode: always signed in; trusted header: the header or nobody), protects `/mcp`, serves `/mcp/public`, and — when it fronts the MCP service — forwards the protected-resource metadata path. Staging (the self-host demo) therefore exercises the real flow with real hosts before any release.

### D12 — Host behavior is probed first, on staging, with a logging stub

Before the surface is built, a probe branch (never merged) deploys to staging a `401` challenge, both metadata documents and stub `register` / `authorize` routes that log what arrives and answer registration with a long sealed `client_id`. It answers, per host (claude.ai, ChatGPT, VS Code Copilot):

1. Does a `401` on an already-added keyless connector prompt for sign-in, or just fail?
2. Registration or a metadata-document `client_id`? Which redirect URIs?
3. Is a `client_id` of several hundred characters carried through intact?
4. Is `resource` sent, and which metadata URL is requested first?
5. Does the host fall back to anything when the window is closed?

Results are recorded here as a revision. Findings that contradict D7 (for example a host that truncates long client ids) switch that decision to stored clients before the surface is written, not after.

### D13 — Scopes map one to one

OAuth scopes are the existing `read` and `execute`. The grant's scopes are the key's, narrowed by a requested `scope`; `read` is always present. `FORBIDDEN_SCOPE` stays a tool result; no `insufficient_scope` step-up in this change.

### D14 — The key list names its connections; it does not manage them

A selected key would otherwise give no sign that a host is using it, and revoking a key disconnects hosts the person cannot see. `GET /keys` therefore joins the principal's live grants onto its keys: `connections: [{ clientName, createdAt, lastUsedAt }]`. The join happens in the authoring handler from `listKeys` and the grant port's listing (two single-partition reads), not in `listKeys` itself, so `StoredKey` and the adapters' key code are unchanged. The authoring deps take the grant reader as an optional member; without it the field is omitted, so a host on a custom store keeps working. `clientName` is client-supplied: it is capped at registration (80 characters), returned as data, and every UI prints it as text with a "reported by the application" note. `lastUsedAt` is the last refresh — resolution is read-only, so per-request use is not recorded. The key list lives in the hosts (the example's `main.ts`, the hosted app), not in the designer package, so the example gains the line here and the hosted app gains it in its own change. Alternative: a full connections section with per-grant revoke — a new route, a new UI section and a second revocation concept; deferred.

### Revisions during apply

- **No key limit exists.** The proposal's scenario "The key limit is reported, not bypassed" assumed a per-principal key limit; the stores have none (`StoreLimits` bounds entries, not keys). The scenario now uses the refusals `createKey` does have — `INVALID_KEY_NAME` and `INVALID_SCOPES`. Adding a key limit is a separate decision and is not part of this change.

- **The grant rules live once, in `store/grants.ts`.** Each adapter supplies nine record primitives (`GrantBackend`) and the rotation, replay, eviction and fan-out rules are shared, so the three writable adapters cannot drift. The port exposes one `exchangeAuthorizationCode(code, matches)` instead of separate "consume" and "create grant" calls: the caller's check sees the code's binding before it is consumed, so a wrong verifier does not burn a code, and the claim is one conditional write (SQLite `UPDATE … WHERE used_at IS NULL`, Cosmos `IfMatch`).
- **`StoreLimits.maxGrants` is optional** (unset means 50), so a host that builds its own complete limits object keeps compiling.
- **SQLite keeps `user_version` 1.** The two grant tables are created with `IF NOT EXISTS` on every open; the version that wrote an older file can still open it afterwards.
- **Cosmos key queries exclude typed documents.** Token and code records share the `keys` container and carry `principalId` and `keyId`, so `listKeys`, `revokeKey` and key lookup filter on `NOT IS_DEFINED(c.type)` and again in code.

- **The challenge rule is a package helper.** `resolveCredential(presented, resolvers)` in `./oauth` holds "a key decides when presented, then a bearer token, anything unresolved is a challenge", so the example and the hosted server cannot drift on it. It takes the host's own resolvers; it reads no request and no store.
- **The example's edge and sign-in wiring are their own modules** (`mcp-edge.ts`, `sign-in.ts`, `oauth-config.ts`) because `mcp.ts` and `web.ts` listen when imported; the tests run the real wiring on local servers. The principal travels from the edge to the SDK's per-request server factory through `AsyncLocalStorage`, so the credential is resolved once, before the handler.
- **`WIDGENTIC_MCP_PUBLIC_URL` defaults to `<WIDGENTIC_PUBLIC_URL>/mcp` unconditionally.** The MCP container cannot know whether the app fronts it; one rule in both services keeps the issuer and the resource in agreement.
- **The example's cross-site guard lets the host-facing routes through** (metadata, registration, token, revocation): hosts call them from other origins and they carry no ambient credential of the app's page. The consent form's POST stays behind the guard.

- **Hosted-facing docs wait for the hosted server.** The docs site also describes mcp.widgentic.dev, which keeps serving keyless requests until the apps repository adopts this release. Those four pages are updated with that deploy (task 8.3), so the site never describes behavior that is not live.

- **One staging round instead of two.** The stub probe of D12 was deployed first (`mcp-oauth-probe-b134322`, revision `--0000042`) and no host had reached it by the time the surface was written. Staging was then moved to the real flow with the same logging on top (`feature/mcp-oauth-flow-probe`, never merged; image `mcp-oauth-flow-probe-ad2cb8a`, revision `--0000043`, ACR run `cj49`), so the owner's host session answers D12's five questions and the host legs together. The one thing the stub tested that the real flow does not is a 600-character client id: a real sealed id for a typical registration is about 150–250 characters. D7's fallback (stored clients) stays the answer if a host mangles it.
- **Staging needs its public origin.** The example derives the issuer and the resource from `WIDGENTIC_PUBLIC_URL`; the staging template (apps repository, `infra/selfhost.bicep`) gained a `publicUrl` parameter that sets it on both containers, with `https://demo.widgentic.dev` in the params template. That edit sits uncommitted on the apps branch `feature/selfhost-public-url` and belongs to the apps adoption change.

## Risks / Trade-offs

- **A host does not react to `401` on an existing connector** → people see a broken connector. Mitigation: D12 measures it; the error body names the fix; the hosted rollout is announced and the app's connect page shows the two URLs.
- **Closing the sign-in window leaves the host unconnected** — the protocol gives the server no way to degrade. Mitigation: the anonymous choice is on the first page, and `/mcp/public` exists. Stated in the docs rather than hidden.
- **Open registration invites look-alike client names** → consent shows the redirect host beside the name and labels both unverified; exact redirect matching; PKCE mandatory.
- **A sealed `client_id` is long** → D12 item 3; fallback is stored clients behind the same port.
- **Refresh races end a grant** → the sixty-second grace; a grant that ends is recovered by signing in again, nothing is lost.
- **Write fan-out is not transactional in Cosmos** (grant record and token records live in different partitions) → writes are ordered so a failure leaves a token that expires within the hour, never a grant that cannot be revoked: new token records are written before the grant points at them, old ones are deleted after.
- **Abandoned records** (codes never exchanged, expired tokens) → every such record carries its expiry and, in Cosmos, a `ttl`; resolution never trusts the TTL. SQLite deletes expired rows on write. The hosted `keys` container needs time-to-live enabled — an apps-repository infra task.
- **The secret leaks** → an attacker can forge client registrations and anonymous codes, neither of which grants access to a principal; signed-in codes and tokens are random and stored. Rotation is a restart.
- **The example's single-principal mode has no sign-in**, so anyone who can reach the app can connect a host as the principal. This is that mode's existing trust statement (localhost or a trusted network); the README repeats it beside the new URLs.

## Migration Plan

1. Probe on staging (D12); revise this document.
2. Land the package and example work on `feature/mcp-oauth` → staging; deploy the branch to staging; run the host legs there.
3. Release `@widgentic/mcp` 0.16.0 (changeset names the example's breaking change); `Widgentic.Mcp` 0.16.0 follows with the pin bump and a changelog line saying nothing in the bundle changed.
4. Apps repository, its own change: mount the surface on widgentic.dev over the session (sign-in gains a sealed same-origin return address), protect mcp.widgentic.dev `/mcp`, add `/mcp/public`, add the secret and the container time-to-live in Bicep, update the landing and connect copy, announce, deploy on the owner's word.
5. Rollback: the edge change is one switch in each host (protect on or off); turning it off restores today's behavior while grants and tokens remain valid for when it is turned back on. No stored record needs undoing.

## Open Questions

- Whether the hosted app shows consent-created keys differently from pasted ones in its key list (a label only; decided in the apps change).
- The copy of the `401` error body and of the three pages — drafted during apply, reviewed by the owner on staging.
