# Design — Self-hosting: a SQLite store and a Docker example

## Context

See proposal.md — Why. What already exists and shapes the approach:

- The store port (`packages/mcp/src/store/types.ts`) is `WidgetStore` (read) and
  `WritableWidgetStore` (write), with `describeStoreContract` in
  `store/__tests__/contract.ts` — one suite, every implementation, including a
  `reopen()` hook for restart. Cosmos is the only durable implementation;
  `createFileStore` is read-only and documents itself as not concurrency-safe,
  `createMemoryStore` is volatile.
- The secrets layer already has both ciphers: `createKeyVaultCipher` and
  `createLocalCipher(hexKey)` + `generateLocalKek()`. Nothing new is needed to
  encrypt secrets in a container.
- The four designers, the guarded fetch (`testHttpAction`), the execution
  limiter and the whole MCP assembly are published API. The example composes
  published pieces; it invents no engine behavior.
- `apps/web` in `widgentic/apps` is the reference for what an authoring app
  does: `api.ts` (332 lines) over resources `me`, `widgets`, `themes`,
  `schemas`, `actions`, `action-test`, `secrets`, `keys`, `identities`;
  `main.ts` (1 133 lines) for the client. `api.ts` and its 546-line test are
  untouched by the palette adoption, so D6's port references stand.
- `designer-brand-chrome` shipped and `@widgentic/designer@0.3.0` is
  published; the private app already adopted it (its v67/v69, archived
  2026-08-31): `DESIGNER_CHROME` is down to the typography pair and both of
  its documents link `/assets/palette.css`, generated at boot from
  `chromeCss(CHROME_DEFAULTS)`. That served-asset pattern is proven in
  production and is the one the docker example copies.
- Verified on this repository's Node floor (v22.23.2): `node:sqlite` imports
  with **no flag**, exporting `DatabaseSync`, `StatementSync` and `backup`, and
  emits only an `ExperimentalWarning` — silenced with
  `--disable-warning=ExperimentalWarning`. SQLite is statically linked into the
  Node binary, so alpine images need no build toolchain.

## Goals / Non-Goals

**Goals:** a store implementation a container can actually use, at zero
dependency cost; a `docker compose up` that gives a person the authoring UI and
a per-principal MCP endpoint; identity that works behind whatever auth proxy
they already run; secrets that survive a restart or fail honestly.

**Non-Goals:** multi-replica or horizontal scaling (a single-node design, by
construction); a migration path from any existing store; an identity provider,
password store or account UI; brand assets, landing page or account linking;
changing anything in `widgentic/apps`.

## Decisions

**D1 — SQLite through `node:sqlite`, not a driver.** It is the only backend
that keeps the zero-runtime-dependency invariant: SQLite is compiled into Node,
so the adapter's cost is an `exports` entry and nothing else — not even an
optional peer, which makes it the first adapter that imports cleanly with an
empty `node_modules`. Alternatives: `better-sqlite3` (native build or prebuilds
in the image), `node-sqlite3-wasm` (a runtime dependency and a slower path),
Postgres via `pg` (a second container and an optional peer, for scaling this
example does not have). The price is an `ExperimentalWarning` on Node 22; the
adapter does not suppress it (a library must not silence a host's warnings) —
the example's entrypoints pass `--disable-warning=ExperimentalWarning`.

**D2 — One entry table, keyed like the Cosmos layout.** Tables:
`principals(id PK, subject, label, scopes)`, `subjects(subject PK,
principal_id, label)`, `entries(principal_id, kind, name, json, PK(principal_id,
kind, name))` where `kind` is `widget | theme | schema | action | secret`, and
`keys(digest PK, principal_id, key_id, name, scopes, created_at, revoked_at)`.
Composition reads one principal's entries as a single indexed range scan — the
same access shape as the Cosmos single-partition query — and key resolution is
a primary-key lookup on the digest. `json` holds the validated entry exactly as
the port defines it, so every adapter shares one persisted shape and one
normalization seam. Alternative: a table per entry type (five statements per
compose, five sets of column drift) — more code, no benefit.

**D3 — `user_version` from the first release.** The repository's standing rule
is that a persisted-shape change ships with a normalization seam and an
old-shape regression test. The adapter stamps `PRAGMA user_version` on create
and reads it on open, so a future shape change has a seam to hook and an
unknown (newer) version fails clearly instead of misreading rows.

**D4 — Synchronous statements behind the async port.** `DatabaseSync` blocks
the event loop for the duration of a statement. Accepted: single node,
point/range queries over data bounded by `DEFAULT_LIMITS` (100 widgets ×
64 KiB is the worst composition), no network round trip. The adapter documents
this ceiling; past it the answer is a server database, not a worker thread —
which would add real complexity to a self-host example. Alternative considered:
`node:sqlite`'s async surface — it has none at this version.

**D5 — WAL, `busy_timeout`, one transaction per write.** Two processes share
the file: the app writes, the MCP service reads. WAL keeps readers running
during a write; `busy_timeout` (5 s) absorbs the writer lock rather than
throwing; `foreign_keys` on. Every write that touches more than one row — and
every delete that must first check references (`SCHEMA_IN_USE`,
`ACTION_IN_USE`, `SECRET_IN_USE`) — runs inside one transaction, so a refusal
leaves nothing behind, which is what the contract suite asserts.

**D6 — The authoring API moves into the package; only the client stays an
example.** Everything in `apps/web/api.ts` after `readSession` is generic: the
handler resolves a principal once and then speaks nothing but the store port,
`testHttpAction` and the execution limiter. So ~300 of its 332 lines become
`@widgentic/mcp/authoring`, taking a resolved principal context
(`{ principalId, subject?, label? }`) instead of a session, with identity
routes served only when a subject is supplied. Authentication — session
cookie, trusted header, or nothing — stays in the host on both sides.

Shape: a pure core `handleAuthoringRequest({ method, path, body, context })
→ { status, body }` plus a thin `node:http` adapter. Roughly forty extra lines
buys tests without sockets and a surface a non-`node:http` host can mount.

What this leaves the example: ~20 lines of wiring where ~300 lines of route
logic were planned. What it leaves the private app: sign-in, brand, landing,
canonical host — the parts that are actually widgentic.dev. The client
(`main.ts`, 1 142 lines) does NOT move: shipping an app shell from a library
makes UI into supported public API, needs its own capability and a designer
release, and belongs in its own change. Its typed API client (~80 lines) goes
to `examples/shared` so both examples share one copy.

The example's client is deliberately plainer than `/app` — one list and one
designer per tab, no create-from-base gallery, no identity section, no landing
page. Capability parity, not chrome parity.

**D7 — Identity: a fixed principal by default, a trusted header by opt-in,
fail closed.** With no configuration the deployment serves one principal and
shows no sign-in; the docs say plainly that this belongs on localhost or a
trusted network. `WIDGENTIC_TRUSTED_USER_HEADER=<name>` opts in: that header's
value becomes the subject through `ensurePrincipal`, namespaced `proxy:<value>`
so it can never collide with an OIDC `sub` or the private app's `github:<id>`.
Two rules make it safe rather than convenient: unset, the header is not read at
all (a spoofed header changes nothing); set, a request without it is refused
rather than served the default principal — a proxy that stops sending the
header must not silently merge every user into one account. The docs state the
proxy's obligation to strip the header from client-supplied requests.
Alternatives: a shared password (no multi-user, weak), porting the GitHub OAuth
flow (~200 lines duplicated and every self-hoster must register an OAuth app).

**D8 — The API-key refusal moves into the package with the routes.** A
widgentic API key travels into prompt-injectable hosts, so it must never
author. In the example's single-principal mode there is no credential at all —
exactly when someone would be tempted to add "just accept the API key" for
convenience. Putting the refusal in `@widgentic/mcp/authoring` means every host
that mounts the surface inherits it and no host can quietly drop it, and the
`authoring-api` capability makes adding one a spec violation rather than a
patch.

**D9 — The KEK is supplied, never generated.** `WIDGENTIC_KEK_FILE` (a mounted
file or docker secret) is the documented path, `WIDGENTIC_KEK` the env
fallback; the README shows `generateLocalKek()` as a one-liner the operator
runs once and stores. Boot never generates one: a per-boot KEK writes records
that cannot be read after a restart. No KEK means the secrets surface is off
and writes are refused with `NO_CIPHER` — the existing store behavior, surfaced
rather than worked around. Both services take the same value. The
`widget-secrets` requirement is reworded because "in production … Key Vault" is
no longer true for a self-hosted deployment; the requirement's TITLE is
deliberately left alone — a rename reads as a removal in the delta, and the
requirement still governs the vault case.

The rewording keeps the two custody models ranked rather than flattening them.
widgentic's own deployment stays the strong one and the spec now says so
outright: its KEK lives in a managed vault, no process holds it, and no
configuration path exists that would put it there. The self-hosted path is
weaker by construction — a KEK in the process — so the obligation lands on
whoever runs it: supply the key as a mounted file with restricted permissions
or a platform secret, never an image layer, a committed `.env` or a shell
history; know that reading that material decrypts every secret the deployment
holds. The example's documentation must state this and must not imply parity,
and it points a reader whose threat model needs more at
`createKeyVaultCipher` — the same port, already shipped.

**D10 — Two services, one image.** The MCP service holds `WidgetStore` — a type
with no write methods — on its own port; the app is the only writer. That keeps
the production trust boundary visible in an example people will copy, and it is
the pattern the private Dockerfile already uses (one image, command per host).
Alternative: one process serving `/` and `/mcp` (the friendliest `docker run`,
but it merges the boundary); the README documents an MCP-only `docker run` for
that case instead.

**D11 — The image installs the widgentic packages from the registry.**
`examples/docker` carries its own manifest with `^` ranges; the Docker build
copies the example plus `examples/shared` and runs `npm install` inside the
image, so building it exercises what a reader would install and proves a
release. Inside the monorepo the same ranges resolve to the local sources for
typecheck. Unreleased package changes use the `npm link` recipe (as in the apps
repo) — a committed `file:` or workspace specifier naming a `@widgentic/*`
package is a spec violation. The rule is about the *product* packages: the
sibling example module is part of the example, so `examples/docker` depends on
it as `file:../shared` and the build context includes both directories. The
alternative — pre-bundling the client outside the image — would put the
monorepo back into the image build for no gain.

**D12 — The security-relevant half is tested by the package gate; the example
keeps a narrow suite.** D6 changes this calculation for the better. The
authoring routes — where a mistake is a security bug rather than a broken demo
— become package code under the mandatory gate, and their tests do not have to
be written: `apps/web/__tests__/api.test.ts` is 546 lines that already exist
and already pass, and porting them is a mechanical swap of `readSession` for a
principal context. What remains in the example is the identity resolution
(~60 lines) and the client (~600). The `examples` vitest project therefore
covers exactly the identity rules — default single principal, header inert
when unconfigured, two subjects stay isolated, configured-but-absent fails
closed — and nothing else; the client rides on the `TESTING.md` compose smoke
and on the workspace typecheck, which already spans `examples/` and is what
stops an API change from leaving an example behind. Examples are a guide, not a
product: that is the user's instruction, and after D6 the untested surface is
UI only.

**D13 — One shared example module, at the level of wiring rules, not of an
app framework.** Shrunk twice by what landed first: with the widgentic palette
as the designers' default no example passes `chrome` at all, and with
`chromeCss()` exported no palette copy exists to share — the page around the
designers derives its `--host-*` block in a line or two, the way both examples
and the private app now do. What is left genuinely shared is the mount
discipline every designer needs — `previous?.dispose()`,
`host.replaceChildren()`, construct, and re-mount the widget designer when
returning to its tab so newly saved themes appear in its selector — and the
typed authoring client. Both are subtle, both are the kind of thing a reader
copies wrong. They move into `@widgentic-examples/shared`: `designers.ts`
(four one-line `mount*` helpers) and `client.ts` (the typed client).

What deliberately does NOT move: the `create*Designer` option objects, the
persistence, the seeds, the tabs. `examples/designer` keeps localStorage and
its no-network promise; `examples/docker` keeps its HTTP calls to the authoring
API. A `createWorkbench()` that mounted and wired everything was considered and
rejected — it would hide the exact call a developer opened the example to read.
The shared module holds the rules; each example still shows the work.

**D14 — The stdio example shares widgets, not wiring.**
`examples/mcp-server/main.ts` is 49 lines and mounts no designer; its overlap
with the docker MCP host is superficial, because a compiled-in catalog walks
its own inline bindings while a store-backed one gets `catalog.actions` from
`composeCatalog`. Forcing a shared "server factory" over those two would
obscure both. What it does share is already shared: the
`@widgentic-examples/mcp-server/widgets` fixture package, which the designer
example imports today and the docker example will import for its seed content.

**D15 — The private app adopts on its own schedule; this change does not wait.**
Moving the routes here means four requirements in the private `widgentic-app`
spec — *Writes are authorized by session, never by API key*, *Multiple named
API keys with individual revocation*, *Secrets section is write-only*, *Key
scopes are chosen at creation* — plus the API-level scenarios of *Actions
section* and *Designing and publishing are the same act*, now belong to
`authoring-api` here. That migration is a change in the OTHER repository: it
adopts the released package, deletes its copy, and modifies `widgentic-app` to
reference the public capability instead of restating it. Nothing in this change
blocks on it — the package ships, the example uses it, widgentic.dev switches
when it suits. Until it does, the same behavior is specified in two places,
which is the normal state between a release and its adoption.

**Discovered during apply** (deviations recorded, not absorbed):

- `node:sqlite` is loaded through `process.getBuiltinModule` instead of a
  static import: Vite-driven tooling (the exports snapshot runs under
  happy-dom) refuses to bundle the builtin, and the runtime path is
  identical. A type-only import keeps the typings.
- The Dockerfile copies `examples/mcp-server` as a third sibling: the seed
  widgets the client offers are the existing fixture package (D14), declared
  `file:../mcp-server` like `shared`.
- `npm install --install-links` in the image: npm symlinks `file:`
  dependencies by default, which strands their own imports outside the
  install's `node_modules`; `--install-links` copies them, and esbuild and
  Node then resolve everything from one tree.
- The docs generator's entry list and its pinned page count are separate from
  `tools/exports.test.ts`; both grew by the two new entries (22 → 24 pages),
  each a reviewed diff.
- The containerized smoke ran against the packed local `@widgentic/mcp`
  tarball in a scratch build context — the committed image installs published
  packages, which predate `./authoring` until the release (the sequencing the
  migration plan states).

**Live findings routed in** (review of the docs and the demo after apply): the
docs generator did not escape `$`, so the DSL's escape tokens typeset as KaTeX
— fixed at the generator with a prose-only regression test; and the designer
demo gained the missing schema designer, a contextual header (seeds only in
the widget tab) and a symmetric Save on every tab, each save feeding the
other designers' selectors through localStorage — the cooperation story the
demo claims, now complete rather than theme-only.

**Code review (pre-archive, 10 angles)** — fixes are itemized in tasks group
12; decisions taken on the findings NOT fixed, so they are deliberate rather
than missed:

- The widgets PUT keeps reconstructing the entry from named fields instead of
  spreading the body: that is the reference implementation's anti-smuggle
  shape, kept verbatim; the forward-compat invariant is about render payloads,
  not stored-entry round-trips through an authoring write.
- `secretsEnabled` stays a host-supplied flag (matching the private app's
  contract); deriving it from the store needs a capability accessor on the
  port — backlog, not a silent port change here.
- Deferred to the backlog with the same reasoning: preparing the SQLite
  statements once (the synchronous adapter's stated ceiling covers today's
  scale); hoisting key-record minting/digest-preview/`requireCipher` into
  `store/keys.ts`/`errors.ts` (memory and cosmos already drifted on keyId
  derivation — a three-adapter refactor deserving its own change, as does a
  shared write-policy layer over per-adapter CRUD); a package-level store-backed
  MCP edge helper (the same D6 argument applied to `examples/docker/mcp.ts`'s
  copy of the private edge); deriving `rejectionStatus` from code families; a
  section factory for the docker client's four list panes.

## Risks / Trade-offs

- [`node:sqlite` is experimental and could change] → the adapter uses only
  `DatabaseSync`/`StatementSync`/`exec`, the surface that has been stable since
  22.5; the contract suite runs on every Node the CI matrix uses, so a
  behavioral change fails the gate rather than a deployment.
- [A KEK held in the process] → stated in the spec, the docs and the README:
  whoever reads that configuration can decrypt that deployment's records. File-
  based KEK with restricted permissions is the documented default; the docs
  rank it explicitly below the vault-backed arrangement widgentic's own
  deployment uses, and point there for a threat model that needs it.
- [A reader treats the self-hosted example as production-grade because it came
  from us] → the ranking is normative, not a footnote: `widget-secrets` now
  requires documentation of a process-held KEK to name the stronger option and
  say what reading the material would allow, and the example's own capability
  repeats it as a scenario.
- [The shared example module drifts into a framework] → D13 fixes its scope at
  chrome, palette and mount discipline; anything an example's reader came to
  read stays at the call site. A change that would move construction or
  persistence into it needs a spec change here first.
- [Refactoring `examples/designer` onto the shared module changes its behavior]
  → it is a like-for-like extraction: the same 28-token map, the same mount
  sequence, and the demo's own toggle, seeds and localStorage untouched. The
  standalone page (`standalone.html`, published browser bundle) does not use
  the module at all.
- [Trusted header spoofing] → inert unless configured, fails closed when it is,
  namespaced subjects, and the docs name the proxy's obligation to strip the
  header from inbound client requests.
- [Synchronous SQLite blocks the loop] → bounded by the store limits and
  documented as the adapter's ceiling.
- [Two processes, one file] → WAL, `busy_timeout`, single-transaction writes,
  and a contract scenario that asserts a reader sees a committed write.
- [The example duplicates the private client and will drift] → capability
  parity only, no chrome parity. The server half no longer duplicates anything
  (D6); the client's extraction into `@widgentic/designer` is the recorded
  follow-up change.
- [An authoring API in a published package freezes a surface still evolving] →
  0.x, and the shape has already absorbed actions, secrets and account-linking
  without changing. The cost is real: a future app iteration becomes
  release-then-bump instead of edit-and-deploy. Accepted deliberately, because
  the alternative leaves the security-critical half of the surface in an
  example nobody tests.
- [Two specs describe the same behavior until the private repo adopts] → D15;
  the private change is small and unblocked the moment the release lands.
- [A public self-host path exists alongside the hosted service] → the user's
  call, made when this change was scoped; the hosted service's value is the
  managed deployment, not the code.

## Migration Plan

Nothing to migrate — no deployment, no existing SQLite data. Sequencing that
does matter:

1. The adapter, the authoring entry and the example land together here; the
   changeset makes `@widgentic/mcp` a minor.
2. The example's committed ranges at apply time are what the registry holds:
   `@widgentic/core@^0.1.0`, `@widgentic/designer@^0.3.0` (published,
   adopted by the private app), `@widgentic/mcp@^0.1.0`. The mcp range points
   at the last release until the new one publishes — designer released alone,
   so mcp lands at 0.2.0 — and between apply and that release the compose
   smoke runs with `npm link` while the CI image build validates 0.1.0. Bump
   the mcp range after the release.
3. `widgentic/apps` then runs its own change: bump `@widgentic/mcp`, mount
   `@widgentic/mcp/authoring` behind its session, delete ~300 lines of
   `api.ts`, keep the session-specific tests and drop the ported ones, and
   modify `widgentic-app` to point at the public capability (D15). It is not a
   prerequisite for anything here.

Rollback is deletion at each step: no other capability depends on the adapter,
the authoring entry or the example, and until step 3 the private app is
untouched.
