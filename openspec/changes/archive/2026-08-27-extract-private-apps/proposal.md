## Why

Phase 1 (`package-split-readiness`) made the package boundaries real and published `@widgentic/core`, `@widgentic/designer` and `@widgentic/mcp` 0.1.0. Our own MCP server, the widgentic.dev web app, the Azure infrastructure and the deployment runbook still live in the public monorepo and consume the packages through workspace links. Now that published versions exist, the apps can move to their own private repository and depend on them like any other host — which is what keeps deployment configuration, operational notes and the hosted app's specification out of the public tree and makes `widgentic/widgentic` exactly the three packages plus the examples.

## What Changes

- **New private repository `widgentic/apps`** receives `apps/mcp-server`, `apps/web`, `infra/`, `Dockerfile`, `.dockerignore`, the deployment sections of TESTING.md (as its runbook) and the `widgentic-app` capability spec (as its own OpenSpec root), with the git history of those paths preserved where tooling allows.
- **The apps consume published packages.** `@widgentic/core|designer|mcp` become regular `^0.1.0` dependencies resolved from npm; no workspace links, no `tsconfig` `paths`. Working on a package change from the app side goes through `npm link` (documented), never through committed source paths.
- **The private repo gets its own scaffolding:** single-package manifest with the runtime and dev dependencies the apps actually use, `tsconfig`, vitest, a CI workflow (typecheck + tests), a README, the runbook, and the Dockerfile adjusted to the new layout. Deployment mechanics (`az acr build` → Bicep) do not change.
- **Deployment continuity:** the first image from the new repository (v59) is built, deployed and verified BEFORE the public repository removes the apps, so production never depends on a tree that no longer exists.
- **The public repository shrinks:** `apps/`, `infra/`, `Dockerfile`, `.dockerignore` removed; `mcp:http`/`web` scripts, the `apps` workspace and vitest project, the `apps/**` tsconfig include and the apps rules in the boundary test go with them; README's hosted-endpoint and web-app sections become pointers; TESTING.md keeps package testing, the basic-host and per-principal-store sections and the host registration snippets, and points at the runbook for production.
- **BREAKING** for contributors of the public repo: `npm run mcp:http` and `npm run web` leave; `npm run mcp` (the stdio example) stays.

## Capabilities

### New Capabilities
_None._

### Modified Capabilities
- `package-distribution`: "Apps and examples consume the public entries" — the examples keep consuming sources in development; our apps now live in the private repository and consume published versions.
- `widgentic-app`: all eight requirements are REMOVED from this repository's specs — the capability relocates unchanged to the private repository's OpenSpec root (`widgentic/apps`), where the app's behavior continues to be specified.

## Impact

- Two repositories: this one loses ~20 files and four config references; `widgentic/apps` is created from them.
- Production: one deploy (v59) from the new repository; identical images and configuration otherwise.
- Process: app work that needs a package change now goes package release → dependency bump; `.claude/settings.local.json` (the `az` allow rules) must be recreated in the new checkout by the owner.
- Owner prerequisites before apply: create the private repository `widgentic/apps` (empty) on GitHub.
