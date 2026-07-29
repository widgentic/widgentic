## 1. Schema validation (catalog)

- [x] 1.1 Implement the JSON-Schema subset checker (`type`, `properties`, `required`, `items`, `enum`; unknown keywords ignored) in `src/catalog/schema.ts`, mapping violations to `MISSING_FIELD`/`INVALID_TYPE` with dotted `data.*` paths
- [x] 1.2 Add `dataSchema?: object` to `WidgetDescriptor`; enforce it in `catalog.render` before dispatching to the renderer (schema-less kinds unchanged)
- [x] 1.3 Built-ins stay schema-less by design (a rejecting schema would contradict their spec'd lenient fallbacks; schema-less = lenient per the ADDED requirement); author a strict schema for the demo `invoice`

## 2. Card formatting hints

- [x] 2.1 Implement `hints.fieldFormat` in the card renderer: `{value}` substitution, append-when-missing placeholder, ignore unmatched keys/non-string patterns, escaped output
- [x] 2.2 Document the hint in the card descriptor (with a `dataExample`-style pattern example)

## 3. render_widget inputs

- [x] 3.1 Add `format` handling to `handleRenderWidget`: `both` (default) / `html` / `widget` / `page`; unrecognized values → `INVALID_TYPE` at `path: "format"`
- [x] 3.2 Implement `page` composition: doctype + inlined `baseStylesheet` + fragment (+ theme declarations), keeping the widgentic resource block
- [x] 3.3 Add `theme` handling: `validateTheme`, `themeToCss` for pages, `INVALID_TYPE` at `path: "theme.<token>"` on invalid tokens, accepted-and-ignored off-page
- [x] 3.4 Make coercion schema-aware: string-typed `dataSchema` bypasses unwrapping
- [x] 3.5 Extend `RENDER_WIDGET_TOOL.inputSchema` (format enum, theme object) and the zod mirrors in `examples/mcp-server/main.ts` and the interop test

## 3b. Page review fixes (from user review)

- [x] 3.6 Theme the page body: `composePage` styles `body` (background/color/font) via `var(--wg-*)` with the token defaults as fallbacks
- [x] 3.7 Descriptor `styles` (CSS-as-data for custom kinds): guarded `widgetStylesToCss` in the catalog, `.wg-`-scoped selectors, page output includes the rendered kind's styles, demo invoice ships styles

- [x] 3.9 Theme discovery tool: `LIST_THEME_TOKENS_TOOL` + pure `handleListThemeTokens()` (tokens with defaults, `dark` preset, value rules), wired in the example server and interop test; `render_widget`'s theme description points at it
- [x] 3.8 Harden both value guards (theming tokens + widget styles) against `expression(` with whitespace tolerance; document strings-only token values in the tool's `theme` description

## 4. Tests

- [x] 4.1 Schema checker unit tests: every subset keyword, dotted paths, unknown keywords ignored, valid data passes
- [x] 4.2 Catalog tests: schema enforcement in `render`, schema-less leniency preserved, built-in schemas accept their own `dataExample`s, schemas listed via `list()`
- [x] 4.3 Card tests: fieldFormat scenarios incl. escaping and placeholder-less patterns
- [x] 4.4 Handler tests: format variants (page starts with doctype + contains stylesheet; single-block formats), theme scenarios (dark tokens present, unsafe token → structured error), schema-violation errors, string-schema bypass regression
- [x] 4.5 SDK interop: `render_widget` with `format: "page"` + `theme` through the in-memory transport; schema violation arriving as `isError`
- [x] 4.6 Type tests: descriptor `dataSchema`, extended handler input, format union

## 5. Verification

- [x] 5.1 Run `npm run typecheck`, `npm test`, and `npm run test:types` — all green
- [x] 5.2 Live stdio check: `render_widget` with `format: "page"` + `darkTheme` tokens returns a browsable document; save and eyeball it
