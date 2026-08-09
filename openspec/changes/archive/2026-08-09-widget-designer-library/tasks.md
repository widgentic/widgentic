# Tasks — Widget Designer Library

## 1. Foundation

- [x] 1.1 `src/designer/store.ts`: micro-store (`get/update/subscribe`, path-scoped updates, bounded undo stack) + draft type (`kind`, `template`, descriptor fields, `sampleData?`, `theme?`)
- [x] 1.2 `src/designer/validate.ts`: derive step running `validateTemplate`, `validateDataAgainstSchema` (+ `dataExample`-vs-`dataSchema` cross-check), styles guards, `validateTheme` → per-panel diagnostics view
- [x] 1.3 `widgentic/designer` export in `package.json` + `src/designer/index.ts` (`createDesigner`, `defineDesignerElement`, draft types); import-discipline note (public entries only)
- [x] 1.4 Store + derive unit tests (happy-dom-free where possible)

## 2. Shell and preview

- [x] 2.1 `createDesigner(container, options)`: layout shell (panel rail + preview pane), instance isolation, `dispose()`; handle API (`getDraft/loadWidget/loadTheme/subscribe`)
- [x] 2.2 Preview module: scratch catalog per valid revision (`registerTemplate` + built-ins), `mountWidget` update-in-place, theme application, invalid-draft freeze + error banner
- [x] 2.3 Tests: mount/dispose, two-instance isolation, preview patches in place, freeze-on-invalid

## 3. Editor panels

- [x] 3.1 Kind + descriptor text panel (`kind`, `description`, `dataShape`, `hints` key/value editor)
- [x] 3.2 `dataExample` / sample-data JSON editors with parse gating and schema cross-check diagnostics
- [x] 3.3 `dataSchema` JSON editor (subset-aware hints: type/properties/required/items/enum/pattern)
- [x] 3.4 Styles editor (selector → declarations rows) surfacing would-be-skipped entries via the safety filters
- [x] 3.5 Template JSON source pane (two-way projection, last-valid-wins, parse + `validateTemplate` errors inline)
- [x] 3.6 Template tree editor: node forms for text/`bind`, then `each`(+`empty`)/`when`(+`else`), then elements with attrs incl. `{ bind }` values; add/remove/move; per-node diagnostics (e.g. `FORBIDDEN_ATTRIBUTE` at the offending attr)
- [x] 3.7 Panel tests: each validator wired to its panel, diagnostics land beside the owning control

## 4. Theme designer mode

- [x] 4.1 Registry-driven token form (color inputs where the default parses as color), live `validateTheme`, unsafe values flagged and withheld from preview
- [x] 4.2 Preview-kind selector (built-ins + draft kind); export bare token map JSON
- [x] 4.3 Tests: token edit → preview var change, unsafe value withheld, export shape

## 5. Import/export and element wrapper

- [x] 5.1 Export widget JSON (`CustomWidget` shape) + theme JSON; copy-as-TypeScript module body (invoice-file compatible)
- [x] 5.2 Import with full re-validation; invalid imports rejected without touching the draft; round-trip test vs the invoice example
- [x] 5.3 `defineDesignerElement()`: explicit registration, `widgentic-change` events with serialized draft `detail`; lifecycle tests

## 6. Demo rig and docs

- [x] 6.1 `examples/designer/index.html` + `serve.ts` (:8082) hosting the element with import/export buttons wired to `localStorage` (host-side persistence demo)
- [x] 6.2 Rig exposure: Caddy site `:9446 → :8082` (tailnet-only, same cert pattern); TESTING.md entry
- [x] 6.3 Live check: author a small custom widget end-to-end in the browser (template + descriptor + styles + schema), export it, register the exported TS module on the local server, render it via `render_widget`; record in TESTING.md
- [x] 6.4 README: designer capability row + a short "Design a widget" section; full `npm test` + typecheck green

## 7. Friendly editors (D9 follow-up)

- [x] 7.1 `json-tree-editor.ts`: generic JSON value editor — collapsible nodes, in-place key/value editing, type select (string/number/boolean/null/object/array), add/remove entries; emits the edited value
- [x] 7.2 `schema-form.ts`: form generator over the dataSchema subset (string/number/boolean/enum/array/object controls, pattern-aware string inputs); used for dataExample and preview data when a schema exists
- [x] 7.3 `schema-builder.ts`: structured schema editor (property rows: name/type/required; string pattern, enum values, array items, nested objects) with JSON tab kept in sync
- [x] 7.4 Wire into panels: Data schema → Builder/JSON tabs; Sample data + Data for preview → Form (schema) / Tree (no schema) / JSON tabs; template tree usability pass (indent guides, compact rows, collapsible nodes)
- [x] 7.5 Tests per editor (edit→value, tabs sync, schema-driven controls, tree ops) + full suite green; demo server rebuild
