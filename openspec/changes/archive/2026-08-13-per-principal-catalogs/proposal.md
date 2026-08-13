# Per-Principal Catalogs and Registration

## Why

Today the server's catalog is a constant: built-ins plus a hard-coded `customWidgets` array compiled into the image, identical for every caller, with a single shared API key that grants access but identifies nobody. The widgentic.dev app cannot exist on that foundation — "the user creates a widget and it appears in their MCP catalog" requires the server to answer *whose* catalog it is serving, per request.

This is deliberately its own change rather than app plumbing, because it is where the trust boundary moves: stored templates authored by one user are executed on our server for whoever holds a key, and one tenant's widgets must never surface in another's `list_widgets`. That deserves a security review of its own, before accounts and a database make it harder to change.

## What Changes

- **New `widgentic/store` capability**: a persistence-agnostic port — `resolvePrincipal(apiKey)`, `widgets(principalId)`, `themes(principalId)` — with an in-memory implementation and a file-backed reference implementation. No database is chosen here; change 3 supplies its own adapter.
- **Per-request composition**: `composeCatalog(store, principal)` / `composeThemes(...)` build a **fresh** catalog and theme registry per request from the built-ins plus that principal's stored entries. Nothing mutable is shared between requests or principals.
- **Validation on both sides of the store**: entries are validated when written *and* re-validated when loaded (defense in depth — a store may be edited out of band). Invalid entries are skipped with a diagnostic, never crashing a session and never leaking into another principal's catalog.
- **Per-principal limits**: caps on widget count, theme count, serialized template size, and node count, so one tenant cannot exhaust the server for the rest.
- **Bounded template interpretation**: `compileTemplate` gains a node budget so a stored template driven by large agent data cannot produce unbounded output — the render stops and reports rather than spending the process.
- **Keyed identity, not a shared password**: keys are stored as hashes and compared in constant time, carry `scopes`, and never appear in logs. Unauthenticated callers get built-ins only.
- **Registration stays out of the MCP surface** (see design): the tool surface remains read-only over the caller's catalog; writes belong to the authenticated management path the app owns.

## Capabilities

### New Capabilities

- `widget-store`: the store port, reference implementations, per-principal validation and limits, and the composition functions that turn stored entries into a request-scoped catalog and theme registry.

### Modified Capabilities

- `mcp-server`: resolves a principal per request and serves that principal's composed catalog and themes; isolation, anonymous fallback, and unchanged tool contracts.
- `template-widgets`: bounded interpretation (node budget) so stored templates have a ceiling.

## Impact

- New `src/store/` (port, memory + file implementations, composition, limits); `widgentic/store` export.
- `src/templates/compile.ts` (node budget), `examples/mcp-server/http.ts` (key → principal), `examples/mcp-server/server.ts` (accept a composed catalog/registry instead of building its own).
- Tests: store implementations, isolation between principals, limit enforcement, invalid-entry skipping, constant-time key comparison, node-budget termination, and an interop test proving two keys see two catalogs.
- Deployment: a store directory (or env-configured adapter) alongside the existing container; the current single-key behavior remains the default when no store is configured.
- Downstream: change 3 (the app) implements the port against its database and owns the write path; change 4 (site) is unaffected.
