## Why

widgentic is one private npm package whose `exports` point at TypeScript sources, with the engine, the designers, the MCP server building blocks, our production apps and the sample hosts sharing a single dependency graph and two import styles (`widgentic/<module>` self-references and relative paths across modules). Publishing `@widgentic/core`, `@widgentic/designer` and `@widgentic/mcp` for external reuse — and moving our own apps to a private repository — requires explicit package boundaries, real build artifacts, honest dependency declarations and a release pipeline first; splitting before that would freeze today's accidental coupling into public APIs.

## What Changes

- **Workspaces, not yet separate repositories.** The repository becomes an npm-workspaces monorepo: `packages/core`, `packages/designer`, `packages/mcp`, with `apps/*` (private, deployed by us) and `examples/*` (sample hosts) as workspaces too. The physical split (apps + infra to a private repository consuming published versions) is a follow-up change once the packages publish; this change makes it mechanical.
- **Package contents.** `@widgentic/core` = contract, adapters, mapper, catalog, theming, templates, actions, reactive (definitions, validation, rendering; browser- and Node-safe). `@widgentic/designer` = the designer library (widget, theme, schema and action designers, custom elements, a single-file browser bundle). `@widgentic/mcp` = the MCP output convention, the server assembly and its building blocks, the per-principal store (memory, file; Cosmos behind a subpath) and secrets (envelope cipher; Key Vault behind a subpath).
- **Import discipline.** Cross-package imports use package specifiers (`@widgentic/core`, `@widgentic/mcp/store`, …); imports inside a package stay relative; deep imports into another package's internals disappear (today: `secrets → actions/types`, `designer → theming/registry`, every consumer of `shared/`, and app tests reaching into `src/designer`). A boundary check enforces the allowed edges and keeps `node:` out of core and designer.
- **Publishable manifests.** Each public package emits ESM + declarations to `dist`, declares `exports` (types + default per entry), `files`, `sideEffects: false`, `engines`, `license`, `publishConfig`, and its dependencies honestly: core has none; designer and mcp depend on core; mcp declares `@modelcontextprotocol/sdk`, `@modelcontextprotocol/ext-apps` and `zod` as optional peers (needed only by the `./sdk` entry, so the base entry stays SDK-free as the `mcp-server` spec requires) and the Azure clients as optional peers needed only by their subpaths.
- **Release pipeline.** Changesets with a linked version group, CI (typecheck, tests, build, pack dry-run, boundary and export-snapshot checks) and publishing with npm provenance. The repository gains an MIT `LICENSE` — it has none today.
- **BREAKING for in-repo consumers:** `widgentic/<module>` specifiers become `@widgentic/core`, `@widgentic/designer`, `@widgentic/mcp`, `@widgentic/mcp/sdk`, `@widgentic/mcp/store`, `@widgentic/mcp/store/cosmos`, `@widgentic/mcp/secrets`, `@widgentic/mcp/secrets/keyvault`. Wire contracts (payloads, tools, resources) do not change.
- **Docs.** Per-package READMEs; the root README's architecture keyed by package; TESTING.md separated into package testing (public) and the deployment runbook (moves with the apps); the capability → package map recorded in the new spec.

## Capabilities

### New Capabilities
- `package-distribution`: what the published packages guarantee downstream — contents and boundaries, consumable artifacts, runtime targets, dependency declarations, versioning and provenance, and how the repository's own apps and examples consume them.

### Modified Capabilities
- `mcp-server`: "Server assembly is a library export", "Formal Apps declaration at the wiring layer" and "Runnable server and SDK interoperability" name `widgentic/mcp-server` / `widgentic/mcp-server/sdk`; they become `@widgentic/mcp` / `@widgentic/mcp/sdk`.
- `mcp-widget-output`: "MCP module programmatic surface" names `widgentic/mcp`; it becomes `@widgentic/mcp`.
- `widget-contract`: "TypeScript type exports" names `widgentic/contract`; it becomes `@widgentic/core`.

## Impact

- Code: every cross-module import in `src/`, `apps/`, `examples/` (a codemod plus the boundary check); package manifests and build configs; root tsconfig (`paths`) and vitest (projects + alias); Dockerfile (workspace install and build).
- Behavior: none for MCP hosts or the web app's users — tool names, payloads, resources and HTTP routes are unchanged.
- Process: releases become explicit (changesets, versions, provenance); the private apps repository consumes published versions after Phase 2.
- Decided: the public packages are MIT-licensed; the `@widgentic` npm scope is already registered to us.
