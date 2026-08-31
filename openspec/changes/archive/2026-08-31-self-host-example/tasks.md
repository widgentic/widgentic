## 1. SQLite store adapter

- [x] 1.1 `packages/mcp/src/store/sqlite.ts`: `createSqliteStore(path, options?)` returning `WritableWidgetStore`; options mirror the other adapters (`limits`, `cipher`, `log`/`onDiagnostic`). Module header documents the layout, the WAL/two-process property and the synchronous ceiling (design D1, D4).
- [x] 1.2 Schema on open (`CREATE TABLE IF NOT EXISTS`): `principals`, `subjects`, `entries(principal_id, kind, name, json, PK(principal_id,kind,name))`, `keys(digest PK, …)`; `PRAGMA journal_mode=WAL`, `busy_timeout=5000`, `foreign_keys=ON`, and `user_version` stamped and checked on open (design D2, D3, D5).
- [x] 1.3 Reads: `resolvePrincipal` as a digest primary-key lookup honouring `revokedAt` and key scopes; `widgets`/`themes`/`schemas`/`actions`/`listSecrets` as one indexed range scan per kind, validating on read and skipping invalid entries with a diagnostic (never throwing).
- [x] 1.4 Writes: `putWidget`/`putTheme`/`putSchema`/`putAction` validated at the door with the existing checkers and the same rejection codes; count and byte limits enforced per principal; each write in one transaction.
- [x] 1.5 Deletes with referential integrity in the same transaction as the check: `SCHEMA_IN_USE`, `ACTION_IN_USE`, `SECRET_IN_USE` reuse `refs.ts` rather than reimplementing the walk.
- [x] 1.6 Identity: `ensurePrincipal`, `linkSubject` (incl. `SUBJECT_IN_USE` and the absorb-an-empty-principal case), `unlinkSubject` (`CANNOT_UNLINK_PRIMARY`), `listLinkedSubjects`.
- [x] 1.7 Keys: `createKey` (raw key once, digest stored), `listKeys` (metadata only), `revokeKey` (one key, others untouched).
- [x] 1.8 Secrets: `putSecret`/`secretValue`/`removeSecret` through `encryptSecret`/`decryptSecret`; `NO_CIPHER` when built without a cipher; ciphertext records only.
- [x] 1.9 `packages/mcp/src/store/__tests__/sqlite.test.ts`: run `describeStoreContract` with a temp-file store and a `reopen()` that opens a new store over the same file; add the scenarios the contract does not cover — a second connection sees a committed write, a refused write leaves no row, the file holds digests and ciphertext but no key material or plaintext, and an unknown `user_version` is refused.

## 2. Authoring surface in the package

- [x] 2.1 `packages/mcp/src/authoring/types.ts`: `PrincipalContext` (`principalId`, optional `subject` and `label`), `AuthoringRequest` (`method`, `path`, parsed `body`, `context`, presented-credential flags), `AuthoringResponse` (`status`, `body`), and the deps (`store`, `secretsEnabled`, `limiter`, `fetchDeps`).
- [x] 2.2 `packages/mcp/src/authoring/handler.ts`: the pure core `handleAuthoringRequest(request, deps)` ported from `apps/web/api.ts` — `me`, widgets, themes, schemas, actions, `action-test`, secrets, keys, and identities gated on a supplied subject. The path names the entry and the body can never override it; no identity, session or cookie code inside (design D6).
- [x] 2.3 The API-key refusal ahead of every route: any presented key → `401 KEY_NOT_A_SESSION` before any store access, with valid and invalid keys indistinguishable (design D8).
- [x] 2.4 Rejection mapping and body handling: `StoreRejectionError` → its own code with the status table (409 / 404 / 503 / 403 / 502 / 422), malformed or oversized bodies → `400 INVALID_BODY`, anything else → `500 INTERNAL` with no internals leaked.
- [x] 2.5 `packages/mcp/src/authoring/node.ts`: the `node:http` adapter — decode `IncomingMessage` (URL, method, size-capped JSON body, credential detection), call the core, write the `ServerResponse`. The only file that touches request/response objects, and it adds no behavior.
- [x] 2.6 `packages/mcp/src/authoring/index.ts` re-exporting the core, the adapter and the types.
- [x] 2.7 Port `apps/web/__tests__/api.test.ts` (546 lines) into `packages/mcp/src/authoring/__tests__/`: swap `readSession` for a principal context, keep every case, and add the ones the extraction creates — identity routes absent without a subject, core and adapter agreeing on status and body, the uniform key refusal.
- [x] 2.8 Confirm `tools/boundaries.test.ts` stays green: the authoring module imports the store, secrets and action helpers relatively and nothing outside the package or `node:`.

## 3. Package plumbing

- [x] 3.1 `packages/mcp/package.json`: add the `./store/sqlite` and `./authoring` exports entries (types + default → `dist`). No new dependency or peer for either.
- [x] 3.2 Root `tsconfig.json` `paths` and `vitest.config.ts` aliases for both entries (specific entries before the generic ones).
- [x] 3.3 `tools/exports.test.ts`: add both entries to `ENTRIES` and review the new snapshots (16 → 18 entries).
- [x] 3.4 `npm run pack:check` green: both entries resolve with types from the tarball under `publint --strict` and `are-the-types-wrong`.
- [x] 3.5 Changeset: minor for `@widgentic/mcp` (the linked group moves with it).

## 4. Shared example module

- [x] 4.1 `examples/shared/package.json`: private workspace `@widgentic-examples/shared` with `exports` for `./designers` and `./client`; depends on `@widgentic/core` `^0.1.0` and `@widgentic/designer` `^0.3.0`. No shared palette file exists — every host derives its page palette from `chromeCss(CHROME_DEFAULTS)` in a line or two (design D13; no example passes `chrome`).
- [x] 4.2 `examples/shared/designers.ts`: `mountWidget`, `mountTheme`, `mountSchema`, `mountAction` — each disposes the previous handle, clears the host element and constructs with the caller's options. Options, persistence and seeds stay at the call site; no workbench, no framework (design D13).
- [x] 4.3 `examples/shared/client.ts`: the typed browser client for the authoring routes (~80 lines), so the docker example and any later example share one copy (design D6).
- [x] 4.4 Refactor `examples/designer` onto the module: use the `mount*` helpers (its palette derivation via `chromeCss` already shipped with `designer-brand-chrome`). Like-for-like — the toggle, the seeds, localStorage, the tab re-mount rule and the rendered page all unchanged; `standalone.html` untouched (it exercises the published browser bundle).
- [x] 4.5 A header note in `examples/designer` pointing at the shared module, so a reader copying it knows which parts are wiring and which are the demo.

## 5. Example: hosts and identity

- [x] 5.1 `examples/docker/package.json`: private workspace `@widgentic-examples/docker` declaring `@widgentic/core` `^0.1.0`, `@widgentic/designer` `^0.3.0`, `@widgentic/mcp` `^0.1.0` (bumped after the mcp release), the MCP SDK peers and `esbuild`, plus `@widgentic-examples/shared` as `file:../shared` (design D11).
- [x] 5.2 `examples/docker/store.ts`: shared bootstrap — open the SQLite store at `WIDGENTIC_DB` (default `/data/widgentic.db`), build the cipher from `WIDGENTIC_KEK_FILE` or `WIDGENTIC_KEK`, never generate one; log which cipher (or none) is active without printing material (design D9).
- [x] 5.3 `examples/docker/identity.ts`: resolve the request principal — the fixed local principal by default; when `WIDGENTIC_TRUSTED_USER_HEADER` is set, `ensurePrincipal("proxy:" + value)` and refuse a request that lacks the header; when unset, never read the header (design D7).
- [x] 5.4 `examples/docker/mcp.ts`: Streamable HTTP MCP host on `WIDGENTIC_MCP_PORT` (default 8081) — a read-only `WidgetStore` handle, per-request `composeCatalog`/`composeThemes`, key → principal, anonymous degradation, execution limiter.
- [x] 5.5 `examples/docker/web.ts`: request router — mount `@widgentic/mcp/authoring` through its Node adapter with the resolved principal context, plus the app shell, the esbuild-bundled client, a `/palette.css` route generated at boot from `chromeCss(CHROME_DEFAULTS, { prefix: "--host" })` (the pattern the private app proved as `/assets/palette.css` in v69), and a health probe; app on `WIDGENTIC_WEB_PORT` (default 8080). Wiring only: no route logic, no refusal mapping, no validation of its own.

## 6. Example: authoring client

- [x] 6.1 `examples/docker/index.html`: shell linking the served `/palette.css`; tabs for Widgets, Themes, Schemas, Actions, Secrets, Keys; no brand assets, no landing page.
- [x] 6.2 `examples/docker/main.ts`: mount the four designers through the shared `mount*` helpers; list, create, replace, view read-only and delete for each through the shared typed client; save publishes straight to the catalog. Seed content from `@widgentic-examples/mcp-server/widgets` (design D14).
- [x] 6.3 Action designer test call wired to the authoring surface's test route (server-side guarded fetch, shared execution budget); the browser never calls the action's target.
- [x] 6.4 Secrets pane: write-only, names and timestamps in the list, disabled with an explanation when no KEK is configured.
- [x] 6.5 Keys pane: mint with scopes and show the raw key exactly once, list metadata, revoke one.

## 7. Container

- [x] 7.1 `examples/docker/Dockerfile`: `node:22-alpine`, copy `examples/docker`, `examples/shared` and `examples/mcp-server` (the seed widgets are a `file:` sibling, like shared), `npm install` (widgentic packages from the registry), unprivileged user, one image with the MCP host as the default command, `--disable-warning=ExperimentalWarning` on both entrypoints.
- [x] 7.2 `examples/docker/compose.yml`: services `web` (8080) and `mcp` (8081) from the one image, one named volume at `/data`, the KEK supplied as a file/secret to both, commented `WIDGENTIC_TRUSTED_USER_HEADER` block.
- [x] 7.3 `examples/docker/.dockerignore` and a `.env.example` carrying every variable with a comment (no values).
- [x] 7.4 `examples/docker/README.md`: `docker compose up`; generating a KEK once with `generateLocalKek()` and storing it as a mounted file with restricted permissions (and what not to do — image layer, committed file, shell history); what reading that key would allow and that the vault-backed cipher is the stronger option; minting a key; connecting a host to `http://localhost:8081/mcp`; the MCP-only `docker run`; putting an auth proxy in front and stripping the header inbound; the `npm link` recipe for unreleased package changes.

## 8. Tests

- [x] 8.1 `vitest.config.ts`: new `examples` project over `examples/**/__tests__/**/*.test.ts` (deliberately narrow — design D12).
- [x] 8.2 `examples/docker/__tests__/identity.test.ts`: default single principal; header ignored when unconfigured; two header values → two isolated principals, stable across a reopen; configured-but-absent header refused, never served the default principal.
- [x] 8.3 Confirm the workspace typecheck covers `examples/shared` and `examples/docker` (root tsconfig `include` already spans `examples/**/*.ts`), and that `tools/boundaries.test.ts` stays green with the new example and shared module.
- [x] 8.4 `.github/workflows/ci.yml`: a job that builds the example image (build only, no stack run) so a broken Dockerfile fails the gate rather than a reader's first `docker compose up`.

## 9. Documentation

- [x] 9.1 `docs/develop/self-hosting.mdx` (+ `docs/docs.json` navigation): the compose stack, the two services, configuration table, identity modes, the KEK and its custody trade-off ranked against the vault-backed deployment, connecting a host, what this deployment is not (single node).
- [x] 9.2 `docs/develop/run-your-own-server.mdx`: a SQLite section beside the Cosmos one, a section on mounting `@widgentic/mcp/authoring` behind your own authentication, and the secrets paragraph reworded so the local cipher is a supported self-hosted path with its custody stated plainly (design D9).
- [x] 9.3 `README.md`: the example row in the layout table, the shared example module, the authoring entry, and a self-hosting line in the server section.
- [x] 9.4 `TESTING.md`: a compose smoke — bring the stack up, save a widget in the app, see it in `list_widgets` on the MCP endpoint, exercise a schema-in-use refusal and a key mint, recreate both containers and confirm persistence, restart with a wrong KEK and confirm the failure is clean.
- [x] 9.5 `packages/mcp/README.md`: the new store and authoring entries in its capability list.

## 10. Gate

- [x] 10.1 `npm run typecheck`, `npm test`, `npm run build`, `npm run pack:check`, `npm run docs:check` all green; `npm run designer` still renders identically after the shared-module refactor.
- [x] 10.2 `openspec validate --strict self-host-example` and `openspec validate --specs` green.
- [x] 10.3 Run the `TESTING.md` compose smoke by hand and record the result in the verification log.
- [x] 10.4 Note the `widgentic/apps` follow-up (adopt `@widgentic/mcp/authoring`, delete its copy, modify `widgentic-app`) in this change's design record so it is not lost at archive (design D15).

## 11. Live findings (routed in during apply)

- [x] 11.1 Docs: the template DSL's `$meta`/`$root`/`$parent`/`$index` tokens rendered as KaTeX on the live site — the generator's `md()` escape did not cover `$`, which the docs renderer treats as a math delimiter. Fixed in `tools/docs-generate.ts`, four generated pages re-emitted, and a regression test asserts no unescaped `$` in generated prose (code spans exempt).
- [x] 11.2 `examples/designer` refactor from review: the schema designer joins the other three (it was missing); the header is contextual (seed buttons live in the widget tab only); and every designer now has the same Save action — saves persist name-keyed collections to localStorage and cross-feed the others (themes → widget preview selector, schemas → widget and action designers, actions → widget bindings, widgets → theme preview kinds), with a tab re-mounted on entry so it sees what the others saved. Verified in headless Chrome: contextual controls, schema designer mounts, a saved theme appears in the widget designer's selector as its label.

## 12. Code review (10-angle, pre-archive)

- [x] 12.1 `sqlite.ts`: every failure leaving the store is a `StoreRejectionError` — `tx()` had let raw driver errors (BUSY, disk-full, read-only volume) escape unwrapped; `BEGIN` failures are wrapped too and `ROLLBACK` is guarded. Regression: a write after `close()` rejects with `STORE_ERROR`.
- [x] 12.2 `sqlite.ts`: a `record: null` secret row is skipped on list and reads as a miss (`typeof null === "object"` had let it through to a decrypt failure); truncating a read to the configured limit now reports a diagnostic instead of silently dropping rows; existence checks use `SELECT 1` instead of fetching and parsing the row's json; `ensurePrincipal` resolves without the writer lock and transacts only to create (with an in-transaction re-check for the two-process race); scope decoding has one derivation (`keyScopesFrom`) for listing and resolution; `node:sqlite`'s absence names the real floor (Node ≥ 22.5) instead of a bare TypeError. All regression-tested (28 sqlite tests).
- [x] 12.3 Authoring surface: a malformed percent-escape answers a structured 404 instead of throwing `URIError` past the adapter; a key in a top-level body field (`key`, `apiKey`, `api_key`, `x-api-key`) is refused `401 KEY_NOT_A_SESSION` like header and query keys — closing the gap against the spec's "or a body field" — and a presented key skips context resolution entirely; unexpected failures log through a `deps.log` sink (clients still see only `INTERNAL`). All tested (31 authoring tests).
- [x] 12.4 Example hosts: `WIDGENTIC_KEK_FILE=""` no longer crashes boot or shadows `WIDGENTIC_KEK`; ports parse via `positiveIntFromEnv` (an empty variable had bound port 0); the MCP service no longer logs "key resolved to no principal" for keyless anonymous traffic; catalog and theme composition run in parallel; a `Sec-Fetch-Site: cross-site` browser write is refused 403 (CSRF guard for the no-sign-in mode — same-origin and non-browser clients unaffected, verified live); `Deployment` no longer exposes the unused cipher handle.
- [x] 12.5 Clients: unsaved work survives tab switches in both hosts — the docker app carries the widget draft across the re-mount, and the demo carries the current theme/schema/action entry; the demo's Save widget refuses an unpreviewable draft (the designer's own `previewable` verdict) instead of announcing a save the theme preview would silently skip; boot double-mounts removed.
- [x] 12.6 Shared module: `previewThemes` (built-ins win a name collision) has one home in `examples/shared/designers.ts`, used by both hosts; the client's types are type-only imports of the store's own shapes (`StoredWidget`, `StoredSchema`, `StoredKey`, `SecretEntry`, `TestActionResult`) instead of hand-mirrors that had already drifted (`output` vs the real `status`/`body`).
- [x] 12.7 The example image import-smokes the entries the services need, so the build fails where `docker compose up` would have crash-looped; verified failing against published mcp@0.1.0 and passing against the packed next version. The `example-image` CI job is deliberately RED between landing a package-entry change and its release — the comment now says so. (The `^0.1.0` range itself self-heals: the release run rewrites private example ranges, verified in the designer 0.2.0→0.3.0 release commit.)
- [x] 12.8 Repo hygiene: CLAUDE.md layout/commands rows updated (18 entries, `./authoring`, `./store/sqlite`, examples in the vitest projects, the two new example folders); observed-live anecdotes trimmed from comments; the web host's budget comment states the per-service (per-replica) semantics truthfully.
