## 1. Decisions and workspace scaffolding

- [ ] 1.1 Add the MIT `LICENSE` (decided) and reference it from every public manifest; configure npm trusted publishing for the already-registered `@widgentic` scope (publishing stays dry-run until the workflow is wired)
- [x] 1.2 Turn the root `package.json` into a private workspace root (`workspaces: ["packages/*", "apps/*", "examples/*"]`, shared devDependencies and scripts), create `packages/core`, `packages/designer`, `packages/mcp` skeletons
- [x] 1.3 Root `tsconfig.json` with `paths` `@widgentic/*` → `packages/*/src`, per-package `tsconfig.json` / `tsconfig.build.json` (`rootDir: src`, `outDir: dist`, declarations + maps); vitest `projects` per package plus a root `tools` project, `resolve.alias` matching `paths`

## 2. Move modules into packages

- [x] 2.1 `packages/core/src`: move contract, adapters, mapper, catalog, theming, templates, actions, reactive, shared with their `__tests__`; add the curated root `index.ts` and the subpath entries; export `isPlainObject` publicly
- [x] 2.2 `packages/designer/src`: move designer with its tests; local `clone`/`errorMessage`
- [x] 2.3 `packages/mcp/src`: move mcp (as `output`), mcp-server, store, secrets with their tests; entries `.`, `./sdk`, `./store`, `./store/cosmos`, `./secrets`, `./secrets/keyvault`; local `clone`/`errorMessage`

## 3. Imports and boundaries

- [x] 3.1 Codemod every `widgentic/<module>` specifier in packages, apps and examples to the `@widgentic/*` mapping; intra-package imports stay relative
- [x] 3.2 Remove cross-package deep imports: `secrets → actions/types` (import `SECRET_NAME` from `@widgentic/core`), `designer/seed → theming/registry`, all `shared/` consumers outside core, `apps/web` tests → `@widgentic/designer`
- [x] 3.3 `tools/boundaries.test.ts`: allowed edge table, no deep imports across packages, no `node:` in core/designer, every specifier resolvable to a declared `exports` entry; delete the two module-local source-scan tests it replaces
- [x] 3.4 Export snapshot test per package entry (sorted names), committed snapshots reviewed once

## 4. Manifests and build

- [x] 4.1 `package.json` per public package: `name`, `version 0.1.0`, `license`, `type: module`, `exports` (types + default → `dist`), `files: ["dist"]`, `sideEffects: false`, `engines.node >=22`, `repository`, `publishConfig.access public`, dependencies per D7
- [x] 4.2 Build scripts (`npm run build` builds all packages in dependency order); `npm pack --dry-run` shows dist only; `publint` and `@arethetypeswrong/cli` pass on the packed tarballs
- [x] 4.3 Designer browser bundle (`dist/browser/widgentic-designer.js`) built by esbuild; `examples/designer` serves it
- [x] 4.4 Dockerfile installs the workspace and builds packages; `apps/*` import `@widgentic/*`; `npm run mcp:http` / `npm run web` run on sources via `paths`

## 5. Release pipeline

- [x] 5.1 Changesets: config with a linked group (core, designer, mcp), initial changeset for `0.1.0`, CHANGELOG per package
- [x] 5.2 GitHub Actions: CI workflow (typecheck, `vitest run`, build, pack dry-run, publint/attw); release workflow with npm provenance, gated behind the scope confirmation (dry-run until then)

## 6. Docs and specs

- [x] 6.1 README per package (install, entries, minimal example); root README architecture keyed by package and the `@widgentic/*` specifiers
- [x] 6.2 TESTING.md: package-testing section separated from the deployment runbook (runbook marked "moves with the apps")
- [x] 6.3 Record the capability → package map in the `package-distribution` spec; note that `widgentic-app` moves with the apps in Phase 2

## 7. Verification

- [x] 7.1 Full suite + typecheck green on the workspace; `openspec validate --strict`
- [x] 7.2 Pack smoke test: install the three tarballs into a scratch project (Node 22) and import every documented entry; import `@widgentic/core` and `@widgentic/designer` in a browser context (happy-dom) without `node:` resolution
- [x] 7.3 Deploy the next version from the workspace Dockerfile; verify served bytes unchanged in behavior; TESTING.md entry
