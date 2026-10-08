# Design — Staging from a branch: a source-build image and a startup seed

## Context

See proposal.md — Why. What shapes the approach:

- `examples/docker/Dockerfile` builds with `examples/` as context and installs the
  `@widgentic/*` packages from the registry at the manifest's ranges; the sibling example
  folders arrive as `file:` dependencies copied with `--install-links`. An import smoke
  proves the entries the services load.
- The packages build with `tsc -p tsconfig.build.json` per workspace (designer also bundles
  for the browser) in the order core, designer, webmcp, mcp, resolving each other through
  workspace links; the root `npm ci` brings the toolchain.
- The authoring service (`web.ts`) is the only writer; the MCP service holds a read-only
  store type. In single-principal mode the principal is `ensurePrincipal("local:default")`.
- The demo deployment runs both containers in one replica over an `EmptyDir`, so every new
  revision starts empty.

## Goals / Non-Goals

**Goals:** any branch or working tree can be built into the demo image in one command;
the image runs that branch's code laid out as a published install would be; every deploy
starts with the same sample content.

**Non-Goals:** publishing prereleases to npm (the `@next` snapshot path stays a later
option); persistent storage for the demo; writing keys or secrets into the store, or
seeding principals in trusted-header mode; changing the published-package image.

## Decisions

### D1 — Pack, then install tarballs; never copy the workspace

The builder stage runs `npm ci` and `npm run build` at the repository root, then `npm pack`
for the four packages. The runtime stage is the published Dockerfile's, except that the
manifest's four `@widgentic/*` ranges, and `overrides` for the same names, are rewritten to
the tarballs before `npm install`, so the example's own dependencies and the sibling
examples' dependencies all resolve to one packed copy of each package.

Installing tarballs exercises each package's `files` list and `exports` map exactly as a
registry install does: a missing `dist` entry fails the import smoke here as it would for a
reader. The heavy root toolchain (Mintlify, Vitest, Azure clients) stays in the discarded
builder stage.

*Alternatives.* Running the example inside the workspace (symlinked packages) is simpler
but ships the whole dev toolchain and resolves through `src`-adjacent layouts that no
reader ever gets. `npm link` is the documented local recipe, but it does not survive a
container build.

### D2 — Root context, root `.dockerignore`

The variant needs `packages/`, the lockfile and the root manifest, so its context is the
repository root. A root `.dockerignore` excludes `node_modules`, `dist`, `.git`, `docs`,
`openspec` and the example's local data, key and env files. BuildKit and `az acr build`
both honor a root `.dockerignore`; the published build keeps its own
`Dockerfile.dockerignore` for its `examples/` context.

### D3 — Seed in the writer, skip what exists, never overwrite

`web.ts` runs the seed after identity is resolved: only the authoring service may write,
and the single principal exists only then. Each entry goes through the store's `put*`
method, so validation, structural limits and reference checks are the same as for a
person's import. "Already held" is decided from the store's own listings, by schema,
theme and action `name` and widget `kind`. Skip-not-overwrite matters on persistent
stores: a restart must never undo what a person edited. Order is schemas, themes, actions,
widgets, because widgets reference schemas and actions.

A seed is a convenience, so a broken file or a refused entry is logged and the service
starts anyway; the summary line makes a partial seed visible.

### D4 — Sample content lives with the example

`examples/docker/seed/demo.json` holds the demo's current content, copied from the live
demo's exports. It ships in the public image like the rest of the folder, and the demo
deployment points `WIDGENTIC_SEED_FILE` at it. The entries are kept verbatim.

### D5 — CI builds the variant

A `selfhost-source-image` job builds `Dockerfile.source` on every pull request. It is not
a required check: the required `verify` and `docs` gates stay as they are, and a red
source build is a signal to look, not a merge block.

### D6 — A deployment key at the edge, not in the store

Keys live in the store, so an empty store loses them and every host pointed at the
deployment needs repointing after each deploy. The MCP service instead accepts one
operator-supplied key from a mounted file or a variable, held only as its digest and
compared in constant time, that resolves to the single principal: the principal's id
derives from its subject, so it is the same on every boot. Scopes go through the same
normalization a minted key gets, read-only unless the operator names `execute`. An
operator can reuse the key the hosts already hold, so even the first deploy needs no
repointing.

*Alternative.* Registering an operator-supplied raw key in the store (an import method
on the store port) would list it in the app, but changes the port for every adapter and
still needs the raw value at each boot; the edge check needs neither.

## Risks / Trade-offs

- [Root `npm ci` in the builder is slow] → Builder-stage only; staging builds are
  occasional and ACR caches layers per tag lineage.
- [A dependency's install script fails on Alpine in the builder] → The builder can switch
  to a Debian base without touching the runtime stage.
- [Seed content drifts from what the demo shows] → The file is the source of truth for
  staging. Edits made on the demo are lost at the next deploy, which the page already says.
- [The demo becomes a moving target for anyone who bookmarked it] → Accepted; the domain
  stays, and the runbook records which branch each deploy came from.

## Migration Plan

Additive. Merge, then build the variant from the branch to stage, and deploy with the
apps repo's `selfhost.bicep` with `WIDGENTIC_SEED_FILE=/srv/docker/seed/demo.json` on the
web container.
