## 1. Core — the format engine and the bind transform

- [ ] 1.1 A format module beside `formatValue` in `packages/core/src/catalog/widgets/` (or `templates/`, wherever the import graph is cleanest): `formatBoundValue(value, spec)` — number/currency via `Intl.NumberFormat` (default locale `en-US`), date via the token engine (`yyyy MM dd HH mm ss`, unzoned ISO → UTC, formatted in UTC), numeric-string parsing, unparseable → raw `formatValue` output; exported constants for the bounds and token allowlist (the validator and the guide read them — design D4, D6).
- [ ] 1.2 `packages/core/src/templates/` compile: `{ bind, format }` on text nodes and attr values renders through the engine; `validate`: the format checks (unknown type, decimals range, currency shape, pattern allowlist/bound, locale shape, transform mutual exclusion, format without bind) with dotted paths.
- [ ] 1.3 Core tests: the three format scenarios (currency over a numeric string, the `dd-MM-yyyy HH:mm` ISO case asserting the exact output, unparseable → raw), attr-value formats, the validation scenario's four malformed shapes, and determinism (two renders byte-equal).

## 2. Core — per-item projection

- [ ] 2.1 `packages/core/src/actions/execute.ts` `applyOutput`: when `map` has no `"."` entry and the projection input is an array, apply the entries per item (design D2); `"."`-alone semantics untouched.
- [ ] 2.2 Tests: the ticker scenario (array in, per-item projected array out, unmapped fields dropped), `"."` root addressing over an array (`{ ".": "0" }`), per-item result still re-validated against the widget's schema, and `merge` still refusing arrays.

## 3. Designer — completion and editors

- [ ] 3.1 `packages/designer/src/schema-paths.ts`: `collectPaths` descends arrays (root arrays included) mirroring `schemaAt`'s branch; new `schema-paths.test.ts` pinning root-array, nested-array and depth semantics directly (design D1, D5).
- [ ] 3.2 `packages/designer/src/template-panel.ts`: `itemScope` collapses into `schemaAt(scope, eachPath)` + the `.items` step, making `each: "."` scope to the root array's item schema; the each dropdown offers `"."` for a root-array scope.
- [ ] 3.3 `editors.test.ts` "schema-driven path pickers": the root-array fixture — `each` offers `"."`, binds inside complete with `ask/bid/book/date`; keep the no-schema free-text case distinguished from the root-array case.
- [ ] 3.4 `packages/designer/src/action-editor.ts` output-map editor: item properties offered when either schema is an array; the mismatch check compares item types across two array sides (`typesConflict` extension or a pre-step); `binding.test.ts` cases for both.
- [ ] 3.5 Bind rows (text + attr) gain the compact format editor (none/number/currency/date with that type's fields), committing the `format` transform; `editors.test.ts` round-trip: author a currency format in the tree, see it in the draft JSON and the preview output.
- [ ] 3.6 Confirm the action input-mapping and `load` completions also benefit from the root-array fix (they share `allPaths`) — one assertion each.

## 4. Guide and docs

- [ ] 4.1 `packages/mcp/src/server/guide.ts`: the template forms line and `rules.template` teach `{ bind, format }` with the vocabulary read from the exported constants and the ticker currency recipe (design D6); guide tests extended (drafted-from-guide widget with a currency and a date format passes `checkStoredWidget`).
- [ ] 4.2 `npm run docs:generate`; sweep hand-written docs that enumerate the transforms (the template DSL page, authoring pages) for `format` and the per-item projection sentence.
- [ ] 4.3 `TESTING.md`: dated verification-log entry.
- [ ] 4.4 Changesets: minor `@widgentic/core` (transform + per-item projection), minor `@widgentic/designer` (completions + editors), minor `@widgentic/mcp` (guide).

## 5. Gate

- [ ] 5.1 `npm run typecheck`, `npm test`, `npm run build`, `npm run pack:check` all green.
- [ ] 5.2 `openspec validate --strict array-projection-and-formats` and `openspec validate --specs`.
- [ ] 5.3 Acceptance rig: the user's ticker end to end — root-array schema, `each: "."`, per-item projection over the sample response, `ask` as COP 0-decimals, `date` as `dd-MM-yyyy HH:mm` — through the real render pipeline, asserting the served bytes.
