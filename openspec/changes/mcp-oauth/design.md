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
- **Staging needs its public origin.** The example derives the issuer and the resource from `WIDGENTIC_PUBLIC_URL`; the staging template (apps repository, `infra/selfhost.bicep`) gained a `publicUrl` parameter that sets it on both containers, with `https://demo.widgentic.dev` in the params template. It landed as its own apps pull request (`feature/selfhost-public-url`, apps #23), ahead of the adoption change, because staging needs it now.
- **Staging after the host legs.** With all three hosts done, staging was moved off the logging build to the branch itself: image `mcp-oauth-071711b`, revision `--0000044`, ACR run `cj4a`, served bytes re-checked. Every deploy empties the store and so signs hosts out; everyday staging connectors stay on the deployment key, which survives deploys, and a bare-URL connector is added only to test sign-in.

### D12 results — claude.ai (2026-11-12, staging `--0000043`, owner's session plus the staging log)

1. **A `401` is detected at add time.** The connector dialog probes the URL and preselects "sign in now" for `/mcp` and "no sign-in" for `/mcp/public`. It also offers "sign in when needed" (connect without credentials, sign in when the server asks), which a server that challenges every request never reaches.
2. **Client metadata document, not registration.** The default is Claude's published identity: `client_id` `https://claude.ai/oauth/mcp-oauth-client-metadata`, redirect `https://claude.ai/api/mcp/auth_callback`. The registration route was never called. The dialog offers registration and a pre-registered client as alternatives.
3. **Client id length** is therefore 49 characters; the sealed-id question does not arise on this host's default path.
4. **`resource` is sent** on the authorize request and again on both token requests. The path form of the protected-resource metadata is read first, then the authorization-server metadata. It asks for every scope in `scopes_supported` (`read execute`).
5. **No fallback.** After the key was revoked the next call presented the access token (`401 invalid_token`), tried the refresh token (`invalid_grant`) and the connector showed "Reconnect"; widgets in existing conversations stop rendering until it is reconnected, as their frames are read through the connector.

Nothing here contradicts D7 or the specs.

### D12 results — ChatGPT desktop (2026-11-20, staging `--0000043`, owner's session plus the staging log)

The client is `codex-mcp-client` (0.169.1, then 0.171.0-alpha.13).

1. **Sign-in works from the bare URL.** Every connection starts with an unauthenticated `GET /mcp` (protocol 2024-11-05), which is challenged, followed by the path-form metadata and the authorization-server metadata.
2. **Client metadata document, not registration**: `client_id` `https://chatgpt.com/oauth/codex/client.json`, with a loopback redirect on a fresh port each time (`http://127.0.0.1:<port>/callback`) — the loopback port rule is what admits it. Registration was never called.
3. **Client id length** 43.
4. **`resource` is sent** on authorize and on both token requests; it asks for `read execute`, and repeats `scope` on the refresh.
5. **A revoked grant is not surfaced to the person.** After the key was revoked the refresh was answered `invalid_grant` and every later call `401 invalid_token`; the server served nothing until the person signed in again (no `served` line in that window). The host neither prompted nor reported the failure: in a new conversation the model answered a "list widgets" request from other knowledge, citing a web page, and it read like a built-in catalog. Signing in again from the connector's settings restored the person's widgets. This is host behavior; the server cannot make the host prompt.

Nothing here contradicts D7 or the specs.

### D12 results — VS Code Copilot (2026-11-20, VS Code 1.147.0, staging `--0000043`, owner's session plus the staging log)

1. **Sign-in is deferred to first use.** The server is challenged when a prompt first needs it; VS Code then asks "wants to authenticate to demo.widgentic.dev" before opening the browser.
2. **Client metadata document, not registration**: `client_id` `https://vscode.dev/oauth/client-metadata.json`, redirect `http://127.0.0.1:33418/`. Registration was never called.
3. **Client id length** 45.
4. **`resource` is sent** on authorize and on the token request; it asks for `read execute`. The path form of the metadata is read first.
5. **A revoked grant prompts again.** The next call presented the token, got `401 invalid_token`, and VS Code asked to authenticate again without trying the refresh token.

### D12 conclusion

All three hosts complete the flow from the bare URL, and all three present a client metadata document: dynamic registration and the sealed client id (D7) were exercised only by the tests and by the scripted staging run, never by a host. Both stay — the MCP specification still names registration, and other clients use it — and no host finding called for a change to the specs or the code. The hosts differ only in what they do with a revoked grant: claude.ai offers "Reconnect", VS Code prompts again, ChatGPT stays silent.

### D15 — Review findings (PR #70, 2026-11-20)

An independent review found no critical issue and ten findings; nine were fixed and one is recorded.

- **A failed `revokeKey` could not be finished** (Cosmos returned early on an already revoked key). The fan-out now runs every time.
- **Rotation did not look at the key.** It does now, and ends the grant when the key is no longer live, so a grant that a failed or racing revocation left behind ends at its next refresh.
- **A refresh token superseded two rotations ago was `unknown`, not a replay**, because only the last superseded record was kept. Superseded records now stay until their own expiry (at most one per rotation, swept by expiry in every adapter); `endGrant` still removes the grant's current and previous ones, and an older one whose grant is gone resolves to `unknown`.
- **Parallel rotations could strand an access token** that no later revocation would find. The grant is now replaced conditionally (`replaceGrant`: a compare in memory, one transaction in SQLite, `IfMatch` in Cosmos); the loser removes what it minted and starts over, and the old access token is removed before the new pair is issued, so a failure part-way costs a refresh and never leaves a token nothing can end.
- **A used code could end its grant forever, from anyone who later learned it.** Expiry is now checked first: past sixty seconds a code is `unknown` and ends nothing.
- **A second exchange racing the first could not end a grant that was not written yet.** The loser marks the code; the winner re-reads it after writing and ends its own grant. Under a race both callers may therefore be refused — the right outcome for a code presented twice.
- **The surface logged a failing component's message verbatim**, and the test that claimed to cover it read the wrong log. Failures are logged by kind; the Cosmos grant-path reads go through the same error mapping as the writes; the test reads the failing surface's own log.
- **`OPTIONS` on a path the surface does not own was answered `405`** when the core was mounted ahead of a host's routes. It answers nothing for any path that is not its own.
- **The memory adapter never dropped expired token records.** It sweeps on write, like SQLite.
- **Automatic error redirects made the origin an open redirector** (anyone can register a client, then link a victim to a failing authorize request). Validation failures are now an error page with a link back, labelled unverified; nothing redirects before a person acts. This revises the requirement "The authorize step validates before it shows anything". Hosts lose the automatic error callback for a malformed request, which none of the three hosts sends.

Recorded, not changed: a Cosmos container without time-to-live keeps expired token and code records until someone enables it. The hosted deployment's `keys` container gets time-to-live in the apps change; the adapter never relies on it.

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
