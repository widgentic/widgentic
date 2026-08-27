## Context

One private package (`widgentic`, `0.0.0`) with 14 source modules under `src/`; `exports` point at `.ts` files, `tsconfig.build.json` emits to `dist` but nothing consumes it; no `license`, `files`, CI or release tooling. The module graph is already layered — contract/adapters/theming/shared are leaves; catalog, mapper and mcp sit on contract; actions on catalog; templates and reactive on actions/catalog; secrets on actions; store on actions/catalog/secrets/templates/theming; mcp-server on all of those plus mcp; designer on actions/catalog/contract/reactive/templates/theming — with no edge from the would-be core into designer, store or the server. What is NOT yet package-shaped: 27 deep cross-module imports (`../catalog/schema.js`, `../shared/*`, `../actions/types.js`, `../theming/registry.js`), a mix of `widgentic/<module>` self-references (designer 48, store 35) and relative paths, `shared/` helpers used by five modules, app tests importing `../../../src/designer/*`, and the Azure/MCP SDK peers declared on the single package. Core modules contain no `node:` imports and no DOM access outside `reactive`/`designer`. See proposal.md — Why.

## Goals / Non-Goals

**Goals:**
- Make the package boundaries real and enforced before any code leaves the repository.
- Ship artifacts a stranger can `npm install` and import in Node 22+ and in a browser (core, designer) with correct types.
- Keep our apps and examples building from sources during development, with no publish step in the inner loop.
- Leave the physical repository split a mechanical `git subtree`/move, not a refactor.

**Non-Goals:**
- Moving apps/infra to the private repository (Phase 2, separate change).
- Changing any wire contract, tool, resource, HTTP route or designer behavior.
- Bundling core or mcp; supporting CommonJS consumers; supporting Node < 22 for `@widgentic/mcp`.

## Decisions

**D1 — Two repositories, not five.** A public monorepo `widgentic` (packages + examples) and a private `widgentic-apps` (apps + infra + runbook). Cross-package changes stay atomic and versioned together, one CI, one tooling setup; the apps need their own repository only because their visibility differs. Alternatives: one repository per package (version skew between core/designer/mcp on every change, three pipelines, examples drifting from HEAD); a single private repository publishing public packages (source not inspectable — defeats "public").

**D2 — Phase 1 (this change) = workspaces in place; Phase 2 = extraction.** Reorganizing into `packages/*` with real manifests, boundaries and a release dry-run, while apps keep consuming through the workspace, surfaces every coupling problem where it is cheapest to fix. Examples stay in the public monorepo as workspaces (always tested against HEAD, published-version pinning is a one-line change later); nothing prevents extracting them since they consume only package entries.

**D3 — Package contents.**

| package | modules | subpath entries |
|---|---|---|
| `@widgentic/core` | contract, adapters, mapper, catalog, theming, templates, actions, reactive, shared | `.` (curated root), `./contract`, `./adapters`, `./mapper`, `./catalog`, `./theming`, `./templates`, `./actions`, `./reactive` |
| `@widgentic/designer` | designer | `.`, `./browser` (single-file bundle) |
| `@widgentic/mcp` | mcp, mcp-server, store, secrets | `.` (server building blocks + output convention), `./sdk` (assembly on the official SDK), `./store`, `./store/cosmos`, `./secrets`, `./secrets/keyvault` |

Store and secrets live in `@widgentic/mcp` because they exist to serve its per-principal model (keys, catalogs, secrets for actions); a separate `@widgentic/store` would add a release unit without a consumer. Revisit if a non-MCP host needs the store. The `mcp` module (output convention: emit/extract/capability) is MCP-specific and goes with the server, not core.

**D4 — `shared/` helpers.** `isPlainObject` becomes a public `@widgentic/core` export (a legitimate consumer utility: "is this a plain JSON object"). `clone` and `errorMessage` (three lines each) are copied into designer and mcp rather than exported. Alternative rejected: `@widgentic/core/internal` marked semver-exempt — a public path is a public path, and consumers will import it.

**D5 — Import rules and enforcement.** Cross-package: package specifier only (root or a declared subpath); intra-package: relative. Allowed edges: core → nothing; designer → core; mcp → core; apps → anything; examples → packages only. `node:` imports are forbidden in core and designer; `@widgentic/mcp` requires Node ≥ 22 (`net.BlockList`, `AbortSignal.timeout`, global `fetch`). One boundary test at the workspace root (`tools/boundaries.test.ts`) reads every source file and checks specifiers against this table, replacing the two module-local source scans. It runs in the default `vitest` gate, like the type suites.

**D6 — Build and resolution.** Per-package `tsc -p tsconfig.build.json` emits ESM, `.d.ts` and maps to `dist`; `exports` reference `dist` with the `types` condition first. Development never needs a build: the root `tsconfig` maps `@widgentic/*` to `packages/*/src` via `paths` (honored by `tsc`, `tsx` and vitest through a matching `resolve.alias`). Alternatives: a bundler (tsup/tsdown) — rejected, subpath entries and readable output matter more than one file; `publishConfig.exports` rewriting — pnpm-only, npm ignores it; committing `dist` — never.

**D7 — Dependency declarations.** core: no `dependencies`. designer: `dependencies: { "@widgentic/core": "^x" }` (the workspace resolves to the local package until publish). mcp: `dependencies` core; `@modelcontextprotocol/sdk`, `@modelcontextprotocol/ext-apps` and `zod` as **optional** peer dependencies — the existing `mcp-server` spec requires the base entry to stay importable without any SDK, so only hosts importing `./sdk` install them; `@azure/cosmos`, `@azure/identity`, `@azure/keyvault-keys` optional peers imported only by `./store/cosmos` and `./secrets/keyvault` (the dynamic import stays for the Key Vault client). A host importing `@widgentic/mcp` root with none of these installed must work; a missing peer surfaces as a clear module-not-found at the entry that needs it.

**D8 — Designer browser bundle.** esbuild produces `dist/browser/widgentic-designer.js` (single-file ESM, registers the custom elements, core inlined) for hosts without a bundler; the module build stays the primary entry for bundler users. The committed `examples/designer/designer.bundle.js` is already gitignored; the example serves the built file.

**D9 — Versioning and release.** Changesets with a `linked` group (core, designer, mcp move together on minor/major), `0.x` until the first stable line, one CHANGELOG per package. CI: typecheck, `vitest run`, per-package build, `npm pack --dry-run` inspected for stray sources/tests, `publint` + `@arethetypeswrong/cli` on the packed tarballs. Publishing through GitHub Actions with npm provenance (OIDC trusted publishing). `LICENSE` added — **MIT** for the public packages (owner decision, 2026-08-27); the `@widgentic` npm scope is already registered to us.

**D10 — API surface as a reviewed artifact.** A snapshot test per package records the sorted export names of every entry; surface growth or loss is a visible diff. Edge helpers our app needs (`readBodyText`, `positiveIntFromEnv`, `createExecutionLimiter`, `guardedJsonFetch`) stay exported from `@widgentic/mcp` as server building blocks — they are exactly what a host building its own server needs.

**D11 — Tests move with their modules.** `__tests__` folders travel; vitest `projects` per package (designer under happy-dom, everything else node) plus the root `tools/` project for boundary and snapshot checks; type suites (`.test-d.ts`) stay in the default gate.

**D12 — Docs and specs.** Each package gets a README (install, entries, one example); the root README's architecture diagram is keyed by package. TESTING.md splits into package testing (stays) and the deployment runbook (moves with the apps in Phase 2). OpenSpec capabilities map to packages in the new spec; `widgentic-app` moves with the apps in Phase 2, everything else stays public.

## Risks / Trade-offs

- **Import churn touches most files.** Mitigated by a scripted codemod for the `widgentic/<module>` → `@widgentic/*` mapping and the boundary test catching what the script misses; behavior is unchanged, so the full suite is the safety net.
- **`exports` → `dist` while development runs on sources.** Two resolution paths can drift (a subpath present in `paths` but missing from `exports`). Mitigated by the pack smoke test: install the packed tarballs into a scratch project and import every documented entry.
- **Linked versions bump designer and mcp when only core changes.** Accepted for 0.x; independent versioning is a one-line Changesets change later.
- **Duplicated `clone`/`errorMessage`.** Six lines of duplication versus a public internal API; accepted.
- **Provenance requires a GitHub-based release workflow with trusted publishing configured on the (already owned) `@widgentic` scope.** Publishing stays a dry run until that configuration exists; nothing else blocks on it.

## Resolved Questions

- License: **MIT** for the public packages (decided 2026-08-27).
- npm scope: `@widgentic` is already registered to us; the release workflow can target it from the first version.
