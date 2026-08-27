## Context

After `package-split-readiness` the monorepo is `packages/*` + `apps/*` + `examples/*` under npm workspaces; the apps import `@widgentic/*` through workspace symlinks and the root `tsconfig` `paths`. The apps are 13 source files (`apps/mcp-server/http.ts`; `apps/web/{api,app,auth,http,main}.ts`, `index.html`, four test files), `infra/main.bicep` + `deploy.params.template.json`, `Dockerfile` and `.dockerignore`. They use `@modelcontextprotocol/sdk`, `esbuild` (the web app bundles `main.ts` at boot), the Azure clients by dynamic import, and `tsx` at runtime in the image. The public repo references them in `package.json` (workspace, `mcp:http`/`web` scripts), `tsconfig.json`, `vitest.config.ts` (an `apps` project), `tools/boundaries.test.ts`, README (hosted endpoint, widgentic.dev app) and TESTING.md (Production, the app, the remote rig, the verification log). Those paths carry 24 of the repo's 115 commits. `git filter-repo` is not installed on the dev VM. Published `0.1.0` packages exist with provenance. See proposal.md — Why.

## Goals / Non-Goals

**Goals:**
- Move the apps, infra and runbook to `widgentic/apps` with their history, consuming published packages, without a production gap.
- Leave `widgentic/widgentic` with no private code, no deployment configuration and no references to either.
- Keep the deploy mechanics and the operational knowledge (runbook, verification log) intact in the private repo.

**Non-Goals:**
- Automating deployment from GitHub Actions (the runbook's `az acr build` + Bicep flow stays manual).
- Dependency-update bots, a second private package, or changing any app behavior.
- Moving the examples out (they stay in the public repo per Phase 1 D2).

## Decisions

**D1 — Extraction preserves history, with a declared fallback.** Preferred: `git filter-repo` (a single-file Python tool installed into the scratch environment, not the repo) over a fresh clone with `--path apps --path infra --path Dockerfile --path .dockerignore --path TESTING.md --path openspec/specs/widgentic-app`, producing a history that contains only those paths; the result is pushed to the empty `widgentic/apps`. Fallback if the tool cannot be installed: a single initial commit whose message records the source commit (`widgentic/widgentic@<sha>`), where the full history remains reachable. Alternatives rejected: `git subtree split` (one prefix at a time, cannot combine paths); `git filter-branch` (deprecated, slow, error-prone).

**D2 — Private repo layout: one plain package, no workspaces.**
```
widgentic/apps
  package.json          private; deps: @widgentic/core|designer|mcp ^0.1.0, @modelcontextprotocol/sdk, @modelcontextprotocol/ext-apps, zod,
                        @azure/cosmos, @azure/identity, @azure/keyvault-keys, esbuild, tsx (runtime); dev: typescript, vitest, happy-dom, @types/node
  tsconfig.json         strict options as today, NO paths — @widgentic/* resolve to the installed dist + d.ts
  vitest.config.ts      apps/**/__tests__
  apps/mcp-server/http.ts, apps/web/…            unchanged paths, so scripts and the Dockerfile stay recognizable
  infra/main.bicep, infra/deploy.params.template.json
  Dockerfile, .dockerignore                      COPY package.json package-lock.json tsconfig.json apps → npm ci → npx tsx apps/mcp-server/http.ts
  RUNBOOK.md            the moved TESTING sections: Production, The widgentic.dev app, Remote demo rig, Verification log (deploy entries)
  openspec/             own root: project context, specs/widgentic-app/spec.md (verbatim), changes/
  .github/workflows/ci.yml   typecheck + tests on push/PR
  README.md             what runs here, how to run locally, link to the runbook, npm link recipe
```
Everything that the apps import from `@widgentic/*` is exported by a published entry (Phase 1 guaranteed it), so no source path is needed. The per-app `package.json` files created in Phase 1 disappear (they existed only to be workspaces).

**D3 — Dependency mode: published versions, `npm link` for in-flight package work.** The apps declare `^0.1.0`. When an app change needs a package change, the order is: change the package in `widgentic/widgentic` → changeset → release → bump the range in `widgentic/apps`. For iterating locally before the release: `npm link @widgentic/core @widgentic/designer @widgentic/mcp` (after `npm link` in each package dir of a built monorepo checkout) — documented in the apps README, never committed (`file:` deps are rejected in review). Alternative rejected: git submodule of the monorepo (drags the whole public tree into the private repo and defeats "consume published versions").

**D4 — Sequencing protects production.** (1) Create `widgentic/apps` (owner), push the extracted history, get its CI green against `0.1.0`. (2) Build v59 from the new repo's Dockerfile, deploy with the same Bicep and params, verify (health, tools, served bundle). (3) Only then commit the removal in `widgentic/widgentic`. (4) Archive the change in the public repo (spec deltas sync: `widgentic-app` retired here, `package-distribution` updated); the private repo's OpenSpec starts with `widgentic-app` as its first main spec. If (2) fails, nothing has been removed and production still runs v58 from the public tree.

**D5 — What the public repo keeps and how it changes.** Removed: `apps/`, `infra/`, `Dockerfile`, `.dockerignore`, `apps/*` workspace entry, `mcp:http` and `web` scripts, the `apps` vitest project, `apps/**/*.ts` in tsconfig, the apps rules and `@widgentic-apps/` case in the boundary test (examples rules stay). README: "Hosted endpoint" and "The widgentic.dev app" collapse to a short paragraph naming the public URLs and pointing at the private repo; "Serving per-principal catalogs" stays (it documents `@widgentic/mcp/store`). TESTING.md: keeps Layout (rewritten), Entries (trimmed) and the host registration snippets; Production, the app, the remote rig, the verification log's deployment entries AND — found during apply — the basic-host and per-principal-store procedures (both start the app's `mcp:http` entry, which no longer exists here) move to RUNBOOK.md with a pointer left behind. `.github/workflows/ci.yml` needs no change (it runs the workspace scripts).

**D6 — Root devDependencies are pruned only where the apps were the sole consumer.** `esbuild` stays (the designer bundle and the designer example use it); `@azure/*`, MCP SDK, zod stay (mcp tests); nothing else was apps-only. The lockfile is regenerated after the workspace removal.

**D7 — Specs.** `widgentic-app` is REMOVED from this repo (eight requirements, each with the relocation reason) and re-homed verbatim in the private repo's OpenSpec root; `package-distribution`'s "Apps and examples consume the public entries" is rewritten so examples stay on sources and the apps are declared to live elsewhere on published versions. No other spec names the apps.

**D8 — Local environment for the owner.** The new checkout needs `.claude/settings.local.json` (gitignored) with the `az acr build` / `az deployment group create` allow rules recreated, and the same Azure CLI identity; the Key Vault references in the params template are unchanged.

## Risks / Trade-offs

- **History extraction depends on installing `git filter-repo`.** If it cannot be installed, the fallback loses per-file history in the private repo (it stays in the public repo) — acceptable, documented in the initial commit.
- **Two-repo friction for app changes that need package changes.** Mitigated by `npm link` for iteration and by the release pipeline being cheap (changeset → merge → publish).
- **A published-version bug reaches the apps only via a bump**, which is also the protection: the apps never run unreleased package code in production.
- **The verification log splits.** Package-level entries stay, deploy entries move; both files point at each other.

## Resolved Questions

- Repository name: `widgentic/apps` (recommended earlier; parallel to the `apps/` directory).
- Deploy from the private repo stays manual (runbook), same ACR and Bicep.
