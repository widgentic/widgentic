# Tasks — The widgentic.dev App

## 1. The writable port

- [ ] 1.1 `src/store/types.ts`: `WritableWidgetStore extends WidgetStore` — `putWidget`, `deleteWidget`, `putTheme`, `deleteTheme`, `ensurePrincipal(subject, label?)`, `createKey(principalId, name)`, `listKeys(principalId)`, `revokeKey(principalId, keyId)`; `StoredKey` (`{ id, name, createdAt, revokedAt?, digestPreview }` — no raw key, ever)
- [ ] 1.2 `src/store/memory.ts`: implement the write half (validation + limits already there), returning the raw key exactly once from `createKey`
- [ ] 1.3 `src/store/contract.ts`: a reusable contract suite any implementation can be run against (round-trip, delete, limits, invalid-entry rejection, key create → resolve → revoke → unknown)
- [ ] 1.4 Tests: memory store passes the contract suite; a `WidgetStore`-typed handle exposes no write methods (type test)

## 2. Cosmos adapter

- [ ] 2.1 `src/store/cosmos.ts` + `./store/cosmos` export; `@azure/cosmos` and `@azure/identity` as optional peer deps so `./store` stays zero-dep
- [ ] 2.2 `data` container partitioned by `/principalId` (`profile`, `widget:<kind>`, `theme:<name>`); single-partition reads only, no cross-partition queries
- [ ] 2.3 `keys` container partitioned by `/digest`; `resolvePrincipal` as a point read by digest; `revokedAt` treated as unknown
- [ ] 2.4 Same validation, limits, and skip-with-diagnostic behavior as the reference implementations; endpoint + credential construction only, no account key or connection string accepted
- [ ] 2.5 Tests: the contract suite against the Cosmos emulator when available (skipped with a clear message otherwise), plus query-shape assertions (partition key set, cross-partition disabled) that run without a database

## 3. Accounts and sessions

- [ ] 3.1 Entra External ID tenant with GitHub federated in; app registration, redirect URIs for apex + `www` + localhost
- [ ] 3.2 `apps/web/auth.ts`: OIDC code flow, JWKS fetch + cache, token validation (issuer, audience, signature, expiry) via node `crypto` — no new runtime dependency
- [ ] 3.3 First sign-in maps the token subject to a principal via `ensurePrincipal`; session cookie is httpOnly, secure, SameSite=Lax
- [ ] 3.4 Tests: valid / expired / wrong-issuer / wrong-audience / malformed tokens; repeat sign-in resolves to the same principal id

## 4. The authoring API

- [ ] 4.1 `apps/web/api.ts`: `GET/PUT/DELETE` widgets and themes, `GET/POST/DELETE` keys — session-authenticated, principal taken from the session and never from the request body
- [ ] 4.2 `POST /api/keys` returns the raw key once with an explicit "shown once" contract; the response is never re-derivable
- [ ] 4.3 Store rejections surface as structured errors naming the rule (reserved kind, invalid template, limit); existing entries untouched on failure
- [ ] 4.4 Tests: MCP key presented to a write endpoint → `401`; cross-principal write refused; rejection leaves state unchanged; create → use → revoke → anonymous

## 5. The app shell

- [ ] 5.1 `apps/web/`: static shell (sign-in, key management, widget list, theme list) built with the existing esbuild pipeline; no framework dependency
- [ ] 5.2 Mount `createDesigner` and `createThemeDesigner` against the API — save writes through, load lists the principal's entries, the widget designer's theme picker is fed the principal's themes
- [ ] 5.3 Node HTTP server (same shape as `apps/mcp-server/http.ts`) serving the bundle and the API; health endpoint for the container probe
- [ ] 5.4 Tests: end-to-end over HTTP — sign in (stubbed issuer), save a widget, then read it back through a composed catalog for that principal and confirm it is absent for another

## 6. Infrastructure

- [ ] 6.1 `infra/main.bicep`: Cosmos serverless account, `data` and `keys` containers with their partition keys
- [ ] 6.2 Second container app in the existing `widgentic-env` (`minReplicas: 0`), its own user-assigned identity, ACR pull from the existing registry
- [ ] 6.3 Cosmos data-plane role assignments: app identity read/write, **MCP identity read-only**; no keys in Bicep, environment, or logs
- [ ] 6.4 Apex + `www` custom hostnames with managed certificates; DNS records; `docs` left unclaimed for change 4
- [ ] 6.5 MCP container gains Cosmos configuration and reads through the adapter; absent configuration keeps today's behavior exactly

## 7. Verification, deploy, docs

- [ ] 7.1 Full `npm test` + typecheck green
- [ ] 7.2 Rig: sign in, create two keys, design a widget and a theme, then prove over HTTP that each key sees that principal's catalog and no other's — and that the revoked key falls back to anonymous
- [ ] 7.3 Seed the existing production key as a digest row for a bootstrap principal; confirm it still works before and after cutover
- [ ] 7.4 Deploy `v11` (both container apps); verify the apex serves the app and `mcp.widgentic.dev` is unchanged
- [ ] 7.5 README + TESTING.md: accounts, key lifecycle and rotation, the Cosmos adapter's configuration, and why writes are session-only (D7)
