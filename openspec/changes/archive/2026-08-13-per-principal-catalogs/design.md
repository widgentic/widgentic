# Design — Per-Principal Catalogs and Registration

## Context

`createWidgenticServer()` builds one catalog (built-ins + the compiled-in `customWidgets`) and one theme registry, then registers tools closed over them. On the stateless HTTP entry every POST constructs a fresh server, so per-request composition is already the natural shape — what's missing is *identity*: `WIDGENTIC_API_KEY` is a shared password compared with `!==`, and nothing maps a key to a principal.

Everything a stored widget needs already exists and is hardened: the template DSL was designed for untrusted authors (validated, script-free, URL-guarded), styles are selector- and value-guarded, schemas are ReDoS-bounded, and themes validate. This change is about *whose* entries get loaded, *how many*, and *what happens when the store lies*.

This is change 2 of the widgentic.dev arc (1: theming foundation ✅ · 2: this · 3: the app · 4: the static site).

## Goals / Non-Goals

**Goals:**
- One request → one principal → one freshly composed catalog and theme registry.
- Strict isolation: a principal's entries can never appear in another's listing or render.
- Survive a hostile or corrupt store without crashing or cross-contaminating.
- Bound what a stored template can cost at render time.
- Pick no database: define the port, ship reference implementations.

**Non-Goals:**
- No accounts, sign-up, sessions, or key issuance UI (change 3).
- No database adapter, migrations, or hosting decisions (change 3).
- No agent-facing write tools (see D5 — deliberate).
- No per-principal rate limiting or quota billing (deployment concern; limits here are structural, not economic).

## Decisions

**D1 — A port, not a database.** `WidgetStore` is three async methods: `resolvePrincipal(apiKey)`, `widgets(principalId)`, `themes(principalId)`. Ship `createMemoryStore(seed)` (tests, demos) and `createFileStore(dir)` (the rig: `<dir>/<principal>/widgets/*.json`, `themes/*.json`, plus a `principals.json` of key hashes). The app supplies its own adapter in change 3 without touching this capability. Alternative — jumping straight to Postgres — rejected: it would bind the hosting decision to a change whose real content is the trust boundary.

**D2 — Compose per request, share nothing.** `composeCatalog(store, principal)` returns a **new** `createCatalog()` with the built-ins plus that principal's validated widgets; `composeThemes` likewise. No module-level cache keyed by principal, no shared catalog mutated per request — a cache is a cross-tenant leak waiting for an off-by-one, and composition is cheap (template compilation is pure and small). If profiling later demands caching, it must be keyed by principal *and* content hash, which is a separate decision with its own review.

**D3 — Validate on write and on read.** The store validates before persisting; composition re-validates every entry as it loads. The second pass is not redundant: a file store is editable out of band, and a future database adapter could be written against by another process. An entry failing validation is **skipped with a diagnostic**, never thrown — one bad row must not deny a user their other widgets, and must never fall through to a neighbour's catalog. Built-in kind names (`card`, `table`, `tree`, `custom`) are refused at write time and skipped at read time: shadowing them would let a stored template capture renders the agent believes are built-in.

**D4 — Limits are structural and per principal.** Defaults: 100 widgets, 50 themes, 64 KiB serialized per entry, 2 000 template nodes per entry (validation-time), 50 000 rendered nodes per render (interpretation-time, D6). Limits are configuration on the store, not constants, so a deployment can tighten them; exceeding a limit is a rejection at write time and a skip-with-diagnostic at read time.

**D5 — Registration is NOT an MCP tool in this change.** The obvious move is `register_widget`/`register_theme` tools so an agent can create widgets in conversation. Rejected for now: the MCP key is pasted into third-party hosts (Copilot, claude.ai, Desktop) and travels through prompt-injectable contexts; a read-only key that leaks exposes a catalog, while a write-capable key that leaks lets an attacker persist arbitrary templates into the victim's account — templates the victim's own agents will then render. Writes therefore belong to the app's authenticated path (change 3), where a session, not a pasted key, authorizes them. The `Principal.scopes` field is defined now (`"read"`, `"write"`) so the door is open, and a future change can add scoped write tools behind an explicit opt-in with its own review. This is the security-review conclusion the backlog was waiting on, recorded here rather than assumed.

**D6 — Bounded interpretation.** `compileTemplate(template, { maxNodes })` counts nodes produced during interpretation and stops when the budget is exhausted, returning what it built plus a truncation marker in the render result. Rationale: `each` multiplies template nodes by *agent-supplied* data length, so template size alone bounds nothing. Default budget 50 000 nodes (orders of magnitude above any legible widget). Alternative — a wall-clock timeout — rejected: it makes rendering non-deterministic and untestable, while a node budget is exact and reproducible.

**D7 — Keys: hashed, constant-time, scoped, never logged.** Stores hold SHA-256 hashes (`sha256:<hex>`), never raw keys; comparison uses `timingSafeEqual` over fixed-length digests, so lookup time leaks nothing about which key matched. Keys carry a `wgk_` prefix for greppability in incident response. `resolvePrincipal` returning `undefined` yields the **anonymous** principal: built-ins only, never an error — an unauthenticated caller gets a working server with no tenant data, which is also exactly today's behavior when no store is configured (back-compat).

## Risks / Trade-offs

- [A store adapter written later ignores validation] → D3's read-side re-validation is the backstop; composition trusts nothing it loads.
- [Composition per request costs CPU on a scale-to-zero container] → Template compilation is pure and sub-millisecond for realistic entry counts; the limits (D4) bound the worst case. Measured in the interop tests rather than assumed.
- [Node budget truncates a legitimately huge render] → 50 000 nodes is far beyond legible output, and truncation is *reported* in the result rather than silent, so an agent can see what happened and send less data.
- [Anonymous fallback hides a misconfigured store] → The server logs (stderr) when a store is configured but a key fails to resolve, so "why is my catalog empty" is diagnosable without leaking the key.
- [File store is not concurrency-safe] → It is a reference/demo implementation; the spec says so, and the app's adapter owns transactional semantics.

## Migration Plan

Additive and default-preserving: with no store configured the server behaves exactly as today (built-ins + compiled-in custom widgets, single-key gate). Configuring a store switches the runnable entry to principal resolution. The compiled-in `customWidgets` remain as the **anonymous** principal's catalog, so the demo rig and existing hosts keep working unchanged. Ship as `v10`.

## Open Questions

_None blocking. Deferred to change 3: key issuance and rotation UX, the write API's shape, and whether scoped write tools are ever exposed over MCP._
