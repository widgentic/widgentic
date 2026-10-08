---
"@widgentic/mcp": minor
---

New app-only tool `preview_widget` (hidden from the model like `execute_action`): while a
render's input streams, the app template asks it to render the partial payload of a
stored widget through the caller's catalog, skipping the data-schema check, and shows
the answer as an in-progress preview instead of a skeleton. One request in flight per
frame; any failure keeps the skeleton. `createWidgenticServer` takes a
`previewRateLimit` gate, and `DEFAULT_PREVIEWS_PER_MINUTE` (240) is exported for edges
that wire a per-principal limiter. The template's patcher pairs keyed siblings exactly as
`@widgentic/core` does, and the served template drops comment lines and indentation from
its script (41,038 → 36,596 bytes) under a size budget pinned in the test suite.
Image inlining now fetches in priority order (card heroes, then thumbnails, avatars and
template images, then tree icons) and admits sources while the bytes they substitute,
charged per occurrence, fit 3 MiB per render: one icon repeated across a large tree no
longer multiplies into the result, and a hero after many icons is no longer starved.
Sources left external are counted on stderr, never by URL.
