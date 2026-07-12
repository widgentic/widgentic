## 1. Module scaffolding

- [x] 1.1 Create `src/catalog/` with `index.ts` (public exports), `node.ts` (`WidgetNode`, `WidgetRenderer` types), `registry.ts` (`createCatalog`, `DuplicateKindError`), `html.ts` (`renderToHtml`), `dom.ts` (`mountNode`), and `widgets/` (`card.ts`, `table.ts`, `tree.ts`, `custom.ts`)
- [x] 1.2 Add `./catalog` entry to `package.json` `exports`
- [x] 1.3 Add `happy-dom` devDependency for DOM-layer tests (verify install; if unavailable, isolate DOM tests and note the gap)

## 2. Render tree and registry

- [x] 2.1 Define `WidgetNode` (string | `{ tag, attrs?, children? }`) and `WidgetRenderer` types — plain data, no DOM types
- [x] 2.2 Implement `DuplicateKindError` (`Error` subclass, `code: "DUPLICATE_KIND"`, offending kind in message)
- [x] 2.3 Implement `createCatalog()` with `register`/`has`/`resolve`/`kinds` (fresh array), pre-registering built-ins through `register()`
- [x] 2.4 Implement `catalog.render(payload)`: `validateWidgetPayload` with live `knownKinds`, dispatch to renderer, return `{ ok, node | error }` without throwing

## 3. Built-in renderers (pure, total)

- [x] 3.1 `card`: title/subtitle/fields from data, entries-as-fields fallback for plain objects, stringified primitives, `meta.title`/`meta.subtitle` fallback, `wg-card*` classes
- [x] 3.2 `table`: column union in first-seen order, `hints.columns` override, empty cells for missing keys, non-array data as single record, `wg-table*` classes
- [x] 3.3 `tree`: recursive `{ label, children[] }`, JSON-snippet label fallback, `hints.expandDepth` → `data-expanded` attributes, `wg-tree*` classes
- [x] 3.4 `custom`: pretty-printed JSON in a `<pre>`, `String(data)` fallback on serialization failure, `wg-custom` class

## 4. Output layers

- [x] 4.1 Implement `renderToHtml(node)`: escape text and attribute values (`& < > " '`), defensive tag/attribute-name allowlist, void-element handling
- [x] 4.2 Implement `mountNode(node, container)` using `container.ownerDocument`, `textContent` for text, replacing previous children

## 5. Tests

- [x] 5.1 Registry tests: built-ins present, independent instances, fresh `kinds()` array, duplicate registration throws (custom kind and built-in), register-then-render round trip
- [x] 5.2 `render()` tests: ok result for each built-in, `UNKNOWN_KIND`, `MISSING_FIELD`, never throws
- [x] 5.3 Renderer tests (pure tree): every card/table/tree/custom scenario in the delta spec plus totality fallbacks (unexpected `data` shapes)
- [x] 5.4 HTML layer tests: escaping scenarios (`<script>`, attribute quoting), `wg-` class presence, JSON-serializability of trees
- [x] 5.5 DOM layer tests (happy-dom): mount builds elements with expected text, re-mount replaces content
- [x] 5.6 Type tests (`types.test-d.ts`): `WidgetNode`, `WidgetRenderer`, `createCatalog` return type, `render` result narrowing
- [x] 5.7 Integration: mapper output (`mapToWidget`) renders end-to-end through `catalog.render` for records/object/tree inputs

## 6. Verification

- [x] 6.1 Run `npm run typecheck`, `npm test`, and `npm run test:types` — all green
- [x] 6.2 Confirm `widgentic/catalog` resolves via package exports (import through the package entry in a test)
