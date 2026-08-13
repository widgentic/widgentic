# Design — Apps Layout

## Context

Three kinds of code share the repo: the library (`src/`, zero runtime deps, eleven export entries), deployables (today one — the MCP server — currently misfiled under `examples/`), and genuine demos (the designer rig). The misfiling has consequences: library tests import across into `examples/`, the Dockerfile ships demo code, and the next deployable (change 3) had nowhere honest to go.

## Goals / Non-Goals

**Goals:** a layout where the directory name states the contract — `src/` is the library, `apps/` is deployed, `examples/` is disposable. Zero behavior change.

**Non-Goals:** building `apps/web/` (change 3); renaming packages or export entries; touching the designer demo beyond its two import paths.

## Decisions

**D1 — `apps/` over top-level folders or `servers/`+`app/`.** One wrapper for all deployables matches the monorepo convention readers already know, keeps the root listing flat as deployables accumulate, and avoids the `servers/`-vs-`app/` ambiguity once the web app also serves an API. The designer demo keeps its path, so the rig (`:9446`, `npm run designer`, TESTING.md runbook) is untouched.

**D2 — Promote `app-template.ts`, don't just move it.** The template is infrastructure every widgentic deployment must serve: the library already exports `WIDGENTIC_APP_TEMPLATE_URI` and the mime type for it, and its test already sits in `src/mcp-server/__tests__/`. Exporting `buildAppTemplate()` from `widgentic/mcp-server` removes the last cross-import in that suite and lets any host serve the loader without copying a file. The `./mcp-server` entry keeps its "no MCP SDK dependency" property — the template imports only `widgentic/theming`.

**D3 — The image slims down instead of following the demo.** The Dockerfile copied `examples/` wholesale, so the production image carried the designer rig. After the move it copies `src/` and `apps/` only; `examples/` never enters the build context. Same base, same entry semantics, smaller context.

**D4 — Widgets stay with the server, not the library.** `widgets/` (invoice, x-post) are this deployment's catalog additions, not library code — a different deployment composes its own. They move to `apps/mcp-server/widgets/`; the designer demo and the two `src/` tests that use them as fixtures update their import paths rather than promoting deployment content into `src/`.

## Risks / Trade-offs

- [Path churn in docs and muscle memory] → one-time; README, TESTING.md, and the npm scripts all update in the same commit, and `npm run mcp` / `mcp:http` keep their names.
- [Import-path mistakes during the move] → the full test suite and typecheck run after; the four known cross-imports are enumerated in tasks so none is discovered by failure.
- [Archived changes and old specs mention `examples/mcp-server`] → history is left as written; only living specs are synced.

## Migration Plan

Pure `git mv` + reference fixes in one change. Nothing deploys; the next image build (change 3's `v11`) uses the new paths. Rollback is `git revert` of a single commit.
