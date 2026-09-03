## 1. Tools

- [x] 1.1 `guide.ts`: `buildDesignerGuide(prefix)` and `dslCheatSheet(prefix)`; store constants copied with a keep-in-step note.
- [x] 1.2 `reference-tools.ts`: `authoring_guide` and `widget_definition_check`; `tools.ts` registers three reference tools; editing descriptions carry the cheat sheet; theme/schema load descriptions gain tokens and the schema subset.
- [x] 1.3 Tests: counts and names (14), read-only set, description terms under both prefixes, guide contents derived from core, check tool verdicts and side-effect freedom.

## 2. Docs and release

- [x] 2.1 Package README, co-author docs page, host matrix (ChatGPT row), self-host README, root README: the two new tools and the host-automation statement.
- [x] 2.2 Changeset minor for `@widgentic/webmcp`; TESTING.md log entry; `npm run typecheck`, `npm test`, `npm run build`, `npm run pack:check`, `npm run docs:check` green; `openspec validate --strict`.
- [x] 2.3 Archive, commit, push; after the release: apps bump `^0.2.0`, demo v4 and widgentic.dev redeploy (apps repo).
