# Tasks — Per-Principal Catalogs and Registration

## 1. Bounded interpretation (template-widgets)

- [x] 1.1 `compile.ts`: node budget threaded through interpretation (`options.maxNodes`, `DEFAULT_MAX_NODES` = 50 000); stop at the budget, return what was built, mark the render truncated
- [x] 1.2 `countTemplateNodes(template)` for storage limits; export both from the `./templates` entry
- [x] 1.3 Tests: runaway `each` stopped promptly and deterministically, ordinary renders byte-identical and unmarked, node counting over nested branches

## 2. Store port and reference implementations

- [x] 2.1 `src/store/types.ts`: `WidgetStore`, `Principal`, `StoredWidget`, `StoreLimits`, `ANONYMOUS_PRINCIPAL`, default limits (100 widgets / 50 themes / 64 KiB / 2 000 nodes)
- [x] 2.2 `src/store/keys.ts`: `hashKey`, `verifyKey` (constant-time over fixed-length digests), `wgk_` key format, never-log discipline
- [x] 2.3 `src/store/memory.ts`: `createMemoryStore(seed?)` with write validation + limit enforcement
- [x] 2.4 `src/store/file.ts`: `createFileStore(dir, limits?)` over `<dir>/<principal>/{widgets,themes}/*.json` + `principals.json`; missing paths yield empty, documented as non-transactional
- [x] 2.5 `widgentic/store` export + entry in `package.json`
- [x] 2.6 Tests: round-trip, unknown principal, key hashing/constant-time/unknown-key, limit rejection on write

## 3. Composition and isolation

- [x] 3.1 `src/store/compose.ts`: `composeCatalog` / `composeThemes` — fresh instances, built-ins first, per-entry re-validation, built-in-kind shadowing skipped, limits enforced on read, diagnostics collected (never thrown)
- [x] 3.2 Tests: two principals → two catalogs, independent instances, anonymous = built-ins only, invalid template/theme skipped with diagnostic while siblings register, oversized entry skipped

## 4. Server wiring

- [x] 4.1 `createWidgenticServer(options?)` accepts composed `catalog`/`themes` (defaulting to today's built-ins + compiled-in `customWidgets`)
- [x] 4.2 `http.ts`: resolve the principal from the presented key before constructing the server; anonymous fallback; stderr note on unresolved key with no key material; keep the no-store path byte-identical to today
- [x] 4.3 Tests: SDK-interop with two keys → two catalogs, cross-principal `UNKNOWN_KIND`/`UNKNOWN_THEME`, sequential and concurrent isolation, no-store back-compat

## 5. Verification, deploy, docs

- [x] 5.1 Full `npm test` + typecheck green
- [x] 5.2 Rig: seed a file store with two principals (one owning `x-post`, one owning a different widget + a theme), run the HTTP entry against it, and verify with curl that each key sees its own catalog and neither sees the other's
- [x] 5.3 Deploy `v10` with the store disabled (no behavior change in production) and confirm the existing key still works end to end
- [x] 5.4 README + TESTING.md: the store port, seeding a file store, the anonymous fallback, and why registration is not an MCP tool (D5)
