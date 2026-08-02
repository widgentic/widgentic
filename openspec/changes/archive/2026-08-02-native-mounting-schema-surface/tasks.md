# Tasks — Native Tree Mounting + Schema Patterns + Surface Token

## 1. Tree in structuredContent (mcp-server)

- [x] 1.1 `handlers.ts`: add `tree: rendered.node` to `structuredContent`; assert tree/html parity (`renderToHtml(tree) === html`) in handler tests
- [x] 1.2 `inline-images.ts`: collect `img` sources from the tree (element nodes, `tag === "img"`), rewrite tree and HTML surfaces from the same resolved map; tests for lockstep rewriting and tree-only walks

## 2. Native mounting in the app template

- [x] 2.1 `app-template.ts`: inline `build(node)` (createElement/createTextNode, TAG_NAME/ATTR_NAME allowlists, skip `on*`) and `patch(prev, next, dom)` (same-shape in-place attribute/child patching, shape change rebuilds) mirroring `src/reactive` semantics
- [x] 2.2 `tool-result` handler: mount from `structuredContent.tree` when present, keep the current `html` injection as fallback; retain error-state behavior
- [x] 2.3 DOM tests (happy-dom): native mount innerHTML parity vs `renderToHtml` across a scenario matrix (all built-in kinds + invoice example + images), patch-in-place identity across successive results, unsafe tag/attr skipping, html fallback when tree absent

## 3. Bounded pattern in data schemas (widget-catalog)

- [x] 3.1 `schema.ts`: `pattern` support per design D4 — string-only, 256-char pattern cap, 10k tested-string cap, nested-quantifier heuristic + RegExp-throw rejection ⇒ ignored, violations as `INVALID_TYPE` with dotted path
- [x] 3.2 Tests: match/violation with dotted paths, unsafe/invalid patterns ignored, non-string data untouched, long-string prefix behavior
- [x] 3.3 Update the invoice example descriptor (`examples/mcp-server/widgets/invoice.ts`) to use a `pattern` (e.g. currency code) as the living demonstration

## 4. Surface token (widget-theming)

- [x] 4.1 `tokens.ts`: `surface` token (light default `#ffffff`); `apply.ts`: `darkTheme.surface = "#161b26"`
- [x] 4.2 `stylesheet.ts`: `.wg-card`/`.wg-table`/`.wg-custom` backgrounds → `var(--wg-surface, var(--wg-bg, <default>))`
- [x] 4.3 Tests: registry contents, nested-fallback chain present, registry-only reference test still passing, bg-only theme behaves as before (applied var resolution in happy-dom)

## 5. Verification, deploy, docs

- [x] 5.1 Full `npm test` + typecheck green
- [x] 5.2 Deploy `v6`; curl-verify `structuredContent.tree` present and image-inlined through `mcp.widgentic.dev`
- [x] 5.3 Live check in basic-host: native mount renders identically (visual sweep of card/table/invoice with images + a dark `surface` theme showing card-vs-page separation); record in TESTING.md
- [x] 5.4 README/TESTING.md touch-ups (schema `pattern` in descriptor docs note, `surface` token mention)
