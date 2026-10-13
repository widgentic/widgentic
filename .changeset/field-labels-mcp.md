---
"@widgentic/mcp": minor
---

Field labels reach agents and previews.

- `get_authoring_guide` states `LABEL_STYLE_RULE` for the labels a template writes and the built-ins' `hints.labels`.
- `render_widget`'s description asks for `widget` first and any `hints` before `data`, so a streaming host previews labels, columns and image places from the first row.
- The app template's client-built card and table previews apply `hints.labels` as the renderers do.
- The host bundle renders labels through the same core renderers; its conformance corpus gains labelled card and table cases.
