---
"@widgentic/mcp": patch
---

Streaming previews no longer show image URLs as text. Wherever the result will draw an
image (a tree icon, a card field, a table cell, decided exactly as the built-in renderers
decide, `hints.images` included), the app template's preview shows a placeholder of the
same shape (`wg-img wg-img-<shape> wg-img-pending`); server previews from `preview_widget`
mount every non-`data:` image as such a placeholder instead of a source the sandbox would
block. A URL still arriving at the end of a partial snapshot is left out of the preview and
of any `preview_widget` request until another value follows it. The result's images
replace the placeholders.
