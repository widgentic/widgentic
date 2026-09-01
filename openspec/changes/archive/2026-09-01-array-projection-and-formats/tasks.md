## 1. Core — the format engine and the bind transform

- [x] 1.1 A format module beside `formatValue` in `packages/core/src/catalog/widgets/` (or `templates/`, wherever the import graph is cleanest): `formatBoundValue(value, spec)` — number/currency via `Intl.NumberFormat` (default locale `en-US`), date via the token engine (`yyyy MM dd HH mm ss`, unzoned ISO → UTC, formatted in UTC), numeric-string parsing, unparseable → raw `formatValue` output; exported constants for the bounds and token allowlist (the validator and the guide read them — design D4, D6).
- [x] 1.2 `packages/core/src/templates/` compile: `{ bind, format }` on text nodes and attr values renders through the engine; `validate`: the format checks (unknown type, decimals range, currency shape, pattern allowlist/bound, locale shape, transform mutual exclusion, format without bind) with dotted paths.
- [x] 1.3 Core tests: the three format scenarios (currency over a numeric string, the `dd-MM-yyyy HH:mm` ISO case asserting the exact output, unparseable → raw), attr-value formats, the validation scenario's four malformed shapes, and determinism (two renders byte-equal).

## 2. Core — per-item projection

- [x] 2.1 `packages/core/src/actions/execute.ts` `applyOutput`: when `map` has no `"."` entry and the projection input is an array, apply the entries per item (design D2); `"."`-alone semantics untouched.
- [x] 2.2 Tests: the ticker scenario (array in, per-item projected array out, unmapped fields dropped), `"."` root addressing over an array (`{ ".": "0" }`), per-item result still re-validated against the widget's schema, and `merge` still refusing arrays.

## 3. Designer — completion and editors

- [x] 3.1 `packages/designer/src/schema-paths.ts`: `collectPaths` descends arrays (root arrays included) mirroring `schemaAt`'s branch; new `schema-paths.test.ts` pinning root-array, nested-array and depth semantics directly (design D1, D5).
- [x] 3.2 `packages/designer/src/template-panel.ts`: `itemScope` collapses into `schemaAt(scope, eachPath)` + the `.items` step, making `each: "."` scope to the root array's item schema; the each dropdown offers `"."` for a root-array scope.
- [x] 3.3 `editors.test.ts` "schema-driven path pickers": the root-array fixture — `each` offers `"."`, binds inside complete with `ask/bid/book/date`; keep the no-schema free-text case distinguished from the root-array case.
- [x] 3.4 `packages/designer/src/action-editor.ts` output-map editor: item properties offered when either schema is an array; the mismatch check compares item types across two array sides (`typesConflict` extension or a pre-step); `binding.test.ts` cases for both.
- [x] 3.5 Bind rows (text + attr) gain the compact format editor (none/number/currency/date with that type's fields), committing the `format` transform; `editors.test.ts` round-trip: author a currency format in the tree, see it in the draft JSON and the preview output.
- [x] 3.6 Confirm the action input-mapping and `load` completions also benefit from the root-array fix (they share `allPaths`) — one assertion each.

## 4. Guide and docs

- [x] 4.1 `packages/mcp/src/server/guide.ts`: the template forms line and `rules.template` teach `{ bind, format }` with the vocabulary read from the exported constants and the ticker currency recipe (design D6); guide tests extended (drafted-from-guide widget with a currency and a date format passes `checkStoredWidget`).
- [x] 4.2 `npm run docs:generate`; sweep hand-written docs that enumerate the transforms (the template DSL page, authoring pages) for `format` and the per-item projection sentence.
- [x] 4.3 `TESTING.md`: dated verification-log entry.
- [x] 4.4 Changesets: minor `@widgentic/core` (transform + per-item projection), minor `@widgentic/designer` (completions + editors), minor `@widgentic/mcp` (guide).

## 5. Gate

- [x] 5.1 `npm run typecheck`, `npm test`, `npm run build`, `npm run pack:check` all green.
- [x] 5.2 `openspec validate --strict array-projection-and-formats` and `openspec validate --specs`.
- [x] 5.3 Acceptance rig: the user's ticker end to end — root-array schema, `each: "."`, per-item projection over the sample response, `ask` as COP 0-decimals, `date` as `dd-MM-yyyy HH:mm` — through the real render pipeline, asserting the served bytes.

## 6. Review closure (8-angle code review — design D10)

- [x] 6.1 Behavior: index-addressed sources keep root semantics in per-item projection; text-bind `map`/`prefix`/`default` accepted-and-ignored again (no persisted shape refused on read); enumerator context-free with item scopes resolved at each consumer; `schemaAt` steps arrays by index only; merge-over-list diagnostic; date-pattern token rule; epoch magnitude rule; runtime-known locales; plain spaces. Deltas amended and tests added for each.
- [x] 6.2 Reuse: `parseFormatSpec`/`compileFormat` (one narrowing, one formatter per spec), `isFormatType`/`isCurrencyDisplay`/`activeTransform` guards (no `as never`), `select()` in `dom.ts`, `itemSchema` everywhere, engine-rendered guide examples, one `:is()` reveal rule, merged CSS rules, const narrowing instead of casts.
- [x] 6.3 Honesty: the binding test that pinned dead root-level completions rewritten to assert the truth; changesets corrected (no breaking text-bind paragraph; index-source and mode rules); the prompt-format finder claim refuted with a probe.
- [x] 6.4 Routed to backlog: select-then-map for enveloped list responses.

## 7. Scope pulled in from the backlog (design D11)

- [x] 7.1 Select-then-map: the action validator lets `"."` coexist with other entries; `applyOutput` selects first and maps the selection (per item when it is a list, index sources keep root); the output-map editor completes the `"."` row from the response root and the other rows from the selection's item schema; guide sentence; spec + tests (envelope end to end).
- [x] 7.2 Text-bind `map`: the compiler renders the selected label (or `default`/empty); validation checks the map shape and refuses `map` beside `format` on a text bind; `prefix` stays attribute-only and inert; the designer's text rows offer `format` and `map` with the map block beneath the node; guide BIND line; spec + tests.
- [x] 7.3 Live findings (design D12): the `"."` selection row is an on-schema target (offered first, whatever the widget's shape); the widget designer's Export section drops the theme-JSON button and labels its entry export `Export widget entry`; the styles legend reads `(.wg- selectors only)`. Spec + tests.
