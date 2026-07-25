## 1. Schema validation (catalog)

- [ ] 1.1 Implement the JSON-Schema subset checker (`type`, `properties`, `required`, `items`, `enum`; unknown keywords ignored) in `src/catalog/schema.ts`, mapping violations to `MISSING_FIELD`/`INVALID_TYPE` with dotted `data.*` paths
- [ ] 1.2 Add `dataSchema?: object` to `WidgetDescriptor`; enforce it in `catalog.render` before dispatching to the renderer (schema-less kinds unchanged)
- [ ] 1.3 Author permissive schemas for the built-ins (documenting their lenient contracts) and a strict schema for the demo `invoice`

## 2. Card formatting hints

- [ ] 2.1 Implement `hints.fieldFormat` in the card renderer: `{value}` substitution, append-when-missing placeholder, ignore unmatched keys/non-string patterns, escaped output
- [ ] 2.2 Document the hint in the card descriptor (with a `dataExample`-style pattern example)

## 3. render_widget inputs

- [ ] 3.1 Add `format` handling to `handleRenderWidget`: `both` (default) / `html` / `widget` / `page`; unrecognized values → `INVALID_TYPE` at `path: "format"`
- [ ] 3.2 Implement `page` composition: doctype + inlined `baseStylesheet` + fragment (+ theme declarations), keeping the widgentic resource block
- [ ] 3.3 Add `theme` handling: `validateTheme`, `themeToCss` for pages, `INVALID_TYPE` at `path: "theme.<token>"` on invalid tokens, accepted-and-ignored off-page
- [ ] 3.4 Make coercion schema-aware: string-typed `dataSchema` bypasses unwrapping
- [ ] 3.5 Extend `RENDER_WIDGET_TOOL.inputSchema` (format enum, theme object) and the zod mirrors in `examples/mcp-server/main.ts` and the interop test

## 4. Tests

- [ ] 4.1 Schema checker unit tests: every subset keyword, dotted paths, unknown keywords ignored, valid data passes
- [ ] 4.2 Catalog tests: schema enforcement in `render`, schema-less leniency preserved, built-in schemas accept their own `dataExample`s, schemas listed via `list()`
- [ ] 4.3 Card tests: fieldFormat scenarios incl. escaping and placeholder-less patterns
- [ ] 4.4 Handler tests: format variants (page starts with doctype + contains stylesheet; single-block formats), theme scenarios (dark tokens present, unsafe token → structured error), schema-violation errors, string-schema bypass regression
- [ ] 4.5 SDK interop: `render_widget` with `format: "page"` + `theme` through the in-memory transport; schema violation arriving as `isError`
- [ ] 4.6 Type tests: descriptor `dataSchema`, extended handler input, format union

## 5. Verification

- [ ] 5.1 Run `npm run typecheck`, `npm test`, and `npm run test:types` — all green
- [ ] 5.2 Live stdio check: `render_widget` with `format: "page"` + `darkTheme` tokens returns a browsable document; save and eyeball it
