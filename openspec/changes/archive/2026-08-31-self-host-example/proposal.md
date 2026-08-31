# Why

Everything a person needs to run widgentic for themselves already exists in
the public packages — the MCP assembly, the four designers, the store port,
the secrets layer — but nothing shows how they fit together, and the two
implementations that make the whole thing durable (Cosmos, Key Vault) are
Azure-only. The only working answer to "how do I run this?" lives in the
private apps repository, which nobody can read. A reader of the README can
render widgets; they cannot get an authoring UI and a per-principal MCP
endpoint onto their own machine.

Two things are missing and one of them is a package gap, not a docs gap: the
store port has no implementation a container can use. `createFileStore` is
read-only and explicitly not concurrency-safe, and `createMemoryStore` loses
everything on restart. SQLite closes that gap at zero dependency cost —
`node:sqlite` is built into the Node 22 floor the package already requires.

# What Changes

- **New `@widgentic/mcp/store/sqlite` entry**: `createSqliteStore(path,
  options?)`, a full `WritableWidgetStore` over `node:sqlite`. Zero
  dependencies (SQLite is statically linked into Node), one file on a
  volume, WAL mode so the read-only MCP process and the writing app can
  share it. It passes the existing `describeStoreContract` suite including
  the `reopen()` restart case, so it is provably the same store the memory
  and Cosmos implementations are.
- **New `@widgentic/mcp/authoring` entry**: the authoring surface — widgets,
  themes, schemas, actions, the action test call, write-only secrets and API
  keys — extracted from the private app, taking an already-resolved principal
  context instead of a session. Authentication stays with the host; the
  package owns the routes, the refusal codes, the write-only rule, the
  one-time key reveal and the rule that an API key never authorizes authoring.
  A pure core plus a thin `node:http` adapter, so it is testable without a
  socket. The private app adopts it after the release and deletes ~300 lines;
  this change does not wait for that.
- **New `examples/docker`**: one image, two `docker compose` services over
  one shared volume.
  - `web` — the authoring app. Mounts the published authoring surface and
    the four designers against it, so it reaches `/app`'s authoring
    capability with wiring rather than a second implementation. No landing
    page, no brand assets, no account linking (that needs sign-in).
  - `mcp` — the Streamable HTTP MCP endpoint, holding a read-only
    `WidgetStore` handle, resolving the presented API key to a principal
    exactly as production does.
- **Identity without an identity provider**: by default the deployment is
  single-principal and has no sign-in — the container is meant for
  localhost or a trusted network. Setting `WIDGENTIC_TRUSTED_USER_HEADER`
  opts into multi-user: the named request header (`X-Forwarded-User` from
  oauth2-proxy, Cloudflare Access, Authelia, Tailscale Serve) becomes the
  identity subject through the store's existing `ensurePrincipal`. Unset,
  the header is ignored entirely, so a spoofed header can never create or
  reach an account.
- **Secrets without a vault, honestly ranked**: the existing
  `createLocalCipher` is the self-hosted cipher. The KEK is read from a
  mounted file (`WIDGENTIC_KEK_FILE`) or an environment variable, never
  generated silently — a missing KEK disables the secrets section rather
  than writing records that cannot be read back after a restart. This is
  weaker custody than widgentic's own deployment, where the KEK lives in a
  managed vault and no process ever holds it, and the documentation says so
  rather than implying parity: how to supply the key safely, what reading it
  would allow, and where to go for a stronger arrangement.
- **One shared example module** (`@widgentic-examples/shared`): the designer
  mount/dispose discipline and the typed authoring client stop being copied
  between hosts. `designer-brand-chrome` already landed and shipped as
  `@widgentic/designer@0.3.0`, so no example passes `chrome` at all and every
  host page derives its palette from `chromeCss(CHROME_DEFAULTS)` in a line
  or two — there is no palette copy left to share. `examples/designer` is refactored onto it
  like-for-like and the new example uses it, so the examples stay a
  consistent guide instead of three divergent snapshots. Designer
  construction, persistence and seeds stay at each example's call site — the
  part a reader came to read.
- **Docs**: a self-hosting page in `docs/develop/`, the SQLite adapter and
  the authoring surface in `run-your-own-server`, a README row for the
  example, and a `TESTING.md` entry for the compose smoke.
- The private apps repository is untouched by this change and keeps Cosmos
  and Key Vault — the SQLite adapter is for other people's deployments. It
  gains one follow-up of its own once this releases: mount the published
  authoring surface behind its session and delete its copy.

# Capabilities

## New Capabilities

- `authoring-api`: the write side of the store port as a hostable HTTP
  surface — the routes, refusal codes and trust rules by which a person
  authors their own catalog, beginning once the host has resolved a
  principal. Four requirements and part of two more migrate here from the
  private `widgentic-app` spec.
- `self-host-example`: a container image, a compose stack and the two
  hosts it runs — what a self-hosted widgentic serves, how identity is
  resolved without an identity provider, and what the two services may
  and may not do to the shared store.

## Modified Capabilities

- `widget-store`: a SQLite adapter joins the port's implementations, with
  the durability and concurrency guarantees a single-node deployment needs.
- `widget-secrets`: a vault is no longer the only supported production
  cipher — a self-hosted deployment supplies its own KEK, and the
  requirement that today says "in production" must say which deployment it
  is describing, keep widgentic's own vault-backed posture normative, and
  put the protection obligation on whoever holds a KEK in a process.
- `package-distribution`: `@widgentic/mcp`'s enumerated contents gain a
  third adapter subpath, and it is the first one that requires nothing to
  be installed alongside it; shared host wiring between examples gets one
  home; and "each capability maps to exactly one distribution unit" is
  corrected — it is already false for `package-distribution` and
  `docs-site`, so the requirement now covers capabilities that ship by
  being committed rather than published, and says such a change triggers
  no release.

# Impact

- `packages/mcp`: new `src/store/sqlite.ts` and `src/authoring/` with their
  tests; two new `exports` entries; root `tsconfig` paths; vitest aliases;
  `tools/exports.test.ts` snapshot grows from 16 entries to 18. A changeset
  (minor for `mcp`, so the linked group moves).
- `widgentic/apps` (later, its own change): adopt `@widgentic/mcp/authoring`,
  delete ~300 lines of `apps/web/api.ts`, and modify `widgentic-app` to
  reference the public capability. Not a prerequisite for anything here.
- `examples/docker`: new workspace — Dockerfile, `compose.yml`, the web
  host, the MCP host, the client bundle, and a README.
- `examples/shared`: new workspace holding the mount helpers and the typed
  authoring client; `examples/designer` refactored onto it with no behavior
  change (`standalone.html` untouched).
- Test gate: the authoring routes are covered in the package by the private
  repo's existing 546-line API suite, ported. The `examples` vitest project
  is then deliberately narrow — the identity rules only. Everything else
  rides on the workspace typecheck (which already spans `examples/`), the
  boundary test, and a `TESTING.md` compose smoke; CI gains an image-build
  job.
- Docs: `docs/develop/self-hosting.mdx` (new, plus nav), edits to
  `docs/develop/run-your-own-server.mdx`, `README.md`, `TESTING.md`.
- No production impact — this repository has no deployments.
