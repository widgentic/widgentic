---
"@widgentic/core": minor
---

Keyed patching. Render-tree elements may carry an optional `key` (data only; `renderToHtml`
and the DOM layer never emit it). When every child of a sibling list carries a distinct
key in both the old and the new tree, `mountWidget` updates pair children by key and move
the existing DOM nodes, so a reordering update keeps each record's element and a
disclosure the reader opened; any other list still pairs by position. `table` keys body
rows and `tree` keys each sibling list from a distinct record `id`. Templates gain an
optional `key` path on `each` (`{ "each": "lines", "key": "sku", … }`), validated like a
bind path. `catalog.render(payload, { partialData: true })` skips the descriptor
data-schema check for the payload and every group item, for previews of input that is
still arriving.
