## 1. Host probe (design D12)

- [x] 1.1 Branch `feature/mcp-oauth-probe` (never merged) from this branch: the example's MCP service answers a keyless `/mcp` with `401` and the challenge, serves both protected-resource metadata paths, and the app serves authorization-server metadata plus stub `register` and `authorize` routes that log method, path, query names, the `client_id` length and redirect URIs (never a secret) and answer registration with a ~600-character sealed `client_id`.
- [x] 1.2 Deploy the probe to staging and verify the served bytes (download, then search the file).
- [x] 1.3 `[USER]` Add the staging `/mcp` URL with no key in claude.ai, ChatGPT and VS Code Copilot, once as a new connector and once on a connector that was already added keyless; report what each host shows. Staging now runs the REAL flow with the probe's logging (see the design's apply revisions), so this is the same session as 7.3.
- [x] 1.4 Record the five answers of D12 per host in `design.md` as a revision. If a host truncates the client id or uses only one registration method, revise D7 and the "Clients register without the server storing them" requirement before task 3.

## 2. The store (`@widgentic/mcp/store`)

- [x] 2.1 `store/grants.ts`: the `AccessGrantStore` and `WritableAccessGrantStore` ports, the grant, code and token record types, the `wga_` / `wgr_` / `wgc_` / `wgn_` prefixes with generators beside `keys.ts`, and the lifetimes as exported constants (D3, D5, D8). `StoreLimits.grants` (default 50). Export from `./store` and update the exports snapshot.
- [x] 2.2 Memory adapter: codes (atomic single use, sixty seconds, a used code reports its grant), grant creation, rotation with the sixty-second grace and replay report, revocation, listing, the least-recently-used eviction at the limit, and `revokeKey` fan-out (D4).
- [x] 2.3 SQLite adapter: the same over new tables created on open without touching existing rows; expired rows deleted on write; token resolution through the read-only handle.
- [x] 2.4 Cosmos adapter: token and code records in `keys` (id = partition = digest, with `type`, expiry and `ttl`), `grant:<id>` in the principal's partition listing its current digests; writes ordered as the design's risk section states; resolution is exactly one point read.
- [x] 2.5 File store: read side only, resolving the anonymous form and nothing else.
- [x] 2.6 `resolvePrincipal` refuses token prefixes and `resolveAccessToken` refuses key prefixes, in every adapter.
- [x] 2.7 Shared adapter suite: every scenario of the four ADDED `widget-store` requirements, run against memory, SQLite and Cosmos (the emulator-free fake the suite already uses), plus the Cosmos single-read assertion.
- [x] 2.8 Old-shape regression: a store file and a SQLite database written by 0.15.0 (fixtures committed) open, resolve their keys, list their entries and accept a first grant with the old records byte-identical.

## 3. The `./oauth` entry — resource side

- [x] 3.1 `packages/mcp/src/oauth/resource.ts`: the metadata document, the challenge value and bearer extraction as pure functions; no request, store or environment access.
- [x] 3.2 `package.json` `exports` gains `./oauth`; `tools/exports.test.ts` snapshot (21 entries); `tools/boundaries.test.ts` entry list; `pack:check` covers the new entry; the base entry does not import it.
- [x] 3.3 Tests: the three scenarios of "Resource-side helpers describe and challenge".

## 4. The `./oauth` entry — authorization surface

- [x] 4.1 `oauth/seal.ts`: HMAC sealing and constant-time opening with expiry, used for client ids, decision tokens and anonymous codes (D7, D10). A copy of the pattern, not an import from the example.
- [x] 4.2 `oauth/clients.ts`: registration validation (redirect URI rules, ten at most), the sealed `client_id`, and metadata-document clients through the guarded fetch with the `client_id` self-check.
- [x] 4.3 `oauth/handler.ts`: the transport-agnostic surface — metadata, `register`, `authorize` (validation order of the spec: error page for an untrusted client or redirect, redirect with an error otherwise), `authorize/decision`, `token` (code exchange with S256, refresh, replay handling), `revoke`; CORS on metadata, register, token and revoke only; `no-store` everywhere.
- [x] 4.4 `oauth/pages.ts`: sign-in choice, consent and error pages — inline styles under a hashed CSP, `frame-ancestors 'none'`, no external resource, all values escaped; client name and redirect host labelled unverified; the `renderPage` override.
- [x] 4.5 Consent decision: select a key, or create one through `createKey` (store refusals — `INVALID_KEY_NAME`, `INVALID_SCOPES` — re-render the page), scope narrowing, raw key discarded; the anonymous choice with its sealed code and `wgn_` token and no store write.
- [x] 4.6 `oauth/node.ts`: the `node:http` adapter — form and JSON bodies bounded by `readBodyText`, the host's `resolvePrincipal` failure contained exactly as the authoring adapter does it.
- [x] 4.7 Log discipline: a test that drives every route with success and failure and asserts the log sink received no code, verifier, token or raw key.
- [x] 4.8 Tests: every scenario of the remaining eight `mcp-authorization` requirements, through the core with plain values, plus core-versus-adapter identity for one request per route. Page guarantees are asserted on the served headers and on the parsed document, not by text match.
- [x] 4.9 Authoring surface (D14): the deps take an optional grant reader; `GET /keys` joins live grants onto keys as `connections` (name, created, last refreshed — nothing else), omits the field without a reader, and the client name is capped at registration. Tests: the three new scenarios of "Keys are minted once with the scopes fixed at creation", with the existing ones still passing.
- [x] 4.10 An end-to-end test in process: a public client registers, authorizes, exchanges, calls a protected endpoint built from task 5's wiring, refreshes, and is cut off by `revokeKey`.

## 5. The self-host example (`examples/docker`)

- [x] 5.1 `mcp.ts`: protect `/mcp` (key header, `?key=`, then bearer; challenge otherwise; no server constructed), serve `/mcp/public` as the anonymous server reading no credential, serve both metadata paths, allow `Authorization` and expose `WWW-Authenticate` in CORS, and write the `401` JSON-RPC body naming the public URL and the key header (D9). The deployment key still matches before the store.
- [x] 5.2 The app: mount the surface under `/oauth/*` and `/.well-known/oauth-authorization-server` with `identity.ts` as the resolver (single mode signed in; trusted header or nobody), issuer and resource from `WIDGENTIC_PUBLIC_URL` / `WIDGENTIC_MCP_PUBLIC_URL` with the local-port defaults, and the secret from `WIDGENTIC_OAUTH_SECRET_FILE` / `WIDGENTIC_OAUTH_SECRET` or derived from the KEK.
- [x] 5.3 The `/mcp` proxy also forwards `/.well-known/oauth-protected-resource*` when `WIDGENTIC_MCP_UPSTREAM` is set.
- [x] 5.4 The Keys section in `main.ts`: each row lists its connected applications as text, marked as reported by the application, with the note that revoking the key disconnects them; the authoring client in `examples/shared` passes the field through. Test: "The Keys section names what uses a key".
- [x] 5.5 The app's connect panel and `README.md`: the two URLs, "add the bare URL and sign in", the key header as the alternative, the trust statement of single-principal mode, the new variables, and the breaking note for keyless hosts.
- [x] 5.6 Tests: the remaining five scenarios of "Hosts sign in through the authoring app", the MODIFIED scenarios of "One image, two services, one store" and "A deployment key survives an ephemeral store", and the six scenarios of the `mcp-server` requirement "A protected endpoint challenges; a public endpoint is anonymous" against the example's service, on both protocol eras (2026-07-28 through `handler.fetch`, 2025-era statelessly).
- [x] 5.7 `mcp-server` MODIFIED "Per-request principal resolution": the two new scenarios and the revised unknown-key scenario; the existing scenarios still pass.

## 6. Docs and records

- [x] 6.1 `packages/mcp/README.md`: the `./oauth` entry — a resource-side snippet and a mounting snippet; the capability row.
- [x] 6.2 Docs site: a "Sign hosts in" page under develop (it documents the grant port and the key listing's connections), the self-hosting and run-your-own-server pages updated, the generated `./oauth` reference page; `docs:check` green. The pages that describe the HOSTED server (connect-a-host, keys-and-scopes, host-matrix, per-principal-catalogs) are left as they are until that server changes — see 8.3.
- [x] 6.3 `TESTING.md`: a curl smoke for the challenge and both metadata documents, the registration snippets for each host with and without a key, and a dated verification-log entry.
- [x] 6.4 `CLAUDE.md`: revise the invariant "anonymous/unknown keys degrade to the built-in catalog, never to an error" per D9, add `./oauth` to the layout block and the entry count, and any gotcha the probe produced.
- [x] 6.5 `BACKLOG.md`: a connected-apps section with per-connection revocation, scope step-up, per-tool scopes, the .NET host's authorization story.
- [x] 6.6 Changeset: `@widgentic/mcp` minor, stating the new entry, the grant port and that the self-host example now protects `/mcp` (keyless hosts move to `/mcp/public`).

## 7. Gates and staging

- [x] 7.1 `npm run typecheck`, `npm test`, `npm run build`, `npm run pack:check`, `openspec validate --strict mcp-oauth`, `openspec validate --specs`; `dotnet test` is not required (nothing the host bundle renders changes) — confirm the conformance corpus is not stale.
- [x] 7.2 Deploy the branch to staging; verify served bytes: the `401` and its header, both metadata documents, `/mcp/public` listing the built-ins, a keyed request unchanged. Done as `mcp-oauth-flow-probe-ad2cb8a` (this branch plus the never-merged logging commit), revision `--0000043`.
- [x] 7.3 `[USER]` Host legs on staging in fresh conversations — claude.ai, ChatGPT, VS Code Copilot: add the bare URL, select an existing key, see your widgets and see the host named on that key in the Keys section; repeat creating a key at consent; repeat with "Continue without an account" (built-ins only); revoke the key in the app and confirm the host is disconnected; add `/mcp/public` and confirm no prompt.
- [x] 7.4 Route findings into this change (delta requirement plus regression test) and record deviations in `design.md`.

## 8. Release and hand-off

- [x] 8.1 PR `feature/mcp-oauth` → staging with green `verify` and `docs`; review; `/opsx:verify`; `/opsx:archive`.
- [x] 8.2 Promote staging → main, Version Packages → `@widgentic/mcp` 0.16.0 on npm; `Widgentic.Mcp` 0.16.0 pin PR and NuGet release; back-merge.
- [ ] 8.3 Open the apps-repository change (adopt 0.16.0: the surface on widgentic.dev over the session with a sealed return address, `401` and `/mcp/public` on mcp.widgentic.dev, the secret and the `keys` time-to-live in Bicep, landing and connect copy, the connected applications in its key list, the announcement to keyless users); deploy only on the owner's word. With that deploy, a docs PR here updates the hosted-facing pages (connect-a-host, keys-and-scopes, host-matrix, per-principal-catalogs) to the two URLs and the sign-in path.
