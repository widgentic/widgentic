# Tasks — The widgentic.dev App

## 1. The writable port

- [x] 1.1 `src/store/types.ts`: `WritableWidgetStore extends WidgetStore` — put/remove pairs existed from change 2; added `ensurePrincipal(subject, label?)` (principal id derived as `usr_<sha256(subject)[:24]>` so subject lookup stays a point read), `createKey(principalId, name)`, `listKeys(principalId)`, `revokeKey(principalId, keyId)`; `StoredKey` (`{ id, name, createdAt, revokedAt?, scopes, digestPreview }` — no raw key, ever) + `CreatedKey`
- [x] 1.2 `src/store/memory.ts`: multi-key records; key lifecycle implemented, raw key returned exactly once from `createKey`; revoked keys excluded from resolution candidates
- [x] 1.3 `src/store/__tests__/contract.ts` (beside the tests, not `src/store/contract.ts` — it imports vitest and must stay out of the build): reusable contract suite (round-trip, remove, limits, invalid-entry rejection, reserved kinds, key create → resolve → revoke → unknown, idempotent ensurePrincipal)
- [x] 1.4 Tests: memory store passes the contract suite; `types.test-d.ts` proves the read-only handle exposes no write methods and `StoredKey` carries no raw material

## 2. Cosmos adapter

- [x] 2.1 `src/store/cosmos.ts` + `./store/cosmos` export; `@azure/cosmos` and `@azure/identity` as optional peer deps (and devDeps for our own typecheck) so `./store` stays zero-dep
- [x] 2.2 `data` container partitioned by `/principalId` (`profile`, `widget:<kind>`, `theme:<name>`); catalog reads are single-partition queries (asserted); `listKeys`/`revokeKey` are documented management-plane queries on the small `keys` container, off the hot path
- [x] 2.3 `keys` container partitioned by `/digest`; `resolvePrincipal` is a point read by digest (asserted: zero queries, one read, id = partition key = digest); `revokedAt` treated as unknown
- [x] 2.4 Same validation, limits, and skip-with-diagnostic behavior; endpoint + credential (or injected client) only — no account key or connection-string option exists; unreachable store degrades to anonymous with an outcome-only log line
- [x] 2.5 Tests: full contract suite against a structural fake (13 tests), query-shape assertions, FORBIDDEN mapping for a read-only identity, diagnostics-hygiene checks; live-emulator spot check env-gated behind `WIDGENTIC_COSMOS_TEST_ENDPOINT` (skipped otherwise)

## 3. Accounts and sessions

- [x] 3.1 Entra External ID tenant (email OTP) live: tenant + user flow + app registration (public client + PKCE — redirect URIs must live under the *Mobile and desktop* platform, or redemption 401s with AADSTS7000218 despite the toggle; issuer is the tenant-id-host form from the discovery doc); issuer/clientId deployed via Bicep (v13); real sign-in verified end to end — principal created in live Cosmos from the External ID subject. GitHub is NOT federated here (unsupported by external tenants — D4 revised, see 3.5)
- [x] 3.5 Direct GitHub OAuth (D4 revised): `/auth/github` + `/auth/github/callback`, state-bound flow cookie with cross-flow refusal in both directions, one-shot identity read (`read:user`), subject `github:<id>`, label name→login fallback; Bicep `githubClientId`/`githubClientSecret` → container secret; 7 tests incl. token-hygiene (no `gho_` in cookies) and distinct-principal assertions
- [x] 3.2 `apps/web/auth.ts`: OIDC code flow with PKCE (S256), JWKS fetch + cache with one rotation refresh, token validation (issuer, audience, signature, expiry, nbf, alg pinned to RS256) via node `crypto` — no new runtime dependency
- [x] 3.3 First sign-in maps the token subject to a principal via `ensurePrincipal`; session is the app's own HMAC-sealed cookie (httpOnly, Secure, SameSite=Lax), never the raw ID token
- [x] 3.4 Tests (12): valid / expired / wrong-issuer / wrong-audience / unknown-kid / bad-signature / malformed tokens; full begin→callback→readSession round trip; state mismatch refused; TTL expiry + tamper invalidation; repeat sign-in resolves to the same principal id and the raw subject never appears in it

## 4. The authoring API

- [x] 4.1 `apps/web/api.ts`: `GET/PUT/DELETE` widgets and themes, `GET/POST/DELETE` keys — session-authenticated; the principal is always the session's and the URL path names the entry (a body-smuggled `kind`/`principalId` is discarded)
- [x] 4.2 `POST /api/keys` returns the raw key once with an explicit "shown once" notice; listings carry metadata + digestPreview only
- [x] 4.3 Store rejections → structured `{ error: { code, message } }` with mapped status (422 validation, 409 limits, 404 unknown, 403 FORBIDDEN, 502 store); state untouched on failure
- [x] 4.4 Tests (9): key-in-header AND key-in-query → 401 even beside a valid session; cross-principal reads empty and cross-principal revoke 404s without effect; RESERVED_KIND rejection leaves state unchanged; create → resolve → revoke → gone over real HTTP

## 5. The app shell

- [x] 5.1 `apps/web/`: static shell (sign-in view, widgets/themes/keys tabs, one-time key reveal) built with the existing esbuild pipeline; no framework dependency; explicit dev-login harness honored only when no issuer is configured
- [x] 5.2 `createDesigner` + `createThemeDesigner` mounted against the API — save PUTs the draft through the session, lists load the principal's entries, the widget designer's theme picker is fed built-ins + the principal's themes (re-mounted on tab return)
- [x] 5.3 `apps/web/http.ts` entry + `createWebAppHandler` router (`npm run web`, PORT 3002); Cosmos store when `WIDGENTIC_COSMOS_ENDPOINT` is set (DefaultAzureCredential), memory store for local dev; `/healthz` probe
- [x] 5.4 Tests (3 e2e + smoke): stubbed-issuer sign-in through the real callback flow → save widget + theme → present in that principal's composed catalog/registry, absent for a second sign-in; key created in the app resolves at the store port and stops after revoke; live curl smoke against `npm run web` (dev login, save, create key, key-on-API 401)

## 6. Infrastructure

- [x] 6.1 `infra/main.bicep`: Cosmos serverless account (`disableLocalAuth: true` — no account keys exist at all), `widgentic` database, `data` (`/principalId`) and `keys` (`/digest`) containers; compiles clean
- [x] 6.2 `widgentic-web` container app in the existing `widgentic-env` (`minReplicas: 0`, port 3002, web entry via container command), its own `widgentic-web-identity`, ACR pull from the existing registry
- [x] 6.3 Cosmos data-plane role assignments in Bicep: web identity → Data Contributor, **MCP identity → Data Reader (read-only)**; session secret as a secure param → container secret; no keys anywhere
- [x] 6.4 Apex + `www` bound to `widgentic-web` with managed certs (apex needed `--validation-method HTTP` — TXT never completes for an apex; documented in TESTING.md); Cloudflare records live (grey cloud); `mcp.` unchanged; `docs` left unclaimed for change 4; all three domains probe 200
- [x] 6.5 MCP entry: `WIDGENTIC_COSMOS_ENDPOINT` → Cosmos adapter via managed identity (gated in Bicep by `mcpCosmosEnabled`, default false, so cutover is a deliberate flip after seeding); `WIDGENTIC_STORE_DIR` file store unchanged; neither set = today's behavior (boot-verified)

## 7. Verification, deploy, docs

- [x] 7.1 Full `npm test` + typecheck green (480 tests + 33 type tests; 1 emulator test env-gated)
- [x] 7.2 Rig — run against **live Cosmos + production**: local web app (dev login, `az` credential) created alice/bob principals, keys, widgets and a theme through the authoring API; the deployed MCP endpoint then served `alice-report`+`alice-brand` to alice's key only, `bob-ticket` to bob's only, cross-principal render/theme → `UNKNOWN_KIND`/`UNKNOWN_THEME`, and the key revoked through the app fell back to the anonymous catalog
- [x] 7.3 Seeded `bootstrap:production` with stored copies of `invoice`+`x-post` and the existing key's digest row (adapter-verified resolution); post-cutover catalog for that key is byte-for-byte today's kind list
- [x] 7.4 `v11` deployed (both container apps; two-step: Cosmos+web with cutover off, then `mcpCosmosEnabled=true`); `mcp.widgentic.dev` verified unchanged — the deploy dropped its domain binding (template owns ingress), rebound via CLI and the binding is now a Bicep param so it cannot regress; **apex pending user DNS** (Cloudflare records documented in TESTING.md), web app verified on its ACA FQDN
- [x] 7.5 README (Cosmos adapter, the app, key lifecycle) + TESTING.md (per-principal production mode, redeploy contract, app runbook, pending DNS records)
